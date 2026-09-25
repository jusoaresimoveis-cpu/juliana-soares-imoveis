/**
 * O imóvel do lado do site: URL, finalidade na frase e rótulo de comodidade.
 *
 * Tipo, finalidade e situação vêm de `property.ts`, que é o contrato do CRM e
 * do banco (TEXT + CHECK). Aqui só se acrescenta o que o site precisa em cima
 * deles; redefinir um valor aqui faria o site procurar algo que o banco nunca
 * grava, e a página ficaria vazia sem erro nenhum.
 */

import { COMMON_AMENITIES, PROPERTY_TYPES, type PropertyType } from './property';

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
 * As finalidades que o site publica. `temporada` o banco aceita porque vem do
 * CRM de origem, mas a Juliana trabalha só com venda e aluguel anual (decisão
 * de 24/09/2026).
 */
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
