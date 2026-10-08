import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { como, comoDono, comoDonoEDesfaz, conectar, desconectar, prepararPrivilegios, IDS } from './banco';

/**
 * Empreendimento com unidades (migration 20261009000000), com o caso real: o
 * New York Residence, 90 apartamentos (andares 5 a 19, finais 01 a 06) e a
 * tabela de outubro com 10 disponíveis.
 *
 * O "a partir de" que o site mostra sai daqui: um gatilho errado anuncia preço
 * de unidade vendida, ou some com o imóvel da vitrine.
 */

const FIXTURA = readFileSync(join(__dirname, 'fixtura.sql'), 'utf8');
const MIGRATIONS = join(__dirname, '..', 'migrations');
const IMOVEL_A = '00000000-0000-4000-a000-000000000030';
const IMOVEL_B = '00000000-0000-4000-b000-000000000030';
const SUITES = '00000000-0000-4000-a000-0000000000e1';
const DORMS = '00000000-0000-4000-a000-0000000000e2';
const MES = `date_trunc('month', now() at time zone 'America/Sao_Paulo')::date`;

const OUTUBRO = [
  ['1702', 89766468], ['1705', 91035252], ['1604', 94207212], ['1502', 87228900], ['1504', 92938428],
  ['1404', 91669644], ['1204', 89132076], ['804', 84056940], ['701', 88497684], ['506', 85008528],
].map(([label, price_cents]) => ({ label, price_cents, status: 'disponivel' }));

/** O empreendimento na imobiliária A, com as duas plantas e as 90 unidades (todas nascem vendidas). */
const EMPREENDIMENTO = `
  update public.properties
     set has_units = true, for_sale = true, for_rent = false, is_published = true,
         property_type = 'apartamento', public_title = 'Apartamentos em Morretes',
         developer = 'Construtora X', delivery_at = '2030-01-01', construction_status = 'lancamento',
         incorporation_registry = 'R-8 96.726', payment_notes = '10% de entrada + 100 mensais + 7 anuais'
   where id = '${IMOVEL_A}';
  insert into public.property_floorplans (id, organization_id, property_id, name, finals, bedrooms, suites, bathrooms, area_built, position) values
    ('${SUITES}', '${IDS.orgA}', '${IMOVEL_A}', '2 suítes + lavabo', '{02,04,05}', 0, 2, 3, 70, 0),
    ('${DORMS}',  '${IDS.orgA}', '${IMOVEL_A}', '3 dormitórios', '{01,03,06}', 2, 1, 2, 70, 1);
  insert into public.property_units (organization_id, property_id, floorplan_id, label, floor, notes)
  select '${IDS.orgA}', '${IMOVEL_A}',
         case when f in ('02', '04', '05') then '${SUITES}'::uuid else '${DORMS}'::uuid end,
         a || f, a, 'nota interna'
    from generate_series(5, 19) a, unnest(array['01', '02', '03', '04', '05', '06']) f;`;

const comoQuem = (quem: string) => `
  set local role authenticated;
  select set_config('request.jwt.claims', '{"sub":"${quem}","role":"authenticated"}', true);`;

const aplicar = (linhas: unknown, mes = MES) =>
  `select public.aplicar_tabela_de_unidades('${IMOVEL_A}', ${mes}, '${JSON.stringify(linhas)}'::jsonb) as mudaram;`;

const IMOVEL = `
  reset role;
  select price_cents, status, units_available, original_price_cents, units_table_month = ${MES} as tabela_do_mes
    from public.properties where id = '${IMOVEL_A}';`;

beforeAll(async () => {
  await conectar();
  await prepararPrivilegios(MIGRATIONS);
  const r = await comoDono(FIXTURA);
  if (r.erro) throw new Error(`fixtura não aplicou: ${r.erro}`);
}, 60_000);

afterAll(desconectar);

