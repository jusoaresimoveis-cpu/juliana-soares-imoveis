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

/* -------------------------------------------------------------------------- */
/* A 121 — a pessoa responde sozinha                                          */
/* -------------------------------------------------------------------------- */

describe('o que um texto afirma', () => {
  // Os MESMOS exemplos de `packages/contracts/qualificacao.test.ts`, feitos
  // agora ao leitor de verdade. Se as duas listas divergirem, uma delas está
  // testando outra coisa.
  const EXEMPLOS: [string, string | null][] = [
    ['Quero investir', 'investir'],
    ['Quero morar em Porto Belo', 'morar'],
    ['Quero um apartamento para veraneio', 'segunda_residencia'],
    ['Quiero invertir', 'investir'],
    ['Quiero vivir en Porto Belo', 'morar'],
    ['Quiero un departamento para vacaciones', 'segunda_residencia'],
    ['Olá!  QUERO   INVESTIR em Porto Belo. Ref. 1002-BR-A', 'investir'],
    ['Quero valores e plantas', null],
    ['Olá! Tenho interesse neste imóvel', null],
    ['Não quero investir agora', null],
    ['No quiero invertir', null],
    ['Quero morar ou quero investir, ainda não sei', null],
    ['Quero investir. Quiero invertir.', 'investir'],
    ['', null],
  ];

  it.each(EXEMPLOS)('%j → %j', async (texto, esperado) => {
    const r = await comoDono('select public.finalidade_do_texto($1) as f', [texto]);
    expect(r.erro).toBeNull();
    expect(r.linhas[0]?.f ?? null).toBe(esperado);
  });

  it('nulo não vira resposta', async () => {
    const r = await comoDono('select public.finalidade_do_texto(null) as f');
    expect(r.linhas[0]?.f ?? null).toBeNull();
  });
});

describe('a primeira mensagem do WhatsApp preenche a ficha', () => {
  const LEAD = IDS.leadDoCorretor;
  const CONVERSA = '00000000-0000-4000-a000-000000000080';
  const DE_ANUNCIO = `'{"message":{"content":{"contextInfo":{"entryPointConversionSource":"ctwa_ad"}}}}'::jsonb`;
  const SEM_PROVA = `'{"message":{"text":"x"}}'::jsonb`;

  const conversa = `insert into public.whatsapp_conversations
      (id, organization_id, instance_id, contact_e164, is_group, lead_id)
    values ('${CONVERSA}', '${IDS.orgA}', '${IDS.instanciaA}', '+5547999990080', false, '${LEAD}')
    on conflict (id) do nothing;`;

  const mensagem = (corpo: string, raw: string, refCode: string | null = null) =>
    `insert into public.whatsapp_messages
       (organization_id, conversation_id, instance_id, direction, dedupe_key, kind, body,
        ref_code, status, occurred_at, raw)
     values ('${IDS.orgA}', '${CONVERSA}', '${IDS.instanciaA}', 'entrada',
             'teste:' || gen_random_uuid()::text, 'texto', '${corpo}',
             ${refCode ? `'${refCode}'` : 'null'}, 'recebida', now(), ${raw});`;

  const ficha = `select l.finalidade,
                        (select e.description from public.lead_timeline_events e
                          where e.lead_id = l.id and e.event_type = 'qualificacao'
                          order by e.occurred_at desc, e.id desc limit 1) as historico
                   from public.leads l where l.id = '${LEAD}'`;

  it('o toque numa pergunta do anúncio vira finalidade, e o histórico diz de onde veio', async () => {
    const r = await comoDonoEDesfaz(`${conversa} ${mensagem('Quero investir', DE_ANUNCIO)} ${ficha}`);
    expect(r.erro).toBeNull();
    expect(r.linhas).toEqual([{ finalidade: 'investir', historico: 'Investir · lido da mensagem do WhatsApp' }]);
  });

  it('a mensagem montada pela landing também, pela porta dela', async () => {
    const r = await comoDonoEDesfaz(
      `${conversa} ${mensagem('Olá! Quero morar em Porto Belo. Ref. 1002-BR-A', SEM_PROVA, '1002-BR-A')} ${ficha}`,
    );
    expect(r.erro).toBeNull();
    expect(r.linhas).toEqual([{ finalidade: 'morar', historico: 'Morar · respondido na landing page' }]);
  });

  it('conversa solta, sem prova de origem, não é lida', async () => {
    const r = await comoDonoEDesfaz(`${conversa} ${mensagem('Quero investir', SEM_PROVA)} ${ficha}`);
    expect(r.erro).toBeNull();
    expect(r.linhas).toEqual([{ finalidade: null, historico: null }]);
  });

  it('NUNCA sobrescreve o que o corretor já anotou', async () => {
    const r = await comoDonoEDesfaz(
      `update public.leads set finalidade = 'morar' where id = '${LEAD}';
       ${conversa} ${mensagem('Quero investir', DE_ANUNCIO)}
       select finalidade from public.leads where id = '${LEAD}'`,
    );
    expect(r.erro).toBeNull();
    expect(r.linhas).toEqual([{ finalidade: 'morar' }]);
  });

  it('a mensagem entra mesmo quando o texto não diz nada', async () => {
    const r = await comoDonoEDesfaz(
      `${conversa} ${mensagem('Olá! Tenho interesse', DE_ANUNCIO)}
       select count(*)::int as n from public.whatsapp_messages where conversation_id = '${CONVERSA}'`,
    );
    expect(r.erro).toBeNull();
    expect(r.linhas).toEqual([{ n: 1 }]);
  });
});

