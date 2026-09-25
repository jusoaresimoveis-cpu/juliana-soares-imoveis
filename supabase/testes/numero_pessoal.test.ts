import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { comoDono, conectar, desconectar, prepararPrivilegios, IDS } from './banco';

/**
 * O número que também é pessoal (migration 20260925000000).
 *
 * O WhatsApp da Juliana é o celular dela. Com a marca ligada, só entra no CRM
 * conversa de cliente; o resto não pode virar linha nenhuma, nem ficar na fila
 * com o conteúdo. Aqui se confere o que FICA no banco, porque é isso que importa
 * para quem tem a conversa pessoal: não basta a tela esconder.
 *
 * Os telefones são desta suíte (+554799977xxxx) para não cruzar com os outros
 * arquivos, que rodam no mesmo banco com a marca desligada.
 */

const FIXTURA = readFileSync(join(__dirname, 'fixtura.sql'), 'utf8');
const MIGRATIONS = join(__dirname, '..', 'migrations');
const INSTANCIA = '00000000-0000-4000-a000-000000000050';

interface Mensagem {
  telefone: string;
  texto: string;
  id: string;
  saindo?: boolean;
  grupo?: boolean;
  anuncio?: object;
}

async function evento({ telefone, texto, id, saindo = false, grupo = false, anuncio }: Mensagem) {
  const numero = telefone.replace('+', '');
  const payload = {
    message: {
      id,
      ...(anuncio ? { content: { text: texto, contextInfo: anuncio } } : {}),
      ...(saindo ? { chatid: `${numero}@s.whatsapp.net` } : { sender: `${numero}@s.whatsapp.net` }),
      ...(grupo ? { chatid: '120363000000000001@g.us', groupName: 'Família' } : {}),
      fromMe: saindo,
      isGroup: grupo,
      text: texto,
      senderName: saindo ? undefined : 'Contato',
      messageType: 'text',
      messageTimestamp: String(Date.now()),
    },
  };
  await comoDono(
    `insert into public.whatsapp_inbox (organization_id, instance_id, provider_event_id, event_type, payload)
     values ($1, $2, $3, 'messages', $4::jsonb)`,
    [IDS.orgA, INSTANCIA, id, JSON.stringify(payload)],
  );
  const r = await comoDono(`select public.processar_inbox(20) as n`);
  if (r.erro) throw new Error(`processar_inbox: ${r.erro}`);
}

async function oQueFicou(telefone: string, id: string) {
  const r = await comoDono(
    `select (select count(*)::int from public.whatsapp_conversations where contact_e164 = $1) as conversas,
            (select count(*)::int from public.whatsapp_messages where provider_message_id = $2) as mensagens,
            (select count(*)::int from public.leads where phone_e164 = public.to_e164($1, 'BR')) as leads,
            (select status from public.whatsapp_inbox where provider_event_id = $2) as fila,
            (select payload = '{}'::jsonb from public.whatsapp_inbox where provider_event_id = $2) as fila_vazia`,
    [telefone, id],
  );
  return r.linhas[0] as { conversas: number; mensagens: number; leads: number; fila: string; fila_vazia: boolean };
}

beforeAll(async () => {
  await conectar();
  await prepararPrivilegios(MIGRATIONS);
  const r = await comoDono(FIXTURA);
  if (r.erro) throw new Error(`fixtura não aplicou: ${r.erro}`);
  await comoDono(`update public.organizations set whatsapp_numero_pessoal = true where id = $1`, [IDS.orgA]);
}, 60_000);

afterAll(async () => {
  await comoDono(`update public.organizations set whatsapp_numero_pessoal = false where id = $1`, [IDS.orgA]);
  await comoDono(`delete from public.whatsapp_inbox where organization_id = $1`, [IDS.orgA]);
  await desconectar();
});

describe('com a marca ligada', () => {
  it('conversa pessoal não deixa rastro: nem conversa, nem mensagem, nem conteúdo na fila', async () => {
    await evento({ telefone: '+5547999770001', texto: 'Oi filha, vem jantar hoje?', id: 'pessoal-1' });
    expect(await oQueFicou('+5547999770001', 'pessoal-1')).toEqual({
      conversas: 0,
      mensagens: 0,
      leads: 0,
      fila: 'ignorado',
      fila_vazia: true,
    });
  });

  it('grupo nunca entra', async () => {
    await evento({ telefone: '+5547999770002', texto: 'Bom dia, família!', id: 'grupo-1', grupo: true });
    const r = await comoDono(
      `select count(*)::int as n from public.whatsapp_conversations where group_jid = '120363000000000001@g.us'`,
    );
    expect(r.linhas[0]?.n).toBe(0);
  });

  it('com o código do link rastreado vira lead, e a conversa entra', async () => {
    await evento({ telefone: '+5547999770003', texto: 'Olá! Vi no site. Ref. 1002-BR-A', id: 'ref-1' });
    const ficou = await oQueFicou('+5547999770003', 'ref-1');
    expect(ficou).toMatchObject({ conversas: 1, mensagens: 1, leads: 1, fila: 'processado' });
  });

  it('e dali em diante as mensagens do cliente entram, mesmo sem código', async () => {
    await evento({ telefone: '+5547999770003', texto: 'Ainda está disponível?', id: 'ref-2' });
    expect(await oQueFicou('+5547999770003', 'ref-2')).toMatchObject({ mensagens: 1, fila: 'processado' });
  });

  it('o que ela manda para um cliente entra; para quem não é cliente, não', async () => {
    await evento({ telefone: '+5547999770003', texto: 'Está sim! Quer visitar?', id: 'saida-cliente', saindo: true });
    expect(await oQueFicou('+5547999770003', 'saida-cliente')).toMatchObject({ mensagens: 1 });

    await evento({ telefone: '+5547999770004', texto: 'Mãe, chego às 8', id: 'saida-pessoal', saindo: true });
    expect(await oQueFicou('+5547999770004', 'saida-pessoal')).toMatchObject({
      conversas: 0,
      mensagens: 0,
      fila_vazia: true,
    });
  });

  it('anúncio de clique para WhatsApp também é prova', async () => {
    await evento({
      telefone: '+5547999770005',
      texto: 'Olá! Quero mais informações.',
      id: 'ctwa-1',
      anuncio: {
        conversionSource: 'FB_Ads',
        entryPointConversionSource: 'ctwa_ad',
        externalAdReply: { sourceID: '120200000000000009', ctwaClid: 'clid-teste' },
      },
    });
    expect(await oQueFicou('+5547999770005', 'ctwa-1')).toMatchObject({ conversas: 1, mensagens: 1, leads: 1 });
  });
});

describe('com a marca desligada (o número da empresa, como na origem)', () => {
  it('a conversa sem prova entra na tela, sem lead', async () => {
    await comoDono(`update public.organizations set whatsapp_numero_pessoal = false where id = $1`, [IDS.orgA]);
    try {
      await evento({ telefone: '+5547999770006', texto: 'Bom dia, é da imobiliária?', id: 'empresa-1' });
      expect(await oQueFicou('+5547999770006', 'empresa-1')).toMatchObject({ conversas: 1, mensagens: 1, leads: 0 });
    } finally {
      await comoDono(`update public.organizations set whatsapp_numero_pessoal = true where id = $1`, [IDS.orgA]);
    }
  });
});
