import {
  PROPERTY_STATUSES,
  PROPERTY_TYPE_LABEL,
  PROPERTY_TYPES,
  precoDeTabela,
  type FinalidadeDoSite,
  type PropertyStatus,
  type PropertyType,
} from '@juliana/contracts';

import { plural } from '@/lib/formato';

import { urlDaFoto } from './banco';
import type { FotoDoImovel, Imovel } from './tipos';

/**
 * Uma linha de `site_imoveis(_organizacao)`, a função do banco que o site lê.
 *
 * Os nomes são os das colunas de `properties` e `property_media` (o banco é a
 * fonte); a tradução para o `Imovel` do site acontece só aqui.
 */
export interface LinhaDoSite {
  public_code: string;
  slug: string;
  /** Endereços que o imóvel já teve: redirecionam para o atual. */
  old_slugs: string[] | null;
  public_title: string | null;
  description: string | null;
  property_type: string;
  for_sale: boolean;
  for_rent: boolean;
  status: string;
  price_cents: number | null;
  /** O preço de tabela da venda com desconto (o "de" do "de R$ X por R$ Y"). */
  original_price_cents: number | null;
  rent_cents: number | null;
  condo_fee_cents: number | null;
  iptu_year_cents: number | null;
  bedrooms: number | null;
  suites: number | null;
  bathrooms: number | null;
  parking_spots: number | null;
  area_built: number | null;
  area_total: number | null;
  neighborhood: string | null;
  city: string | null;
  amenities: string[] | null;
  is_featured: boolean;
  updated_at: string;
  media: MidiaDaLinha[] | null;
}

export interface MidiaDaLinha {
  storage_path: string;
  width: number | null;
  height: number | null;
  alt_text: string | null;
  caption: string | null;
}

/*
 * Foto sem medida (subida antes de o CRM gravar largura e altura) entra como
 * 4:3, que é o formato de câmera de celular deitado. Sem uma medida o
 * `next/image` não sabe reservar o espaço e a página pula ao carregar.
 */
const LARGURA_PADRAO = 1600;
const ALTURA_PADRAO = 1200;

const tipoConhecido = (valor: string): valor is PropertyType =>
  (PROPERTY_TYPES as readonly string[]).includes(valor);
const situacaoConhecida = (valor: string): valor is PropertyStatus =>
  (PROPERTY_STATUSES as readonly string[]).includes(valor);

/**
 * O título quando a Juliana não escreveu um: o que a pessoa procuraria.
 * "Apartamento com 2 quartos em Meia Praia, Itapema"
 */
export function tituloPadrao(
  linha: Pick<LinhaDoSite, 'property_type' | 'bedrooms' | 'suites' | 'neighborhood' | 'city'>,
): string {
  const tipo = tipoConhecido(linha.property_type) ? PROPERTY_TYPE_LABEL[linha.property_type] : 'Imóvel';
  // Os quartos do cadastro não contam as suítes: 2 quartos e 1 suíte são 3.
  const dormitorios = (linha.bedrooms ?? 0) + (linha.suites ?? 0);
  const quartos = dormitorios ? ` com ${plural(dormitorios, 'quarto', 'quartos')}` : '';
  const onde = [linha.neighborhood?.trim(), linha.city?.trim()].filter(Boolean).join(', ');
  return `${tipo}${quartos}${onde ? ` em ${onde}` : ''}`;
}

export function imovelDaLinha(linha: LinhaDoSite, urlDoBanco: string): Imovel {
  const titulo = linha.public_title?.trim() || tituloPadrao(linha);
  const finalidades: FinalidadeDoSite[] = [];
  if (linha.for_rent) finalidades.push('aluguel');
  if (linha.for_sale) finalidades.push('venda');

  const fotos: FotoDoImovel[] = (linha.media ?? []).map((midia, i) => ({
    url: urlDaFoto(urlDoBanco, midia.storage_path),
    // Sem texto alternativo cadastrado, o título com a posição ainda descreve
    // a foto melhor do que nada (e é o que o Google Imagens lê).
    alt: midia.alt_text?.trim() || midia.caption?.trim() || `${titulo}, foto ${i + 1}`,
    largura: midia.width ?? LARGURA_PADRAO,
    altura: midia.height ?? ALTURA_PADRAO,
  }));

  return {
    codigo: linha.public_code,
    slug: linha.slug,
    slugsAntigos: linha.old_slugs ?? [],
    titulo,
    descricao: linha.description?.trim() ?? '',
    tipo: tipoConhecido(linha.property_type) ? linha.property_type : 'outro',
    finalidades,
    status: situacaoConhecida(linha.status) ? linha.status : 'suspenso',
    // Preço de um regime que o imóvel não tem não aparece, mesmo que tenha
    // ficado gravado de quando ele estava à venda.
    precoVendaCents: linha.for_sale ? linha.price_cents : null,
    precoDeTabelaCents: linha.for_sale ? precoDeTabela(linha.price_cents, linha.original_price_cents) : null,
    aluguelCents: linha.for_rent ? linha.rent_cents : null,
    condominioCents: linha.condo_fee_cents,
    iptuAnualCents: linha.iptu_year_cents,
    quartos: linha.bedrooms,
    suites: linha.suites,
    banheiros: linha.bathrooms,
    vagas: linha.parking_spots,
    areaM2: linha.area_built ?? linha.area_total,
    areaTotalM2: linha.area_total,
    bairro: linha.neighborhood?.trim() || null,
    cidade: linha.city?.trim() || null,
    fotos,
    comodidades: linha.amenities ?? [],
    destaque: linha.is_featured,
    atualizadoEm: linha.updated_at,
  };
}
