import { describe, expect, it } from 'vitest';

import { IMOVEIS_DE_EXEMPLO } from '@/lib/imoveis/exemplos';
import type { Imovel } from '@/lib/imoveis/tipos';

import { schemaDoImovel } from './schema';

const dormitorios = (campos: Partial<Imovel>) => {
  const schema = schemaDoImovel({ ...IMOVEIS_DE_EXEMPLO[0]!, ...campos }, 'https://julianasoaresimoveis.com.br/imovel/x') as {
    about: { numberOfBedrooms?: number };
  };
  return schema.about.numberOfBedrooms;
};

describe('schemaDoImovel', () => {
  it('diz ao Google o total de dormitórios: os quartos do cadastro não contam as suítes', () => {
    expect(dormitorios({ quartos: 2, suites: 1 })).toBe(3);
    expect(dormitorios({ quartos: null, suites: 4 })).toBe(4);
    expect(dormitorios({ quartos: 2, suites: null })).toBe(2);
  });

  it('sem quarto nem suíte, não inventa o número', () => {
    expect(dormitorios({ quartos: null, suites: null })).toBeUndefined();
  });
});
