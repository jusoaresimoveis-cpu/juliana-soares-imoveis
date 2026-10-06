import { describe, expect, it } from 'vitest';

import { IMOVEIS_DE_EXEMPLO } from './exemplos';
import { resumoDoImovel } from './texto';
import type { Imovel } from './tipos';

// EX3: casa à venda por R$ 890.000. EX4: venda por R$ 1.450.000 ou aluguel por R$ 5.200.
const exemplo = (codigo: string, campos: Partial<Imovel> = {}): Imovel => ({
  ...IMOVEIS_DE_EXEMPLO.find((imovel) => imovel.codigo === codigo)!,
  ...campos,
});

// O real formatado leva espaço que não quebra entre o "R$" e o número.
const resumo = (imovel: Imovel) => resumoDoImovel(imovel).replace(/ /g, ' ');

describe('resumoDoImovel', () => {
  it('venda com desconto diz o "de" e o "por"', () => {
    expect(resumo(exemplo('EX3', { precoDeTabelaCents: 95_000_000 }))).toBe(
      'Casa à venda em Perequê, Porto Belo: 140 m², 3 quartos, 1 suíte, 2 banheiros, 2 vagas. ' +
        'De R$ 950.000 por R$ 890.000. Cód. EX3.',
    );
  });

  it('sem desconto, só o preço', () => {
    expect(resumo(exemplo('EX3', { precoDeTabelaCents: null }))).toMatch(/2 vagas\. R\$ 890\.000\. Cód\. EX3\.$/);
  });

  it('com aluguel e venda, o desconto fica na venda', () => {
    expect(resumo(exemplo('EX4', { precoDeTabelaCents: 150_000_000 }))).toMatch(
      /\. R\$ 5\.200\/mês ou de R\$ 1\.500\.000 por R\$ 1\.450\.000\. Cód\. EX4\.$/,
    );
  });
});
