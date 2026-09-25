import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { comoDono, conectar, desconectar, prepararPrivilegios, IDS } from './banco';

/**
 * A trava do agente.
 *
 * A regra do dono do produto: o agente só fala em conversa de origem
 * comprovada. Nunca numa conversa pessoal, nunca numa sem origem.
 *
 * Isto NÃO é testado como "o código confere". É testado como "o banco recusa" —
 * porque a função do agente roda com `service_role`, que ignora toda RLS, e a
 * única coisa que `service_role` não ignora é gatilho. Se estes testes passarem
 * a falhar, não é um detalhe de implementação: é a promessa de privacidade que
 * foi feita ao cliente deixando de valer.
 */

const FIXTURA = readFileSync(join(__dirname, 'fixtura.sql'), 'utf8');
const MIGRATIONS = join(__dirname, '..', 'migrations');
const INSTANCIA = '00000000-0000-4000-a000-000000000050';

/** Uma conversa plantada com o estado que o teste precisa. */
async function conversa(id: string, opcoes: { grupo?: boolean; lead?: boolean } = {}) {
  /*
   * `ref_code` é o que torna a conversa um lead de verdade.
   *
   * A primeira versão deste teste amarrou a conversa ao lead da fixtura e
   * esperou que isso bastasse — e o CI reprovou, com razão: aquele lead é
   * `source = 'manual'`, que NÃO é origem comprovada. Origem é id de anúncio,
   * de landing, utm, imóvel, código de referência, ou uma fonte de campanha.
   * Um lead cadastrado à mão é lead para o corretor e não é prova de campanha
   * para o agente — e essa distinção é o produto inteiro.
   */
  await comoDono(
    `insert into public.whatsapp_conversations
       (id, organization_id, instance_id, contact_e164, is_group, group_jid, lead_id, ref_code)
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     on conflict (id) do nothing`,
    [
      id,
      IDS.orgA,
      INSTANCIA,
      opcoes.grupo ? null : `+55479999${id.slice(-4)}`,
      opcoes.grupo ?? false,
      opcoes.grupo ? `${id}@g.us` : null,
      opcoes.lead ? '00000000-0000-4000-a000-000000000040' : null,
      opcoes.lead ? '1002-BR-A' : null,
    ],
  );
}

/** Tenta enfileirar uma saída AUTOMÁTICA (sem autor) e devolve o erro, se houver. */
async function saidaAutomatica(conversaId: string) {
  const m = await comoDono(
    `insert into public.whatsapp_messages
       (organization_id, conversation_id, instance_id, direction, dedupe_key, kind, body, status, occurred_at)
     values ($1, $2, $3, 'saida', 'teste:' || gen_random_uuid()::text, 'texto', 'x', 'enfileirada', now())
     returning id`,
    [IDS.orgA, conversaId, INSTANCIA],
  );
  return comoDono(
    `insert into public.whatsapp_outbox
       (organization_id, conversation_id, instance_id, message_id, to_e164, body, requested_by)
     values ($1, $2, $3, $4, '+5547999990000', 'x', null)`,
    [IDS.orgA, conversaId, INSTANCIA, m.linhas[0]?.id],
  );
}

beforeAll(async () => {
  await conectar();
  await prepararPrivilegios(MIGRATIONS);
  const r = await comoDono(FIXTURA);
  if (r.erro) throw new Error(`fixtura não aplicou: ${r.erro}`);

  await conversa('00000000-0000-4000-a000-000000000060', { lead: true });
  await conversa('00000000-0000-4000-a000-000000000061');
  await conversa('00000000-0000-4000-a000-000000000062', { grupo: true });
}, 60_000);

afterAll(async () => {
  await comoDono(`delete from public.whatsapp_outbox where organization_id = $1`, [IDS.orgA]);
  await desconectar();
});

