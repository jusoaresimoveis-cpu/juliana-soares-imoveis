import { describe, expect, it } from 'vitest';
import { TEMPERATURAS, TEMPERATURA_MATIZ } from '@contracts';
import { BOARD_COLUMNS } from '@/types/db';

/**
 * A qualificação do lado da tela.
 *
 * O contrato contra o banco está em `packages/contracts/src/qualificacao.test.ts`.
 * Aqui fica a amarra que só existe do lado de cá: o quadro só filtra pelo que
 * ele pede ao banco.
 */

describe('o quadro', () => {
  it('pede o selo ao banco — é por ele que o filtro funciona', () => {
    expect(BOARD_COLUMNS.split(', ')).toContain('temperatura');
  });

  it('cada temperatura tem o seu matiz, e nenhum se repete', () => {
    const matizes = TEMPERATURAS.map((t) => TEMPERATURA_MATIZ[t]);
    expect(new Set(matizes).size).toBe(TEMPERATURAS.length);
  });
});
