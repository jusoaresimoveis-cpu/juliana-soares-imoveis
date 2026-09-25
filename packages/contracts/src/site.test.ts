import { describe, expect, it } from 'vitest';

import {
  PROPERTY_TYPE_PLURAL,
  PROPERTY_TYPES,
  rotuloDaComodidade,
  slugify,
  tipoPeloSlug,
  TODOS_OS_TIPOS,
} from './index';

describe('slugify', () => {
  it('tira acento, espaço e maiúscula', () => {
    expect(slugify('Meia Praia')).toBe('meia-praia');
    expect(slugify('Perequê')).toBe('pereque');
    expect(slugify('  Jardim São Paulo  ')).toBe('jardim-sao-paulo');
    expect(slugify('Canto da Praia / Itapema')).toBe('canto-da-praia-itapema');
  });
});

describe('slugs de tipo', () => {
  it('são únicos, já estão em forma de slug e não colidem com "imoveis"', () => {
    const slugs = PROPERTY_TYPES.map((tipo) => PROPERTY_TYPE_PLURAL[tipo].slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) expect(slugify(slug)).toBe(slug);
    expect(slugs).not.toContain(TODOS_OS_TIPOS.slug);
  });

  it('vão e voltam', () => {
    for (const tipo of PROPERTY_TYPES) expect(tipoPeloSlug(PROPERTY_TYPE_PLURAL[tipo].slug)).toBe(tipo);
    expect(tipoPeloSlug('mansoes')).toBeNull();
  });
});

describe('rotuloDaComodidade', () => {
  it('usa o rótulo da lista, ou arruma o texto livre', () => {
    expect(rotuloDaComodidade('salao_festas')).toBe('Salão de festas');
    expect(rotuloDaComodidade('sauna_seca')).toBe('Sauna seca');
  });
});