describe('o "a partir de"', () => {
  it('sem unidade disponível o empreendimento fica sem preço, e não vira vendido sem unidades', async () => {
    const r = await comoDonoEDesfaz(`
      update public.properties set has_units = true, for_sale = true, for_rent = false, status = 'disponivel' where id = '${IMOVEL_A}';
      select price_cents, status, units_available from public.properties where id = '${IMOVEL_A}';`);
    expect(r.erro).toBeNull();
    expect(r.linhas[0]).toEqual({ price_cents: null, status: 'disponivel', units_available: 0 });
  });

  it('gerar as unidades antes da primeira tabela não tira o empreendimento da vitrine', async () => {
    // As unidades nascem vendidas; sem tabela aplicada, a situação continua a que era.
    const r = await comoDonoEDesfaz(`
      update public.properties set status = 'disponivel' where id = '${IMOVEL_A}';
      ${EMPREENDIMENTO} ${IMOVEL}`);
    expect(r.erro).toBeNull();
    expect(r.linhas[0]).toMatchObject({ price_cents: null, status: 'disponivel', units_available: 0 });
  });

  it('o corretor aplica a tabela de outubro: a partir de R$ 840.569,40, 10 disponíveis', async () => {
    const r = await comoDonoEDesfaz(`${EMPREENDIMENTO} ${comoQuem(IDS.corretor)} ${aplicar(OUTUBRO)} ${IMOVEL}`);
    expect(r.erro).toBeNull();
    expect(r.linhas[0]).toEqual({
      price_cents: '84056940',
      status: 'disponivel',
      units_available: 10,
      original_price_cents: null,
      tabela_do_mes: true,
    });
  });

  it('vendeu o 804: o preço sobe sozinho para o 506', async () => {
    const r = await comoDonoEDesfaz(`${EMPREENDIMENTO} ${comoQuem(IDS.corretor)} ${aplicar(OUTUBRO)}
      update public.property_units set status = 'vendido' where property_id = '${IMOVEL_A}' and label = '804';
      ${IMOVEL}`);
    expect(r.erro).toBeNull();
    expect(r.linhas[0]).toMatchObject({ price_cents: '85008528', units_available: 9, status: 'disponivel' });
  });

  it('só reservadas: situação reservado, com o preço da menor reservada; todas vendidas: vendido', async () => {
    const reservadas = await comoDonoEDesfaz(`${EMPREENDIMENTO} ${comoQuem(IDS.corretor)}
      ${aplicar([{ label: '1702', price_cents: 89766468, status: 'reservado' }, { label: '804', price_cents: 84056940, status: 'reservado' }])}
      ${IMOVEL}`);
    expect(reservadas.erro).toBeNull();
    expect(reservadas.linhas[0]).toMatchObject({ price_cents: '84056940', status: 'reservado', units_available: 0 });

    const vendidas = await comoDonoEDesfaz(`${EMPREENDIMENTO} ${comoQuem(IDS.corretor)} ${aplicar(OUTUBRO)}
      update public.property_units set status = 'vendido' where property_id = '${IMOVEL_A}';
      ${IMOVEL}`);
    expect(vendidas.erro).toBeNull();
    expect(vendidas.linhas[0]).toMatchObject({ status: 'vendido', units_available: 0 });
  });

  it('suspenso é decisão de quem cadastra, e as unidades não o desfazem', async () => {
    const r = await comoDonoEDesfaz(`${EMPREENDIMENTO} ${comoQuem(IDS.corretor)} ${aplicar(OUTUBRO)}
      update public.properties set status = 'suspenso' where id = '${IMOVEL_A}';
      update public.property_units set status = 'vendido' where property_id = '${IMOVEL_A}' and label = '804';
      ${IMOVEL}`);
    expect(r.erro).toBeNull();
    expect(r.linhas[0]).toMatchObject({ status: 'suspenso', price_cents: '85008528' });
  });

  it('o formulário reenviando o preço arredondado, a situação e um "de/por" não muda nada', async () => {
    const r = await comoDonoEDesfaz(`${EMPREENDIMENTO} ${comoQuem(IDS.corretor)} ${aplicar(OUTUBRO)}
      update public.properties set price_cents = 84057000, original_price_cents = 99000000, status = 'vendido' where id = '${IMOVEL_A}';
      ${IMOVEL}`);
    expect(r.erro).toBeNull();
    expect(r.linhas[0]).toMatchObject({ price_cents: '84056940', status: 'disponivel', original_price_cents: null });
  });

  it('empreendimento com unidades não aluga', async () => {
    const r = await comoDonoEDesfaz(`update public.properties set has_units = true, for_rent = true where id = '${IMOVEL_A}';`);
    expect(r.erro).toMatch(/properties_unidades_ck/);
  });
});

