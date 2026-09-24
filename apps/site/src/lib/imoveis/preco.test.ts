import { describe, expect, it } from 'vitest';

import { IMOVEIS_DE_EXEMPLO } from './exemplos';
import { dentroDaFaixa, FAIXAS_DE_PRECO, interpretarFaixa, rotuloDaFaixa } from './preco';

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
