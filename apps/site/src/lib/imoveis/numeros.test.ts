import { describe, expect, it } from 'vitest';

import { IMOVEIS_DE_EXEMPLO } from './exemplos';
import { numerosDoImovel } from './numeros';
import type { Imovel } from './tipos';

const imovel = (campos: Partial<Imovel>): Imovel => ({
  ...IMOVEIS_DE_EXEMPLO[0]!,
  areaM2: null,
  areaTotalM2: null,
  quartos: null,
  suites: null,
  banheiros: null,
  vagas: null,
  ...campos,
});

const resumo = (i: Imovel) => numerosDoImovel(i).map((n) => [n.valor, n.rotulo, n.extra]);

describe('numerosDoImovel', () => {
  it('põe quartos e suítes lado a lado, e a área total embaixo da área', () => {
    // No cadastro, os quartos não contam as suítes: 2 quartos e 1 suíte são 3
    // dormitórios, e a pessoa vê os dois números para somar.
    expect(resumo(imovel({ areaM2: 130, areaTotalM2: 160, quartos: 2, suites: 1, banheiros: 2, vagas: 1 }))).toEqual([
      ['130', 'm²', '160 m² total'],
      ['2', 'quartos', null],
      ['1', 'suíte', null],
      ['2', 'banheiros', null],
      ['1', 'vaga', null],
    ]);
  });

  it('sem dormitórios cadastrados, as suítes aparecem sozinhas', () => {
    // O imóvel 1000 ficou assim no CRM: dormitórios vazio e 4 suítes.
    expect(resumo(imovel({ areaM2: 177, suites: 4, vagas: 3 }))).toEqual([
      ['177', 'm²', null],
      ['4', 'suítes', null],
      ['3', 'vagas', null],
    ]);
  });

  it('usa o singular quando é um', () => {
    expect(resumo(imovel({ quartos: 1, suites: 1, banheiros: 1, vagas: 1 }))).toEqual([
      ['1', 'quarto', null],
      ['1', 'suíte', null],
      ['1', 'banheiro', null],
      ['1', 'vaga', null],
    ]);
  });

  it('não repete a área quando a total é igual à privativa', () => {
    expect(resumo(imovel({ areaM2: 90, areaTotalM2: 90 }))).toEqual([['90', 'm²', null]]);
  });

  it('não mostra nada do que não foi preenchido', () => {
    expect(numerosDoImovel(imovel({}))).toEqual([]);
  });
});
