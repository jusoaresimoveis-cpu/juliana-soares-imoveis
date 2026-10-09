import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { como, comoDono, comoDonoEDesfaz, conectar, desconectar, prepararPrivilegios, IDS } from './banco';

/**
 * O que o lead disse — a migration 120.
 *
 * A regra da temperatura mora em SQL, então é aqui, contra um Postgres de
 * verdade, que ela tem tabela-verdade. Os testes em memória conferem o TEXTO da
 * função; estes conferem o que ela RESPONDE.
 *
 * E há uma pergunta que só este laboratório sabe fazer: o corretor consegue
 * salvar? As duas temperaturas são colunas geradas, e a expressão de uma coluna
 * gerada roda com o papel de quem faz o UPDATE. Um `revoke` a mais na função da
 * regra e a ficha inteira passaria a responder "permission denied" — para o
 * corretor, nunca para quem testa com poderes de dono.
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

describe('a regra, resposta por resposta', () => {
  /*
   * Todas as combinações: 5 prazos mais "sem prazo", 3 encaixes mais "sem
   * resposta". São 24 linhas, e a tabela inteira cabe na cabeça:
   *
   *   sem prazo                          → nada
   *   até 3 meses E a entrada cabe       → quente
   *   até 6 meses                        → morno
   *   o resto                            → frio
   */
  const ESPERADO: Record<string, string | null> = {};
  const PRAZOS = [null, 'ate_30_dias', 'de_1_a_3_meses', 'de_3_a_6_meses', 'mais_de_6_meses', 'pesquisando'];
  const ENCAIXES = [null, 'cabe', 'precisa_prazo', 'depende_banco'];
  for (const p of PRAZOS) {
    for (const e of ENCAIXES) {
      let t: string | null;
      if (p === null) t = null;
      else if ((p === 'ate_30_dias' || p === 'de_1_a_3_meses') && e === 'cabe') t = 'quente';
      else if (p === 'ate_30_dias' || p === 'de_1_a_3_meses' || p === 'de_3_a_6_meses') t = 'morno';
      else t = 'frio';
      ESPERADO[`${p}|${e}`] = t;
    }
  }

  it('responde as 24 combinações como a tabela manda', async () => {
    const r = await comoDono(
      `select p, e, public.temperatura_pela_regra(p, e) as t
         from unnest($1::text[]) as p
        cross join unnest($2::text[]) as e`,
      [PRAZOS, ENCAIXES],
    );
    expect(r.erro).toBeNull();
    expect(r.linhas).toHaveLength(24);
    for (const l of r.linhas) {
      expect(l.t, `${l.p} | ${l.e}`).toBe(ESPERADO[`${l.p}|${l.e}`]);
    }
  });

  it('quem depende de banco nunca sai quente, nem querendo comprar amanhã', async () => {
    const r = await comoDono(`select public.temperatura_pela_regra('ate_30_dias', 'depende_banco') as t`);
    expect(r.linhas[0]?.t).toBe('morno');
  });
});

