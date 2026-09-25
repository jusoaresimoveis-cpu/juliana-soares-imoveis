import { describe, expect, it } from 'vitest';

import { urlDaFoto } from './banco';
import { imovelDaLinha, tituloPadrao, type LinhaDoSite } from './linha';

const BANCO = 'https://abc.supabase.co';

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
  amenities: ['piscina'],
  is_featured: true,
  updated_at: '2026-09-24T12:00:00Z',
  media: [{ storage_path: 'org/imovel/capa.webp', width: 2000, height: 1500, alt_text: 'Sala', caption: null }],
  ...mudancas,
});

describe('imovelDaLinha', () => {
  it('traduz a linha do banco para o imóvel do site', () => {
    const imovel = imovelDaLinha(linha(), BANCO);
    expect(imovel).toMatchObject({
      codigo: '1a2b',
      titulo: 'Apartamento com 2 quartos em Meia Praia, Itapema',
      finalidades: ['aluguel'],
      aluguelCents: 350_000,
      precoVendaCents: null,
      areaM2: 72,
      areaTotalM2: 90,
      slugsAntigos: [],
      fotos: [{ url: `${BANCO}/storage/v1/object/public/property-media/org/imovel/capa.webp`, alt: 'Sala', largura: 2000, altura: 1500 }],
    });
  });

  it('o título que a Juliana escreveu vence o montado', () => {
    expect(imovelDaLinha(linha({ public_title: '  Cobertura pé na areia ' }), BANCO).titulo).toBe('Cobertura pé na areia');
  });

  it('mostra só o preço do regime em que o imóvel está', () => {
    // Imóvel que estava à venda e passou a só alugar: o preço de venda ficou
    // gravado, e não pode aparecer no site.
    const soAluguel = imovelDaLinha(linha({ price_cents: 90_000_000 }), BANCO);
    expect(soAluguel.precoVendaCents).toBeNull();

    const osDois = imovelDaLinha(linha({ for_sale: true, price_cents: 90_000_000 }), BANCO);
    expect(osDois.finalidades).toEqual(['aluguel', 'venda']);
    expect(osDois.precoVendaCents).toBe(90_000_000);
  });

  it('foto sem medida e sem texto alternativo ainda sai utilizável', () => {
    const [foto] = imovelDaLinha(
      linha({ media: [{ storage_path: 'a/b.jpg', width: null, height: null, alt_text: null, caption: null }] }),
      BANCO,
    ).fotos;
    expect(foto).toMatchObject({ largura: 1600, altura: 1200, alt: 'Apartamento com 2 quartos em Meia Praia, Itapema, foto 1' });
  });

  it('valor fora do contrato não quebra a página', () => {
    const imovel = imovelDaLinha(linha({ property_type: 'iate', status: 'arquivado' }), BANCO);
    expect(imovel.tipo).toBe('outro');
    // Fica fora das listagens até alguém olhar.
    expect(imovel.status).toBe('suspenso');
  });
});

describe('tituloPadrao', () => {
  it('usa só o que existe', () => {
    expect(tituloPadrao({ property_type: 'terreno', bedrooms: null, neighborhood: null, city: 'Porto Belo' })).toBe(
      'Terreno em Porto Belo',
    );
    expect(tituloPadrao({ property_type: 'kitnet', bedrooms: 1, neighborhood: ' ', city: null })).toBe('Kitnet com 1 quarto');
  });
});

describe('urlDaFoto', () => {
  it('codifica cada parte do caminho, sem mexer nas barras', () => {
    expect(urlDaFoto(BANCO, '/org 1/foto ção.jpg')).toBe(
      `${BANCO}/storage/v1/object/public/property-media/org%201/foto%20%C3%A7%C3%A3o.jpg`,
    );
  });
});
