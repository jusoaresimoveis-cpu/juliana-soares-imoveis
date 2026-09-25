import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { como, comoDono, conectar, desconectar, prepararPrivilegios, IDS } from './banco';

/**
 * Cada um vê a sua carteira — a migration 079.
 *
 * A pergunta que estes testes fazem é a que o print do cliente fez: a corretora
 * entrou pela primeira vez e viu 15 leads, o funil da imobiliária inteira e os
 * últimos leads de todo mundo. O recorte novo não pode viver no `select` da
 * tela, porque a mesma chave que a tela usa serve para pedir a tabela inteira
 * ao PostgREST. Ele vive na policy — e é a policy que estes testes interrogam.
 *
 * A ordem aqui é proposital: TODA afirmação negativa vem depois de uma
 * positiva. Sem isso, um banco vazio, uma conexão errada ou uma policy que nega
 * tudo para todo mundo deixariam a suíte verde — já aconteceu neste
 * laboratório, na primeira execução no CI.
 */

const FIXTURA = readFileSync(join(__dirname, 'fixtura.sql'), 'utf8');
const MIGRATIONS = join(__dirname, '..', 'migrations');

beforeAll(async () => {
  await conectar();
  await prepararPrivilegios(MIGRATIONS);
  const r = await comoDono(FIXTURA);
  if (r.erro) throw new Error(`fixtura não aplicou: ${r.erro}`);
}, 60_000);

afterAll(async () => {
  await desconectar();
});

describe('quem enxerga qual lead', () => {
  it('a imobiliária A tem três leads, com três donos diferentes', async () => {
    // A afirmação de base. Se ela cair, todo o resto deste arquivo passa a
    // medir a fixtura em vez de medir a policy.
    const r = await comoDono(
      `select full_name, assigned_to from public.leads
        where organization_id = $1 order by full_name`,
      [IDS.orgA],
    );
    expect(r.linhas.map((l) => l.full_name)).toEqual([
      'Cliente da A',
      'Cliente do Gerente',
      'Cliente sem dono',
    ]);
  });

  it('o gerente vê os três — é ele quem acompanha a operação', async () => {
    const r = await como('gerente', 'select full_name from public.leads order by full_name');
    expect(r.erro).toBeNull();
    expect(r.linhas.map((l) => l.full_name)).toEqual([
      'Cliente da A',
      'Cliente do Gerente',
      'Cliente sem dono',
    ]);
  });

  it('o administrador também', async () => {
    const r = await como('admin', 'select count(*)::int as n from public.leads');
    expect(r.erro).toBeNull();
    expect(r.linhas[0]?.n).toBe(3);
  });

  it('o corretor vê UM: o que está no nome dele', async () => {
    const r = await como('corretor', 'select full_name from public.leads');
    expect(r.erro).toBeNull();
    expect(r.linhas.map((l) => l.full_name)).toEqual(['Cliente da A']);
  });

  it('nem pedindo o lead do colega pelo id', async () => {
    /*
     * O caminho de quem já sabe o que quer: um id que apareceu numa URL
     * compartilhada, num print, num log. A consulta tem de FUNCIONAR e voltar
     * vazia — "permission denied" aqui significaria que o teste está medindo
     * GRANT de tabela e não policy, que é uma defesa diferente da que ele diz
     * estar medindo.
     */
    const r = await como('corretor', 'select id from public.leads where id = $1', [
      IDS.leadDoGerente,
    ]);
    expect(r.erro).toBeNull();
    expect(r.linhas.length).toBe(0);
  });

  it('e o lead SEM RESPONSÁVEL também não é dele', async () => {
    /*
     * Este é o caso que mais aparece na operação: é assim que o lead nasce
     * quando chega do WhatsApp ou da landing page. Fica com a gestão até
     * alguém distribuir — que é o desenho pedido, e cujo custo está escrito no
     * cabeçalho da 079: sem distribuição, o corretor abre o CRM vazio.
     */
    const r = await como('corretor', 'select id from public.leads where id = $1', [IDS.leadSemDono]);
    expect(r.erro).toBeNull();
    expect(r.linhas.length).toBe(0);
  });
});

