import { describe, expect, it } from 'vitest';

import { IMOVEIS_DE_EXEMPLO } from '@/lib/imoveis/exemplos';
import type { Imovel } from '@/lib/imoveis/tipos';

import { schemaDoImovel } from './schema';

const dormitorios = (campos: Partial<Imovel>) => {
  const schema = schemaDoImovel({ ...IMOVEIS_DE_EXEMPLO[0]!, ...campos }, 'https://julianasoaresimoveis.com.br/imovel/x') as {
    about: { numberOfBedrooms?: number };
  };
  return schema.about.numberOfBedrooms;
};

describe('schemaDoImovel', () => {
  it('diz ao Google o total de dormitórios: os quartos do cadastro não contam as suítes', () => {
    expect(dormitorios({ quartos: 2, suites: 1 })).toBe(3);
    expect(dormitorios({ quartos: null, suites: 4 })).toBe(4);
    expect(dormitorios({ quartos: 2, suites: null })).toBe(2);
  });

  it('sem quarto nem suíte, não inventa o número', () => {
    expect(dormitorios({ quartos: null, suites: null })).toBeUndefined();
  });
});

describe('schemaDoImovel no empreendimento', () => {
  const EX5 = IMOVEIS_DE_EXEMPLO.find((imovel) => imovel.codigo === 'EX5')!;
  const schema = (imovel: Imovel) =>
    schemaDoImovel(imovel, 'https://julianasoaresimoveis.com.br/imovel/x') as {
      offers: Record<string, unknown>[];
      about: Record<string, unknown>;
    };

  it('é uma oferta agregada, do menor ao maior preço entre as disponíveis', () => {
    // O 1702, reservado, chega sem preço e não entra na oferta.
    expect(schema(EX5).offers).toEqual([
      {
        '@type': 'AggregateOffer',
        businessFunction: 'http://purl.org/goodrelations/v1#Sell',
        availability: 'https://schema.org/InStock',
        offerCount: 4,
        lowPrice: 840_569.4,
        highPrice: 891_320.76,
        priceCurrency: 'BRL',
        seller: { '@id': 'https://julianasoaresimoveis.com.br/#corretora' },
      },
    ]);
  });

  it('sem a tabela do mês, a oferta sai sem preço', () => {
    const semTabela: Imovel = {
      ...EX5,
      precoVendaCents: null,
      empreendimento: {
        ...EX5.empreendimento!,
        tabelaVigente: false,
        plantas: EX5.empreendimento!.plantas.map((p) => ({ ...p, unidades: p.unidades.map((u) => ({ ...u, precoCents: null })) })),
      },
    };
    const [oferta] = schema(semTabela).offers;
    expect(oferta).toMatchObject({ '@type': 'AggregateOffer', offerCount: 4 });
    expect(oferta).not.toHaveProperty('lowPrice');
    expect(oferta).not.toHaveProperty('highPrice');
    expect(oferta).not.toHaveProperty('priceCurrency');
  });

  it('a reservada não é oferta, nem se viesse com preço', () => {
    const comPrecoNaReservada: Imovel = {
      ...EX5,
      empreendimento: {
        ...EX5.empreendimento!,
        plantas: EX5.empreendimento!.plantas.map((p) => ({
          ...p,
          unidades: p.unidades.map((u) => (u.situacao === 'reservado' ? { ...u, precoCents: 89_766_468 } : u)),
        })),
      },
    };
    expect(schema(comPrecoNaReservada).offers[0]).toMatchObject({ lowPrice: 840_569.4, highPrice: 891_320.76 });
  });

  it('os quartos e a área vêm das plantas, em faixa quando diferem', () => {
    const { about } = schema(EX5);
    expect(about.numberOfBedrooms).toEqual({ '@type': 'QuantitativeValue', minValue: 2, maxValue: 3 });
    expect(about.floorSize).toEqual({ '@type': 'QuantitativeValue', value: 70, unitCode: 'MTK' });
    // 2 ou 3 banheiros: o schema.org só aceita um número inteiro, e fica de fora.
    expect(about).not.toHaveProperty('numberOfBathroomsTotal');
  });
});
