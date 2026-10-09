import { describe, expect, it } from 'vitest';

import { schemaDoImovel } from '@/lib/seo/schema';

import { imovelDaLinha, type EmpreendimentoDaLinha, type LinhaDoSite } from './linha';
import { resumoDoImovel } from './texto';
import type { Imovel } from './tipos';

const BANCO = 'https://abc.supabase.co';
const EM_OUTUBRO = new Date('2026-10-15T12:00:00-03:00');
// 30 minutos depois da virada, no horário de Brasília.
const EM_NOVEMBRO = new Date('2026-11-01T00:30:00-03:00');

const linha = (mudancas: Partial<LinhaDoSite> = {}): LinhaDoSite => ({
  public_code: '1a2b',
  slug: 'apartamento-2-dormitorios-meia-praia-1a2b',
  old_slugs: null,
  public_title: null,
  description: 'Vista para o mar.',
  property_type: 'apartamento',
  for_sale: false,
  for_rent: true,
  status: 'disponivel',
  price_cents: null,
  original_price_cents: null,
  rent_cents: 350_000,
  condo_fee_cents: 60_000,
  iptu_year_cents: 120_000,
  bedrooms: 2,
  suites: 1,
  bathrooms: 2,
  parking_spots: 1,
  area_built: 72,
  area_total: 90,
  neighborhood: 'Meia Praia',
  city: 'Itapema',
  features: { lazer: { outros: ['Piscina aquecida'] }, cozinha: { itens: ['ilha'] } },
  is_featured: true,
  updated_at: '2026-09-24T12:00:00Z',
  media: [{ storage_path: 'org/imovel/capa.webp', width: 2000, height: 1500, alt_text: 'Sala', caption: null }],
  ...mudancas,
});

/**
 * O New York Residence como `site_imoveis` o devolve com a tabela de outubro:
 * as plantas com as disponíveis em ordem de preço, sem construtora, nota
 * interna nem unidade vendida.
 */
const unidade = (label: string, floor: number, price_cents: number | null, status = 'disponivel') => ({
  label,
  floor,
  area_built: 70,
  price_cents,
  status,
});
const NEW_YORK: EmpreendimentoDaLinha = {
  units_table_month: '2026-10-01',
  table_is_current: true,
  units_available: 10,
  construction_status: 'lancamento',
  delivery_year: 2030,
  incorporation_registry: 'R-8 96.726',
  incorporation_registry_office: ' ',
  payment_notes: '10% de entrada + 100 mensais + 7 anuais',
  floorplans: [
    {
      name: '2 suítes + lavabo',
      bedrooms: 0,
      suites: 2,
      bathrooms: 3,
      parking_spots: null,
      area_built: 70,
      units: [
        unidade('804', 8, 84_056_940),
        unidade('1502', 15, 87_228_900),
        unidade('1204', 12, 89_132_076),
        unidade('1702', 17, 89_766_468),
        unidade('1705', 17, 91_035_252),
        unidade('1404', 14, 91_669_644),
        unidade('1504', 15, 92_938_428),
        unidade('1604', 16, 94_207_212),
      ],
    },
    {
      name: '3 dormitórios',
      bedrooms: 2,
      suites: 1,
      bathrooms: 2,
      parking_spots: null,
      area_built: 70,
      units: [unidade('506', 5, 85_008_528), unidade('701', 7, 88_497_684)],
    },
  ],
};

const lancamento = (empreendimento: EmpreendimentoDaLinha = NEW_YORK, mudancas: Partial<LinhaDoSite> = {}) =>
  linha({
    for_sale: true,
    for_rent: false,
    rent_cents: null,
    price_cents: empreendimento.table_is_current ? 84_056_940 : null,
    bedrooms: null,
    suites: null,
    neighborhood: 'Morretes',
    empreendimento,
    ...mudancas,
  });

/** Os preços como o banco os manda quando a tabela não é a do mês. */
const semTabela = (e: EmpreendimentoDaLinha): EmpreendimentoDaLinha => ({
  ...e,
  table_is_current: false,
  floorplans: (e.floorplans ?? []).map((p) => ({ ...p, units: (p.units ?? []).map((u) => ({ ...u, price_cents: null })) })),
});

