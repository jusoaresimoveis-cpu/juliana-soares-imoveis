import type { Veredito } from './inteligencia';

/* -------------------------------------------------------------------------- */
/* O ângulo do criativo — a 134                                                */
/* -------------------------------------------------------------------------- */

/**
 * Uma linha por ARGUMENTO, e não por anúncio.
 *
 * O motivo é de amostra, e a medição de 23/09 diz tudo: 145 leads divididos por
 * 51 anúncios dão menos de três cada, e o semáforo desta casa precisa de dez
 * para abrir a boca. Cinco ângulos chegam lá; cinquenta e um anúncios, nunca.
 */
export interface AnguloInteligencia {
  angulo: string;
  anuncios: number;
  ativos: number;
  gasto: number;
  leads: number;
  atendidos: number;
  quentes: number;
  visitas: number;
  cpl: number | null;
  cpl_piso: number | null;
  cpl_teto: number | null;
  veredito: Veredito;
  faltam: number;
}

/** Um anúncio, com o ângulo que alguém marcou nele (ou a falta dele). */
export interface AnuncioInteligencia {
  ad_id: string;
  nome: string | null;
  estado: string | null;
  angulo: string | null;
  campanha: string | null;
  gasto: number;
  leads: number;
  atendidos: number;
  quentes: number;
  visitas: number;
  ultimo_dia: string | null;
  dias: number;
}

export interface InteligenciaPorAngulo {
  erro?: string;
  periodo: { de: string; ate: string };
  meta_cpl: number | null;
  teto_cpl: number | null;
  sincronizacao: { ok: boolean };
  angulos: AnguloInteligencia[];
  anuncios: AnuncioInteligencia[];
}

/** A chave que o banco usa para "ainda não marcado". */
export const SEM_ANGULO = 'sem_angulo';

/* -------------------------------------------------------------------------- */
/* A cadeia inteira, por anúncio — a 150                                       */
/* -------------------------------------------------------------------------- */

/** Um degrau do funil, como a organização o tem hoje. Vem do banco. */
export interface DegrauDaCadeia {
  key: string;
  label: string;
  position: number;
}

export interface AnuncioDaCadeia {
  ad_id: string;
  nome: string | null;
  estado: string | null;
  angulo: string | null;
  campanha: string | null;
  gasto: number;
  cliques: number;
  /** O que a META conta de conversa iniciada — não o que o CRM fichou. */
  conversas: number;
  leads: number;
  atendidos: number;
  /** Soma do valor dos negócios de quem chegou à etapa de ganho. */
  valor: number;
  /** Quantos leads desta coorte chegaram a cada degrau, por chave. */
  passos: Record<string, number>;
  cpl: number | null;
  cpl_piso: number | null;
  cpl_teto: number | null;
  ultimo_dia: string | null;
  dias: number;
}

export interface CadeiaPorAnuncio {
  erro?: string;
  periodo: { de: string; ate: string };
  meta_cpl: number | null;
  teto_cpl: number | null;
  sincronizacao: { ok: boolean };
  degraus: DegrauDaCadeia[];
  total: {
    gasto: number;
    cliques: number;
    conversas: number;
    leads: number;
    valor: number;
    anuncios: number;
    passos: Record<string, number>;
  };
  anuncios: AnuncioDaCadeia[];
}

/**
 * A DISTÂNCIA ENTRE A CONVERSA E A FICHA.
 *
 * A Meta conta quantas conversas o anúncio abriu; o CRM conta quantas viraram
 * lead com origem provada. Medido em 24/09, num mês: **288 conversas, 154
 * fichas**. Quase metade das conversas não vira nada — é engano, é "oi" que
 * some, é quem queria emprego.
 *
 * Esse número não existe em nenhuma outra tela, e é o único lugar onde a
 * qualidade do tráfego aparece antes do custo por lead. Um anúncio com
 * conversa barata e ficha cara está comprando conversa errada.
 *
 * Nulo quando a Meta não reportou conversa nenhuma — dividir por zero daria
 * `Infinity`, que na tela vira "∞%" e parece defeito.
 */
export function aproveitamentoDaConversa(a: {
  conversas: number;
  leads: number;
}): number | null {
  if (!a.conversas) return null;
  return a.leads / a.conversas;
}

/**
 * QUANTOS LEADS FALTAM PARA O PRÓXIMO DEGRAU TER LEITURA.
 *
 * Não é enfeite: com 1 visita em 154 leads, qualquer "custo por visita" que a
 * tela mostrasse seria um número inventado com cara de precisão. A tela diz
 * quantos faltam em vez de mostrar a conta.
 */
export const CADEIA_MINIMO_PARA_LER = 10;
