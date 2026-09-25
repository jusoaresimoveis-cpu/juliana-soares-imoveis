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
  it('põe as suítes embaixo dos quartos e a área total embaixo da área', () => {
    expect(resumo(imovel({ areaM2: 177, areaTotalM2: 230, quartos: 4, suites: 2, banheiros: 3, vagas: 2 }))).toEqual([
      ['177', 'm²', '230 m² total'],
      ['4', 'quartos', '2 suítes'],
      ['3', 'banheiros', null],
      ['2', 'vagas', null],
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
      ['1', 'quarto', '1 suíte'],
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
