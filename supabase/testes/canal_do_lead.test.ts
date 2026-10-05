import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { refDoSite } from '../../packages/contracts/src/rastreio';
import { comoDono, conectar, desconectar, prepararPrivilegios, IDS } from './banco';

/**
 * O canal de onde o lead veio (migration 20261005000000).
 *
 * O código do WhatsApp leva o canal no meio (`Ref. 1004-GO-A`), e o banco grava
 * a origem do lead a partir dele. Aqui se confere o lead que FICA: a origem é o
 * que o painel soma por canal, e um canal lido errado não dá erro, só conta o
 * cliente do Google como "Site".
 *
 * Telefones desta suíte: +554799976xxxx, para não cruzar com os outros arquivos.
 */

const FIXTURA = readFileSync(join(__dirname, 'fixtura.sql'), 'utf8');
const MIGRATIONS = join(__dirname, '..', 'migrations');
const INSTANCIA = '00000000-0000-4000-a000-000000000050';

async function chega(telefone: string, texto: string, id: string) {
  const numero = telefone.replace('+', '');
  const payload = {
    message: {
      id,
      sender: `${numero}@s.whatsapp.net`,
      fromMe: false,
      isGroup: false,
      text: texto,
      senderName: 'Contato',
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

async function oLead(telefone: string) {
  const r = await comoDono(
    `select l.source as origem,
            (select c.ref_code from public.whatsapp_conversations c
              where c.contact_e164 = $1 order by c.created_at desc limit 1) as codigo
       from public.leads l
      where l.phone_e164 = public.to_e164($1, 'BR')`,
    [telefone],
  );
  return r.linhas[0] as { origem: string; codigo: string | null } | undefined;
}

beforeAll(async () => {
  await conectar();
  await prepararPrivilegios(MIGRATIONS);
  const r = await comoDono(FIXTURA);
  if (r.erro) throw new Error(`fixtura não aplicou: ${r.erro}`);
  // Como na Juliana: o número também é pessoal.
  await comoDono(`update public.organizations set whatsapp_numero_pessoal = true where id = $1`, [IDS.orgA]);
}, 60_000);

afterAll(async () => {
  await comoDono(`update public.organizations set whatsapp_numero_pessoal = false where id = $1`, [IDS.orgA]);
  await comoDono(`delete from public.whatsapp_inbox where organization_id = $1`, [IDS.orgA]);
  await desconectar();
});

describe('o canal no código vira a origem do lead', () => {
  it.each([
    ['go', 'google', '+5547999760001'],
    ['bi', 'link_bio', '+5547999760002'],
    ['mk', 'marketplace', '+5547999760003'],
    ['ga', 'google_ads', '+5547999760004'],
    ['ig', 'instagram', '+5547999760005'],
    ['fb', 'facebook', '+5547999760006'],
  ] as const)('%s → %s', async (canal, origem, telefone) => {
    await chega(telefone, `Olá, Juliana! (${refDoSite(undefined, canal)})`, `canal-${canal}`);
    expect(await oLead(telefone)).toEqual({ origem, codigo: `SITE-${canal.toUpperCase()}-A` });
  });

  it('com imóvel, o canal vale do mesmo jeito', async () => {
    await chega('+5547999760007', `Tenho interesse no imóvel 1002. (${refDoSite('1002', 'mk')})`, 'canal-imovel');
    expect(await oLead('+5547999760007')).toEqual({ origem: 'marketplace', codigo: '1002-MK-A' });
  });

  it('sem canal, a origem é o site, e não "whatsapp"', async () => {
    await chega('+5547999760008', `Olá, Juliana! Vim pelo site. (${refDoSite()})`, 'canal-nenhum');
    expect(await oLead('+5547999760008')).toEqual({ origem: 'landing_page', codigo: 'SITE-A' });
  });

  it('canal que o banco não conhece também conta como site', async () => {
    await chega('+5547999760009', 'Olá! Ref. 1002-ZZ-A', 'canal-desconhecido');
    expect(await oLead('+5547999760009')).toMatchObject({ origem: 'landing_page' });
  });

  it('quem já era lead não muda de origem: o primeiro contato é o que conta', async () => {
    await comoDono(
      `select public.find_or_create_lead($1, 'Já cadastrada', '+5547999760010', 'BR', null, 'indicacao')`,
      [IDS.orgA],
    );
    await chega('+5547999760010', `Oi! (${refDoSite(undefined, 'go')})`, 'canal-ja-lead');
    expect(await oLead('+5547999760010')).toMatchObject({ origem: 'indicacao' });
  });
});