describe('o empreendimento', () => {
  it('chega com o "a partir de", as plantas e as unidades à venda', () => {
    const imovel = imovelDaLinha(lancamento(), BANCO, EM_OUTUBRO);
    expect(imovel.precoVendaCents).toBe(84_056_940);
    expect(imovel.precoDeTabelaCents).toBeNull();
    expect(imovel.empreendimento).toMatchObject({
      tabelaDoMes: '2026-10-01',
      tabelaVigente: true,
      unidadesDisponiveis: 10,
      obra: 'lancamento',
      anoDeEntrega: 2030,
      registroDeIncorporacao: 'R-8 96.726',
      // Cartório em branco no CRM não sai como texto vazio.
      cartorio: null,
      condicaoDePagamento: '10% de entrada + 100 mensais + 7 anuais',
    });
    const [suites, dormitorios] = imovel.empreendimento!.plantas;
    expect(suites).toMatchObject({ nome: '2 suítes + lavabo', quartos: 0, suites: 2, banheiros: 3, areaM2: 70 });
    expect(suites!.unidades.map((u) => u.rotulo)).toEqual(['804', '1502', '1204', '1702', '1705', '1404', '1504', '1604']);
    expect(dormitorios!.unidades).toEqual([
      { rotulo: '506', andar: 5, areaM2: 70, precoCents: 85_008_528, situacao: 'disponivel' },
      { rotulo: '701', andar: 7, areaM2: 70, precoCents: 88_497_684, situacao: 'disponivel' },
    ]);
  });

  it('sem título, o padrão diz os tipos no plural e os dormitórios das plantas', () => {
    // "Dormitórios", como no cartão: o número já soma as suítes.
    expect(imovelDaLinha(lancamento(), BANCO, EM_OUTUBRO).titulo).toBe('Apartamentos com 2 ou 3 dormitórios em Morretes, Itapema');
  });

  it('o título padrão usa as plantas do cartão: a que só tem reservada fica de fora', () => {
    const [suites, dormitorios] = NEW_YORK.floorplans!;
    const soReservadas = { ...dormitorios!, units: [unidade('701', 7, 88_497_684, 'reservado')] };
    const comVendida = { ...dormitorios!, name: 'Cobertura', bedrooms: 3, units: [unidade('2001', 20, 150_000_000, 'vendido')] };
    const imovel = imovelDaLinha(lancamento({ ...NEW_YORK, floorplans: [suites!, soReservadas, comVendida] }), BANCO, EM_OUTUBRO);
    expect(imovel.titulo).toBe('Apartamentos com 2 dormitórios em Morretes, Itapema');
  });

  it('quando só restam reservadas, o título usa todas, como o cartão', () => {
    const reservar = (p: NonNullable<EmpreendimentoDaLinha['floorplans']>[number]) => ({
      ...p,
      units: (p.units ?? []).map((u) => ({ ...u, status: 'reservado' })),
    });
    const tudoReservado = { ...NEW_YORK, floorplans: NEW_YORK.floorplans!.map(reservar) };
    expect(imovelDaLinha(lancamento(tudoReservado), BANCO, EM_OUTUBRO).titulo).toBe(
      'Apartamentos com 2 ou 3 dormitórios em Morretes, Itapema',
    );
  });

  it('sem a tabela do mês, todo preço é "Consulte", e as unidades vão por andar', () => {
    const imovel = imovelDaLinha(lancamento(semTabela(NEW_YORK)), BANCO, EM_OUTUBRO);
    expect(imovel.precoVendaCents).toBeNull();
    expect(imovel.empreendimento?.tabelaVigente).toBe(false);
    const unidades = imovel.empreendimento!.plantas.flatMap((p) => p.unidades);
    expect(unidades.every((u) => u.precoCents === null)).toBe(true);
    expect(imovel.empreendimento!.plantas[0]!.unidades.map((u) => u.rotulo)).toEqual([
      '804', '1204', '1404', '1502', '1504', '1604', '1702', '1705',
    ]);
  });

  it('virou o mês e o cache ainda tem a tabela velha: o relógio do site também apaga os preços', () => {
    const imovel = imovelDaLinha(lancamento(), BANCO, EM_NOVEMBRO);
    expect(imovel.precoVendaCents).toBeNull();
    expect(imovel.empreendimento?.tabelaVigente).toBe(false);
    expect(imovel.empreendimento!.plantas.flatMap((p) => p.unidades).some((u) => u.precoCents !== null)).toBe(false);
  });

  it('unidade vendida ou com situação desconhecida não sai, e a planta que fica sem unidade também não', () => {
    const imovel = imovelDaLinha(
      lancamento({
        ...NEW_YORK,
        construction_status: 'demolido',
        floorplans: [
          { ...NEW_YORK.floorplans![1]!, units: [unidade('506', 5, 85_008_528, 'vendido'), unidade('701', 7, 88_497_684, 'reservado')] },
          { ...NEW_YORK.floorplans![0]!, units: [unidade('804', 8, 84_056_940, 'alugado')] },
        ],
      }),
      BANCO,
      EM_OUTUBRO,
    );
    expect(imovel.empreendimento?.obra).toBeNull();
    expect(imovel.empreendimento!.plantas.map((p) => p.nome)).toEqual(['3 dormitórios']);
    // A reservada fica sem preço mesmo se ele viesse: só o selo, na tela.
    expect(imovel.empreendimento!.plantas[0]!.unidades).toEqual([
      { rotulo: '701', andar: 7, areaM2: 70, precoCents: null, situacao: 'reservado' },
    ]);
  });

  it('a reservada chega sem preço e vai depois das disponíveis', () => {
    const [suites] = NEW_YORK.floorplans!;
    const comReservada = {
      ...suites!,
      units: [unidade('1702', 17, null, 'reservado'), unidade('804', 8, 84_056_940), unidade('1204', 12, 89_132_076)],
    };
    const imovel = imovelDaLinha(lancamento({ ...NEW_YORK, units_available: 2, floorplans: [comReservada] }), BANCO, EM_OUTUBRO);
    expect(imovel.empreendimento!.plantas[0]!.unidades.map((u) => [u.rotulo, u.precoCents])).toEqual([
      ['804', 84_056_940],
      ['1204', 89_132_076],
      ['1702', null],
    ]);
    expect(imovel.empreendimento!.unidadesDisponiveis).toBe(2);
  });

  it('a contagem é a do banco, nunca a das linhas da lista', () => {
    // Dez disponíveis na lista, e o banco não mandou a contagem: zero, e não dez.
    expect(imovelDaLinha(lancamento({ ...NEW_YORK, units_available: null }), BANCO, EM_OUTUBRO).empreendimento!.unidadesDisponiveis).toBe(0);
  });

  it('imóvel comum não tem empreendimento, venha a chave nula ou ausente', () => {
    expect(imovelDaLinha(linha(), BANCO).empreendimento).toBeNull();
    expect(imovelDaLinha(linha({ empreendimento: null }), BANCO).empreendimento).toBeNull();
  });

  it('a foto ilustrativa vem marcada; sem a marca, é foto do imóvel', () => {
    const fotos = imovelDaLinha(
      linha({
        media: [
          { storage_path: 'a/render.jpg', width: 1600, height: 900, alt_text: null, caption: null, is_illustrative: true },
          { storage_path: 'a/sala.jpg', width: 1600, height: 900, alt_text: null, caption: null },
        ],
      }),
      BANCO,
    ).fotos;
    expect(fotos.map((foto) => foto.ilustrativa)).toEqual([true, false]);
  });
});

