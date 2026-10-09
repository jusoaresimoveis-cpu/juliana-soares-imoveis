/**
 * Integração com a Meta (Facebook/Instagram Ads).
 *
 * Duas coisas entram por aqui: o LEAD do formulário de anúncio, que chega por
 * webhook, e o GASTO por anúncio por dia, que a gente vai buscar. As duas se
 * encontram na tela de atribuição, e é esse encontro que produz custo por lead.
 *
 * O sistema de referência tem 3.145 linhas disso, e uma auditoria adversarial
 * confirmou defeitos em todas as seis dimensões examinadas. Os valores abaixo
 * existem porque cada um fecha um deles — o comentário diz qual.
 */

/**
 * Versão da Graph API, em UM lugar.
 *
 * O sistema auditado espalhou `v18.0`, `v19.0` e `v21.0` por arquivos
 * diferentes. A v18 já estava fora de suporte, e a chamada que a usava falhava
 * em silêncio — o lead simplesmente não chegava, sem erro em lugar nenhum.
 */
export const GRAPH_VERSION = 'v21.0';
export const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

/**
 * Saúde da integração.
 *
 * Não é enfeite de tela: é o que decide se o cron continua tentando. Sem isso,
 * token revogado vira uma chamada falhando de hora em hora para sempre, e a
 * única pessoa que descobre é quem pergunta por que parou de entrar lead.
 */
export const META_HEALTH = [
  'ok',
  'precisa_reconectar', // token revogado ou expirado (erro 190)
  'sem_permissao', // o token vale, mas falta acesso ao objeto (erro 200/10)
  'throttled', // limite da Graph API (erro 4/17/32/613)
  'erro',
] as const;
export type MetaHealth = (typeof META_HEALTH)[number];

/** Cada estado pede uma frase e uma ação diferentes de quem está olhando. */
export const META_HEALTH_META: Record<
  MetaHealth,
  { rotulo: string; instrucao: string; grave: boolean }
> = {
  ok: { rotulo: 'Conectado', instrucao: 'Sincronizando normalmente.', grave: false },
  precisa_reconectar: {
    rotulo: 'Precisa reconectar',
    instrucao: 'O acesso da Meta expirou ou foi revogado. Reconecte para voltar a receber leads e gasto.',
    grave: true,
  },
  sem_permissao: {
    rotulo: 'Falta permissão',
    instrucao:
      'O token vale, mas a Meta negou acesso a um objeto. Confira se a Página está atribuída ao usuário do sistema com controle total — reconectar não resolve isto.',
    grave: true,
  },
  throttled: {
    rotulo: 'Aguardando a Meta',
    instrucao: 'Limite de consultas atingido. A sincronização recomeça sozinha em alguns minutos.',
    grave: false,
  },
  erro: {
    rotulo: 'Com erro',
    instrucao: 'A última sincronização falhou. O detalhe está no histórico abaixo.',
    grave: true,
  },
};

/** Estado de um evento recebido do webhook. */
export const META_INBOX_STATUSES = [
  'pendente',
  'processando',
  'processado',
  'erro',
  'descartado', // fora da janela de tempo, teste, ou orgânico
] as const;
export type MetaInboxStatus = (typeof META_INBOX_STATUSES)[number];

/** O que uma execução de sincronização foi buscar. */
export const META_SYNC_KINDS = ['insights', 'leads', 'forms', 'account_info'] as const;
export type MetaSyncKind = (typeof META_SYNC_KINDS)[number];

/**
 * Como ela terminou.
 *
 * `parcial` existe porque o sistema auditado gravava `success` mesmo quando
 * TODAS as chamadas à Graph falhavam. Quem olhava o histórico via uma coluna
 * verde e concluía que o gasto na tela estava completo.
 */
export const META_SYNC_STATUSES = ['running', 'ok', 'parcial', 'erro'] as const;
export type MetaSyncStatus = (typeof META_SYNC_STATUSES)[number];

/** Nível da hierarquia de anúncios. */
export const META_AD_LEVELS = ['campaign', 'adset', 'ad'] as const;
export type MetaAdLevel = (typeof META_AD_LEVELS)[number];

export const META_AD_LEVEL_LABEL: Record<MetaAdLevel, string> = {
  campaign: 'Campanha',
  adset: 'Conjunto',
  ad: 'Anúncio',
};

/* -------------------------------------------------------------------------- */
/* Está entregando agora?                                                     */
/* -------------------------------------------------------------------------- */

