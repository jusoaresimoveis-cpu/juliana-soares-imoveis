import { CIDADES_ATENDIDAS, FINALIDADES_DO_SITE, type FinalidadeDoSite } from '@juliana/contracts';

import { bairrosDe, filtrarImoveis } from './listagem';
import type { Imovel } from './tipos';

export interface OpcoesDaBusca {
  cidades: { slug: string; nome: string }[];
  bairros: Record<FinalidadeDoSite, Record<string, { slug: string; nome: string }[]>>;
}

/**
 * O que o seletor de bairro oferece: por finalidade e cidade, só bairros que
 * têm imóvel disponível. Oferecer bairro vazio é levar a pessoa a uma página
 * sem resultado.
 */
export function opcoesDaBusca(imoveis: readonly Imovel[]): OpcoesDaBusca {
  const bairros = {} as OpcoesDaBusca['bairros'];

  for (const finalidade of FINALIDADES_DO_SITE) {
    const disponiveis = filtrarImoveis(imoveis, { finalidade, tipo: null, cidade: null, bairro: null });
    bairros[finalidade] = {};
    for (const bairro of bairrosDe(disponiveis)) {
      (bairros[finalidade][bairro.cidade.slug] ??= []).push({ slug: bairro.slug, nome: bairro.nome });
    }
  }

  return {
    cidades: CIDADES_ATENDIDAS.map(({ slug, nome }) => ({ slug, nome })),
    bairros,
  };
}
