import { describe, expect, it } from 'vitest';
import { ANGULOS, ANGULOS_DE_CRIATIVO, ANGULO_DE_CRIATIVO_META } from './index';
import { valoresDoCheck as valoresDoCheckAtual } from '../../../supabase/testes/esquema';

describe('o ângulo do criativo — a 134', () => {
  it('os cinco do contrato são os que o banco aceita', () => {
    expect(valoresDoCheckAtual('meta_ad_dimensions_angulo_ck')).toEqual(
      [...ANGULOS_DE_CRIATIVO].sort(),
    );
  });

  it('não se confundem com os ângulos de landing page', () => {
    /*
     * Dois vocabulários, dois eixos. O da landing é sobre a PÁGINA que recebe
     * (experiência, investimento, oportunidade); este é sobre o ARGUMENTO do
     * anúncio que traz. Se um nome aparecesse nos dois, a primeira leitura
     * cruzada juntaria coisas que não têm relação nenhuma.
     */
    const juntos = new Set<string>([...ANGULOS, ...ANGULOS_DE_CRIATIVO]);
    expect(juntos.size).toBe(ANGULOS.length + ANGULOS_DE_CRIATIVO.length);
  });

  it('cada um explica o que é e dá um exemplo', () => {
    // Quem está escolhendo o ângulo está criando o anúncio: "objeção" sozinho
    // não ajuda ninguém a escrever a primeira linha do criativo.
    ANGULOS_DE_CRIATIVO.forEach((a) => {
      expect(ANGULO_DE_CRIATIVO_META[a]?.nota.length, a).toBeGreaterThan(30);
      expect(ANGULO_DE_CRIATIVO_META[a]?.exemplo.length, a).toBeGreaterThan(20);
    });
  });
});
