import { describe, expect, it } from 'vitest';

import { IMOVEIS_DE_EXEMPLO } from './exemplos';
import { dentroDaFaixa, FAIXAS_DE_PRECO, interpretarFaixa, precosNaFinalidade, rotuloDaFaixa } from './preco';
import type { Imovel } from './tipos';

const [aluguel3500, , casaVenda] = IMOVEIS_DE_EXEMPLO;

describe('interpretarFaixa', () => {
  it('lê reais e devolve centavos', () => {
    expect(interpretarFaixa('2000-3500')).toEqual({ minCents: 200_000, maxCents: 350_000 });
    expect(interpretarFaixa('8000-')).toEqual({ minCents: 800_000, maxCents: null });
    expect(interpretarFaixa('0-2000')).toEqual({ minCents: 0, maxCents: 200_000 });
  });

  it('recusa lixo, faixa vazia e faixa invertida', () => {
    for (const valor of [null, '', '-', 'abc', '2000', '5000-2000', '1e5-2', '-100-200']) {
      expect(interpretarFaixa(valor)).toBeNull();
    }
  });

  it('toda faixa sugerida é válida', () => {
    for (const opcoes of Object.values(FAIXAS_DE_PRECO)) {
      for (const opcao of opcoes) expect(interpretarFaixa(opcao.valor)).not.toBeNull();
    }
  });
});

describe('dentroDaFaixa', () => {
  it('inclui as pontas e usa o preço da finalidade buscada', () => {
    expect(dentroDaFaixa(aluguel3500, 'aluguel', interpretarFaixa('2000-3500')!)).toBe(true);
    expect(dentroDaFaixa(aluguel3500, 'aluguel', interpretarFaixa('3500-5000')!)).toBe(true);
    expect(dentroDaFaixa(aluguel3500, 'aluguel', interpretarFaixa('0-2000')!)).toBe(false);
    expect(dentroDaFaixa(casaVenda, 'venda', interpretarFaixa('500000-1000000')!)).toBe(true);
  });

  it('deixa de fora imóvel sem preço naquela finalidade', () => {
    expect(dentroDaFaixa(aluguel3500, 'venda', interpretarFaixa('0-')!)).toBe(false);
  });
});

describe('rotuloDaFaixa', () => {
  it('usa o rótulo sugerido ou monta um', () => {
    expect(rotuloDaFaixa('aluguel', '2000-3500')).toBe('R$ 2.000 a R$ 3.500');
    expect(rotuloDaFaixa('venda', '300000-')).toBe('Acima de R$ 300.000');
    expect(rotuloDaFaixa('venda', 'xyz')).toBeNull();
  });
});

/**
 * EX5: disponíveis o 804 (R$ 840.569,40), o 506 (R$ 850.085,28), o 701
 * (R$ 884.976,84) e o 1204 (R$ 891.320,76); o 1702 está reservado, e sem preço.
 */
describe('o empreendimento na faixa de preço', () => {
  const EX5 = IMOVEIS_DE_EXEMPLO.find((imovel) => imovel.codigo === 'EX5')!;
  const naFaixa = (imovel: Imovel, valor: string) => dentroDaFaixa(imovel, 'venda', interpretarFaixa(valor)!);
  const soReservadas: Imovel = {
    ...EX5,
    status: 'reservado',
    // Como o banco manda: sem disponível, nem "a partir de" nem contagem.
    precoVendaCents: null,
    empreendimento: {
      ...EX5.empreendimento!,
      unidadesDisponiveis: 0,
      plantas: EX5.empreendimento!.plantas.map((p) => ({
        ...p,
        unidades: p.unidades.map((u) => ({ ...u, precoCents: null, situacao: 'reservado' as const })),
      })),
    },
  };

  it('entra se alguma unidade disponível couber, mesmo acima do "a partir de"', () => {
    expect(naFaixa(EX5, '800000-845000')).toBe(true);
    // O "a partir de" (R$ 840.569) fica abaixo, mas o 506 cabe.
    expect(naFaixa(EX5, '845000-851000')).toBe(true);
    expect(naFaixa(EX5, '0-840000')).toBe(false);
  });

  it('a unidade reservada não põe o empreendimento na faixa, nem se viesse com preço', () => {
    expect(naFaixa(EX5, '892000-900000')).toBe(false);
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
    expect(naFaixa(comPrecoNaReservada, '892000-900000')).toBe(false);
  });

  it('sem a tabela do mês ("Consulte"), fica fora de toda faixa', () => {
    const semTabela: Imovel = {
      ...EX5,
      precoVendaCents: null,
      empreendimento: {
        ...EX5.empreendimento!,
        tabelaVigente: false,
        plantas: EX5.empreendimento!.plantas.map((p) => ({ ...p, unidades: p.unidades.map((u) => ({ ...u, precoCents: null })) })),
      },
    };
    expect(precosNaFinalidade(semTabela, 'venda')).toEqual([]);
    expect(naFaixa(semTabela, '0-')).toBe(false);
  });

  it('só com reservadas, o cartão diz "Consulte" e fica fora de toda faixa', () => {
    expect(precosNaFinalidade(soReservadas, 'venda')).toEqual([]);
    expect(naFaixa(soReservadas, '0-')).toBe(false);
    // Só as disponíveis contam: nem um "a partir de" que sobrasse no imóvel
    // (o da menor reservada, regra antiga) põe o empreendimento na faixa.
    expect(precosNaFinalidade({ ...soReservadas, precoVendaCents: 89_766_468 }, 'venda')).toEqual([]);
  });

  it('sem lista (antes da primeira tabela, ou tudo vendido), fica fora de toda faixa', () => {
    const semLista: Imovel = {
      ...EX5,
      precoVendaCents: null,
      empreendimento: { ...EX5.empreendimento!, tabelaDoMes: null, tabelaVigente: false, unidadesDisponiveis: 0, plantas: [] },
    };
    expect(precosNaFinalidade(semLista, 'venda')).toEqual([]);
  });
});
