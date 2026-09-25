import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { como, comoDono, conectar, desconectar, prepararPrivilegios, IDS } from './banco';

/**
 * O laboratório funciona?
 *
 * Antes de qualquer asserção sobre policy, provar que a montagem é honesta. Um
 * teste de RLS tem uma forma de mentir que é difícil de notar: ele passa porque
 * NÃO HAVIA DADO para vazar, e não porque a policy segurou. Verde por tabela
 * vazia é o pior resultado possível — parece cobertura e não é.
 *
 * Então aqui se confirma, nesta ordem: o cenário existe visto de cima, o
 * visitante não alcança nada, e o corretor de uma imobiliária não alcança o
 * cliente da outra.
 */

const FIXTURA = readFileSync(join(__dirname, 'fixtura.sql'), 'utf8');
const MIGRATIONS = join(__dirname, '..', 'migrations');

beforeAll(async () => {
  await conectar();
  // Primeiro o modelo de privilégio, depois o cenário: sem a base de GRANT, todo
  // teste falharia por "permission denied" e alguns PASSARIAM por isso.
  await prepararPrivilegios(MIGRATIONS);
  const r = await comoDono(FIXTURA);
  if (r.erro) throw new Error(`fixtura não aplicou: ${r.erro}`);
}, 60_000);

afterAll(async () => {
  await desconectar();
});

describe('o cenário', () => {
  it('tem DUAS imobiliárias, e é isso que dá sentido ao resto', async () => {
    /*
     * Com uma organização só, toda policy passa — inclusive uma que não filtre
     * nada. A segunda imobiliária é o instrumento de medida; sem ela, o teste
     * mede zero.
     */
    const r = await comoDono(
      `select count(*)::int as n from public.organizations where id in ($1, $2)`,
      [IDS.orgA, IDS.orgB],
    );
    expect(r.linhas[0]?.n).toBe(2);
  });

  it('tem lead dos dois lados', async () => {
    const r = await comoDono(
      `select distinct organization_id from public.leads where organization_id in ($1, $2)`,
      [IDS.orgA, IDS.orgB],
    );
    expect(r.linhas.length).toBe(2);
  });
});

describe('o modelo de privilégio', () => {
  /*
   * Estes dois testes guardam o laboratório, não o produto.
   *
   * Se o `prepararPrivilegios` parar de funcionar, a suíte inteira volta a
   * responder "permission denied" para tudo — e boa parte dos testes ficaria
   * VERDE, porque recusado é o que eles esperam. Aqui se prova que a recusa vem
   * da policy, e não da falta de permissão.
   */
  it('o corretor ALCANÇA as tabelas — a recusa tem de vir da policy', async () => {
    const r = await como('corretor', 'select 1 from public.leads limit 1');
    expect(r.erro).toBeNull();
  });

  it('mas não escreve numa coluna que a migration protegeu', async () => {
    // `revoke update on notifications` + `grant update (is_read, read_at)`.
    // Marcar como lida, pode; reescrever o texto do aviso, não — e isso é
    // privilégio de coluna, uma camada ABAIXO da RLS.
    const proibida = await como('corretor', `update public.notifications set title = 'x'`);
    expect(proibida.erro).toMatch(/permission denied/i);

    const permitida = await como('corretor', `update public.notifications set is_read = true`);
    expect(permitida.erro).toBeNull();
  });
});

describe('o visitante sem sessão', () => {
  // Já conferido contra a produção com a chave publicável, e agora preso num
  // teste: `leads` é a tabela mais sensível do sistema e a que mais aparece em
  // vazamento de CRM.
  it.each(['leads', 'properties', 'profiles', 'organizations', 'whatsapp_messages'])(
    'não enxerga nada em %s',
    async (tabela) => {
      const r = await como('anon', `select count(*)::int as n from public.${tabela}`);
      if (r.erro) expect(r.erro).toMatch(/permission denied/);
      else expect(r.linhas[0]?.n).toBe(0);
    },
  );
});

describe('a fronteira entre as duas imobiliárias', () => {
  it('o corretor da A vê o lead da A', async () => {
    // A afirmação positiva vem PRIMEIRO. Sem ela, o teste de baixo passaria
    // igual com o banco vazio, com a conexão errada ou com a policy negando
    // tudo para todo mundo.
    const r = await como('corretor', 'select id, full_name from public.leads');
    expect(r.erro).toBeNull();
    expect(r.linhas.length).toBe(1);
    expect(r.linhas[0]?.full_name).toBe('Cliente da A');
  });

  it('o corretor da B NÃO vê o lead da A', async () => {
    const r = await como('corretor_de_fora', 'select id, full_name from public.leads');
    expect(r.linhas.map((l) => l.full_name)).toEqual(['Cliente da B']);
  });

  it('nem pedindo o lead da A pelo id', async () => {
    // Buscar pelo id é o caminho de quem já sabe o que quer: um id que vazou num
    // log, numa URL compartilhada, num print. A policy tem de segurar igual.
    const r = await como('corretor_de_fora', 'select id from public.leads where id = $1', [
      '00000000-0000-4000-a000-000000000040',
    ]);
    // A consulta tem de FUNCIONAR e voltar vazia. Sem esta linha o teste ficaria
    // verde com um erro de permissão, que é uma defesa diferente da que ele diz
    // estar medindo — foi assim que ele passou na primeira execução no CI.
    expect(r.erro).toBeNull();
    expect(r.linhas.length).toBe(0);
  });

  it('o gerente da B também não vê — papel alto não atravessa a fronteira', async () => {
    /*
     * O gerente é o dono da imobiliária e enxerga a operação inteira DELE. Se a
     * hierarquia furasse a separação por organização, o papel mais alto de cada
     * cliente veria o negócio dos outros — que é exatamente o pior desfecho
     * possível num sistema vendido para imobiliárias concorrentes.
     */
    const r = await como('gerente_de_fora', 'select id from public.leads');
    expect(r.linhas.length).toBe(1);
    expect(r.linhas[0]?.id).not.toBe('00000000-0000-4000-a000-000000000040');
  });

  it('o corretor da B não consegue GRAVAR dentro da A', async () => {
    // Leitura fechada e escrita aberta é uma combinação que já apareceu em
    // sistema real: dá para não ver o dado do vizinho e ainda assim sujar a
    // caixa de entrada dele.
    const r = await como(
      'corretor_de_fora',
      `insert into public.leads (organization_id, stage_id, full_name, phone)
       values ($1, $2, 'Invasor', '+5547999990009') returning id`,
      [IDS.orgA, '00000000-0000-4000-a000-000000000020'],
    );
    // Tem de ser a RLS recusando, com todas as letras. "permission denied"
    // aqui significaria que o teste está medindo GRANT e não policy.
    expect(r.erro).toMatch(/row-level security/i);
    expect(r.linhas.length).toBe(0);
  });

  it('e não consegue mudar o lead da A', async () => {
    const r = await como(
      'corretor_de_fora',
      `update public.leads set full_name = 'sequestrado' where id = $1 returning id`,
      ['00000000-0000-4000-a000-000000000040'],
    );
    // Sem policy que alcance a linha, o update não estoura: ele simplesmente
    // não encontra nada. Zero linha afetada É a defesa funcionando.
    expect(r.linhas.length).toBe(0);

    const conferindo = await comoDono('select full_name from public.leads where id = $1', [
      '00000000-0000-4000-a000-000000000040',
    ]);
    expect(conferindo.linhas[0]?.full_name).toBe('Cliente da A');
  });
});
