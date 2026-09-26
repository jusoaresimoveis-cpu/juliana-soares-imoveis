import { describe, expect, it } from 'vitest';
import { FRACAO_DO_LADO_MENOR, TRACOS_DO_SIMBOLO, posicaoDaMarca } from './marcaDagua';

describe("a marca d'água", () => {
  it('lê as três peças do símbolo do arquivo da marca', () => {
    // O S, o J e o telhado: cada peça começa com um M e fecha com um Z.
    expect(TRACOS_DO_SIMBOLO.match(/M/g)).toHaveLength(3);
    expect(TRACOS_DO_SIMBOLO.match(/Z/g)).toHaveLength(3);
  });

  it('fica no meio da foto deitada, com 35% da altura', () => {
    const p = posicaoDaMarca(1600, 900);
    expect(p.altura).toBeCloseTo(900 * FRACAO_DO_LADO_MENOR);
    expect(p.x + p.largura / 2).toBeCloseTo(800);
    expect(p.y + p.altura / 2).toBeCloseTo(450);
  });

  it('na foto em pé, mede pela largura, que é o lado menor', () => {
    const p = posicaoDaMarca(900, 1600);
    expect(p.altura).toBeCloseTo(900 * FRACAO_DO_LADO_MENOR);
    expect(p.x + p.largura / 2).toBeCloseTo(450);
    expect(p.y + p.altura / 2).toBeCloseTo(800);
  });

  it('cabe inteira até numa panorâmica estreita', () => {
    const p = posicaoDaMarca(4000, 500);
    expect(p.x).toBeGreaterThan(0);
    expect(p.y).toBeGreaterThan(0);
    expect(p.x + p.largura).toBeLessThan(4000);
    expect(p.y + p.altura).toBeLessThan(500);
  });

  it('mantém a proporção do símbolo', () => {
    const deitada = posicaoDaMarca(1600, 900);
    const emPe = posicaoDaMarca(900, 1600);
    expect(deitada.largura / deitada.altura).toBeCloseTo(emPe.largura / emPe.altura);
    expect(deitada.largura / deitada.altura).toBeCloseTo(696 / 741, 3);
  });
});