describe('leitura fechada não pode conviver com escrita aberta', () => {
  it('o corretor não puxa a carteira da casa para o próprio nome', async () => {
    /*
     * O buraco que o `for all` antigo deixava: dava para não VER o lead do
     * colega e ainda assim reescrevê-lo. Um `update` sem filtro nenhum traria
     * a imobiliária inteira para o nome de quem mandou — e, aí sim, ele
     * passaria a ver tudo, legitimamente, pela policy de leitura.
     *
     * Zero linha afetada É a defesa: sem policy que alcance a linha, o update
     * não estoura, ele simplesmente não encontra nada.
     */
    const r = await como(
      'corretor',
      `update public.leads set assigned_to = $1 where organization_id = $2 returning id`,
      [IDS.corretor, IDS.orgA],
    );
    expect(r.erro).toBeNull();
    expect(r.linhas.map((l) => l.id)).toEqual([IDS.leadDoCorretor]);

    const conferindo = await comoDono(`select assigned_to from public.leads where id = $1`, [
      IDS.leadDoGerente,
    ]);
    expect(conferindo.linhas[0]?.assigned_to).toBe(IDS.gerente);
  });

  it('nem apaga o que não é dele', async () => {
    const r = await como('corretor', `delete from public.leads where id = $1 returning id`, [
      IDS.leadDoGerente,
    ]);
    expect(r.erro).toBeNull();
    expect(r.linhas.length).toBe(0);
  });

  it('mas continua editando o lead que é dele', async () => {
    // O contraponto obrigatório: se a trava fechasse a porta inteira, o
    // sintoma seria o corretor não conseguir trabalhar — e ninguém chamaria
    // isso de segurança.
    const r = await como(
      'corretor',
      `update public.leads set notes = 'ligou hoje' where id = $1 returning notes`,
      [IDS.leadDoCorretor],
    );
    expect(r.erro).toBeNull();
    expect(r.linhas[0]?.notes).toBe('ligou hoje');
  });
});

describe('o lead que o corretor cadastra', () => {
  it('nasce no nome dele, sem ele precisar escolher', async () => {
    /*
     * Sem o gatilho, a tela de cadastro manual vira armadilha: preenche,
     * salva, e o lead some na mesma hora — nasceu sem responsável, e o corretor
     * não vê lead sem responsável. A pessoa conclui que o sistema perdeu o
     * cadastro, que é a pior forma de uma trava de segurança se manifestar.
     */
    const r = await como(
      'corretor',
      `insert into public.leads (organization_id, stage_id, full_name, phone)
       values ($1, $2, 'Cadastrado à mão', '+5547999990077')
       returning assigned_to`,
      [IDS.orgA, IDS.etapaA],
    );
    expect(r.erro).toBeNull();
    expect(r.linhas[0]?.assigned_to).toBe(IDS.corretor);
  });

  it('e o do gerente continua nascendo sem dono, para ele distribuir', async () => {
    const r = await como(
      'gerente',
      `insert into public.leads (organization_id, stage_id, full_name, phone)
       values ($1, $2, 'Para distribuir', '+5547999990078')
       returning assigned_to`,
      [IDS.orgA, IDS.etapaA],
    );
    expect(r.erro).toBeNull();
    expect(r.linhas[0]?.assigned_to).toBeNull();
  });

  it('o corretor não cadastra lead direto no nome de outro', async () => {
    const r = await como(
      'corretor',
      `insert into public.leads (organization_id, stage_id, full_name, phone, assigned_to)
       values ($1, $2, 'Presente envenenado', '+5547999990079', $3) returning id`,
      [IDS.orgA, IDS.etapaA, IDS.gerente],
    );
    expect(r.erro).toMatch(/row-level security/i);
  });
});

describe('o histórico do lead segue o lead', () => {
  it('o corretor lê a linha do tempo do lead dele', async () => {
    await comoDono(
      `insert into public.lead_timeline_events (organization_id, lead_id, category, event_type, title)
       values ($1, $2, 'mensagem', 'nota', 'Do corretor')`,
      [IDS.orgA, IDS.leadDoCorretor],
    );
    // Pelo TÍTULO, e não pela contagem: todo lead nasce com um `lead/created`,
    // então "veio alguma linha" passaria mesmo se a nota nunca tivesse entrado.
    const r = await como(
      'corretor',
      `select title from public.lead_timeline_events where lead_id = $1 and title = 'Do corretor'`,
      [IDS.leadDoCorretor],
    );
    expect(r.erro).toBeNull();
    expect(r.linhas.length).toBeGreaterThan(0);
  });

  it('e NÃO lê a do lead do colega', async () => {
    /*
     * Fechar `leads` e deixar a filha aberta por organização entregaria a parte
     * mais sensível: anotação, motivo de perda, valor de proposta. Quem tem o
     * id lê a história inteira do atendimento alheio.
     */
    await comoDono(
      `insert into public.lead_timeline_events (organization_id, lead_id, category, event_type, title)
       values ($1, $2, 'mensagem', 'nota', 'Segredo do gerente')`,
      [IDS.orgA, IDS.leadDoGerente],
    );
    const r = await como(
      'corretor',
      `select title from public.lead_timeline_events where lead_id = $1`,
      [IDS.leadDoGerente],
    );
    expect(r.erro).toBeNull();
    expect(r.linhas.length).toBe(0);
  });
});

