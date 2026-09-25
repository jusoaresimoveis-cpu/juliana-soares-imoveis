/**
 * Visitas.
 *
 * O funil nasceu com "Visita agendada" E "Visita realizada" como etapas
 * separadas de propósito: é entre as duas que o negócio vaza, e nenhum dos
 * dois sistemas de referência registrava a diferença. Sem isso, "agendei 34
 * visitas" e "aconteceram 34 visitas" viram a mesma frase — e não são.
 *
 * Por isso `nao_compareceu` é um status próprio, e não um apelido de
 * `cancelada`. Cancelar é aviso prévio; não comparecer é prejuízo: o corretor
 * bloqueou a agenda, foi até o imóvel e voltou. São números que o gestor
 * precisa separar para cobrar quem marca visita sem qualificar o lead.
 */

export const VISIT_STATUSES = [
  'agendada',
  'confirmada',
  'realizada',
  'nao_compareceu',
  'cancelada',
] as const;

export type VisitStatus = (typeof VISIT_STATUSES)[number];

export const VISIT_STATUS_LABEL: Record<VisitStatus, string> = {
  agendada: 'Agendada',
  confirmada: 'Confirmada',
  realizada: 'Realizada',
  nao_compareceu: 'Não compareceu',
  cancelada: 'Cancelada',
};

/**
 * Os status que ocupam a agenda do corretor.
 *
 * O banco repete exatamente esta lista no `WHERE` da restrição de exclusão que
 * impede sobreposição. Cancelar ou concluir uma visita libera o horário; as
 * duas de baixo o seguram.
 */
export const VISIT_BLOCKING_STATUSES = ['agendada', 'confirmada'] as const;

export type VisitBlockingStatus = (typeof VISIT_BLOCKING_STATUSES)[number];

/** Status a partir dos quais a visita não muda mais de estado sozinha. */
export const VISIT_CLOSED_STATUSES = ['realizada', 'nao_compareceu', 'cancelada'] as const;

export function isVisitStatus(v: string): v is VisitStatus {
  return (VISIT_STATUSES as readonly string[]).includes(v);
}

export function blocksAgenda(status: string): boolean {
  return (VISIT_BLOCKING_STATUSES as readonly string[]).includes(status);
}

/** Duração padrão de uma visita, em minutos. */
export const DEFAULT_VISIT_MINUTES = 60;

/**
 * Teto de duração aceito pelo banco. Existe para barrar digitação errada
 * (a visita que termina no ano seguinte), não para modelar regra de negócio.
 */
export const MAX_VISIT_HOURS = 12;

/**
 * Dias da semana no formato do Postgres e do JavaScript: 0 = domingo.
 *
 * Os dois concordam nesse ponto (`extract(dow …)` e `Date#getDay`), então a
 * disponibilidade semanal do corretor pode ir e voltar do banco sem conversão.
 */
export const WEEKDAYS = [
  { value: 0, short: 'Dom', label: 'Domingo' },
  { value: 1, short: 'Seg', label: 'Segunda' },
  { value: 2, short: 'Ter', label: 'Terça' },
  { value: 3, short: 'Qua', label: 'Quarta' },
  { value: 4, short: 'Qui', label: 'Quinta' },
  { value: 5, short: 'Sex', label: 'Sexta' },
  { value: 6, short: 'Sáb', label: 'Sábado' },
] as const;

export type Weekday = (typeof WEEKDAYS)[number]['value'];