/**
 * O que a Meta chama de `effective_status`, traduzido para cinco situações.
 *
 * EFETIVO, e não o botão do próprio objeto. A diferença é a razão de este campo
 * existir: um anúncio com `status` ACTIVE dentro de uma campanha pausada tem
 * `effective_status` = CAMPAIGN_PAUSED. Filtrar pelo `status` diria que ele está
 * no ar — e ele não gasta um centavo desde que alguém pausou a campanha acima.
 *
 * A Meta devolve mais de uma dúzia de valores crus, e a maioria diz a mesma
 * coisa para quem decide verba. Aqui eles viram as cinco perguntas que a tela
 * responde: está rodando, alguém parou, foi arquivado, está em análise, ou
 * quebrou.
 */
export const META_ENTREGAS = [
  'ativo',
  'pausado',
  'arquivado',
  'em_analise',
  'com_problema',
  'desconhecido',
] as const;
export type MetaEntrega = (typeof META_ENTREGAS)[number];

const POR_STATUS: Record<string, MetaEntrega> = {
  ACTIVE: 'ativo',

  // Pausado em qualquer degrau da hierarquia. Os três significam a mesma coisa
  // para quem olha o gasto: não está entregando.
  PAUSED: 'pausado',
  CAMPAIGN_PAUSED: 'pausado',
  ADSET_PAUSED: 'pausado',

  ARCHIVED: 'arquivado',
  DELETED: 'arquivado',

  IN_PROCESS: 'em_analise',
  PENDING_REVIEW: 'em_analise',
  PREAPPROVED: 'em_analise',
  PENDING_BILLING_INFO: 'em_analise',

  // Estes DOIS não são "pausado". Ninguém escolheu parar — a Meta parou, e há o
  // que fazer a respeito. Somá-los aos pausados esconderia justamente a linha
  // que precisa de alguém hoje.
  DISAPPROVED: 'com_problema',
  WITH_ISSUES: 'com_problema',
  ADSET_WITH_ISSUES: 'com_problema',
  CAMPAIGN_WITH_ISSUES: 'com_problema',
};

export function entregaDoStatus(status: string | null | undefined): MetaEntrega {
  if (!status) return 'desconhecido';
  return POR_STATUS[status.trim().toUpperCase()] ?? 'desconhecido';
}

/**
 * Está no ar, agora, no gerenciador.
 *
 * Só `ativo`. "Em análise" ainda não entrega e "com problema" parou de
 * entregar — chamar qualquer um dos dois de ativo faria a tela afirmar que a
 * verba está rodando quando não está.
 */
export function estaEntregando(status: string | null | undefined): boolean {
  return entregaDoStatus(status) === 'ativo';
}

export const META_ENTREGA_META: Record<MetaEntrega, { rotulo: string; atencao: boolean }> = {
  ativo: { rotulo: 'No ar', atencao: false },
  pausado: { rotulo: 'Pausado', atencao: false },
  arquivado: { rotulo: 'Arquivado', atencao: false },
  em_analise: { rotulo: 'Em análise', atencao: true },
  // O único que a tela precisa gritar: gastou, parou de entregar, e ninguém
  // mandou parar.
  com_problema: { rotulo: 'Com problema', atencao: true },
  /*
   * Nunca sincronizado — e é DIFERENTE de pausado.
   *
   * Enquanto a importação de estado não roda, todo objeto cai aqui. Tratar
   * ausência como "pausado" esvaziaria a tela inteira no primeiro filtro, e o
   * corretor concluiria que não há nada rodando.
   */
  desconhecido: { rotulo: 'Sem estado', atencao: false },
};

/* -------------------------------------------------------------------------- */
/* O que cada campanha produz                                                 */
/* -------------------------------------------------------------------------- */

/**
 * O resultado não é o mesmo em toda campanha.
 *
 * Uma de formulário produz CADASTRO; uma de mensagem produz CONVERSA. Mostrar
 * "leads" nas duas faz a de mensagem parecer um fracasso permanente — 21 dos 31
 * anúncios desta conta são de mensagem, e todos apareceriam com zero para
 * sempre, marcados em vermelho como desperdício.
 *
 * E a soma dos dois não existe: "8 resultados" onde 5 são cadastro e 3 são
 * conversa é um número que não responde a pergunta nenhuma.
 */
export const RESULTADO_TIPOS = ['cadastro', 'conversa', 'clique'] as const;
export type TipoDeResultado = (typeof RESULTADO_TIPOS)[number];

