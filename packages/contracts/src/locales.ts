/**
 * Idiomas suportados pelas landing pages.
 *
 * REGRA INEGOCIÁVEL: idioma é DIMENSÃO, nunca braço do experimento.
 * Ele é gravado como coluna nos eventos, na submissão e no lead, e serve
 * como FILTRO na análise. Se o idioma virar variante do teste A/B/C, o
 * número de células multiplica e nenhuma delas junta amostra suficiente.
 *
 * Conjunto fechado e proposital:
 *  - 'pt-BR' porque o mercado é Brasil
 *  - 'es'    genérico, não 'es-419' nem 'es-AR' — o hreflang do Google
 *            ignora subtags regionais de espanhol na prática, e manter
 *            uma variante por país triplicaria o custo de tradução
 *  - 'en'    genérico, mesmo motivo
 */

export const LOCALES = ['pt-BR', 'es', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'pt-BR';

/** Como o idioma servido foi decidido. Vai gravado em todo evento. */
export const LOCALE_SOURCES = [
  'url', // fixado no path da URL do anúncio — sempre vence
  'stored', // escolha anterior do visitante, persistida
  'header', // negociado a partir do Accept-Language
  'geo', // desempate fraco por país do IP
  'default', // caiu no idioma padrão da organização
] as const;
export type LocaleSource = (typeof LOCALE_SOURCES)[number];

/** Segmento de path por idioma. O padrão NÃO leva prefixo. */
export const LOCALE_PATH: Record<Locale, string> = {
  'pt-BR': '',
  es: 'es',
  en: 'en',
};

export const PATH_LOCALE: Record<string, Locale> = {
  es: 'es',
  en: 'en',
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/**
 * Negocia o Accept-Language contra os idiomas publicados da página.
 *
 * Por que o cabeçalho e não o IP: o brasileiro que mora em Miami e quer
 * investir no Brasil tem IP dos Estados Unidos e aparelho em português.
 * Decidir por geolocalização entregaria inglês exatamente para o público
 * que a campanha mais quer alcançar. O IP só entra como desempate.
 */
export function negotiateLocale(
  acceptLanguage: string | null,
  available: readonly Locale[],
  fallback: Locale = DEFAULT_LOCALE,
): Locale {
  if (!acceptLanguage || !available.length) return fallback;

  const ranked = acceptLanguage
    .split(',')
    .map((part) => {
      const [tagRaw = '', ...params] = part.trim().split(';');
      const q = params.find((p) => p.trim().startsWith('q='));
      const quality = q ? Number.parseFloat(q.split('=')[1] ?? '') : 1;
      return { tag: tagRaw.trim().toLowerCase(), q: Number.isFinite(quality) ? quality : 0 };
    })
    .filter((entry) => entry.tag && entry.q > 0)
    .sort((a, b) => b.q - a.q);

  for (const { tag } of ranked) {
    // '*' significa "qualquer um serve" — não é sinal de preferência.
    if (tag === '*') break;

    const exact = available.find((loc) => loc.toLowerCase() === tag);
    if (exact) return exact;

    const base = tag.split('-')[0];
    const byBase = available.find((loc) => loc.toLowerCase().split('-')[0] === base);
    if (byBase) return byBase;
  }

  return available.includes(fallback) ? fallback : (available[0] ?? fallback);
}
