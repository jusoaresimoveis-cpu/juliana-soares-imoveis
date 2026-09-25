import {
  ENCAIXE_FINANCEIRO_LABEL,
  FINALIDADE_LABEL,
  LEAD_SOURCE_LABEL,
  LOSS_REASON_LABEL,
  PRAZO_DE_COMPRA_LABEL,
  TEMPERATURA_LABEL,
  regiaoDoTelefone,
  type LeadSource,
  type LossReason,
} from '@contracts';
import { planilhaXlsx, type ColunaXlsx } from '@/xlsx';

/**
 * Um lead como `leads_exportar` o devolve.
 *
 * O banco entrega o dado cru e a hora já no fuso da organização; os rótulos
 * ("Meta Ads", "Parou de responder") são aplicados aqui, a partir do mesmo
 * dicionário que a tela usa — uma planilha que dissesse "sem_resposta" onde a
 * ficha diz "Parou de responder" pareceria outro sistema.
 */
export interface LinhaExportada {
  nome: string;
  telefone_e164: string | null;
  telefone_bruto: string | null;
  pais: string | null;
  cidade: string | null;
  corretor: string | null;
  /** `YYYY-MM-DDTHH:MM:SS`, relógio de Brasília (fuso da organização). */
  entrada: string;
  etapa: string | null;
  origem: string;
  entrada_por: string | null;
  campanha: string | null;
  email: string | null;
  ultimo_contato: string | null;
  motivo_perda: string | null;
  motivo_perda_texto: string | null;
  /** O selo que vale: a marcação do corretor ou, sem ela, a regra. */
  temperatura: string | null;
  finalidade: string | null;
  prazo_compra: string | null;
  encaixe_financeiro: string | null;
}

/**
 * As colunas, na ordem combinada com o dono.
 *
 * As quatro primeiras são as que "não podem faltar de forma alguma" — o teste
 * guarda a ordem delas. Quem abre a planilha lê da esquerda, e é ali que tem de
 * estar o que se usa para ligar para a pessoa.
 */
export const COLUNAS_DA_EXPORTACAO = [
  { titulo: 'Nome', largura: 30 },
  { titulo: 'Telefone', largura: 20 },
  { titulo: 'Cidade', largura: 20 },
  { titulo: 'Corretor responsável', largura: 24 },
  { titulo: 'Região (pelo DDD) / País', largura: 34 },
  { titulo: 'Data de entrada', largura: 17, tipo: 'data' },
  { titulo: 'Etapa', largura: 18 },
  { titulo: 'Origem', largura: 26 },
  { titulo: 'Campanha', largura: 34 },
  { titulo: 'E-mail', largura: 28 },
  { titulo: 'Último contato', largura: 17, tipo: 'data' },
  { titulo: 'Motivo da perda', largura: 32 },
  // A qualificação entra no FIM: a ordem das primeiras foi combinada com o
  // dono e é guardada por teste.
  { titulo: 'Temperatura', largura: 14 },
  { titulo: 'O que procura', largura: 20 },
  { titulo: 'Quando pretende comprar', largura: 24 },
  { titulo: 'Entrada e parcelas', largura: 34 },
] as const satisfies readonly ColunaXlsx[];

/** Por onde o lead entrou, dito como gente diz. */
const PORTA: Record<string, string> = {
  whatsapp_inbound: 'WhatsApp',
  landing_form: 'formulário da página',
  formulario_meta: 'formulário da Meta',
  importacao_lote: 'importação',
};

/**
 * "+55 49 99154-5454". Número de fora fica como chegou: formatar telefone
 * estrangeiro direito exige a regra de cada país, e errar o agrupamento é pior
 * do que não agrupar.
 */
export function telefoneLegivel(e164: string | null, bruto: string | null): string | null {
  if (e164?.startsWith('+55')) {
    const d = e164.slice(3);
    if (d.length === 11) return `+55 ${d.slice(0, 2)} ${d.slice(2, 7)}-${d.slice(7)}`;
    if (d.length === 10) return `+55 ${d.slice(0, 2)} ${d.slice(2, 6)}-${d.slice(6)}`;
  }
  return e164 ?? (bruto?.trim() || null);
}

export function origemLegivel(source: string, entradaPor: string | null): string {
  const canal = LEAD_SOURCE_LABEL[source as LeadSource] ?? source;
  const porta = entradaPor ? PORTA[entradaPor] : undefined;
  return porta ? `${canal} · ${porta}` : canal;
}

export function motivoLegivel(motivo: string | null, texto: string | null): string | null {
  if (!motivo) return null;
  const rotulo = LOSS_REASON_LABEL[motivo as LossReason] ?? motivo;
  return texto?.trim() ? `${rotulo} — ${texto.trim()}` : rotulo;
}

/**
 * O rótulo da tela para um código do banco — ou o próprio código, se o
 * dicionário ainda não o conhece. Código cru na planilha é feio; célula vazia
 * onde havia resposta é pior, porque ninguém percebe.
 */
export function rotuloDe(dicionario: Record<string, string>, codigo: string | null): string | null {
  if (!codigo) return null;
  return dicionario[codigo] ?? codigo;
}

export function linhasDaPlanilha(linhas: readonly LinhaExportada[]): (string | null)[][] {
  return linhas.map((l) => [
    l.nome,
    telefoneLegivel(l.telefone_e164, l.telefone_bruto),
    l.cidade?.trim() || null,
    l.corretor ?? 'Sem responsável',
    regiaoDoTelefone(l.telefone_e164, l.pais),
    l.entrada,
    l.etapa,
    origemLegivel(l.origem, l.entrada_por),
    l.campanha,
    l.email,
    l.ultimo_contato,
    motivoLegivel(l.motivo_perda, l.motivo_perda_texto),
    rotuloDe(TEMPERATURA_LABEL, l.temperatura),
    rotuloDe(FINALIDADE_LABEL, l.finalidade),
    rotuloDe(PRAZO_DE_COMPRA_LABEL, l.prazo_compra),
    rotuloDe(ENCAIXE_FINANCEIRO_LABEL, l.encaixe_financeiro),
  ]);
}

export function planilhaDeLeads(linhas: readonly LinhaExportada[]): Uint8Array {
  return planilhaXlsx(COLUNAS_DA_EXPORTACAO, linhasDaPlanilha(linhas), 'Leads');
}

export function nomeDoArquivo(de: string, ate: string): string {
  return de === ate ? `leads-${de}.xlsx` : `leads-${de}-a-${ate}.xlsx`;
}
