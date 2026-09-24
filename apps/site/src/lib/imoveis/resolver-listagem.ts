import { FINALIDADE_NA_FRASE, type FinalidadeDoSite } from '@juliana/contracts';
import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';

import { SITE } from '@/config/site';

import { carregarImoveisPublicados } from './dados';
import {
  bairrosDe,
  filtrarImoveis,
  interpretarSegmentos,
  listagensComImoveis,
  segmentosDaListagem,
  tituloDaListagem,
  urlDaListagem,
  type Bairro,
  type FiltroDeListagem,
} from './listagem';
import type { Imovel } from './tipos';

export interface ListagemResolvida {
  filtro: FiltroDeListagem;
  bairro: Bairro | null;
  titulo: string;
  url: string;
  imoveis: Imovel[];
  /** Todos os publicados, para montar os atalhos de tipo, cidade e bairro. */
  todos: Imovel[];
}

/**
 * URL → listagem, ou 404, ou 301 para a URL canônica.
 *
 * Usada pela página E pelo `generateMetadata` da mesma rota. O `cache` do React
 * em `carregarImoveisPublicados` faz as duas chamadas saírem de uma consulta só.
 */
export async function resolverListagem(
  finalidade: FinalidadeDoSite,
  segmentos: string[] | undefined,
): Promise<ListagemResolvida> {
  const interpretacao = interpretarSegmentos(finalidade, segmentos);
  if (!interpretacao.ok) {
    if (interpretacao.redirecionarPara) permanentRedirect(interpretacao.redirecionarPara);
    notFound();
  }

  const { filtro } = interpretacao;
  const todos = await carregarImoveisPublicados();

  let bairro: Bairro | null = null;
  if (filtro.bairro) {
    bairro =
      bairrosDe(todos).find((b) => b.slug === filtro.bairro && b.cidade.slug === filtro.cidade?.slug) ?? null;
    // Bairro que nunca teve imóvel publicado não é página: é endereço digitado errado.
    if (!bairro) notFound();
  }

  return {
    filtro,
    bairro,
    titulo: tituloDaListagem(filtro, bairro?.nome),
    url: urlDaListagem(filtro),
    imoveis: filtrarImoveis(todos, filtro),
    todos,
  };
}

export async function metadataDaListagem(
  finalidade: FinalidadeDoSite,
  segmentos: string[] | undefined,
): Promise<Metadata> {
  const { titulo, url, imoveis, filtro } = await resolverListagem(finalidade, segmentos);

  const quantos =
    imoveis.length === 0
      ? 'Imóveis'
      : `${imoveis.length} ${imoveis.length === 1 ? 'opção' : 'opções'} de imóveis`;
  const description = `${quantos} ${FINALIDADE_NA_FRASE[filtro.finalidade]} com a corretora ${SITE.nomeCurto} (${SITE.creci}). Fotos, valores e atendimento pelo WhatsApp.`;

  return {
    title: titulo,
    description,
    alternates: { canonical: url },
    openGraph: { title: titulo, description, url },
    // Listagem vazia continua acessível, mas fora do índice: página sem
    // conteúdo pesa contra o site inteiro.
    ...(imoveis.length === 0 ? { robots: { index: false, follow: true } } : {}),
  };
}

/** As listagens pré-geradas no build. As outras são geradas na primeira visita. */
export async function parametrosDaListagem(finalidade: FinalidadeDoSite): Promise<{ filtros: string[] }[]> {
  const imoveis = await carregarImoveisPublicados();
  const filtros = listagensComImoveis(imoveis).filter((filtro) => filtro.finalidade === finalidade);
  const segmentos = filtros.map(segmentosDaListagem);

  // A raiz (/aluguel, /venda) existe sempre, mesmo sem imóvel nenhum.
  if (!segmentos.some((lista) => lista.length === 0)) segmentos.unshift([]);
  return segmentos.map((lista) => ({ filtros: lista }));
}
