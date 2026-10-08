import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase() || '?';
}

export function greeting(date = new Date()): string {
  const h = date.getHours();
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

export const brl = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 0,
});

/**
 * Dinheiro sai do banco em CENTAVOS (bigint), sempre.
 *
 * `brl.format()` espera reais, então `brl.format(price_cents)` compila e mostra
 * cem vezes o valor — R$ 85.000.000 no lugar de R$ 850.000. O compilador não
 * pega, porque os dois são number. Esta função põe a unidade no nome, que é a
 * única defesa que sobra.
 */
export const brlCents = (centavos: number) => brl.format(centavos / 100);

/**
 * O valor de cada regime em que o imóvel está: "R$ 1.850.000", "R$ 3.500/mês"
 * ou os dois. O "/mês" é o que impede um aluguel de ser lido como preço de
 * venda numa lista que mistura os dois.
 *
 * Empreendimento com unidades: "A partir de R$ 840.569 · 10 disponíveis". O
 * preço é o calculado pelo banco (o menor entre as disponíveis, ou o da menor
 * reservada quando só restam reservadas).
 */
export function valoresDoImovel(p: {
  for_sale: boolean;
  for_rent: boolean;
  price_cents: number | null;
  rent_cents: number | null;
  has_units?: boolean;
  units_available?: number;
}): string[] {
  if (p.has_units) {
    const disponiveis = p.units_available ?? 0;
    if (p.price_cents == null) return ['Nenhuma unidade disponível'];
    return [
      `A partir de ${brlCents(p.price_cents)}`,
      disponiveis === 0 ? 'só reservadas' : disponiveis === 1 ? '1 disponível' : `${disponiveis} disponíveis`,
    ];
  }
  return [
    p.for_sale && p.price_cents != null ? brlCents(p.price_cents) : null,
    p.for_rent && p.rent_cents != null ? `${brlCents(p.rent_cents)}/mês` : null,
  ].filter((v): v is string => v !== null);
}
