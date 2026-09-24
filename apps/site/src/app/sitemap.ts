import type { MetadataRoute } from 'next';

import { SITE } from '@/config/site';
import { carregarImoveisPublicados } from '@/lib/imoveis/dados';
import { filtrarImoveis, listagensComImoveis, urlDaListagem } from '@/lib/imoveis/listagem';
import { STATUS_NA_VITRINE } from '@/lib/imoveis/tipos';

export const revalidate = 3600;

/**
 * Tudo o que o Google deve conhecer: páginas fixas, cada listagem com imóvel e
 * cada imóvel disponível. Alugado e vendido ficam de fora: a página continua no
 * ar para quem tem o link, mas não é mais oferta.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const imoveis = await carregarImoveisPublicados();
  const naVitrine = imoveis.filter((imovel) => STATUS_NA_VITRINE.includes(imovel.status));

  const maisRecente = (lista: typeof imoveis) =>
    lista.reduce<string | undefined>(
      (atual, imovel) => (!atual || imovel.atualizadoEm > atual ? imovel.atualizadoEm : atual),
      undefined,
    );

  const fixas: MetadataRoute.Sitemap = [
    { url: SITE.url, lastModified: maisRecente(naVitrine) },
    { url: `${SITE.url}/cadastrar-imovel` },
    { url: `${SITE.url}/sobre` },
    { url: `${SITE.url}/contato` },
  ];

  const listagens: MetadataRoute.Sitemap = [
    urlDaListagem({ finalidade: 'aluguel' }),
    urlDaListagem({ finalidade: 'venda' }),
  ].map((caminho) => ({ url: `${SITE.url}${caminho}` }));

  for (const filtro of listagensComImoveis(imoveis)) {
    const caminho = urlDaListagem(filtro);
    if (listagens.some((item) => item.url === `${SITE.url}${caminho}`)) continue;
    listagens.push({ url: `${SITE.url}${caminho}`, lastModified: maisRecente(filtrarImoveis(imoveis, filtro)) });
  }

  const paginasDeImovel: MetadataRoute.Sitemap = naVitrine.map((imovel) => ({
    url: `${SITE.url}/imovel/${imovel.slug}`,
    lastModified: imovel.atualizadoEm,
    images: imovel.fotos.slice(0, 5).map((foto) => foto.url),
  }));

  return [...fixas, ...listagens, ...paginasDeImovel];
}
