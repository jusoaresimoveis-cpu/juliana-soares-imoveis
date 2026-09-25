import { describe, expect, it } from 'vitest';
import { dimensoesReduzidas, JA_LEVE_BYTES, LADO_MAIOR, precisaReduzir } from './fotos';

/**
 * A regra de quando e quanto reduzir. O desenho no canvas só roda no
 * navegador; o que decide o tamanho do armazenamento está aqui.
 */

describe('dimensoesReduzidas', () => {
  it('leva o lado maior a 2048 e mantém a proporção', () => {
    expect(dimensoesReduzidas(4032, 3024)).toEqual({ largura: LADO_MAIOR, altura: 1536 });
    // Em pé: o lado maior é a altura.
    expect(dimensoesReduzidas(3024, 4032)).toEqual({ largura: 1536, altura: LADO_MAIOR });
  });

  it('nunca aumenta foto pequena', () => {
    expect(dimensoesReduzidas(1200, 800)).toEqual({ largura: 1200, altura: 800 });
  });
});

describe('precisaReduzir', () => {
  const jpeg = (size: number) => ({ type: 'image/jpeg', size });

  it('foto de celular reduz', () => {
    expect(precisaReduzir(jpeg(4_200_000), 4032, 3024)).toBe(true);
  });

  it('JPEG já leve e no tamanho sobe como veio', () => {
    expect(precisaReduzir(jpeg(JA_LEVE_BYTES - 1), 1600, 1200)).toBe(false);
  });

  it('leve mas grande demais reduz', () => {
    expect(precisaReduzir(jpeg(300_000), 4000, 3000)).toBe(true);
  });

  it('PNG e AVIF viram JPEG mesmo pequenos', () => {
    expect(precisaReduzir({ type: 'image/png', size: 50_000 }, 800, 600)).toBe(true);
    expect(precisaReduzir({ type: 'image/avif', size: 50_000 }, 800, 600)).toBe(true);
  });
});
