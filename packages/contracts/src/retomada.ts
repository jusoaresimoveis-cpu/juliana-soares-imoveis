import type { Temperatura } from './qualificacao';

/**
 * A fila de retomada: depois de quanto silêncio um lead merece outra mensagem,
 * até quando, e a frase que diz por quê. `qualificacao.ts` reexporta tudo daqui.
 */

/* -------------------------------------------------------------------------- */
/* A retomada — a 140                                                          */
/* -------------------------------------------------------------------------- */

/**
 * DEPOIS DE QUANTO TEMPO DE SILÊNCIO VALE CUTUCAR.
 *
 * Vinte e quatro horas, e o número saiu de 645 retornos medidos em 24/09:
 *
 *   menos de 1 hora .... 88,8%
 *   no mesmo dia ....... 97,8% acumulado
 *   depois disso ....... 2,2%
 *
 * Quem ia voltar sozinho já voltou no primeiro dia. Uma conversa parada há três
 * dias não está "amadurecendo" — ela acabou, e só recomeça se alguém recomeçar.
 *
 * Esperar mais não é prudência, é desistência com outro nome.
 */
export const RETOMADA_APOS_HORAS = 24;

/**
 * E DEPOIS DE QUANTOS TOQUES PARAR DE OFERECER.
 *
 * Três. A casa mandou segunda mensagem sem resposta 1.771 vezes e 385
 * trouxeram o cliente de volta — 21,7%, uma em cada cinco. O que a medição NÃO
 * diz é quantas dessas vieram na quinta tentativa, e é por isso que o limite
 * existe: insistir com quem não responde é o caminho mais curto para o número
 * ser denunciado, e um número denunciado leva junto os leads de todo mundo.
 *
 * Três é o que a fila oferece. Ninguém impede o corretor de escrever de novo
 * na ficha — o limite é da SUGESTÃO, não da pessoa.
 */
export const RETOMADA_TOQUES_MAXIMO = 3;

/** A ordem da fila: quente primeiro, depois quem esfriou há menos tempo. */
export const PESO_DA_TEMPERATURA: Record<Temperatura, number> = {
  quente: 0,
  morno: 1,
  frio: 2,
};

/**
 * Este lead merece uma retomada?
 *
 * Especificação executável da fila — a tela e o teste leem daqui, e no dia em
 * que o número mudar, muda num lugar só.
 */
export function podeRetomar(lead: {
  silencio_desde: string | null;
  toques_sem_resposta: number;
}): boolean {
  if (!lead.silencio_desde) return false;
  if (lead.toques_sem_resposta >= RETOMADA_TOQUES_MAXIMO) return false;
  const horas = (Date.now() - new Date(lead.silencio_desde).getTime()) / 3_600_000;
  return horas >= RETOMADA_APOS_HORAS;
}

/**
 * Por que este lead está na fila — a frase que a tela mostra.
 *
 * Diz o FATO ("sem resposta há 9 dias"), e não uma recomendação ("ligue
 * agora!"). Quem decide se vale a pena é quem conhece a conversa.
 */
export function motivoDaRetomada(dias: number, toques: number): string {
  const tempo =
    dias < 2 ? 'Sem resposta desde ontem' : `Sem resposta há ${Math.floor(dias)} dias`;
  if (toques <= 1) return tempo;
  return `${tempo} · ${toques} mensagens nossas sem retorno`;
}