describe('a porta única de quem grava sem ser a ficha', () => {
  const LEAD = IDS.leadDoCorretor;

  it('existe e grava, para quem tem poderes de servidor', async () => {
    // A afirmação positiva primeiro: sem ela, o "permission denied" abaixo
    // poderia ser só uma função que não existe.
    const r = await comoDonoEDesfaz(
      `select public.lead_preencher_qualificacao('${LEAD}', 'landing', 'investir') as gravou`,
    );
    expect(r.erro).toBeNull();
    expect(r.linhas).toEqual([{ gravou: true }]);
  });

  it('o corretor logado não chama: a tela grava pela tabela, sob a RLS', async () => {
    const r = await como('corretor', `select public.lead_preencher_qualificacao($1, 'landing', 'investir')`, [
      LEAD,
    ]);
    expect(r.erro).toMatch(/permission denied/i);
  });

  it('origem fora da lista é recusada', async () => {
    const r = await comoDonoEDesfaz(
      `select public.lead_preencher_qualificacao('${LEAD}', 'telepatia', 'investir')`,
    );
    expect(r.erro).toMatch(/origem de qualificacao desconhecida/);
  });

  it('o aviso de origem não vaza para a gravação seguinte da mesma transação', async () => {
    // `processar_inbox` trata várias mensagens numa transação só. Se o aviso
    // ficasse de pé, a segunda linha do histórico sairia carimbada "whatsapp".
    const r = await comoDonoEDesfaz(
      `select public.lead_preencher_qualificacao('${LEAD}', 'whatsapp', 'investir');
       update public.leads set prazo_compra = 'ate_30_dias' where id = '${LEAD}';
       select metadata->>'origem' as origem, metadata->>'prazo_compra' as prazo
         from public.lead_timeline_events
        where lead_id = '${LEAD}' and event_type = 'qualificacao'`,
    );
    expect(r.erro).toBeNull();
    // Pelo CONTEÚDO, e não pela ordem: as duas linhas nascem na mesma
    // transação, com o mesmo `now()`, e o id é aleatório.
    const porPrazo = Object.fromEntries(r.linhas.map((l) => [String(l.prazo), l.origem]));
    expect(porPrazo).toEqual({ null: 'whatsapp', ate_30_dias: 'sistema' });
  });
});
