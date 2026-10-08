/**
 * Empreendimento com várias unidades (migration 20261009000000).
 *
 * O empreendimento é um imóvel só (uma página, uma galeria, um código), e as
 * unidades ficam embaixo dele, com planta, preço e situação. O "a partir de" é
 * o menor preço entre as DISPONÍVEIS; o banco calcula (`resumo_das_unidades`)
 * e esta é a mesma regra para o CRM conferir antes de gravar.
 *
 * A tabela da construtora sai todo 1º dia útil do mês, com o CUB/SC. Até a
 * Juliana aplicar a do mês corrente (horário de Brasília), o site mostra
 * "Consulte": preço de tabela vencida é preço errado.
 */

import type { PropertyType } from './property';

/** A mesma lista do CHECK `property_units_status_ck`. */
export const UNIT_STATUSES = ['disponivel', 'reservado', 'vendido'] as const;
export type UnitStatus = (typeof UNIT_STATUSES)[number];

/** No feminino: é "a unidade". */
export const UNIT_STATUS_LABEL: Record<UnitStatus, string> = {
  disponivel: 'Disponível',
  reservado: 'Reservada',
  vendido: 'Vendida',
};

/** A mesma lista do CHECK `properties_obra_ck` (herdado do CRM de origem). */
export const CONSTRUCTION_STATUSES = ['pre_lancamento', 'lancamento', 'em_obra', 'pronto'] as const;
export type ConstructionStatus = (typeof CONSTRUCTION_STATUSES)[number];

export const CONSTRUCTION_STATUS_LABEL: Record<ConstructionStatus, string> = {
  pre_lancamento: 'Pré-lançamento',
  lancamento: 'Na planta',
  em_obra: 'Em obras',
  pronto: 'Pronto',
};

/** O identificador da unidade ("804", "01"): o mesmo padrão do CHECK do banco. */
export const ROTULO_DA_UNIDADE = /^[0-9A-Za-z]{1,8}$/;

export interface UnidadeParaResumo {
  status: string;
  price_cents: number | null;
}

export interface ResumoDoEmpreendimento {
  total: number;
  disponiveis: number;
  reservadas: number;
  /** O "a partir de": o menor preço entre as disponíveis. */
  menorCents: number | null;
  maiorCents: number | null;
  menorReservadaCents: number | null;
}

/** A regra de `resumo_das_unidades`, para o CRM mostrar o novo "a partir de" antes de gravar. */
export function resumoDoEmpreendimento(unidades: readonly UnidadeParaResumo[]): ResumoDoEmpreendimento {
  const precos = (status: UnitStatus) =>
    unidades.filter((u) => u.status === status && typeof u.price_cents === 'number').map((u) => u.price_cents as number);
  const disponiveis = precos('disponivel');
  const reservadas = precos('reservado');
  return {
    total: unidades.length,
    disponiveis: unidades.filter((u) => u.status === 'disponivel').length,
    reservadas: unidades.filter((u) => u.status === 'reservado').length,
    menorCents: disponiveis.length ? Math.min(...disponiveis) : null,
    maiorCents: disponiveis.length ? Math.max(...disponiveis) : null,
    menorReservadaCents: reservadas.length ? Math.min(...reservadas) : null,
  };
}

/** O preço que o imóvel mostra: o menor disponível, ou o menor reservado se só restarem reservadas. */
export function aPartirDe(resumo: ResumoDoEmpreendimento): number | null {
  return resumo.total === 0 ? null : (resumo.menorCents ?? resumo.menorReservadaCents);
}

/** "Apto 804", "Sala 03": o número puro nunca aparece sozinho (o código público 1004 e o apto 1004 colidem). */
export function rotuloDaUnidade(tipo: PropertyType, rotulo: string): string {
  switch (tipo) {
    case 'sala_comercial':
      return `Sala ${rotulo}`;
    case 'loja':
      return `Loja ${rotulo}`;
    case 'casa':
    case 'casa_condominio':
      return `Casa ${rotulo}`;
    case 'terreno':
      return `Lote ${rotulo}`;
    default:
      return `Apto ${rotulo}`;
  }
}

export interface UnidadeGerada {
  label: string;
  floor: number;
  final: string;
}

/**
 * As unidades de um prédio, andar por final: andares 5 a 19 e finais 01 a 06
 * dão 501, 502, … 1906, como a tabela da construtora escreve.
 */
export function gerarUnidades(primeiroAndar: number, ultimoAndar: number, finais: readonly string[]): UnidadeGerada[] {
  const saida: UnidadeGerada[] = [];
  const [de, ate] = primeiroAndar <= ultimoAndar ? [primeiroAndar, ultimoAndar] : [ultimoAndar, primeiroAndar];
  for (let andar = de; andar <= ate; andar++) {
    for (const final of finais) saida.push({ label: `${andar}${final}`, floor: andar, final });
  }
  return saida;
}

/** O mês corrente no horário de Brasília, como o banco guarda: "2026-10-01". */
export function mesCorrente(agora: Date = new Date()): string {
  const partes = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' })
    .formatToParts(agora)
    .reduce<Record<string, string>>((acc, p) => ({ ...acc, [p.type]: p.value }), {});
  return `${partes.year}-${partes.month}-01`;
}

/** A tabela aplicada vale no mês dela; no dia 1 do mês seguinte, os preços viram "Consulte". */
export function tabelaVigente(mesAplicado: string | null | undefined, agora: Date = new Date()): boolean {
  return !!mesAplicado && mesAplicado.slice(0, 10) >= mesCorrente(agora);
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** "2026-10-01" → "outubro de 2026"; curto: "out/26". */
export function nomeDoMesDaTabela(mes: string, curto = false): string {
  const [ano, numero] = mes.split('-');
  const nome = MESES[Number(numero) - 1] ?? '';
  return curto ? `${nome.slice(0, 3)}/${(ano ?? '').slice(2)}` : `${nome} de ${ano}`;
}

/**
 * O preço como a tabela da construtora escreve, em centavos: "840.569,40",
 * "R$ 840.569,40", "840569,4", "840.569" (ponto de milhar). Vazio ou
 * ilegível é nulo.
 */
export function lerReais(texto: string): number | null {
  const limpo = texto.replace(/R\$/gi, '').replace(/\s/g, '');
  if (!limpo) return null;
  // Com vírgula, ela é o decimal e o ponto é milhar. Sem vírgula, ponto seguido
  // de 1 ou 2 dígitos no fim é decimal ("840569.40"); de 3, é milhar ("840.569").
  const normal = limpo.includes(',')
    ? limpo.replace(/\./g, '').replace(',', '.')
    : /\.\d{1,2}$/.test(limpo)
      ? limpo.replace(/\.(?=.*\.)/g, '')
      : limpo.replace(/\./g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(normal)) return null;
  const cents = Math.round(Number(normal) * 100);
  return cents > 0 ? cents : null;
}

/** Centavos com os centavos: "R$ 840.569,40", como na tabela da construtora. */
export function reaisComCentavos(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });
}
