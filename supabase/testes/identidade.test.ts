import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { comoDono, conectar, desconectar, prepararPrivilegios, IDS } from './banco';

/**
 * Os três caminhos de identidade de uma conversa.
 *
 * A tabela pode ser identificada de três jeitos — por CONTATO (telefone), por
 * GRUPO (o jid do grupo) e por LID (o identificador anônimo que o WhatsApp
 * passou a usar). Existe um índice único para cada um. E `on conflict` aponta
 * para UM índice.
 *
 * O `insert` apontava sempre para o de contato. Os outros dois quebraram de
 * jeitos diferentes, e nenhum deles apareceu como erro na tela:
 *
 *   GRUPO  a linha não entrava em nenhum índice, então nada segurava: cada
 *          mensagem criava uma conversa nova. 53 linhas para 8 grupos.
 *   LID    a linha entrava num índice que o `on conflict` não conhecia: virava
 *          exceção, cinco tentativas, e o evento morria. Mensagem perdida.
 */

const FIXTURA = readFileSync(join(__dirname, 'fixtura.sql'), 'utf8');
const MIGRATIONS = join(__dirname, '..', 'migrations');
const INSTANCIA = '00000000-0000-4000-a000-000000000050';

async function enfileira(msg: Record<string, unknown>, id: string) {
  await comoDono(
    `insert into public.whatsapp_inbox (organization_id, instance_id, provider_event_id, event_type, payload)
     values ($1, $2, $3, 'messages', $4::jsonb)`,
    [IDS.orgA, INSTANCIA, id, JSON.stringify({ message: { id, ...msg } })],
  );
}

const base = { fromMe: false, messageType: 'text', messageTimestamp: String(Date.now()) };

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

describe('conversa de grupo', () => {
  it('duas pessoas falando no MESMO grupo dão UMA conversa', async () => {
    const grupo = { isGroup: true, chatid: '120363000000000001@g.us', groupName: 'Contratos' };
    await enfileira({ ...base, ...grupo, sender_pn: '5547911110001@s.whatsapp.net', senderName: 'Jose', text: 'bom dia' }, 'g-1');
    await enfileira({ ...base, ...grupo, sender_pn: '5547911110002@s.whatsapp.net', senderName: 'Maria', text: 'oi' }, 'g-2');
    await comoDono(`select public.processar_inbox(20)`);

    const r = await comoDono(
      `select contact_name, group_subject, contact_e164, lead_id
         from public.whatsapp_conversations where group_jid = $1`,
      ['120363000000000001@g.us'],
    );
    expect(r.linhas.length).toBe(1);

    // O nome que a lista mostra é o do GRUPO. Era o do último que falou, e por
    // isso a tela repetia o mesmo nome oito vezes seguidas.
    expect(r.linhas[0]?.contact_name).toBe('Contratos');
    // Grupo não é pessoa: não guarda telefone de participante.
    expect(r.linhas[0]?.contact_e164).toBeNull();
    // E nunca vira lead, por mais que chegue mensagem.
    expect(r.linhas[0]?.lead_id).toBeNull();
  });

  it('as duas mensagens ficam na mesma conversa', async () => {
    const r = await comoDono(
      `select count(*)::int as n from public.whatsapp_messages m
         join public.whatsapp_conversations c on c.id = m.conversation_id
        where c.group_jid = $1`,
      ['120363000000000001@g.us'],
    );
    expect(r.linhas[0]?.n).toBe(2);
  });
});

describe('contato sem telefone (LID)', () => {
  it('duas mensagens do mesmo LID não perdem nada', async () => {
    const lid = '125340148080999@lid';
    await enfileira({ ...base, isGroup: false, sender: lid, chatid: lid, senderName: 'Anônimo', text: 'primeira' }, 'l-1');
    await comoDono(`select public.processar_inbox(20)`);
    await enfileira({ ...base, isGroup: false, sender: lid, chatid: lid, senderName: 'Anônimo', text: 'segunda' }, 'l-2');
    const r = await comoDono(`select public.processar_inbox(20)`);
    expect(r.erro).toBeNull();

    // A segunda mensagem batia no índice do LID, virava exceção e o evento
    // morria depois de cinco tentativas. Aqui ela tem de estar viva.
    const falhos = await comoDono(
      `select count(*)::int as n from public.whatsapp_inbox
        where organization_id = $1 and status = 'falhou'`,
      [IDS.orgA],
    );
    expect(falhos.linhas[0]?.n).toBe(0);

    const conv = await comoDono(
      `select c.id, count(m.id)::int as msgs
         from public.whatsapp_conversations c
         left join public.whatsapp_messages m on m.conversation_id = c.id
        where c.contact_lid = $1 group by c.id`,
      [lid],
    );
    expect(conv.linhas.length).toBe(1);
    expect(conv.linhas[0]?.msgs).toBe(2);
  });
});
