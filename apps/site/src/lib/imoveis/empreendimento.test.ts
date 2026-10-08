import { describe, expect, it } from 'vitest';

import { ofertaDaPlanta, precoDaUnidade } from './empreendimento';
import type { UnidadeDoEmpreendimento } from './tipos';

const unidade = (
  rotulo: string,
  precoCents: number | null,
  situacao: UnidadeDoEmpreendimento['situacao'] = 'disponivel',
): UnidadeDoEmpreendimento => ({ rotulo, andar: 1, areaM2: 70, precoCents, situacao });

// O real formatado leva espaço que não quebra entre o "R$" e o número.
const texto = (valor: string | null) => valor?.replace(/ /g, ' ') ?? null;

describe('precoDaUnidade', () => {
  it('a disponível mostra o preço da tabela, com os centavos', () => {
    expect(texto(precoDaUnidade(unidade('804', 84_056_940)))).toBe('R$ 840.569,40');
  });

  it('a disponível sem a tabela do mês é "Consulte"', () => {
    expect(precoDaUnidade(unidade('804', null))).toBe('Consulte');
  });

  it('a reservada não tem preço nem "Consulte", só o selo', () => {
    expect(precoDaUnidade(unidade('1702', null, 'reservado'))).toBeNull();
    // Nem se o preço viesse: a reservada não está à venda.
    expect(precoDaUnidade(unidade('1702', 89_766_468, 'reservado'))).toBeNull();
  });
});

describe('ofertaDaPlanta', () => {
  it('o "a partir de" é o da disponível mais barata, e a reservada só é contada', () => {
    const planta = { unidades: [unidade('804', 84_056_940), unidade('1204', 89_132_076), unidade('1702', null, 'reservado')] };
    expect(ofertaDaPlanta(planta)).toEqual({ disponiveis: 2, reservadas: 1, aPartirDeCents: 84_056_940 });
  });

  it('uma reservada com preço não baixa o "a partir de"', () => {
    const planta = { unidades: [unidade('804', 84_056_940), unidade('302', 70_000_000, 'reservado')] };
    expect(ofertaDaPlanta(planta).aPartirDeCents).toBe(84_056_940);
  });

  it('planta só com reservadas: sem "a partir de"', () => {
    const planta = { unidades: [unidade('1702', null, 'reservado'), unidade('1705', null, 'reservado')] };
    expect(ofertaDaPlanta(planta)).toEqual({ disponiveis: 0, reservadas: 2, aPartirDeCents: null });
  });

  it('sem a tabela do mês: as disponíveis contadas, sem "a partir de"', () => {
    const planta = { unidades: [unidade('804', null), unidade('1204', null)] };
    expect(ofertaDaPlanta(planta)).toEqual({ disponiveis: 2, reservadas: 0, aPartirDeCents: null });
  });
});
