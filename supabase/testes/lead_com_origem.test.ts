import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { comoDono, conectar, desconectar, prepararPrivilegios, IDS } from './banco';

/**
 * O que conta como LEAD, e o que é só conversa.
 *
 * Lead é oportunidade com ORIGEM CONHECIDA: é o que se divide pelo gasto de
 * anúncio para saber quanto custou. Um WhatsApp de imobiliária recebe muito mais
 * do que isso — o síndico, o despachante, o conhecido, o telemarketing. Quando
 * tudo virava lead, o denominador crescia com gente que nunca viu um anúncio e o
 * custo por lead aparecia barato. A verba é decidida em cima desse número.
 *
 * No primeiro dia com o número no ar isso encheu o funil com três contatos que
 * não eram lead nenhum. Estes testes existem para não acontecer de novo.
 */

const FIXTURA = readFileSync(join(__dirname, 'fixtura.sql'), 'utf8');
const MIGRATIONS = join(__dirname, '..', 'migrations');

const INSTANCIA = '00000000-0000-4000-a000-000000000050';

/** Enfileira um evento de mensagem como o provedor manda, e processa. */
async function chega(telefone: string, texto: string, id: string, anuncio?: object) {
  const payload = {
    message: {
      id,
      ...(anuncio ? { content: { text: texto, contextInfo: anuncio } } : {}),
      sender: `${telefone.replace('+', '')}@s.whatsapp.net`,
      fromMe: false,
      isGroup: false,
      text: texto,
      senderName: 'Fulano',
      messageType: 'text',
      // Milissegundos, como o UAZAPI manda de verdade.
      messageTimestamp: String(Date.now()),
    },
  };
  await comoDono(
    `insert into public.whatsapp_inbox (organization_id, instance_id, provider_event_id, event_type, payload)
     values ($1, $2, $3, 'messages', $4::jsonb)`,
    [IDS.orgA, INSTANCIA, id, JSON.stringify(payload)],
  );
  return comoDono(`select public.processar_inbox(20) as n`);
}

beforeAll(async () => {
  await conectar();
  await prepararPrivilegios(MIGRATIONS);
  const r = await comoDono(FIXTURA);
  if (r.erro) throw new Error(`fixtura não aplicou: ${r.erro}`);
}, 60_000);

afterAll(async () => {
  await comoDono(`delete from public.whatsapp_inbox where organization_id = $1`, [IDS.orgA]);
  await desconectar();
});

describe('o instante que veio do provedor', () => {
  it('milissegundo e segundo dão o mesmo instante', async () => {
    // O bug que colocou as 25 primeiras mensagens do cliente no ano 58599.
    const r = await comoDono(
      `select public.instante_do_provedor('1787063105000') = public.instante_do_provedor('1787063105') as igual`,
    );
    expect(r.linhas[0]?.igual).toBe(true);
  });

  it('nada vira nulo, e o texto vazio também', async () => {
    const r = await comoDono(
      `select public.instante_do_provedor(null) is null as a, public.instante_do_provedor('') is null as b`,
    );
    expect(r.linhas[0]?.a).toBe(true);
    expect(r.linhas[0]?.b).toBe(true);
  });
});

