import { describe, expect, it } from 'vitest';
import { EVENT_TYPES } from './index';

describe('eventos', () => {
  it('sem prefixo e sem duplicata', () => {
    expect(new Set(EVENT_TYPES).size).toBe(EVENT_TYPES.length);
    EVENT_TYPES.forEach((e) => expect(e.startsWith('lp_')).toBe(false));
  });

  it('a profundidade de rolagem é um evento só, com o marco nas propriedades', () => {
    // E não scroll_25 / scroll_50 / scroll_75 como tipos separados — foi
    // exatamente essa divergência que quebrou o desenho anterior.
    expect(EVENT_TYPES).toContain('scroll_depth');
    expect(EVENT_TYPES.filter((e) => /^scroll_\d+$/.test(e))).toHaveLength(0);
  });
});
