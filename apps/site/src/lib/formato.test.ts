import { describe, expect, it } from 'vitest';

import { faixaDeArea, faixaDeContagem, reais, reaisParaBaixo } from './formato';

// O real formatado leva espaço que não quebra entre o "R$" e o número.
const semNbsp = (texto: string) => texto.replace(/ /g, ' ');

describe('reaisParaBaixo', () => {
  it('corta os centavos do "a partir de", sem arredondar para cima', () => {
    expect(semNbsp(reaisParaBaixo(84_056_940))).toBe('R$ 840.569');
    expect(semNbsp(reaisParaBaixo(84_056_999))).toBe('R$ 840.569');
    // O preço comum continua arredondado.
    expect(semNbsp(reais(84_056_999))).toBe('R$ 840.570');
  });
});

describe('faixaDeContagem', () => {
  it('dois valores com "ou", mais de dois com "a"', () => {
    expect(faixaDeContagem([3, 2, 3])).toBe('2 ou 3');
    expect(faixaDeContagem([1, 3, 2])).toBe('1 a 3');
    expect(faixaDeContagem([2, 2])).toBe('2');
  });

  it('com zero, "até": "0 ou 1 vaga" pareceria erro', () => {
    expect(faixaDeContagem([0, 1])).toBe('até 1');
    expect(faixaDeContagem([0, 2, 3])).toBe('até 3');
  });
});

describe('faixaDeArea', () => {
  it('uma área, ou da menor à maior', () => {
    expect(faixaDeArea([70, 70])).toBe('70');
    expect(faixaDeArea([90, 32.5, 70])).toBe('32,5 a 90');
  });
});