describe('quem o automático pode responder', () => {
  it('conversa COM origem comprovada: aceita', async () => {
    // A afirmação positiva primeiro. Sem ela, os testes de baixo passariam
    // igual com a trava recusando tudo — inclusive o que deve passar.
    const r = await saidaAutomatica('00000000-0000-4000-a000-000000000060');
    expect(r.erro).toBeNull();
  });

  it('conversa SEM origem: recusada pelo banco', async () => {
    const r = await saidaAutomatica('00000000-0000-4000-a000-000000000061');
    expect(r.erro).toMatch(/origem foi comprovada/i);
  });

  it('conversa de GRUPO (pessoal por definição): recusada pelo banco', async () => {
    const r = await saidaAutomatica('00000000-0000-4000-a000-000000000062');
    expect(r.erro).toMatch(/origem foi comprovada/i);
  });

  it('marcada como pessoal pelo dono: recusada, mesmo tendo sido lead', async () => {
    /*
     * O caso que mais importa. A conversa TEM origem — veio de campanha — e
     * mesmo assim o dono do número decidiu que ela é particular. A decisão dele
     * vence a prova de origem, sempre.
     */
    const id = '00000000-0000-4000-a000-000000000060';
    await comoDono(`update public.whatsapp_conversations set classification = 'pessoal' where id = $1`, [id]);
    const r = await saidaAutomatica(id);
    expect(r.erro).toMatch(/origem foi comprovada/i);
    await comoDono(`update public.whatsapp_conversations set classification = null where id = $1`, [id]);
  });

  it('o corretor, à mão, fala em qualquer conversa dele', async () => {
    // A trava é só para o que não tem gente por trás. A conversa pessoal é do
    // corretor, e travá-lo dentro da própria conversa seria absurdo.
    const m = await comoDono(
      `insert into public.whatsapp_messages
         (organization_id, conversation_id, instance_id, direction, dedupe_key, kind, body, status, occurred_at)
       values ($1, $2, $3, 'saida', 'teste:' || gen_random_uuid()::text, 'texto', 'x', 'enfileirada', now())
       returning id`,
      [IDS.orgA, '00000000-0000-4000-a000-000000000062', INSTANCIA],
    );
    const r = await comoDono(
      `insert into public.whatsapp_outbox
         (organization_id, conversation_id, instance_id, message_id, to_e164, body, requested_by)
       values ($1, $2, $3, $4, '+5547999990000', 'x', $5)`,
      [IDS.orgA, '00000000-0000-4000-a000-000000000062', INSTANCIA, m.linhas[0]?.id, IDS.corretor],
    );
    expect(r.erro).toBeNull();
  });
});

describe('os interruptores', () => {
  it('nascem todos desligados', async () => {
    // Subir a migration não pode ligar nada. É a única ordem segura para algo
    // que fala com cliente.
    const r = await comoDono(
      `select (select count(*)::int from public.organizations where agente_ativo) as orgs,
              (select count(*)::int from public.whatsapp_instances where agente_ativo) as numeros`,
    );
    expect(r.linhas[0]?.orgs).toBe(0);
    expect(r.linhas[0]?.numeros).toBe(0);
  });

  it('com a organização desligada, nada é agendado', async () => {
    await comoDono(
      `insert into public.whatsapp_messages
         (organization_id, conversation_id, instance_id, direction, dedupe_key, kind, body, status, occurred_at)
       values ($1, $2, $3, 'entrada', 'teste:' || gen_random_uuid()::text, 'texto', 'oi', 'recebida', now())`,
      [IDS.orgA, '00000000-0000-4000-a000-000000000060', INSTANCIA],
    );
    const r = await comoDono(
      `select agente_responder_em from public.whatsapp_conversations where id = $1`,
      ['00000000-0000-4000-a000-000000000060'],
    );
    expect(r.linhas[0]?.agente_responder_em).toBeNull();
  });
});

