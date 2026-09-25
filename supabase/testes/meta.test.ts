import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { como, comoDono, comoDonoEDesfaz, conectar, desconectar, prepararPrivilegios, IDS } from './banco';

/**
 * A conta de anúncio não muda de dono sozinha — a migration 082.
 *
 * O defeito era discreto e chegava longe: `meta-conectar` gravava com
 * `upsert(..., { onConflict: 'ad_account_id' })`, e o único de `ad_account_id`
 * é GLOBAL. `on conflict do update` sobre um único global não recusa nada — ele
 * reescreve a linha inteira, `organization_id` inclusive. Clicar em "Buscar da
 * Meta" numa imobiliária transferia para ela a conta de anúncio, ou a página do
 * Facebook, de outra.
 *
 * O comentário da 017 promete, por escrito, o contrário: "a primeira que provar
 * posse fica com a página, e a segunda recebe erro na hora de conectar, não em
 * silêncio no webhook". Estes testes são o que faz a frase virar verdade.
 */

const FIXTURA = readFileSync(join(__dirname, 'fixtura.sql'), 'utf8');
const MIGRATIONS = join(__dirname, '..', 'migrations');

const CONTA = 'act_999000111';
const PAGINA = '900900900';

beforeAll(async () => {
  await conectar();
  await prepararPrivilegios(MIGRATIONS);
  const r = await comoDono(FIXTURA);
  if (r.erro) throw new Error(`fixtura não aplicou: ${r.erro}`);
}, 60_000);

afterAll(async () => {
  await desconectar();
});

describe('reivindicar conta de anúncio', () => {
  it('a primeira imobiliária registra a conta', async () => {
    // Positiva primeiro: uma função que recusasse tudo passaria nos testes de
    // baixo sem proteger nada.
    const r = await comoDonoEDesfaz(`
      select public.meta_reivindicar_conta('${IDS.conexaoA}', '${CONTA}', 'Conta de teste', 'BRL', 'America/Sao_Paulo') as r;
    `);
    expect(r.erro).toBeNull();
    expect(r.linhas[0]?.r).toBe('criada');
  });

  it('a segunda NÃO leva a conta da primeira', async () => {
    const r = await comoDonoEDesfaz(`
      select public.meta_reivindicar_conta('${IDS.conexaoA}', '${CONTA}', 'Conta da A', 'BRL', 'America/Sao_Paulo');
      select public.meta_reivindicar_conta('${IDS.conexaoB}', '${CONTA}', 'Conta da B', 'USD', 'America/New_York') as r;
    `);
    expect(r.erro).toBeNull();
    expect(r.linhas[0]?.r).toBe('de_outra_casa');
  });

  it('e a linha da primeira continua intacta depois da tentativa', async () => {
    /*
     * O teste que pega o defeito original. Antes, esta consulta devolveria
     * organization_id = orgB, name = 'Conta da B', currency = 'USD' — e ninguém
     * teria visto nada acontecer.
     */
    const r = await comoDonoEDesfaz(`
      select public.meta_reivindicar_conta('${IDS.conexaoA}', '${CONTA}', 'Conta da A', 'BRL', 'America/Sao_Paulo');
      select public.meta_reivindicar_conta('${IDS.conexaoB}', '${CONTA}', 'Conta da B', 'USD', 'America/New_York');
      select organization_id, name, currency from public.meta_ad_accounts where ad_account_id = '${CONTA}';
    `);
    expect(r.erro).toBeNull();
    expect(r.linhas[0]?.organization_id).toBe(IDS.orgA);
    expect(r.linhas[0]?.name).toBe('Conta da A');
    expect(r.linhas[0]?.currency).toBe('BRL');
  });

  it('a mesma casa atualiza o nome, e NÃO desliga a conta', async () => {
    /*
     * `enabled` é a allowlist — alguém marcou "esta conta pode gastar por aqui".
     * Regravá-la a cada descoberta desligaria contas em uso toda vez que
     * alguém clicasse em "Buscar da Meta", e o gasto sumiria do painel sem
     * ninguém ter mudado nada.
     */
    const r = await comoDonoEDesfaz(`
      select public.meta_reivindicar_conta('${IDS.conexaoA}', '${CONTA}', 'Nome velho', 'BRL', 'America/Sao_Paulo');
      update public.meta_ad_accounts set enabled = true where ad_account_id = '${CONTA}';
      select public.meta_reivindicar_conta('${IDS.conexaoA}', '${CONTA}', 'Nome novo', 'BRL', 'America/Sao_Paulo') as r;
      select name, enabled from public.meta_ad_accounts where ad_account_id = '${CONTA}';
    `);
    expect(r.erro).toBeNull();
    expect(r.linhas[0]?.name).toBe('Nome novo');
    expect(r.linhas[0]?.enabled).toBe(true);
  });
});

