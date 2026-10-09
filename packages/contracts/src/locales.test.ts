import { describe, expect, it } from 'vitest';
import { LOCALES, negotiateLocale } from './index';

describe('negociação de idioma', () => {
  it('brasileiro morando no exterior recebe português', () => {
    // O caso que motivou a decisão: IP nos Estados Unidos, aparelho em
    // português. Decidir por geolocalização entregaria inglês justamente
    // para o público que a campanha mais quer.
    expect(negotiateLocale('pt-BR,pt;q=0.9,en-US;q=0.8', LOCALES)).toBe('pt-BR');
  });

  it('argentino recebe espanhol pela raiz do idioma', () => {
    expect(negotiateLocale('es-AR,es;q=0.9', LOCALES)).toBe('es');
  });

  it('respeita a ordem de qualidade, não a ordem de escrita', () => {
    expect(negotiateLocale('en;q=0.4,es;q=0.9', LOCALES)).toBe('es');
  });

  it('curinga e cabeçalho ausente caem no padrão', () => {
    expect(negotiateLocale('*', LOCALES)).toBe('pt-BR');
    expect(negotiateLocale(null, LOCALES)).toBe('pt-BR');
  });

  it('idioma não publicado cai no padrão', () => {
    expect(negotiateLocale('de-DE,de;q=0.9', ['pt-BR', 'es'])).toBe('pt-BR');
  });
});
