import { cache } from 'react';

import { IMOVEIS_DE_EXEMPLO } from './exemplos';
import type { Imovel } from './tipos';

/**
 * De onde o site tira os imóveis.
 *
 * Uma consulta só, com todos os publicados; filtro e agrupamento acontecem em
 * memória (`listagem.ts`). Uma corretora autônoma tem centenas de imóveis, não
 * milhões, e assim cada página estática sai de uma única ida ao banco.
 *
 * HOJE: sem banco. No `next dev` entram os imóveis de exemplo; em qualquer build
 * de produção a lista sai VAZIA. Imóvel inventado publicado é anúncio falso.
 *
 * QUANDO O SUPABASE CHEGAR: esta função passa a ler a view pública de imóveis,
 * guardada em cache com a tag `imoveis`, e o CRM chama a revalidação dessa tag
 * quando a Juliana salva um imóvel.
 */
export const carregarImoveisPublicados = cache(async (): Promise<Imovel[]> => {
  if (process.env.NODE_ENV === 'development') return IMOVEIS_DE_EXEMPLO;
  return [];
});

export async function buscarImovel(slug: string): Promise<Imovel | null> {
  const imoveis = await carregarImoveisPublicados();
  return imoveis.find((imovel) => imovel.slug === slug) ?? null;
}
