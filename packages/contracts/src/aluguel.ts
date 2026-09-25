/**
 * Aluguel anual: o que o CRM de origem não tinha.
 *
 * Um imóvel pode estar à venda, para alugar, ou os dois; cada regime tem o seu
 * valor (`price_cents` é o de venda, `rent_cents` o aluguel mensal). O banco
 * repete a lista de garantias no CHECK `properties_guarantees_ck`.
 */

/** As garantias da Lei do Inquilinato (art. 37) mais as que o mercado usa. */
export const RENTAL_GUARANTEES = [
  'caucao',
  'fiador',
  'seguro_fianca',
  'titulo_capitalizacao',
  'carta_fianca',
] as const;
export type RentalGuarantee = (typeof RENTAL_GUARANTEES)[number];

export const RENTAL_GUARANTEE_LABEL: Record<RentalGuarantee, string> = {
  caucao: 'Caução',
  fiador: 'Fiador',
  seguro_fianca: 'Seguro-fiança',
  titulo_capitalizacao: 'Título de capitalização',
  carta_fianca: 'Carta fiança',
};

export interface Regime {
  for_sale: boolean;
  for_rent: boolean;
}

/** "Venda", "Aluguel" ou "Venda e aluguel": o selo do imóvel no CRM. */
export function rotuloDoRegime({ for_sale, for_rent }: Regime): string {
  if (for_sale && for_rent) return 'Venda e aluguel';
  return for_rent ? 'Aluguel' : 'Venda';
}
