/**
 * Mercados de anúncio — o PAÍS de quem vai ler, não o idioma dele.
 *
 * REGRA, irmã da que vale para idioma: mercado é DIMENSÃO, nunca braço do
 * experimento. O teste A/B/C roda DENTRO de um mercado. Comparar a variante A
 * da Argentina com a B dos Estados Unidos e chamar de resultado de layout é
 * medir dois públicos com orçamentos, moedas e motivos de compra diferentes —
 * e atribuir a diferença ao desenho da página.
 *
 * E mercado NÃO é idioma. É a distinção que faz esta lista existir:
 *
 *   AR, CL e ES falam espanhol e compram por motivos opostos. O argentino
 *   protege patrimônio de um peso que derrete e de controle cambial; o chileno
 *   diversifica com moeda estável; o espanhol olha tratado tributário e voo
 *   direto. Traduzir uma página para os três entrega a mesma conversa em
 *   espanhol — e conversa errada em espanhol continua sendo conversa errada.
 *
 * O idioma segue sendo o de `LOCALES`, e sai daqui por derivação: é ele que
 * manda no `hreflang` e no texto. O mercado manda no ARGUMENTO.
 */

import type { Locale } from './locales';

export interface Mercado {
  /** ISO 3166-1 alfa-2, minúsculo — é o que vai no caminho da URL. */
  code: string;
  label: string;
  /** Idioma em que a página é escrita. Vários mercados compartilham um. */
  locale: Locale;
  /** Moeda de quem lê. O preço verdadeiro continua em BRL. */
  currency: string;
  /**
   * Unidade de área esperada.
   *
   * O único mercado da lista que não pensa em metro quadrado são os Estados
   * Unidos. Mostrar "120 m²" para quem compra em pés quadrados é a diferença
   * entre uma página traduzida e uma página feita para aquele leitor — e a
   * conversão é exata, sem depender de cotação nem envelhecer.
   */
  areaUnit: 'm2' | 'ft2';
  /** Quem é essa pessoa e por que ela olharia um imóvel no Brasil. */
  pitch: string;
}

/**
 * Conjunto fechado, e curto de propósito.
 *
 * São os mercados onde a operação anuncia hoje. Acrescentar um é uma linha
 * aqui e uma migração de uma linha no CHECK — barato, e melhor do que uma
 * lista de duzentos países num seletor que ninguém consegue ler.
 */
export const MERCADOS: readonly Mercado[] = [
  {
    code: 'br',
    label: 'Brasil',
    locale: 'pt-BR',
    currency: 'BRL',
    areaUnit: 'm2',
    pitch: 'Mora ou investe no país. Conhece a região e compara com o que já viu.',
  },
  {
    code: 'ar',
    label: 'Argentina',
    locale: 'es',
    currency: 'ARS',
    areaUnit: 'm2',
    pitch: 'Protege patrimônio de moeda que derrete e de controle cambial. Já conhece a praia.',
  },
  {
    code: 'cl',
    label: 'Chile',
    locale: 'es',
    currency: 'CLP',
    areaUnit: 'm2',
    pitch: 'Diversifica com moeda estável. Compara com litoral chileno, que é caro e frio.',
  },
  {
    code: 'us',
    label: 'Estados Unidos',
    locale: 'en',
    currency: 'USD',
    areaUnit: 'ft2',
    pitch: 'Vê o dólar render muito mais aqui. Precisa entender como compra à distância.',
  },
  {
    code: 'es',
    label: 'Espanha',
    locale: 'es',
    currency: 'EUR',
    areaUnit: 'm2',
    pitch: 'Olha tratado tributário, voo direto e laço familiar. Compara com Algarve e Alicante.',
  },
] as const;

export const MERCADO_CODES = MERCADOS.map((m) => m.code) as readonly string[];

export const MERCADO_POR_CODE: Record<string, Mercado> = Object.fromEntries(
  MERCADOS.map((m) => [m.code, m]),
);

export const MERCADO_PADRAO = 'br';

export function ehMercado(valor: unknown): boolean {
  return typeof valor === 'string' && MERCADO_CODES.includes(valor);
}

/** O idioma em que a página daquele mercado é escrita. */
export function localeDoMercado(code: string): Locale {
  return MERCADO_POR_CODE[code]?.locale ?? 'pt-BR';
}

/**
 * Área na unidade que aquele mercado lê.
 *
 * 1 m² = 10,7639 ft². A conversão é exata e não envelhece — ao contrário da
 * cotação de moeda, que é por isso que o preço continua saindo em real.
 */
export function areaNoMercado(
  m2: number | null | undefined,
  code: string,
): { valor: number; unidade: string } | null {
  if (m2 == null || !Number.isFinite(m2) || m2 <= 0) return null;
  const mercado = MERCADO_POR_CODE[code];
  if (mercado?.areaUnit === 'ft2') {
    return { valor: Math.round(m2 * 10.7639), unidade: 'ft²' };
  }
  return { valor: Math.round(m2 * 10) / 10, unidade: 'm²' };
}

/**
 * O caminho público de uma página.
 *
 * O mercado entra SEMPRE, inclusive o Brasil — diferente do prefixo de idioma,
 * que omite o padrão. A razão é que esta URL nunca é digitada por ninguém: ela
 * é colada dentro de um anúncio. Uma rota sem caso especial vale mais do que
 * uma URL três caracteres mais curta, e o caso especial é onde mora o defeito
 * que só aparece no mercado padrão.
 */
export function caminhoDaPagina(
  orgSlug: string | null,
  mercado: string,
  slug: string,
  variante?: string,
): string {
  /*
   * Sem `orgSlug`, a URL é a do DOMÍNIO PRÓPRIO.
   *
   * O segmento da organização existia para desfazer a ambiguidade entre
   * inquilinos — o slug do imóvel é único por organização. Num domínio próprio
   * quem desfaz é o hostname, que é mais confiável que um segmento de caminho:
   * ninguém digita o domínio errado.
   *
   * As duas formas continuam válidas de propósito. O link com o slug da organização já foi
   * compartilhado, e quebrá-lo seria quebrar algo que já está na mão de alguém.
   */
  const prefixo = orgSlug ? `/${orgSlug}` : '';
  const base = `${prefixo}/${mercado}/imovel/${slug}`;
  return variante ? `${base}/${variante}` : base;
}