describe('a tabela do mês', () => {
  it('aplicar a mesma tabela de novo não muda nada', async () => {
    const r = await comoDonoEDesfaz(`${EMPREENDIMENTO} ${comoQuem(IDS.corretor)} ${aplicar(OUTUBRO)}
      select set_config('teste.antes', (select updated_at::text from public.properties where id = '${IMOVEL_A}'), true);
      ${aplicar(OUTUBRO).replace(' as mudaram;', ' as mudaram_de_novo;')}
      select (select updated_at::text from public.properties where id = '${IMOVEL_A}') = current_setting('teste.antes') as igual;`);
    expect(r.erro).toBeNull();
    expect(r.linhas[0]?.igual).toBe(true);
  });

  it('a unidade que não veio na tabela fica como estava', async () => {
    const r = await comoDonoEDesfaz(`${EMPREENDIMENTO} ${comoQuem(IDS.corretor)} ${aplicar(OUTUBRO)}
      ${aplicar([{ label: '506', price_cents: 86000000, status: 'disponivel' }])}
      reset role;
      select count(*) filter (where status = 'disponivel')::int as disponiveis,
             max(price_cents) filter (where label = '804') as preco_804
        from public.property_units where property_id = '${IMOVEL_A}';`);
    expect(r.erro).toBeNull();
    expect(r.linhas[0]).toEqual({ disponiveis: 10, preco_804: '84056940' });
  });

  it('recusa unidade que não existe, repetida, sem rótulo, ou disponível sem preço, e não grava nada', async () => {
    const casos: [unknown, RegExp][] = [
      [[{ label: '2001', price_cents: 1, status: 'disponivel' }, { label: '804', price_cents: 1, status: 'disponivel' }], /não existem neste imóvel: 2001/],
      [[{ label: '804', price_cents: 1, status: 'disponivel' }, { label: '804', price_cents: 2, status: 'disponivel' }], /repetida na tabela: 804/],
      [[{ label: '', price_cents: 1, status: 'disponivel' }], /sem unidade/],
      [[{ label: '804', price_cents: null, status: 'disponivel' }], /property_units_preco_ck/],
      [[{ label: '804', price_cents: 1, status: 'alugado' }], /property_units_status_ck/],
    ];
    for (const [linhas, erro] of casos) {
      const r = await comoDonoEDesfaz(`${EMPREENDIMENTO} ${comoQuem(IDS.corretor)} ${aplicar(linhas)}`);
      expect(r.erro, JSON.stringify(linhas)).toMatch(erro);
    }
  });
});

describe('a fronteira entre imobiliárias', () => {
  it('corretor de fora não vê nem altera as unidades da A', async () => {
    const r = await comoDonoEDesfaz(`${EMPREENDIMENTO} ${comoQuem(IDS.corretor)} ${aplicar(OUTUBRO)}
      ${comoQuem(IDS.corretorDeFora)}
      select count(*)::int as ve from public.property_units;`);
    expect(r.erro).toBeNull();
    expect(r.linhas[0]?.ve).toBe(0);

    const tabela = await comoDonoEDesfaz(`${EMPREENDIMENTO} ${comoQuem(IDS.corretorDeFora)} ${aplicar(OUTUBRO)}`);
    expect(tabela.erro).toMatch(/não encontrado/);
  });

  it('unidade não se liga a planta de outro empreendimento, nem ao imóvel de outra imobiliária', async () => {
    const outraPlanta = await comoDonoEDesfaz(`${EMPREENDIMENTO}
      update public.properties set has_units = true, for_rent = false where id = '${IMOVEL_B}';
      insert into public.property_units (organization_id, property_id, floorplan_id, label)
      values ('${IDS.orgB}', '${IMOVEL_B}', '${SUITES}', '101');`);
    expect(outraPlanta.erro).toMatch(/property_units_floorplan_fk/);

    const outraCasa = await comoDonoEDesfaz(`${EMPREENDIMENTO}
      insert into public.property_units (organization_id, property_id, floorplan_id, label)
      values ('${IDS.orgB}', '${IMOVEL_A}', '${SUITES}', '101');`);
    expect(outraCasa.erro).toMatch(/property_units_property_fk|property_units_floorplan_fk/);
  });

  it('visitante não lê as tabelas nem aplica tabela', async () => {
    expect((await como('anon', 'select count(*) from public.property_units')).erro).toMatch(/permission denied/);
    expect((await como('anon', 'select count(*) from public.property_floorplans')).erro).toMatch(/permission denied/);
    const r = await como('anon', `select public.aplicar_tabela_de_unidades($1, current_date, '[]'::jsonb)`, [IMOVEL_A]);
    expect(r.erro).toMatch(/permission denied/);
  });
});

