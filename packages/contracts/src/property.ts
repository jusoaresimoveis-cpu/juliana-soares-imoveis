/**
 * Domínio de imóvel.
 *
 * Tipo e situação são TEXT + CHECK no banco, não enum do Postgres. Enum exige
 * migration para cada valor novo e não pode ser removido; CHECK troca com um
 * ALTER. A lição vem das etapas do funil, que nos dois sistemas de referência
 * são enum e por isso nunca puderam ser configuradas.
 */

export const PROPERTY_TYPES = [
  'apartamento',
  'casa',
  'casa_condominio',
  'cobertura',
  'studio',
  'kitnet',
  'terreno',
  'chacara',
  'sitio',
  'fazenda',
  'sala_comercial',
  'loja',
  'galpao',
  'predio',
  'outro',
] as const;
export type PropertyType = (typeof PROPERTY_TYPES)[number];

export const PROPERTY_TYPE_LABEL: Record<PropertyType, string> = {
  apartamento: 'Apartamento',
  casa: 'Casa',
  casa_condominio: 'Casa em condomínio',
  cobertura: 'Cobertura',
  studio: 'Studio',
  kitnet: 'Kitnet',
  terreno: 'Terreno',
  chacara: 'Chácara',
  sitio: 'Sítio',
  fazenda: 'Fazenda',
  sala_comercial: 'Sala comercial',
  loja: 'Loja',
  galpao: 'Galpão',
  predio: 'Prédio',
  outro: 'Outro',
};

/** O que se faz com o imóvel. Um imóvel pode estar em mais de um regime. */
export const PROPERTY_PURPOSES = ['venda', 'aluguel', 'temporada'] as const;
export type PropertyPurpose = (typeof PROPERTY_PURPOSES)[number];

export const PROPERTY_STATUSES = [
  'disponivel',
  'reservado',
  'vendido',
  'alugado',
  'suspenso',
] as const;
export type PropertyStatus = (typeof PROPERTY_STATUSES)[number];

export const PROPERTY_STATUS_LABEL: Record<PropertyStatus, string> = {
  disponivel: 'Disponível',
  reservado: 'Reservado',
  vendido: 'Vendido',
  alugado: 'Alugado',
  suspenso: 'Suspenso',
};

/**
 * Mídia em tabela própria, com posição, capa e texto alternativo.
 *
 * O sistema atual guarda fotos, vídeos e documentos como três arrays de texto
 * dentro da linha do imóvel. Sem ordem persistida, sem legenda, sem alt, e a
 * "capa" é a convenção de ser o índice zero. Numa landing page com três
 * templates diferentes isso não se sustenta: cada template escolhe imagens
 * diferentes, e alt text é requisito de acessibilidade e de SEO.
 */
export const MEDIA_KINDS = ['image', 'video', 'document', 'tour'] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

/** Comodidades mais buscadas. Lista aberta — o banco aceita qualquer texto. */
export const COMMON_AMENITIES = [
  'piscina',
  'churrasqueira',
  'academia',
  'salao_festas',
  'playground',
  'quadra',
  'portaria_24h',
  'elevador',
  'varanda_gourmet',
  'mobiliado',
  'aceita_pet',
  'vista_mar',
] as const;

export const PROPERTY_PURPOSE_LABEL: Record<PropertyPurpose, string> = {
  venda: 'Venda',
  aluguel: 'Aluguel',
  temporada: 'Temporada',
};

/* -------------------------------------------------------------------------- */
/* Plano de pagamento                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Formas de pagamento aceitas.
 *
 * LISTA, e não valor único: o mesmo imóvel aceita à vista e financiado, e
 * obrigar a escolher uma faria o corretor marcar a mais comum e responder as
 * outras por WhatsApp — que é justamente o que estes campos existem para
 * evitar.
 */
export const PAYMENT_METHODS = [
  'a_vista',
  'financiamento',
  'direto',
  'permuta',
  'fgts',
  'consorcio',
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  a_vista: 'À vista',
  financiamento: 'Financiamento bancário',
  direto: 'Direto com a construtora',
  permuta: 'Aceita permuta',
  fgts: 'Aceita FGTS',
  consorcio: 'Aceita consórcio',
};

export const REINFORCEMENT_PERIODS = ['semestral', 'anual'] as const;
export type ReinforcementPeriod = (typeof REINFORCEMENT_PERIODS)[number];

export const REINFORCEMENT_PERIOD_LABEL: Record<ReinforcementPeriod, string> = {
  semestral: 'Semestral',
  anual: 'Anual',
};

export interface PlanoDePagamento {
  precoCents?: number | null;
  entradaCents?: number | null;
  parcelas?: number | null;
  parcelaCents?: number | null;
  reforcos?: number | null;
  reforcoCents?: number | null;
  chavesCents?: number | null;
}

export interface ResumoDoPlano {
  /** Soma do que o plano descreve. */
  somaCents: number;
  /**
   * O que sobra para financiar. Positivo é normal — o banco entra com o
   * restante. NEGATIVO significa que o plano passou do preço, que é erro de
   * digitação e precisa aparecer para quem está cadastrando.
   */
  saldoCents: number | null;
  excede: boolean;
  /** Nada preenchido: não há plano, e não há o que mostrar na página. */
  vazio: boolean;
}

/**
 * O que o plano soma, e o que falta.
 *
 * Existe para a tela poder dizer, no momento do cadastro, que a conta não
 * fecha. Sem isso, um plano digitado errado vai para a página pública e o
 * comprador é quem faz a soma — e descobre a diferença na hora da proposta,
 * que é o pior momento possível.
 *
 * O saldo é NULO quando não há preço: sem o total, "quanto falta" não é uma
 * pergunta que tenha resposta, e devolver o próprio negativo da soma seria
 * inventar uma.
 */
export function resumoDoPlano(p: PlanoDePagamento): ResumoDoPlano {
  const n = (v: number | null | undefined) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

  const somaCents =
    n(p.entradaCents) +
    n(p.parcelas) * n(p.parcelaCents) +
    n(p.reforcos) * n(p.reforcoCents) +
    n(p.chavesCents);

  const vazio = somaCents === 0;
  const preco = typeof p.precoCents === 'number' && p.precoCents > 0 ? p.precoCents : null;
  const saldoCents = preco === null ? null : preco - somaCents;

  return {
    somaCents,
    saldoCents,
    excede: saldoCents !== null && saldoCents < 0,
    vazio,
  };
}
