import type { JanelaDoPainel } from '@/types/painel';

// `hooks/usePainel.ts` reexporta, para quem já importava os formatos de lá.

/* -------------------------------------------------------------------------- */
/* Como cada número vira texto                                                */
/* -------------------------------------------------------------------------- */

export function dinheiro(menor: number | null | undefined): string {
  if (menor == null) return '—';
  return (menor / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/**
 * Minutos viram "126h 40m", não "7600 minutos".
 *
 * Tempo de atendimento é lido de relance para saber se está bom ou ruim; em
 * minutos, ninguém converte de cabeça.
 */
export function duracao(minutos: number | null | undefined): string {
  if (minutos == null) return '—';
  if (minutos < 60) return `${Math.round(minutos)}min`;
  const h = Math.floor(minutos / 60);
  const m = Math.round(minutos % 60);
  if (h < 48) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

/**
 * O investimento, só quando ele significa alguma coisa.
 *
 * Com mais de uma moeda no período, a soma junta real com dólar e produz um
 * número com toda a cara de estar certo. Devolver nulo faz a tela escrever '—',
 * que é a verdade: não dá para somar isso.
 */
export function investimento(j: JanelaDoPainel): number | null {
  return j.moedas > 1 ? null : j.investido_menor;
}

/**
 * Custo por lead — dividido só pelos leads que a META trouxe.
 *
 * O painel de referência dividia o gasto de anúncio pelo total de leads,
 * indicação e placa na rua incluídas. O custo saía barato e a decisão de verba
 * era tomada em cima disso.
 */
export function custoPorLeadMeta(j: JanelaDoPainel): number | null {
  /*
   * Sem gasto registrado o custo é NULO, não zero.
   *
   * "R$ 0,00" num card de custo por lead lê como "os leads saíram de graça",
   * que é uma afirmação. A verdade é outra: ou a integração não trouxe o gasto
   * ainda, ou não houve investimento no período. Nos dois casos, não se sabe —
   * e '—' é como se escreve não saber.
   */
  // Moedas misturadas invalidam o custo pelo mesmo motivo que invalidam a soma.
  if (j.moedas > 1 || j.investido_menor <= 0 || j.leads_meta <= 0) return null;
  return Math.round(j.investido_menor / j.leads_meta);
}

export interface Variacao {
  pct: number | null;
  /** `true` quando subir é bom. Custo e tempo sobem para o lado errado. */
  subirEBom: boolean;
}

/**
 * A variação entre os dois períodos.
 *
 * Devolve `null` quando o período anterior é zero: "de 0 para 8" não é +800%,
 * não é +100%, é simplesmente uma comparação que não existe. O painel auditado
 * mostrava `+∞%` e `NaN%` nesse caso.
 */
export function variacao(agora: number, antes: number): number | null {
  if (antes === 0) return null;
  return Math.round(((agora - antes) / antes) * 100);
}

/** "11/07 – 09/08/26", que é como se lê um período de relance. */
export function formatarJanela({ de, ate }: { de: string; ate: string }): string {
  const f = (s: string, comAno: boolean) => {
    const [a, m, d] = s.split('-');
    return comAno ? `${d}/${m}/${a?.slice(2)}` : `${d}/${m}`;
  };
  return `${f(de, false)} – ${f(ate, true)}`;
}

/** "agora", "12 min", "3 h", "2 d" — como se lê uma lista de recentes. */
export function desde(iso: string): string {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h`;
  return `${Math.floor(h / 24)} d`;
}