describe('o painel conta a carteira de quem está olhando', () => {
  const PAINEL = `select public.painel_indicadores(current_date, current_date) as j`;

  it('para o gerente, o total é o da imobiliária', async () => {
    const r = await como('gerente', PAINEL);
    expect(r.erro).toBeNull();
    const j = r.linhas[0]?.j as { escopo: string; atual: { leads: number } };
    expect(j.escopo).toBe('todos');
    expect(Number(j.atual.leads)).toBe(3);
  });

  it('para o corretor, é o dele — e o painel DIZ que é o dele', async () => {
    /*
     * O `escopo` não é enfeite: é o que deixa a tela escrever "Sua carteira" ao
     * lado do período e RETIRAR os cartões de investimento e custo por lead.
     * Sem ele, o corretor leria "Investimento Meta R$ 0,00" — que não é
     * discrição, é a tela afirmando que a imobiliária não investiu nada.
     */
    const r = await como('corretor', PAINEL);
    expect(r.erro).toBeNull();
    const j = r.linhas[0]?.j as { escopo: string; atual: { leads: number } };
    expect(j.escopo).toBe('meus');
    expect(Number(j.atual.leads)).toBe(1);
  });

  it('o funil também, e as etapas vazias continuam aparecendo', async () => {
    /*
     * O recorte por dono vai no ON do `left join`, não no WHERE. No WHERE, o
     * `left join` viraria `inner` e as etapas sem nenhum lead do corretor
     * sumiriam do funil em vez de aparecerem zeradas — um funil que muda de
     * TAMANHO conforme quem olha.
     */
    const r = await como('corretor', PAINEL);
    const j = r.linhas[0]?.j as { funil: { key: string; total: number }[] };
    expect(j.funil.length).toBeGreaterThan(0);
    expect(Number(j.funil[0]?.total)).toBe(1);
  });
});

describe('as etiquetas da lista de últimos leads', () => {
  it('não respondem por lead que não é do corretor', async () => {
    /*
     * `leads_etiquetas` é `security definer` — ela passa por cima da RLS por
     * construção, porque precisa ler `meta_ads_spend`, que corretor nenhum
     * enxerga. É esse mesmo poder que a tornaria uma porta dos fundos: sem o
     * recorte de carteira lá dentro, mandar uma lista de ids alheios devolveria
     * de qual conta veio o lead do colega e quem está atendendo.
     */
    const r = await como('corretor', `select * from public.leads_etiquetas($1)`, [
      [IDS.leadDoGerente, IDS.leadSemDono],
    ]);
    expect(r.erro).toBeNull();
    expect(r.linhas.length).toBe(0);
  });

  it('mas respondem pelo lead dele — com o nome de quem atende', async () => {
    // A positiva obrigatória: uma função que recusasse tudo passaria no teste de
    // cima sem proteger nada, e deixaria a primeira dobra sem etiqueta nenhuma.
    const r = await como('corretor', `select responsavel from public.leads_etiquetas($1)`, [
      [IDS.leadDoCorretor],
    ]);
    expect(r.erro).toBeNull();
    expect(r.linhas[0]?.responsavel).toBe('Corretor da A');
  });

  it('e o gerente vê as de qualquer lead da casa', async () => {
    const r = await como('gerente', `select lead_id from public.leads_etiquetas($1)`, [
      [IDS.leadDoCorretor, IDS.leadDoGerente, IDS.leadSemDono],
    ]);
    expect(r.erro).toBeNull();
    expect(r.linhas.length).toBe(3);
  });
});

describe('a etiqueta da landing page', () => {
  it('não responde por lead que não é do corretor', async () => {
    /*
     * `leads_de_qual_pagina` é `security definer` — ela passa por cima da RLS
     * por construção, para poder ler `landing_pages` e `properties`. Sem a
     * condição de carteira lá dentro, bastaria mandar uma lista de ids alheios
     * para descobrir de qual campanha cada um veio, com a policy de `leads`
     * fechada do outro lado e sem perceber nada.
     */
    const r = await como('corretor', `select * from public.leads_de_qual_pagina($1)`, [
      [IDS.leadDoGerente, IDS.leadSemDono],
    ]);
    expect(r.erro).toBeNull();
    expect(r.linhas.length).toBe(0);
  });
});
