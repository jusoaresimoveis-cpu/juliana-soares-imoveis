import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { como, comoDono, comoDonoEDesfaz, conectar, desconectar, prepararPrivilegios, IDS } from './banco';

/**
 * A migration 121, separada de `qualificacao.test.ts` (que fica com a 120): o
 * leitor da primeira mensagem e a porta única de quem grava sem ser a ficha,
 * o mesmo corte de `packages/contracts/src/qualificacao-leitor.test.ts`.
 *
 * Planta a fixtura de novo, como todo arquivo daqui: os arquivos rodam em
 * série, e nada abaixo pode contar com o que outro arquivo deixou no banco.
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

/* -------------------------------------------------------------------------- */
/* A 121 — a pessoa responde sozinha                                          */
/* -------------------------------------------------------------------------- */

describe('o que um texto afirma', () => {
  // Os MESMOS exemplos de `packages/contracts/src/qualificacao-leitor.test.ts`, feitos
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