describe('com o agente ligado', () => {
  beforeAll(async () => {
    await comoDono(`update public.organizations set agente_ativo = true where id = $1`, [IDS.orgA]);
    await comoDono(`update public.whatsapp_instances set agente_ativo = true where id = $1`, [INSTANCIA]);
  });

  it('mensagem que chega agenda resposta entre 60 e 180 segundos', async () => {
    /*
     * Não é enfeite: responder em três segundos cravados, sempre, é assinatura
     * de máquina — e assinatura de máquina é o que faz número ser bloqueado.
     */
    const id = '00000000-0000-4000-a000-000000000060';
    await comoDono(`update public.whatsapp_conversations set agente_responder_em = null, agente_espera_desde = null, agente_pausado_em = null where id = $1`, [id]);
    await comoDono(
      `insert into public.whatsapp_messages
         (organization_id, conversation_id, instance_id, direction, dedupe_key, kind, body, status, occurred_at)
       values ($1, $2, $3, 'entrada', 'teste:' || gen_random_uuid()::text, 'texto', 'oi', 'recebida', now())`,
      [IDS.orgA, id, INSTANCIA],
    );
    const r = await comoDono(
      `select extract(epoch from (agente_responder_em - now()))::int as faltam
         from public.whatsapp_conversations where id = $1`,
      [id],
    );
    const faltam = r.linhas[0]?.faltam as number;
    expect(faltam).toBeGreaterThanOrEqual(55);
    expect(faltam).toBeLessThanOrEqual(185);
  });

  it('conversa SEM origem não agenda nada, nem com tudo ligado', async () => {
    const id = '00000000-0000-4000-a000-000000000061';
    await comoDono(
      `insert into public.whatsapp_messages
         (organization_id, conversation_id, instance_id, direction, dedupe_key, kind, body, status, occurred_at)
       values ($1, $2, $3, 'entrada', 'teste:' || gen_random_uuid()::text, 'texto', 'oi', 'recebida', now())`,
      [IDS.orgA, id, INSTANCIA],
    );
    const r = await comoDono(`select agente_responder_em from public.whatsapp_conversations where id = $1`, [id]);
    expect(r.linhas[0]?.agente_responder_em).toBeNull();
  });

  it('o corretor respondendo PAUSA o agente', async () => {
    const id = '00000000-0000-4000-a000-000000000060';
    await comoDono(
      `insert into public.whatsapp_messages
         (organization_id, conversation_id, instance_id, direction, dedupe_key, kind, body, status, occurred_at, sent_by, automatica)
       values ($1, $2, $3, 'saida', 'teste:' || gen_random_uuid()::text, 'texto', 'eu assumo', 'enviada', now(), $4, false)`,
      [IDS.orgA, id, INSTANCIA, IDS.corretor],
    );
    const r = await comoDono(
      `select agente_pausado_em, agente_responder_em from public.whatsapp_conversations where id = $1`,
      [id],
    );
    expect(r.linhas[0]?.agente_pausado_em).not.toBeNull();
    // E o que estava agendado é cancelado: quem assumiu não quer ser
    // interrompido pela IA um minuto depois.
    expect(r.linhas[0]?.agente_responder_em).toBeNull();
  });

  it('a resposta do próprio agente NÃO pausa o agente', async () => {
    const id = '00000000-0000-4000-a000-000000000060';
    await comoDono(`update public.whatsapp_conversations set agente_pausado_em = null where id = $1`, [id]);
    await comoDono(
      `insert into public.whatsapp_messages
         (organization_id, conversation_id, instance_id, direction, dedupe_key, kind, body, status, occurred_at, automatica)
       values ($1, $2, $3, 'saida', 'teste:' || gen_random_uuid()::text, 'texto', 'oi!', 'enviada', now(), true)`,
      [IDS.orgA, id, INSTANCIA],
    );
    const r = await comoDono(`select agente_pausado_em from public.whatsapp_conversations where id = $1`, [id]);
    expect(r.linhas[0]?.agente_pausado_em).toBeNull();
  });

  it('a lista de tarefas só entrega conversa que o agente pode responder', async () => {
    // O banco entrega a lista; o código não escolhe. O pior que um defeito no
    // TypeScript pode fazer é processar algo que o banco já autorizou.
    await comoDono(
      `update public.whatsapp_conversations
          set agente_responder_em = now() - interval '1 minute', agente_pausado_em = null
        where organization_id = $1`,
      [IDS.orgA],
    );
    const r = await comoDono(`select conversa from public.agente_pegar_tarefas(20)`);
    expect(r.erro).toBeNull();
    expect(r.linhas.map((l) => l.conversa)).toEqual(['00000000-0000-4000-a000-000000000060']);
  });
});
