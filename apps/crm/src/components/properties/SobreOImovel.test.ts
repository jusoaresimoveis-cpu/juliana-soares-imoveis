import { describe, expect, it } from 'vitest';

import { dividir } from './SobreOImovel';

describe('o texto digitado em "Sobre o imóvel"', () => {
  it('nas listas, vírgula separa vários itens de uma vez', () => {
    expect(dividir('lazer', 'Deck molhado, Espaço zen; Bar\nOfurô')).toEqual(['Deck molhado', 'Espaço zen', 'Bar', 'Ofurô']);
  });

  it('vírgula entre números não separa', () => {
    expect(dividir('unidade', 'Terreno de 12,5 x 30 m, Poço artesiano')).toEqual(['Terreno de 12,5 x 30 m', 'Poço artesiano']);
  });

  it('em "Informações adicionais" o texto vai inteiro', () => {
    expect(dividir('adicionais', '  Condomínio de R$ 1.250,00, com água inclusa ')).toEqual([
      'Condomínio de R$ 1.250,00, com água inclusa',
    ]);
    expect(dividir('adicionais', '   ')).toEqual([]);
  });
});