describe('reivindicar página', () => {
  it('a primeira registra, a segunda é recusada e a linha não muda', async () => {
    const r = await comoDonoEDesfaz(`
      select public.meta_reivindicar_pagina('${IDS.conexaoA}', '${PAGINA}', 'Página da A');
      select public.meta_reivindicar_pagina('${IDS.conexaoB}', '${PAGINA}', 'Página da B') as r;
      select organization_id, page_name from public.meta_pages where page_id = '${PAGINA}';
    `);
    expect(r.erro).toBeNull();
    expect(r.linhas[0]?.organization_id).toBe(IDS.orgA);
    expect(r.linhas[0]?.page_name).toBe('Página da A');
  });
});

describe('quem pode reivindicar', () => {
  /*
   * A lição da 058, aplicada de novo: `revoke ... from public` NÃO fecha uma
   * função no Supabase. `anon` e `authenticated` recebem a concessão NOMINAL
   * por default privileges no instante em que a função nasce, e ela sobrevive à
   * revogação do PUBLIC. Os três papéis precisam ser nomeados.
   *
   * Aqui isso importa mais do que o normal: a função é `security definer` e
   * escreve em tabela de outra imobiliária se ninguém a segurar.
   */
  const CHAMADAS: [string, string][] = [
    ['meta_reivindicar_conta', `select public.meta_reivindicar_conta($1::uuid, 'act_1', 'x', 'BRL', 'UTC')`],
    ['meta_reivindicar_pagina', `select public.meta_reivindicar_pagina($1::uuid, '1', 'x')`],
  ];

  it.each(CHAMADAS)('o anônimo não executa %s', async (_nome, sql) => {
    const r = await como('anon', sql, [IDS.conexaoA]);
    expect(r.erro).toMatch(/permission denied/i);
  });

  it.each(CHAMADAS)('nem o gerente logado executa %s', async (_nome, sql) => {
    // Quem chama é a edge function com `service_role`. Deixar o cliente chamar
    // seria dar a ele o poder de registrar ativo em nome de qualquer org.
    const r = await como('gerente', sql, [IDS.conexaoA]);
    expect(r.erro).toMatch(/permission denied/i);
  });
});

describe('o frescor da importação', () => {
  it('mostra uma linha por conta de anúncio, não uma por tipo', async () => {
    /*
     * A função antiga fazia `distinct on (r.kind)` e o único `kind` escrito é
     * 'insights' — com duas contas ligadas ela devolvia UMA linha, a da conta
     * que terminou por último, e a outra sumia da tela. A HVA tem duas contas
     * ligadas hoje: uma parava de importar e o cartão continuava verde, que é
     * exatamente o defeito que aquele cartão foi escrito para eliminar.
     */
    const r = await comoDonoEDesfaz(`
      insert into public.meta_sync_runs (organization_id, integration_id, kind, ad_account_id, status, finished_at)
      values ('${IDS.orgA}', '${IDS.conexaoA}', 'insights', 'act_aaa', 'ok',   now() - interval '3 days'),
             ('${IDS.orgA}', '${IDS.conexaoA}', 'insights', 'act_bbb', 'erro', now());
      set local role authenticated;
      select set_config('request.jwt.claims', '{"sub":"${IDS.gerente}","role":"authenticated"}', true);
      select ad_account_id, status from public.meta_ultima_sincronizacao() order by ad_account_id;
    `);
    expect(r.erro).toBeNull();
    expect(r.linhas.map((l) => l.ad_account_id)).toEqual(['act_aaa', 'act_bbb']);
    expect(r.linhas.map((l) => l.status)).toEqual(['ok', 'erro']);
  });

  it('e não atravessa a fronteira entre imobiliárias', async () => {
    const r = await comoDonoEDesfaz(`
      insert into public.meta_sync_runs (organization_id, integration_id, kind, ad_account_id, status, finished_at)
      values ('${IDS.orgB}', '${IDS.conexaoB}', 'insights', 'act_da_b', 'ok', now());
      set local role authenticated;
      select set_config('request.jwt.claims', '{"sub":"${IDS.gerente}","role":"authenticated"}', true);
      select ad_account_id from public.meta_ultima_sincronizacao();
    `);
    expect(r.erro).toBeNull();
    expect(r.linhas.map((l) => l.ad_account_id)).not.toContain('act_da_b');
  });
});