describe('o corretor qualifica o próprio lead', () => {
  it('salva as respostas e recebe o selo calculado pelo banco', async () => {
    // A afirmação positiva vem primeiro: é ela que prova que o corretor tem
    // EXECUTE na função da regra. Sem isso, os "não consegue" abaixo passariam
    // por falta de permissão, e não por acerto da policy.
    const r = await como(
      'corretor',
      `update public.leads
          set finalidade = 'investir', prazo_compra = 'ate_30_dias', encaixe_financeiro = 'cabe'
        where id = $1
    returning temperatura, temperatura_regra`,
      [IDS.leadDoCorretor],
    );
    expect(r.erro).toBeNull();
    expect(r.linhas).toEqual([{ temperatura: 'quente', temperatura_regra: 'quente' }]);
  });

  it('a marcação à mão ganha da regra, e a regra continua guardada ao lado', async () => {
    const r = await como(
      'corretor',
      `update public.leads
          set prazo_compra = 'ate_30_dias', encaixe_financeiro = 'cabe', temperatura_manual = 'frio'
        where id = $1
    returning temperatura, temperatura_regra`,
      [IDS.leadDoCorretor],
    );
    expect(r.erro).toBeNull();
    expect(r.linhas).toEqual([{ temperatura: 'frio', temperatura_regra: 'quente' }]);
  });

  it('ninguém escreve direto no selo — nem a tela, nem um UPDATE apressado', async () => {
    const r = await como('corretor', `update public.leads set temperatura = 'quente' where id = $1`, [
      IDS.leadDoCorretor,
    ]);
    expect(r.erro).toMatch(/generated|DEFAULT/i);
  });

  it('resposta fora da lista é recusada pelo banco', async () => {
    const r = await como('corretor', `update public.leads set prazo_compra = 'semana_que_vem' where id = $1`, [
      IDS.leadDoCorretor,
    ]);
    expect(r.erro).toMatch(/leads_prazo_compra_ck/);
  });

  it('o colega não qualifica o lead que não é dele', async () => {
    const r = await como(
      'colega',
      `update public.leads set prazo_compra = 'ate_30_dias' where id = $1 returning id`,
      [IDS.leadDoCorretor],
    );
    // Sem erro e sem linha: a RLS esconde o lead, e UPDATE no que não se vê
    // não acha o que atualizar.
    expect(r.erro).toBeNull();
    expect(r.linhas).toHaveLength(0);
  });

  it('o gerente qualifica qualquer lead da casa', async () => {
    const r = await como(
      'gerente',
      `update public.leads set prazo_compra = 'de_3_a_6_meses' where id = $1 returning temperatura`,
      [IDS.leadDoCorretor],
    );
    expect(r.erro).toBeNull();
    expect(r.linhas).toEqual([{ temperatura: 'morno' }]);
  });
});

describe('toda qualificação vira linha no histórico', () => {
  const LEAD = IDS.leadDoCorretor;
  const eventos = `select title, description, metadata->>'origem' as origem
                     from public.lead_timeline_events
                    where lead_id = '${LEAD}' and event_type = 'qualificacao'
                    order by occurred_at, id`;

  it('com o selo no título e as respostas por extenso', async () => {
    const r = await comoDonoEDesfaz(
      `update public.leads
          set finalidade = 'investir', prazo_compra = 'de_1_a_3_meses', encaixe_financeiro = 'cabe'
        where id = '${LEAD}';
       ${eventos}`,
    );
    expect(r.erro).toBeNull();
    expect(r.linhas).toEqual([
      {
        title: 'Qualificação: quente',
        description: 'Investir · De 1 a 3 meses · Entrada e parcelas cabem',
        // Sem sessão e sem aviso de origem, quem gravou foi o sistema.
        origem: 'sistema',
      },
    ]);
  });

  it('quem grava sem ser a ficha avisa de onde veio', async () => {
    const r = await comoDonoEDesfaz(
      `select set_config('app.qualificacao_origem', 'whatsapp', true);
       update public.leads set finalidade = 'morar' where id = '${LEAD}';
       ${eventos}`,
    );
    expect(r.erro).toBeNull();
    expect(r.linhas).toEqual([
      {
        title: 'Qualificação: incompleta',
        description: 'Morar · lido da mensagem do WhatsApp',
        origem: 'whatsapp',
      },
    ]);
  });

  it('a marcação à mão aparece no título', async () => {
    const r = await comoDonoEDesfaz(
      `update public.leads set temperatura_manual = 'quente' where id = '${LEAD}';
       ${eventos}`,
    );
    expect(r.erro).toBeNull();
    expect(r.linhas[0]?.title).toBe('Qualificação: quente (marcada à mão)');
  });

  it('salvar sem mudar nada não enche o histórico', async () => {
    const r = await comoDonoEDesfaz(
      `update public.leads set finalidade = finalidade, prazo_compra = prazo_compra where id = '${LEAD}';
       update public.leads set full_name = full_name where id = '${LEAD}';
       ${eventos}`,
    );
    expect(r.erro).toBeNull();
    expect(r.linhas).toHaveLength(0);
  });
});
