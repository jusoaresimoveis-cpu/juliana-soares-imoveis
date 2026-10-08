const REAL = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 0,
});

/** Centavos → "R$ 3.500". Imóvel não tem preço com centavos na vitrine. */
export function reais(cents: number): string {
  return REAL.format(Math.round(cents / 100));
}

/**
 * Centavos → "R$ 840.569", cortando os centavos para baixo. É o do "a partir
 * de": arredondar R$ 840.569,60 para R$ 840.570 anunciaria um piso acima do
 * preço da unidade mais barata.
 */
export function reaisParaBaixo(cents: number): string {
  return REAL.format(Math.floor(cents / 100));
}

/** 1 → "1 quarto", 3 → "3 quartos". */
export function plural(quantidade: number, singular: string, pluralDaPalavra: string): string {
  return `${quantidade} ${quantidade === 1 ? singular : pluralDaPalavra}`;
}

const distintos = (valores: readonly number[]) => [...new Set(valores)].sort((a, b) => a - b);

/**
 * A contagem de várias plantas: [2, 3] → "2 ou 3", [1, 2, 3] → "1 a 3",
 * [2, 2] → "2".
 *
 * Com zero na lista vira "até": [0, 1] → "até 1". "0 ou 1 vaga" lê como erro, e
 * "1 vaga" diria que toda planta tem vaga.
 */
export function faixaDeContagem(valores: readonly number[]): string {
  const lista = distintos(valores);
  const menor = lista[0] ?? 0;
  const maior = lista.at(-1) ?? 0;
  if (menor === 0 && maior > 0) return `até ${maior}`;
  if (lista.length === 1) return String(menor);
  return lista.length === 2 ? `${menor} ou ${maior}` : `${menor} a ${maior}`;
}

/** As áreas de várias unidades: [70] → "70", [65, 70, 90] → "65 a 90". */
export function faixaDeArea(valores: readonly number[]): string {
  const lista = distintos(valores).map((area) => area.toLocaleString('pt-BR'));
  return lista.length > 1 ? `${lista[0]} a ${lista.at(-1)}` : (lista[0] ?? '');
}
