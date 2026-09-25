import { cache } from 'react';

import { configuracaoDoBanco } from './banco';
import { IMOVEIS_DE_EXEMPLO } from './exemplos';
import { imovelDaLinha, type LinhaDoSite } from './linha';
import type { Imovel } from './tipos';

/** A etiqueta do cache: é ela que o CRM manda revalidar quando a Juliana salva um imóvel. */
export const ETIQUETA_DOS_IMOVEIS = 'imoveis';

/**
 * De onde o site tira os imóveis.
 *
 * Uma consulta só, com todos os publicados; filtro e agrupamento acontecem em
 * memória (`listagem.ts`). Uma corretora autônoma tem centenas de imóveis, não
 * milhões, e assim cada página estática sai de uma única ida ao banco.
 *
 * A leitura é um GET na função `site_imoveis`, guardado no cache do Next com a
 * etiqueta `imoveis`: o banco avisa `/api/revalidar` quando um imóvel muda, e
 * as 3.600 s são só a rede de segurança se o aviso se perder.
 *
 * Sem banco configurado: no `next dev` entram os imóveis de exemplo; em
 * qualquer build de produção a lista sai VAZIA. Imóvel inventado publicado é
 * anúncio falso.
 *
 * Com banco configurado, erro NÃO vira lista vazia: no build ele derruba o
 * deploy (melhor que publicar um site sem imóvel nenhum), e na revalidação o
 * Next continua servindo a última versão boa.
 */
export const carregarImoveisPublicados = cache(async (): Promise<Imovel[]> => {
  const banco = configuracaoDoBanco();
  if (!banco) return process.env.NODE_ENV === 'development' ? IMOVEIS_DE_EXEMPLO : [];

  const endereco = `${banco.url}/rest/v1/rpc/site_imoveis?_organizacao=${encodeURIComponent(banco.organizacao)}`;
  const resposta = await fetch(endereco, {
    headers: { apikey: banco.chave, Accept: 'application/json' },
    next: { tags: [ETIQUETA_DOS_IMOVEIS], revalidate: 3600 },
  });
  if (!resposta.ok) {
    throw new Error(`site_imoveis respondeu ${resposta.status}: ${(await resposta.text()).slice(0, 300)}`);
  }
  const linhas = (await resposta.json()) as LinhaDoSite[] | null;
  return (linhas ?? []).map((linha) => imovelDaLinha(linha, banco.url));
});

export async function buscarImovel(slug: string): Promise<Imovel | null> {
  const imoveis = await carregarImoveisPublicados();
  return imoveis.find((imovel) => imovel.slug === slug) ?? null;
}

/** O imóvel que já respondeu por este endereço, para redirecionar ao atual. */
export async function buscarPorSlugAntigo(slug: string): Promise<Imovel | null> {
  const imoveis = await carregarImoveisPublicados();
  return imoveis.find((imovel) => imovel.slugsAntigos.includes(slug)) ?? null;
}