export const RESULTADO_META: Record<
  TipoDeResultado,
  { singular: string; plural: string; custo: string; coluna: string }
> = {
  cadastro: {
    singular: 'cadastro',
    plural: 'cadastros',
    custo: 'Custo por cadastro',
    coluna: 'Cadastros',
  },
  conversa: {
    singular: 'conversa',
    plural: 'conversas',
    custo: 'Custo por conversa',
    coluna: 'Conversas',
  },
  clique: { singular: 'clique', plural: 'cliques', custo: 'Custo por clique', coluna: 'Cliques' },
};

/** Objetivos que geram formulário — os novos (OUTCOME_) e os herdados. */
export const OBJETIVOS_DE_CADASTRO = ['OUTCOME_LEADS', 'LEAD_GENERATION'] as const;
/** E os que geram conversa por mensagem. */
export const OBJETIVOS_DE_CONVERSA = ['MESSAGES', 'OUTCOME_MESSAGES', 'CONVERSATIONS'] as const;

function tipoSemBater(
  esperado: TipoDeResultado | null,
  temCadastro: boolean,
  temConversa: boolean,
): TipoDeResultado {
  // Produziu só uma coisa: é essa, independente do que o objetivo prometia.
  if (temConversa && !temCadastro) return 'conversa';
  if (temCadastro && !temConversa) return 'cadastro';
  // As duas, e o objetivo desempata.
  if (temCadastro && temConversa) return esperado ?? 'cadastro';

  // Não produziu nada. O objetivo diz o que ERA para produzir.
  return esperado ?? 'clique';
}

function decidirTipo(
  esperado: TipoDeResultado | null,
  temCadastro: boolean,
  temConversa: boolean,
): TipoDeResultado {
  // Produziu o que se esperava dela: nada a discutir.
  if (esperado === 'cadastro' && temCadastro) return 'cadastro';
  if (esperado === 'conversa' && temConversa) return 'conversa';

  return tipoSemBater(esperado, temCadastro, temConversa);
}

/**
 * Que resultado esta linha realmente produziu.
 *
 * O objetivo NÃO basta, e a conta de origem é a prova: as 9 campanhas de
 * `OUTCOME_LEADS` dela não geraram um único cadastro de formulário — geraram 37
 * conversas. `OUTCOME_LEADS` cobre quatro destinos diferentes (formulário
 * instantâneo, mensagem, ligação e site), e a Meta não os separa no objetivo.
 * Uma tabela que fosse só de objetivo → tipo marcaria esses nove anúncios como
 * "sem cadastro", em vermelho, para sempre — errando exatamente sobre os
 * anúncios que estavam funcionando.
 *
 * Então: o que foi MEDIDO manda; o objetivo entra como desempate e, quando não
 * houve resultado nenhum, como rótulo — é ele que faz a linha vazia dizer "sem
 * cadastro" em vez de "sem clique".
 */
export function tipoDeResultado(
  objective: string | null | undefined,
  cadastros: number | null | undefined,
  conversas: number | null | undefined,
): TipoDeResultado {
  const obj = (objective ?? '').toUpperCase();
  const esperado: TipoDeResultado | null = (
    OBJETIVOS_DE_CADASTRO as readonly string[]
  ).includes(obj)
    ? 'cadastro'
    : (OBJETIVOS_DE_CONVERSA as readonly string[]).includes(obj)
      ? 'conversa'
      : null;

  const temCadastro = (cadastros ?? 0) > 0;
  const temConversa = (conversas ?? 0) > 0;

  return decidirTipo(esperado, temCadastro, temConversa);
}

/**
 * Quantos resultados, do tipo que aquela linha realmente produz.
 *
 * Devolve `null` quando o número não foi importado ainda — e `null` vira '—' na
 * tela, não zero. "0 cadastros" é uma afirmação sobre a campanha; "—" é a
 * verdade sobre o que sabemos dela.
 */
export function resultadoDaLinha(
  tipo: TipoDeResultado,
  linha: { cadastros?: number | null; conversas?: number | null; clicks?: number | null },
): number | null {
  if (tipo === 'cadastro') return linha.cadastros ?? null;
  if (tipo === 'conversa') return linha.conversas ?? null;
  return linha.clicks ?? null;
}

// Os erros da Graph, o gasto e o telefone, e a volta das conversões, moram em
// arquivos próprios. Ficam reexportados daqui para que `index.ts`, e quem mais
// importava deste módulo, continue vendo os mesmos nomes.
export * from './meta-gasto';
export * from './meta-conversoes';
