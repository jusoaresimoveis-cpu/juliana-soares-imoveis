import {
  cidadePeloSlug,
  CIDADES_ATENDIDAS,
  FINALIDADE_NA_FRASE,
  PROPERTY_TYPE_PLURAL,
  slugify,
  tipoPeloSlug,
  TODOS_OS_TIPOS,
  type CidadeAtendida,
  type FinalidadeDoSite,
  type PropertyType,
} from '@juliana/contracts';

import { STATUS_NA_VITRINE, type Imovel } from './tipos';

/**
 * As páginas de listagem e o formato das URLs delas.
 *
 *   /aluguel
 *   /aluguel/apartamentos
 *   /aluguel/imoveis/itapema
 *   /aluguel/apartamentos/itapema/meia-praia
 *
 * Sempre nesta ordem: finalidade, tipo, cidade, bairro. É a frase que a pessoa
 * digita ("apartamentos para alugar em Meia Praia, Itapema"), e cada combinação
 * vira uma página que pode ranquear sozinha. A URL é contrato público: depois de
 * indexada, mudar exige redirecionamento 301.
 */

export interface FiltroDeListagem {
  finalidade: FinalidadeDoSite;
  tipo: PropertyType | null;
  cidade: CidadeAtendida | null;
  /** Slug do bairro. Quem confere se ele existe é a página, que tem os dados. */
  bairro: string | null;
}

export type Interpretacao =
  | { ok: true; filtro: FiltroDeListagem }
  /** A mesma listagem existe num endereço mais curto: redireciona para ele. */
  | { ok: false; redirecionarPara: string }
  | { ok: false; redirecionarPara: null };

export function interpretarSegmentos(
  finalidade: FinalidadeDoSite,
  segmentos: string[] | undefined,
): Interpretacao {
  const [tipoSlug, cidadeSlug, bairroSlug, ...sobra] = segmentos ?? [];
  const invalido = { ok: false, redirecionarPara: null } as const;

  if (sobra.length > 0) return invalido;

  let tipo: PropertyType | null = null;
  if (tipoSlug !== undefined && tipoSlug !== TODOS_OS_TIPOS.slug) {
    tipo = tipoPeloSlug(tipoSlug);
    if (!tipo) return invalido;
  }

  let cidade: CidadeAtendida | null = null;
  if (cidadeSlug !== undefined) {
    cidade = cidadePeloSlug(cidadeSlug);
    if (!cidade) return invalido;
  }

  // "Perequê" ou "Meia-Praia" digitados à mão viram o slug certo pelo
  // redirecionamento abaixo, em vez de 404. O Next entrega o segmento ainda
  // codificado ("Perequ%C3%AA"): sem decodificar, o acento vira "c3-aa".
  let bairro: string | null = null;
  if (bairroSlug !== undefined) {
    try {
      bairro = slugify(decodeURIComponent(bairroSlug));
    } catch {
      return invalido;
    }
    if (bairro === '') return invalido;
  }

  const filtro: FiltroDeListagem = { finalidade, tipo, cidade, bairro };

  // `/aluguel/imoveis` é a mesma página que `/aluguel`. Duas URLs para o mesmo
  // conteúdo dividem a relevância entre elas; fica só a curta.
  const canonica = urlDaListagem(filtro);
  const pedida = ['', finalidade, ...(segmentos ?? [])].join('/');
  if (canonica !== pedida) return { ok: false, redirecionarPara: canonica };

  return { ok: true, filtro };
}

export function urlDaListagem(filtro: {
  finalidade: FinalidadeDoSite;
  tipo?: PropertyType | null;
  cidade?: Pick<CidadeAtendida, 'slug'> | null;
  bairro?: string | null;
}): string {
  const partes: string[] = [filtro.finalidade];
  const tipoSlug = filtro.tipo ? PROPERTY_TYPE_PLURAL[filtro.tipo].slug : TODOS_OS_TIPOS.slug;

  if (filtro.cidade) {
    partes.push(tipoSlug, filtro.cidade.slug);
    if (filtro.bairro) partes.push(filtro.bairro);
  } else if (filtro.tipo) {
    partes.push(tipoSlug);
  }

  return `/${partes.join('/')}`;
}