/**
 * Os casos em que o empreendimento não tem o que oferecer, como `site_imoveis`
 * os manda: sem "a partir de" e com a contagem zerada. O preço, a descrição e
 * a oferta para o Google têm que dizer a mesma coisa ("Consulte").
 */
describe('o empreendimento sem unidade à venda', () => {
  const reservar = (p: NonNullable<EmpreendimentoDaLinha['floorplans']>[number]) => ({
    ...p,
    units: (p.units ?? []).map((u) => ({ ...u, price_cents: null, status: 'reservado' })),
  });
  const SO_RESERVADAS: EmpreendimentoDaLinha = { ...NEW_YORK, units_available: 0, floorplans: NEW_YORK.floorplans!.map(reservar) };
  const oferta = (imovel: Imovel) => (schemaDoImovel(imovel, 'https://julianasoaresimoveis.com.br/imovel/x') as { offers: Record<string, unknown>[] }).offers[0]!;
  // O real formatado leva espaço que não quebra entre o "R$" e o número.
  const resumo = (imovel: Imovel) => resumoDoImovel(imovel).replace(/ /g, ' ');

  it('só com reservadas: "Consulte", sem contagem, e a lista só com o selo', () => {
    const imovel = imovelDaLinha(lancamento(SO_RESERVADAS, { status: 'reservado', price_cents: null }), BANCO, EM_OUTUBRO);
    expect(imovel.precoVendaCents).toBeNull();
    expect(imovel.empreendimento!.unidadesDisponiveis).toBe(0);
    expect(imovel.empreendimento!.plantas.flatMap((p) => p.unidades).every((u) => u.precoCents === null)).toBe(true);
    expect(resumo(imovel)).toBe('Apartamentos à venda em Morretes, Itapema: 70 m², 2 ou 3 dormitórios. Cód. 1a2b.');
    expect(oferta(imovel)).toEqual({
      '@type': 'AggregateOffer',
      businessFunction: 'http://purl.org/goodrelations/v1#Sell',
      availability: 'https://schema.org/InStock',
      seller: { '@id': 'https://julianasoaresimoveis.com.br/#corretora' },
    });
  });

  it('nem um "a partir de" da menor reservada passa: sem disponível, não há preço', () => {
    const imovel = imovelDaLinha(lancamento(SO_RESERVADAS, { status: 'reservado', price_cents: 89_766_468 }), BANCO, EM_OUTUBRO);
    expect(imovel.precoVendaCents).toBeNull();
  });

  it('suspenso: o banco zera a contagem, e o site apaga também os preços das unidades', () => {
    // O banco ainda manda as unidades com preço; sem o site apagar, iriam para o Google.
    const imovel = imovelDaLinha(lancamento(NEW_YORK, { status: 'suspenso', price_cents: null }), BANCO, EM_OUTUBRO);
    expect(imovel.precoVendaCents).toBeNull();
    expect(imovel.empreendimento!.unidadesDisponiveis).toBe(0);
    expect(imovel.empreendimento!.plantas.flatMap((p) => p.unidades).some((u) => u.precoCents !== null)).toBe(false);
    // Os números das plantas continuam: a página antiga ainda diz o que o prédio é.
    expect(resumo(imovel)).toBe('Apartamentos à venda em Morretes, Itapema: 70 m², 2 ou 3 dormitórios. Cód. 1a2b.');
    expect(oferta(imovel)).toEqual({
      '@type': 'AggregateOffer',
      businessFunction: 'http://purl.org/goodrelations/v1#Sell',
      availability: 'https://schema.org/SoldOut',
      seller: { '@id': 'https://julianasoaresimoveis.com.br/#corretora' },
    });
  });

  it('suspenso, mesmo que a contagem viesse: fora da vitrine, zero', () => {
    const imovel = imovelDaLinha(lancamento(NEW_YORK, { status: 'suspenso' }), BANCO, EM_OUTUBRO);
    expect(imovel.empreendimento!.unidadesDisponiveis).toBe(0);
    expect(imovel.precoVendaCents).toBeNull();
  });

  it('antes da primeira tabela (unidades geradas, todas vendidas): sem lista, "Consulte" e sem contagem', () => {
    const semTabelaAplicada: EmpreendimentoDaLinha = {
      ...NEW_YORK,
      units_table_month: null,
      table_is_current: false,
      units_available: 0,
      floorplans: [],
    };
    const imovel = imovelDaLinha(lancamento(semTabelaAplicada), BANCO, EM_OUTUBRO);
    expect(imovel.status).toBe('disponivel');
    expect(imovel.precoVendaCents).toBeNull();
    expect(imovel.empreendimento).toMatchObject({ tabelaDoMes: null, tabelaVigente: false, unidadesDisponiveis: 0, plantas: [] });
    // Sem plantas na lista, os números são os do cadastro do imóvel.
    expect(resumo(imovel)).toBe('Apartamentos à venda em Morretes, Itapema: 72 m². Cód. 1a2b.');
    expect(oferta(imovel)).toEqual({
      '@type': 'AggregateOffer',
      businessFunction: 'http://purl.org/goodrelations/v1#Sell',
      availability: 'https://schema.org/InStock',
      seller: { '@id': 'https://julianasoaresimoveis.com.br/#corretora' },
    });
  });

  it('com a tabela vencida, as disponíveis seguem contadas, sem preço em lugar nenhum', () => {
    const imovel = imovelDaLinha(lancamento(semTabela(NEW_YORK)), BANCO, EM_OUTUBRO);
    expect(resumo(imovel)).toBe('Apartamentos à venda em Morretes, Itapema: 70 m², 2 ou 3 dormitórios. 10 unidades disponíveis. Cód. 1a2b.');
    expect(oferta(imovel)).toMatchObject({ offerCount: 10 });
    expect(oferta(imovel)).not.toHaveProperty('lowPrice');
  });
});
