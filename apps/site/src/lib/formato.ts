const REAL = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 0,
});

/** Centavos → "R$ 3.500". Imóvel não tem preço com centavos na vitrine. */
export function reais(cents: number): string {
  return REAL.format(Math.round(cents / 100));
}

/** 1 → "1 quarto", 3 → "3 quartos". */
export function plural(quantidade: number, singular: string, pluralDaPalavra: string): string {
  return `${quantidade} ${quantidade === 1 ? singular : pluralDaPalavra}`;
}
