import type { UnitStatus } from '@contracts';
import type { Unidade } from '@/hooks/useUnidades';
import { formatarPreco, formatarVariacao, lerCelula, variacao, VARIACAO_SUSPEITA } from '@/lib/unidades';

export interface Legenda {
  texto: string;
  ok: boolean;
  mudou: boolean;
  status: UnitStatus | null;
  /** Preço que caiu ou subiu mais de 10%: o mesmo destaque da conferência, já na célula. */
  alerta: boolean;
}

export type Vista = Pick<Unidade, 'price_cents'> & { status: string };

/**
 * A legenda embaixo do valor, para a Juliana ver como o CRM leu o que ela
 * digitou. `u` é a unidade como a grade a mostrava quando ela digitou.
 */
export function legendaDaCelula(u: Vista, t: string): Legenda {
  const leitura = lerCelula(t, u.price_cents);
  if (!leitura.ok) return { texto: 'Corrigir', ok: false, mudou: true, status: null, alerta: false };
  const mudou = leitura.status !== u.status || leitura.price_cents !== u.price_cents;
  if (leitura.status === 'vendido') return { texto: 'Vendida', ok: true, mudou, status: 'vendido', alerta: false };
  const v = u.status !== 'vendido' ? variacao(u.price_cents, leitura.price_cents) : null;
  const alerta = v !== null && (v < 0 || v > VARIACAO_SUSPEITA);
  if (leitura.status === 'reservado') {
    return {
      texto: leitura.price_cents != null ? `Reservada · ${formatarPreco(leitura.price_cents)}` : 'Reservada, sem preço',
      ok: true,
      mudou,
      status: 'reservado',
      alerta,
    };
  }
  return {
    texto: v ? `${formatarVariacao(v)} no preço` : u.status !== 'disponivel' ? 'Volta à venda' : 'Disponível',
    ok: true,
    mudou,
    status: 'disponivel',
    alerta,
  };
}