describe('mensagem que chega', () => {
  it('SEM prova de origem não cria lead — mas cria a conversa', async () => {
    const antes = await comoDono(`select count(*)::int as n from public.leads`);
    await chega('+5547988880001', 'Oi Juliana, tudo bem? Aqui é o síndico', 'evt-sem-ref-1');

    const depois = await comoDono(`select count(*)::int as n from public.leads`);
    expect(depois.linhas[0]?.n).toBe(antes.linhas[0]?.n);

    const conversa = await comoDono(
      `select lead_id from public.whatsapp_conversations where contact_e164 = '+5547988880001'`,
    );
    expect(conversa.linhas.length).toBe(1);
    expect(conversa.linhas[0]?.lead_id).toBeNull();
  });

  it('COM o código de referência da landing vira lead, com a variante', async () => {
    /*
     * Este é o outro lado do risco. Fechar demais seria pior do que abrir: se o
     * código não fosse reconhecido, nenhum lead de campanha entraria e ninguém
     * perceberia — o painel mostraria zero e pareceria "não vendeu".
     *
     * O texto é exatamente o que `linkWhatsapp` monta em src/publico/pecas.tsx.
     */
    await chega(
      '+5547988880002',
      'Olá! Tenho interesse neste imóvel: Apartamento 2 dormitórios · Porto Belo, SC. Ref. 1002-BR-A',
      'evt-com-ref-1',
    );

    const lead = await comoDono(
      `select l.source, l.entry_point, l.ft_variant
         from public.leads l where l.phone_e164 = '+5547988880002'`,
    );
    expect(lead.linhas.length).toBe(1);
    expect(lead.linhas[0]?.source).toBe('whatsapp');
    // A variante é o que o painel de A/B lê. Sem ela o lead existe e não conta
    // para nenhuma das três páginas.
    expect(lead.linhas[0]?.ft_variant).toBe('a');
  });

  it('e uma conversa não herda o lead da mensagem anterior do lote', async () => {
    /*
     * A armadilha da mudança: `v_lead` é declarado uma vez e o laço processa até
     * vinte eventos. Sem zerar a cada volta, a conversa sem origem que vier
     * DEPOIS de uma com origem nasceria grudada no lead da outra pessoa — e o
     * corretor veria a mensagem de um estranho dentro da ficha de um cliente.
     */
    await comoDono(`delete from public.whatsapp_inbox where organization_id = $1`, [IDS.orgA]);

    await chega('+5547988880003', 'Ref. 1002-BR-A quero saber mais', 'evt-lote-com-ref');
    await chega('+5547988880004', 'bom dia, é da imobiliária?', 'evt-lote-sem-ref');

    const r = await comoDono(
      `select contact_e164, lead_id from public.whatsapp_conversations
        where contact_e164 in ('+5547988880003','+5547988880004') order by contact_e164`,
    );
    expect(r.linhas.length).toBe(2);
    expect(r.linhas[0]?.lead_id).not.toBeNull();
    expect(r.linhas[1]?.lead_id).toBeNull();
  });
});

describe('o lead que veio de anúncio', () => {
  /*
   * O caso que a primeira versão da regra deixou passar — e passou justamente o
   * único que importava. Das 21 pessoas que mandaram mensagem no primeiro dia
   * com o número no ar, UMA veio de anúncio, e foi a única que não virou lead:
   * a saudação do Click To WhatsApp é escrita dentro da Meta e não carrega o
   * nosso `Ref.`.
   *
   * A prova está embaixo, no `contextInfo`, e é a plataforma assinando.
   */
  const CTWA = {
    conversionSource: 'FB_Ads',
    entryPointConversionApp: 'facebook',
    entryPointConversionSource: 'ctwa_ad',
    externalAdReply: {
      sourceType: 'ad',
      sourceApp: 'facebook',
      sourceID: '120200000000000001',
      ctwaClid: 'AfjTESTE0000',
    },
  };

  it('vira lead com a origem, o método e o ID DO ANÚNCIO', async () => {
    await chega(
      '+5551988880010',
      'Olá! Tenho interesse e queria mais informações, por favor.',
      'evt-ctwa-1',
      CTWA,
    );

    const r = await comoDono(
      `select source, attribution_method, ft_meta_ad_id, ft_utm_source, fbclid
         from public.leads where phone_e164 = '+5551988880010'`,
    );
    expect(r.linhas.length).toBe(1);
    expect(r.linhas[0]?.source).toBe('meta_ads');
    expect(r.linhas[0]?.attribution_method).toBe('ctwa');
    // O id do anúncio é o que liga este lead ao gasto daquela peça. Sem ele o
    // lead existe e o custo por lead continua sendo um número por imobiliária,
    // não por criativo — que é onde a decisão de verba realmente acontece.
    expect(r.linhas[0]?.ft_meta_ad_id).toBe('120200000000000001');
    expect(r.linhas[0]?.fbclid).toBe('AfjTESTE0000');
  });

  it('o método "ctwa" é aceito pelo banco', async () => {
    // O CHECK de `attribution_method` tinha DUAS restrições sobre a mesma
    // coluna, e a que barrava não era a que o nome sugeria. O reprocessamento
    // falhou com `violates check constraint "leads_method_ck"`.
    const r = await comoDono(
      `select count(*)::int as n from pg_constraint
        where conrelid = 'public.leads'::regclass
          and pg_get_constraintdef(oid) ilike '%attribution_method%'`,
    );
    expect(r.linhas[0]?.n).toBe(1);
  });
});

