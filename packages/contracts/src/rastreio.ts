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

/**
 * No lugar do código do imóvel, nos botões que não são de um imóvel (topo,
 * rodapé, contato). Tem quatro caracteres, como o código de imóvel, que é a
 * base 36 de uma sequência que começa em `1000`: `site` só sairia dela depois
 * de mais de um milhão de imóveis.
 */
export const CODIGO_DO_SITE = 'SITE';

const VARIANTE_DO_SITE: Variant = 'a';

/** `Ref. 1000-A` para um imóvel; `Ref. SITE-A` para o site em geral. */
export function refDoSite(codigoDoImovel?: string): string {
  return `Ref. ${buildRefCode(codigoDoImovel ?? CODIGO_DO_SITE, VARIANTE_DO_SITE)}`;
}