describe('o que o site recebe', () => {
  async function noSite(depois = '') {
    const r = await comoDonoEDesfaz(`${EMPREENDIMENTO} ${comoQuem(IDS.corretor)} ${aplicar(OUTUBRO)} reset role; ${depois}
      set local role anon;
      select public.site_imoveis('imob-a')::text as json;`);
    if (r.erro) throw new Error(r.erro);
    return { texto: String(r.linhas[0]?.json), imovel: JSON.parse(String(r.linhas[0]?.json))[0] };
  }

  it('o "a partir de", as plantas com as disponíveis em ordem de preço, e nada interno', async () => {
    const { texto, imovel } = await noSite();
    expect(imovel.price_cents).toBe(84056940);
    expect(imovel.empreendimento).toMatchObject({
      table_is_current: true,
      units_available: 10,
      construction_status: 'lancamento',
      delivery_year: 2030,
      incorporation_registry: 'R-8 96.726',
      payment_notes: '10% de entrada + 100 mensais + 7 anuais',
    });
    const [suites, dorms] = imovel.empreendimento.floorplans;
    expect(suites.name).toBe('2 suítes + lavabo');
    expect(suites.units.map((u: { label: string }) => u.label)).toEqual(['804', '1502', '1204', '1702', '1705', '1404', '1504', '1604']);
    expect(dorms.units).toEqual([
      { label: '506', floor: 5, area_built: 70, price_cents: 85008528, status: 'disponivel' },
      { label: '701', floor: 7, area_built: 70, price_cents: 88497684, status: 'disponivel' },
    ]);
    // Construtora, nota interna, ids e unidade vendida não saem.
    expect(texto).not.toMatch(/Construtora X|nota interna|"developer"|"notes"|"id"|"1901"/);
  });

  it('com a tabela de um mês que já passou, todo preço sai nulo ("Consulte")', async () => {
    const { imovel } = await noSite(
      `update public.properties set units_table_month = (${MES} - interval '1 month')::date where id = '${IMOVEL_A}';`,
    );
    expect(imovel.price_cents).toBeNull();
    expect(imovel.empreendimento.table_is_current).toBe(false);
    const precos = imovel.empreendimento.floorplans.flatMap((f: { units: { price_cents: number | null }[] }) => f.units.map((u) => u.price_cents));
    expect(precos.every((p: number | null) => p === null)).toBe(true);
  });

  it('reservada sai sem preço (ele pode ser de uma tabela antiga); só reservadas, sem "a partir de"', async () => {
    const { imovel } = await noSite(
      `update public.property_units set status = 'reservado' where property_id = '${IMOVEL_A}' and label = '506';`,
    );
    const dorms = imovel.empreendimento.floorplans.find((f: { name: string }) => f.name === '3 dormitórios');
    expect(dorms.units.find((u: { label: string }) => u.label === '506')).toMatchObject({ status: 'reservado', price_cents: null });

    const soReservadas = await noSite(
      `update public.property_units set status = 'reservado' where property_id = '${IMOVEL_A}' and status = 'disponivel';`,
    );
    expect(soReservadas.imovel).toMatchObject({ status: 'reservado', price_cents: null });
    expect(soReservadas.imovel.empreendimento.units_available).toBe(0);
  });

  it('suspenso não anuncia "a partir de" nem unidades disponíveis', async () => {
    const { imovel } = await noSite(`update public.properties set status = 'suspenso' where id = '${IMOVEL_A}';`);
    expect(imovel).toMatchObject({ status: 'suspenso', price_cents: null });
    expect(imovel.empreendimento.units_available).toBe(0);
    const precos = imovel.empreendimento.floorplans.flatMap((f: { units: { price_cents: number | null }[] }) => f.units.map((u) => u.price_cents));
    expect(precos.every((p: number | null) => p === null)).toBe(true);
  });

  it('planta sem unidade à venda não aparece; imóvel comum sai como antes', async () => {
    const { imovel } = await noSite(
      `update public.property_units set status = 'vendido' where property_id = '${IMOVEL_A}' and label in ('506', '701');`,
    );
    expect(imovel.empreendimento.floorplans.map((f: { name: string }) => f.name)).toEqual(['2 suítes + lavabo']);

    const comum = await comoDonoEDesfaz(`
      update public.properties set is_published = true, price_cents = 50000000 where id = '${IMOVEL_A}';
      set local role anon;
      select public.site_imoveis('imob-a')::text as json;`);
    const [linha] = JSON.parse(String(comum.linhas[0]?.json));
    expect(linha).toMatchObject({ price_cents: 50000000, empreendimento: null });
  });
});
