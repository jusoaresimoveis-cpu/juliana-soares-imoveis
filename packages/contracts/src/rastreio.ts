/**
 * O código que liga o contato que veio do site ao lead no CRM.
 *
 * O WhatsApp da Juliana também é o número pessoal dela, e o CRM só deixa
 * entrar a conversa que chega com prova de origem (migration 20260925000000).
 * Para quem clica num botão do site, a prova é o `Ref.` visível na mensagem: o
 * banco o lê com `parse_ref_code`, e a mensagem sem ele cai como conversa
 * pessoal, sem deixar rastro no CRM.
 *
 * O formato é o do CRM de origem (`buildRefCode`, em `attribution.ts`): o
 * código do imóvel e a variante no fim, que a leitura exige. O site não tem as
 * variantes A/B/C das páginas de anúncio da origem, então vai sempre `A`.
 */

import { buildRefCode, type Variant } from './attribution';
import type { LeadSource } from './pipeline';

/**
 * No lugar do código do imóvel, nos botões que não são de um imóvel (topo,
 * rodapé, contato). Tem quatro caracteres, como o código de imóvel, que é a
 * base 36 de uma sequência que começa em `1000`: `site` só sairia dela depois
 * de mais de um milhão de imóveis.
 */
export const CODIGO_DO_SITE = 'SITE';

const VARIANTE_DO_SITE: Variant = 'a';

/**
 * Por onde a pessoa chegou antes de chamar no WhatsApp: viaja no segmento do
 * MEIO do código, `Ref. 1004-GO-A`.
 *
 * No CRM de origem esse segmento era o país da página de anúncio, para cinco
 * mercados. Aqui não há mercado, e desde 05/10 ele diz o canal: o site anota de
 * onde o visitante veio, o link `/w/<canal>` já sai com ele, e o banco o traduz
 * na origem do lead (`origem_do_canal`, conferida contra esta lista por teste).
 * Sem canal, a origem é o site.
 *
 * Duas letras, porque é o que a leitura do código aceita (`REF_CODE_RE`).
 * `slug` é o endereço do link (`/w/bio`) e `nome` vai na mensagem ("Vim pelo
 * Google"), para a Juliana ler de onde veio sem abrir o CRM.
 */
export const CANAIS = {
  go: { origem: 'google', slug: 'google', nome: 'Google' },
  ga: { origem: 'google_ads', slug: 'google-ads', nome: 'anúncio do Google' },
  ma: { origem: 'meta_ads', slug: 'meta-ads', nome: 'anúncio do Instagram ou Facebook' },
  bi: { origem: 'link_bio', slug: 'bio', nome: 'link da bio' },
  ig: { origem: 'instagram', slug: 'instagram', nome: 'Instagram' },
  fb: { origem: 'facebook', slug: 'facebook', nome: 'Facebook' },
  mk: { origem: 'marketplace', slug: 'marketplace', nome: 'Marketplace' },
} as const satisfies Record<string, { origem: LeadSource; slug: string; nome: string }>;

export type Canal = keyof typeof CANAIS;

/** A origem do lead que chega com o código do site e sem canal. */
export const ORIGEM_SEM_CANAL: LeadSource = 'landing_page';

export function ehCanal(valor: unknown): valor is Canal {
  return typeof valor === 'string' && Object.prototype.hasOwnProperty.call(CANAIS, valor);
}

/** O canal do endereço `/w/<slug>`. */
export function canalDoSlug(slug: string): Canal | null {
  const achado = (Object.keys(CANAIS) as Canal[]).find((c) => CANAIS[c].slug === slug.toLowerCase());
  return achado ?? null;
}

/**
 * `Ref. 1000-A` para um imóvel; `Ref. SITE-A` para o site em geral; com o
 * canal no meio, `Ref. 1000-GO-A`.
 */
export function refDoSite(codigoDoImovel?: string, canal?: Canal): string {
  return `Ref. ${buildRefCode(codigoDoImovel ?? CODIGO_DO_SITE, VARIANTE_DO_SITE, canal)}`;
}
