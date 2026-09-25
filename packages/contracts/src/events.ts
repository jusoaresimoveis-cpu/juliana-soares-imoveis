/**
 * Catálogo FECHADO de eventos de comportamento da landing page.
 *
 * Este arquivo é a fonte única da verdade. O coletor da página, a função
 * de ingestão, a tabela `lp_events` e todo painel leem daqui.
 *
 * Por que isso existe: numa revisão anterior, cinco desenhos feitos em
 * paralelo produziram `scroll_75`, `scroll_depth`, `lp_scroll_depth` e
 * `lang_switch`/`locale_switch` para as mesmas duas coisas. O resultado
 * seria uma consulta de funil retornando zero para sempre, sem ninguém
 * perceber. Renomear qualquer valor daqui quebra o CI de propósito.
 */

export const EVENT_TYPES = [
  'page_view', // primeira renderização útil
  'scroll_depth', // props.pct ∈ {25,50,75,90}
  'section_view', // props.section = id do bloco
  'dwell', // props.seconds — tempo ATIVO, pausa fora de foco
  'gallery_open',
  'gallery_advance', // props.index
  'video_play',
  'cta_click', // props.cta_id + props.position
  'whatsapp_click',
  'phone_click',
  'form_start',
  'form_submit',
  'locale_switch', // props.from + props.to — mede erro da detecção
  'exit_intent',
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

/** Marcos de rolagem. Nada além disso é gravado. */
export const SCROLL_MARKS = [25, 50, 75, 90] as const;
export type ScrollMark = (typeof SCROLL_MARKS)[number];

/**
 * Métrica primária de decisão do teste A/B/C.
 *
 * NÃO é lead e NÃO é venda. Motivo, com a conta feita:
 *  - clique no WhatsApp ou envio de formulário tem base ~8-10% por sessão
 *    → detectar diferença de 25% exige ~3.900 sessões por braço
 *  - lead tem base 2-4% → exige o triplo
 *  - venda leva de 60 a 180 dias e não dá amostra em tempo nenhum
 *
 * Venda continua sendo medida e atribuída. Ela só não decide template.
 */
export const PRIMARY_CONVERSION: readonly EventType[] = ['whatsapp_click', 'form_submit'];

/** Sinais de engajamento — leitura antecipada, nunca critério de decisão. */
export const ENGAGEMENT_SIGNALS: readonly EventType[] = ['scroll_depth', 'gallery_open', 'dwell'];

export function isEventType(value: unknown): value is EventType {
  return typeof value === 'string' && (EVENT_TYPES as readonly string[]).includes(value);
}

/** Payload que o coletor envia. Mantido pequeno de propósito. */
export interface LpEvent {
  type: EventType;
  /** milissegundos desde o page_view — o servidor carimba o absoluto */
  t: number;
  props?: Record<string, string | number | boolean>;
}

export interface LpEventBatch {
  session_id: string;
  landing_page_id: string;
  variant: string;
  locale: string;
  events: LpEvent[];
}
