import type { FinalidadeDoSite } from '@juliana/contracts';

import type { Imovel } from './tipos';

/**
 * Faixas de preço da busca.
 *
 * Na URL a faixa vai em reais, `?preco=2000-3500`, e não em centavos: é o link
 * que a pessoa copia e manda no WhatsApp, e "200000-350000" parece erro. As
 * faixas abaixo são só as sugeridas no seletor; a URL aceita qualquer par.
 */

export interface OpcaoDeFaixa {
  valor: string;
  rotulo: string;
}

export const FAIXAS_DE_PRECO: Record<FinalidadeDoSite, readonly OpcaoDeFaixa[]> = {
  aluguel: [
    { valor: '0-2000', rotulo: 'Até R$ 2.000' },
    { valor: '2000-3500', rotulo: 'R$ 2.000 a R$ 3.500' },
    { valor: '3500-5000', rotulo: 'R$ 3.500 a R$ 5.000' },
    { valor: '5000-8000', rotulo: 'R$ 5.000 a R$ 8.000' },
    { valor: '8000-', rotulo: 'Acima de R$ 8.000' },
  ],
  venda: [
    { valor: '0-500000', rotulo: 'Até R$ 500 mil' },
    { valor: '500000-1000000', rotulo: 'R$ 500 mil a R$ 1 milhão' },
    { valor: '1000000-2000000', rotulo: 'R$ 1 a 2 milhões' },
    { valor: '2000000-4000000', rotulo: 'R$ 2 a 4 milhões' },
    { valor: '4000000-', rotulo: 'Acima de R$ 4 milhões' },
  ],
};

export interface Faixa {
  minCents: number | null;
  maxCents: number | null;
}

/** "2000-3500" → { min 200000, max 350000 } em centavos. Qualquer outra coisa → null. */
export function interpretarFaixa(valor: string | null | undefined): Faixa | null {
  const achado = /^(\d{0,10})-(\d{0,10})$/.exec(valor ?? '');
  if (!achado) return null;
  const [, min, max] = achado;
  if (!min && !max) return null;

  const faixa: Faixa = {
    minCents: min ? Number(min) * 100 : null,
    maxCents: max ? Number(max) * 100 : null,
  };
  if (faixa.minCents !== null && faixa.maxCents !== null && faixa.minCents > faixa.maxCents) return null;
  return faixa;
}

/** O preço que vale para aquela busca: aluguel mensal ou valor de venda. */
export function precoNaFinalidade(imovel: Imovel, finalidade: FinalidadeDoSite): number | null {
  return finalidade === 'aluguel' ? imovel.aluguelCents : imovel.precoVendaCents;
}

/**
 * Imóvel sem preço cadastrado ("Consulte") fica FORA de uma busca por faixa:
 * não dá para afirmar que ele cabe no orçamento da pessoa.
 */
export function dentroDaFaixa(imovel: Imovel, finalidade: FinalidadeDoSite, faixa: Faixa): boolean {
  return precoNaFaixa(precoNaFinalidade(imovel, finalidade), faixa);
}

export function precoNaFaixa(precoCents: number | null, faixa: Faixa): boolean {
  if (precoCents === null) return false;
  if (faixa.minCents !== null && precoCents < faixa.minCents) return false;
  if (faixa.maxCents !== null && precoCents > faixa.maxCents) return false;
  return true;
}

/** O rótulo da faixa para mostrar no filtro ativo: o do seletor ou um montado. */
export function rotuloDaFaixa(finalidade: FinalidadeDoSite, valor: string): string | null {
  const sugerida = FAIXAS_DE_PRECO[finalidade].find((opcao) => opcao.valor === valor);
  if (sugerida) return sugerida.rotulo;

  const faixa = interpretarFaixa(valor);
  if (!faixa) return null;
  const real = (cents: number) => `R$ ${(cents / 100).toLocaleString('pt-BR')}`;
  if (faixa.minCents !== null && faixa.maxCents !== null) return `${real(faixa.minCents)} a ${real(faixa.maxCents)}`;
  if (faixa.minCents !== null) return `Acima de ${real(faixa.minCents)}`;
  return `Até ${real(faixa.maxCents!)}`;
}