describe('duas BMs na mesma imobiliária', () => {
  /*
   * O cenário que a 087 existe para permitir, e que até ela não cabia no banco:
   * `meta_integrations` tinha `unique (organization_id)`.
   *
   * A segunda conexão é criada aqui dentro e desfeita no fim. Pô-la na fixtura
   * faria TODO o resto da suíte passar a enxergar duas — e o que se quer medir é
   * o comportamento com duas, não a fixtura com duas.
   */
  const SEGUNDA = `
    insert into public.meta_integrations
      (id, organization_id, owner_id, label, app_id, app_secret_id, access_token_id, scopes)
    values ('00000000-0000-4000-a000-000000000071', '${IDS.orgA}', '${IDS.corretor}',
            'BM do corretor', '999', gen_random_uuid(), gen_random_uuid(), array['ads_read']);
    insert into public.meta_ad_accounts
      (organization_id, integration_id, ad_account_id, name, currency, timezone_name, enabled)
    values ('${IDS.orgA}', '00000000-0000-4000-a000-000000000071', 'act_do_corretor',
            'Conta do corretor', 'BRL', 'America/Sao_Paulo', true),
           ('${IDS.orgA}', '${IDS.conexaoA}', 'act_da_casa',
            'Conta da casa', 'BRL', 'America/Sao_Paulo', true);
    insert into public.meta_ads_spend
      (organization_id, ad_account_id, campaign_id, date, currency, report_timezone, spend_minor)
    values ('${IDS.orgA}', 'act_do_corretor', 'c1', current_date, 'BRL', 'America/Sao_Paulo', 50000),
           ('${IDS.orgA}', 'act_da_casa',     'c2', current_date, 'BRL', 'America/Sao_Paulo', 70000);
  `;

  const como_ = (quem: string) => `
    set local role authenticated;
    select set_config('request.jwt.claims', '{"sub":"${quem}","role":"authenticated"}', true);
  `;

  it('o corretor vê a conta e o gasto DELE, e nada da casa', async () => {
    const r = await comoDonoEDesfaz(`
      ${SEGUNDA}
      ${como_(IDS.corretor)}
      select (select count(*) from public.meta_ad_accounts)::int as contas,
             (select coalesce(sum(spend_minor),0) from public.meta_ads_spend)::int as gasto;
    `);
    expect(r.erro).toBeNull();
    expect(r.linhas[0]?.contas).toBe(1);
    expect(r.linhas[0]?.gasto).toBe(50000);
  });

  it('o gerente vê a SOMA das duas — é a mesma imobiliária', async () => {
    /*
     * É o pedido, na frase do dono do produto: "o ideal seria que o o dono da conta tivesse
     * conhecimento do valor da conta de anúncio da a corretora, dos leads que
     * entrou, do quanto que gastou, porque é da mesma imobiliária, só que são
     * BMs diferentes".
     */
    const r = await comoDonoEDesfaz(`
      ${SEGUNDA}
      ${como_(IDS.gerente)}
      select (select count(*) from public.meta_ad_accounts)::int as contas,
             (select coalesce(sum(spend_minor),0) from public.meta_ads_spend)::int as gasto;
    `);
    expect(r.erro).toBeNull();
    expect(r.linhas[0]?.contas).toBe(2);
    expect(r.linhas[0]?.gasto).toBe(120000);
  });

  it('a saúde de uma conexão não contamina a outra', async () => {
    /*
     * `meta_saude` escrevia `where organization_id = _org`, sem filtro nenhum:
     * token vencido numa BM marcaria as DUAS como quebradas e dispararia o
     * alerta, e a outra — perfeitamente viva — apareceria morta sem ninguém
     * saber qual reconectar.
     */
    const r = await comoDonoEDesfaz(`
      ${SEGUNDA}
      select public.meta_saude('00000000-0000-4000-a000-000000000071', 'precisa_reconectar', 190, 'token vencido');
      select id, health from public.meta_integrations where organization_id = '${IDS.orgA}' order by created_at;
    `);
    expect(r.erro).toBeNull();
    const porId = Object.fromEntries(r.linhas.map((l) => [l.id, l.health]));
    expect(porId[IDS.conexaoA]).toBe('ok');
    expect(porId['00000000-0000-4000-a000-000000000071']).toBe('precisa_reconectar');
  });

  it('uma conexão não toma a conta de anúncio da outra', async () => {
    /*
     * Acontece de verdade: o gestor de tráfego enxerga a mesma conta pelo token
     * dele e pelo token do cliente. Quem registrou primeiro fica — trocar a
     * conexão da conta trocaria o token usado para buscar o gasto dela, no meio
     * do caminho e sem ninguém pedir.
     */
    const r = await comoDonoEDesfaz(`
      ${SEGUNDA}
      select public.meta_reivindicar_conta(
        '00000000-0000-4000-a000-000000000071', 'act_da_casa', 'Tomada', 'BRL', 'UTC') as r;
      select integration_id from public.meta_ad_accounts where ad_account_id = 'act_da_casa';
    `);
    expect(r.erro).toBeNull();
    expect(r.linhas[0]?.integration_id).toBe(IDS.conexaoA);
  });

  it('e a segunda conexão da MESMA pessoa é recusada pela chave', async () => {
    // Uma BM por pessoa. Sem isso, reconectar criaria uma linha nova a cada vez
    // e o gasto passaria a ser buscado por um token que ninguém mais atualiza.
    const r = await comoDonoEDesfaz(`
      ${SEGUNDA}
      insert into public.meta_integrations
        (organization_id, owner_id, label, app_id, app_secret_id, access_token_id)
      values ('${IDS.orgA}', '${IDS.corretor}', 'Outra', '888', gen_random_uuid(), gen_random_uuid());
    `);
    expect(r.erro).toMatch(/meta_integrations_dono_uk|duplicate key/i);
  });
});
