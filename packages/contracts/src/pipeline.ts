/**
 * Etapas do funil.
 *
 * Diferente dos dois sistemas de referência, as etapas NÃO são um enum do
 * Postgres. Elas vivem na tabela `pipeline_stages`, com ordem, cor e regras
 * por etapa. Isto aqui é só o SEED inicial e o contrato de tipos — mudar o
 * funil do cliente é uma linha na tabela, não uma migration.
 *
 * O motivo é concreto: no CRM de referência as 7 etapas são um enum, e o botão
 * "Editar Etapas" só renomeia rótulo no localStorage do navegador — não
 * persiste, não sincroniza entre corretores e some ao limpar o cache.
 */

export interface StageSeed {
  key: string;
  label: string;
  position: number;
  color: string;
  /** exige valor de negócio para entrar nesta etapa */
  requiresValue: boolean;
  /** exige motivo registrado para entrar nesta etapa */
  requiresReason: boolean;
  isWon: boolean;
  isLost: boolean;
}

export const DEFAULT_STAGES: readonly StageSeed[] = [
  { key: 'novo', label: 'Novo', position: 1, color: '#7A61FF', requiresValue: false, requiresReason: false, isWon: false, isLost: false },
  { key: 'em_atendimento', label: 'Em atendimento', position: 2, color: '#5B3DF5', requiresValue: false, requiresReason: false, isWon: false, isLost: false },
  { key: 'visita_agendada', label: 'Visita agendada', position: 3, color: '#2F9BE0', requiresValue: false, requiresReason: false, isWon: false, isLost: false },
  { key: 'visita_realizada', label: 'Visita realizada', position: 4, color: '#12B886', requiresValue: false, requiresReason: false, isWon: false, isLost: false },
  { key: 'proposta', label: 'Proposta', position: 5, color: '#C77A16', requiresValue: true, requiresReason: false, isWon: false, isLost: false },
  { key: 'fechado', label: 'Fechado', position: 6, color: '#0FA97D', requiresValue: true, requiresReason: false, isWon: true, isLost: false },
  { key: 'perdido', label: 'Perdido', position: 7, color: '#E0456F', requiresValue: false, requiresReason: true, isWon: false, isLost: true },
];

/**
 * Ordem correta para o mercado imobiliário: a visita vem ANTES da proposta.
 * Os dois sistemas de referência colocam "agendamento de visita" depois de
 * "envio de proposta", o que faz qualquer conversão etapa-a-etapa mentir —
 * quem está em negociação nunca conta como tendo visitado.
 *
 * E "visita realizada" existe como etapa própria porque é a conversão de
 * meio de funil que fecha o ciclo gasto → template → lead → visita → venda.
 * Nenhum dos dois sistemas registra se a visita aconteceu de fato.
 */

/** Motivos de perda. Vai em coluna dedicada, nunca concatenado nas observações. */
export const LOSS_REASONS = [
  'preco_acima',
  'comprou_outro',
  'sem_credito',
  'localizacao',
  'sem_resposta',
  'fora_do_perfil',
  'so_pesquisando',
  'outro',
] as const;
export type LossReason = (typeof LOSS_REASONS)[number];

export const LOSS_REASON_LABEL: Record<LossReason, string> = {
  preco_acima: 'Preço acima do orçamento',
  comprou_outro: 'Comprou outro imóvel',
  sem_credito: 'Crédito não aprovado',
  localizacao: 'Localização não atendeu',
  sem_resposta: 'Parou de responder',
  fora_do_perfil: 'Fora do perfil buscado',
  so_pesquisando: 'Só pesquisando preço',
  outro: 'Outro',
};

/**
 * Canais de origem do lead.
 *
 * `instagram` e `facebook` são os perfis ORGÂNICOS. O que vem de anúncio no
 * Instagram chega como `meta_ads`, porque é de lá que vêm o gasto e a
 * atribuição — sem essa separação, o mesmo lead seria mídia paga ou orgânica
 * conforme quem o cadastrasse, e o custo por lead mudaria de valor sozinho.
 *
 * `placa` não é folclore: no interior ela ainda traz mais lead que portal, e a
 * referência já dividia o gasto de anúncio por ela sem perceber.
 */
export const LEAD_SOURCES = [
  'landing_page',
  'meta_ads',
  'google_ads',
  'link_bio',
  'instagram',
  'facebook',
  'whatsapp',
  'portal',
  'indicacao',
  'placa',
  'manual',
  'outro',
] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

/**
 * Como cada origem se chama para quem lê.
 *
 * Mora aqui, e não na tela, porque existiam TRÊS cópias desta lista — em
 * `usePainel`, no cartão de lead e no painel — e elas já tinham divergido: uma
 * escrevia "Meta", outra "Meta Ads". Rótulo diferente para a mesma coisa faz
 * duas telas parecerem falar de canais diferentes.
 */
export const LEAD_SOURCE_LABEL: Record<LeadSource, string> = {
  landing_page: 'Landing page',
  meta_ads: 'Meta Ads',
  google_ads: 'Google Ads',
  link_bio: 'Link da bio',
  instagram: 'Instagram orgânico',
  facebook: 'Facebook orgânico',
  whatsapp: 'WhatsApp',
  portal: 'Portal',
  indicacao: 'Indicação',
  placa: 'Placa no imóvel',
  manual: 'Cadastro manual',
  outro: 'Outro',
};

/** Curto, para caber em selo dentro de linha de lista. */
export const LEAD_SOURCE_LABEL_CURTO: Record<LeadSource, string> = {
  ...LEAD_SOURCE_LABEL,
  instagram: 'Instagram',
  facebook: 'Facebook',
  manual: 'Manual',
  placa: 'Placa',
};

/**
 * A cor de cada canal no gráfico de aquisição.
 *
 * Matiz fixo por canal, e não uma paleta girando pela ordem: com a ordem, o
 * canal que caiu de segundo para terceiro TROCA DE COR entre um período e
 * outro, e quem olha jura que os dados mudaram. Aqui, Meta é sempre azul.
 *
 * Só o matiz é fixo — a luminosidade fica com a tela, que sabe se o fundo é
 * claro ou escuro.
 */
export const LEAD_SOURCE_HUE: Record<LeadSource, number> = {
  meta_ads: 214,
  facebook: 245,
  instagram: 322,
  link_bio: 288,
  google_ads: 8,
  whatsapp: 145,
  landing_page: 266,
  portal: 28,
  indicacao: 178,
  placa: 48,
  manual: 220,
  outro: 220,
};

/** Os dois neutros da lista acima, que ganham saturação baixa em vez de cor. */
export const LEAD_SOURCES_NEUTRAS: readonly LeadSource[] = ['manual', 'outro'];