describe('o primeiro contato', () => {
  /*
   * Antes, `first_contact_at` só era gravado quando o lead saía da primeira
   * etapa do funil — ou seja, media o arrastar do cartão, não o atendimento.
   * Quem respondia no WhatsApp e não mexia no Kanban ficava "pendente" para
   * sempre, e quem arrastava sem falar com ninguém contava como atendido.
   *
   * O estrago não era o rótulo: o painel calcula o tempo médio de resposta a
   * partir deste campo. Com ele vazio na maioria, a média saía da minoria que
   * por acaso teve o cartão movido — um número que parece existir e não
   * significa nada.
   */
  it('é gravado quando a imobiliária responde, sem mexer no funil', async () => {
    const lead = await comoDono(
      `select id, first_contact_at from public.leads where phone_e164 = '+5551988880010'`,
    );
    const leadId = lead.linhas[0]?.id as string;
    expect(lead.linhas[0]?.first_contact_at).toBeNull();

    const conv = await comoDono(
      `select id from public.whatsapp_conversations where lead_id = $1`,
      [leadId],
    );
    await comoDono(
      `insert into public.whatsapp_messages
         (organization_id, conversation_id, lead_id, instance_id, direction, dedupe_key,
          kind, body, status, occurred_at)
       values ($1, $2, $3, $4, 'saida', 'teste:' || gen_random_uuid()::text,
               'texto', 'oi', 'enviada', now())`,
      [IDS.orgA, conv.linhas[0]?.id, leadId, '00000000-0000-4000-a000-000000000050'],
    );

    const depois = await comoDono(`select first_contact_at from public.leads where id = $1`, [leadId]);
    expect(depois.linhas[0]?.first_contact_at).not.toBeNull();
  });

  it('acontece uma vez: a segunda resposta não reescreve a primeira', async () => {
    const lead = await comoDono(
      `select id, first_contact_at from public.leads where phone_e164 = '+5551988880010'`,
    );
    const leadId = lead.linhas[0]?.id as string;
    const primeiro = lead.linhas[0]?.first_contact_at;

    const conv = await comoDono(`select id from public.whatsapp_conversations where lead_id = $1`, [leadId]);
    await comoDono(
      `insert into public.whatsapp_messages
         (organization_id, conversation_id, lead_id, instance_id, direction, dedupe_key,
          kind, body, status, occurred_at)
       values ($1, $2, $3, $4, 'saida', 'teste:' || gen_random_uuid()::text,
               'texto', 'segunda', 'enviada', now() + interval '5 minutes')`,
      [IDS.orgA, conv.linhas[0]?.id, leadId, '00000000-0000-4000-a000-000000000050'],
    );

    const depois = await comoDono(`select first_contact_at from public.leads where id = $1`, [leadId]);
    expect(depois.linhas[0]?.first_contact_at).toEqual(primeiro);
  });

  it('mensagem que CHEGA não conta como contato nosso', async () => {
    // O lead escrever de novo não é a imobiliária respondendo.
    const lead = await comoDono(`select id from public.leads where phone_e164 = '+5547988880002'`);
    const leadId = lead.linhas[0]?.id as string;
    const conv = await comoDono(`select id from public.whatsapp_conversations where lead_id = $1`, [leadId]);
    await comoDono(
      `insert into public.whatsapp_messages
         (organization_id, conversation_id, lead_id, instance_id, direction, dedupe_key,
          kind, body, status, occurred_at)
       values ($1, $2, $3, $4, 'entrada', 'teste:' || gen_random_uuid()::text,
               'texto', 'alo?', 'recebida', now())`,
      [IDS.orgA, conv.linhas[0]?.id, leadId, '00000000-0000-4000-a000-000000000050'],
    );
    const r = await comoDono(`select first_contact_at from public.leads where id = $1`, [leadId]);
    expect(r.linhas[0]?.first_contact_at).toBeNull();
  });
});
