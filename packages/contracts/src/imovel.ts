/**
 * Domínio de imóvel.
 *
 * Os valores são os MESMOS do CRM de origem (SelectusConnect, `packages/contracts/property.ts`).
 * No banco eles são TEXT + CHECK, e o clone do CRM traz esses CHECKs junto:
 * renomear um valor só aqui faz o site procurar um tipo que o banco nunca grava,
 * e a página fica vazia sem erro nenhum.
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

/**
 * O tipo no plural, como aparece na URL e no título da listagem.
 *
 * É o plural que a pessoa digita no Google ("apartamentos para alugar em
 * Itapema"), então é ele que vai no endereço. O slug é contrato público: depois
 * de indexado, trocar um destes exige redirecionamento 301, senão a página perde
 * a posição que já tinha.
 */
export const PROPERTY_TYPE_PLURAL: Record<PropertyType, { slug: string; label: string }> = {
  apartamento: { slug: 'apartamentos', label: 'Apartamentos' },
  casa: { slug: 'casas', label: 'Casas' },
  casa_condominio: { slug: 'casas-em-condominio', label: 'Casas em condomínio' },
  cobertura: { slug: 'coberturas', label: 'Coberturas' },
  studio: { slug: 'studios', label: 'Studios' },
  kitnet: { slug: 'kitnets', label: 'Kitnets' },
  terreno: { slug: 'terrenos', label: 'Terrenos' },
  chacara: { slug: 'chacaras', label: 'Chácaras' },
  sitio: { slug: 'sitios', label: 'Sítios' },
  fazenda: { slug: 'fazendas', label: 'Fazendas' },
  sala_comercial: { slug: 'salas-comerciais', label: 'Salas comerciais' },
  loja: { slug: 'lojas', label: 'Lojas' },
  galpao: { slug: 'galpoes', label: 'Galpões' },
  predio: { slug: 'predios', label: 'Prédios' },
  outro: { slug: 'outros', label: 'Outros imóveis' },
};

/** O segmento de "qualquer tipo": `/aluguel/imoveis/itapema`. */
export const TODOS_OS_TIPOS = { slug: 'imoveis', label: 'Imóveis' } as const;

export function tipoPeloSlug(slug: string): PropertyType | null {
  const achado = PROPERTY_TYPES.find((tipo) => PROPERTY_TYPE_PLURAL[tipo].slug === slug);
  return achado ?? null;
}

/**
 * O que se faz com o imóvel.
 *
 * `temporada` continua na lista porque o CHECK do banco herdado aceita. A
 * Juliana trabalha só com venda e aluguel anual (decisão de 24/09/2026), e o
 * site publica apenas `FINALIDADES_DO_SITE`.
 */
export const PROPERTY_PURPOSES = ['venda', 'aluguel', 'temporada'] as const;
export type PropertyPurpose = (typeof PROPERTY_PURPOSES)[number];

export const PROPERTY_PURPOSE_LABEL: Record<PropertyPurpose, string> = {
  venda: 'Venda',
  aluguel: 'Aluguel',
  temporada: 'Temporada',
};

export const FINALIDADES_DO_SITE = ['aluguel', 'venda'] as const;
export type FinalidadeDoSite = (typeof FINALIDADES_DO_SITE)[number];

/**
 * Como a finalidade entra numa frase: "Apartamentos PARA ALUGAR em Itapema".
 * É a forma que a pessoa busca; "Apartamentos de aluguel" quase ninguém digita.
 */
export const FINALIDADE_NA_FRASE: Record<FinalidadeDoSite, string> = {
  aluguel: 'para alugar',
  venda: 'à venda',
};

export function ehFinalidadeDoSite(valor: string): valor is FinalidadeDoSite {
  return (FINALIDADES_DO_SITE as readonly string[]).includes(valor);
}

/** Comodidades mais buscadas (mesma lista do CRM de origem). O banco aceita qualquer texto. */
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
export type CommonAmenity = (typeof COMMON_AMENITIES)[number];

export const COMMON_AMENITY_LABEL: Record<CommonAmenity, string> = {
  piscina: 'Piscina',
  churrasqueira: 'Churrasqueira',
  academia: 'Academia',
  salao_festas: 'Salão de festas',
  playground: 'Playground',
  quadra: 'Quadra',
  portaria_24h: 'Portaria 24h',
  elevador: 'Elevador',
  varanda_gourmet: 'Varanda gourmet',
  mobiliado: 'Mobiliado',
  aceita_pet: 'Aceita pet',
  vista_mar: 'Vista para o mar',
};

/** Rótulo de qualquer comodidade: a da lista, ou o texto livre arrumado. */
export function rotuloDaComodidade(valor: string): string {
  if (valor in COMMON_AMENITY_LABEL) return COMMON_AMENITY_LABEL[valor as CommonAmenity];
  const texto = valor.replace(/_/g, ' ').trim();
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

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
