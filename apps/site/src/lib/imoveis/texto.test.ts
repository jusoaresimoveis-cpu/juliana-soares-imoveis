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

describe('resumoDoImovel no empreendimento', () => {
  it('diz os tipos no plural, os dormitórios das plantas, o "a partir de" e as unidades', () => {
    // "Dormitórios", e não "quartos": o número já soma as suítes.
    expect(resumo(exemplo('EX5'))).toBe(
      'Apartamentos à venda em Morretes, Itapema: 70 m², 2 ou 3 dormitórios. A partir de R$ 840.569, 4 unidades disponíveis. Cód. EX5.',
    );
  });

  it('o "a partir de" corta os centavos para baixo, nunca arredonda para cima', () => {
    expect(resumo(exemplo('EX5', { precoVendaCents: 84_056_999 }))).toContain('A partir de R$ 840.569,');
  });

  it('sem a tabela do mês, sai sem preço', () => {
    expect(resumo(exemplo('EX5', { precoVendaCents: null }))).toBe(
      'Apartamentos à venda em Morretes, Itapema: 70 m², 2 ou 3 dormitórios. 4 unidades disponíveis. Cód. EX5.',
    );
  });

  it('sem unidade disponível (só reservadas, suspenso), sem preço e sem contagem, como o "Consulte" da página', () => {
    const ex5 = exemplo('EX5');
    const semDisponivel = exemplo('EX5', {
      precoVendaCents: null,
      empreendimento: { ...ex5.empreendimento!, unidadesDisponiveis: 0 },
    });
    expect(resumo(semDisponivel)).toBe('Apartamentos à venda em Morretes, Itapema: 70 m², 2 ou 3 dormitórios. Cód. EX5.');
  });
});