/** "Apartamentos para alugar em Meia Praia, Itapema". */
export function tituloDaListagem(filtro: FiltroDeListagem, nomeDoBairro?: string): string {
  const oQue = filtro.tipo ? PROPERTY_TYPE_PLURAL[filtro.tipo].label : TODOS_OS_TIPOS.label;
  const onde = filtro.cidade
    ? nomeDoBairro
      ? `${nomeDoBairro}, ${filtro.cidade.nome}`
      : filtro.cidade.nome
    : CIDADES_ATENDIDAS.map((cidade) => cidade.nome).join(' e ');

  return `${oQue} ${FINALIDADE_NA_FRASE[filtro.finalidade]} em ${onde}`;
}

/** A cidade do imóvel, se for uma das que a Juliana atende. */
export function cidadeDoImovel(imovel: Pick<Imovel, 'cidade'>): CidadeAtendida | null {
  return imovel.cidade ? cidadePeloSlug(slugify(imovel.cidade)) : null;
}

export function filtrarImoveis(imoveis: readonly Imovel[], filtro: FiltroDeListagem): Imovel[] {
  return imoveis.filter((imovel) => {
    if (!STATUS_NA_VITRINE.includes(imovel.status)) return false;
    if (!imovel.finalidades.includes(filtro.finalidade)) return false;
    if (filtro.tipo && imovel.tipo !== filtro.tipo) return false;
    if (filtro.cidade && cidadeDoImovel(imovel)?.slug !== filtro.cidade.slug) return false;
    if (filtro.bairro && (!imovel.bairro || slugify(imovel.bairro) !== filtro.bairro)) return false;
    return true;
  });
}

/** O inverso de `urlDaListagem`: os segmentos depois da finalidade. */
export function segmentosDaListagem(filtro: FiltroDeListagem): string[] {
  return urlDaListagem(filtro).split('/').slice(2);
}

/**
 * Toda listagem que tem pelo menos um imóvel na vitrine.
 *
 * Alimenta o sitemap e a geração estática. Combinação sem imóvel não entra:
 * página vazia no sitemap é página rasa aos olhos do Google.
 */
export function listagensComImoveis(imoveis: readonly Imovel[]): FiltroDeListagem[] {
  const porUrl = new Map<string, FiltroDeListagem>();
  const adicionar = (filtro: FiltroDeListagem) => porUrl.set(urlDaListagem(filtro), filtro);

  for (const imovel of imoveis) {
    if (!STATUS_NA_VITRINE.includes(imovel.status)) continue;
    const cidade = cidadeDoImovel(imovel);
    const bairro = imovel.bairro ? slugify(imovel.bairro) || null : null;

    for (const finalidade of imovel.finalidades) {
      for (const tipo of [null, imovel.tipo]) {
        adicionar({ finalidade, tipo, cidade: null, bairro: null });
        if (!cidade) continue;
        adicionar({ finalidade, tipo, cidade, bairro: null });
        if (bairro) adicionar({ finalidade, tipo, cidade, bairro });
      }
    }
  }

  return [...porUrl.values()];
}

export interface Bairro {
  slug: string;
  nome: string;
  cidade: CidadeAtendida;
}

/**
 * Os bairros que existem no site: os que têm pelo menos um imóvel publicado.
 *
 * Conta também alugados e vendidos, para que a página do bairro não suma (e
 * perca a posição no Google) no dia em que o último imóvel dele sair.
 */
export function bairrosDe(imoveis: readonly Imovel[]): Bairro[] {
  const porChave = new Map<string, Bairro>();
  for (const imovel of imoveis) {
    const cidade = cidadeDoImovel(imovel);
    if (!cidade || !imovel.bairro) continue;
    const slug = slugify(imovel.bairro);
    const chave = `${cidade.slug}/${slug}`;
    if (!porChave.has(chave)) porChave.set(chave, { slug, nome: imovel.bairro.trim(), cidade });
  }
  return [...porChave.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}
