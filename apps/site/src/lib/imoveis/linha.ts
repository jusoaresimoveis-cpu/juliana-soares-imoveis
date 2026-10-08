import {
  CONSTRUCTION_STATUSES,
  PROPERTY_STATUSES,
  PROPERTY_TYPE_LABEL,
  PROPERTY_TYPE_PLURAL,
  PROPERTY_TYPES,
  normalizarCaracteristicas,
  precoDeTabela,
  tabelaVigente,
  type ConstructionStatus,
  type FinalidadeDoSite,
  type PropertyStatus,
  type PropertyType,
} from '@juliana/contracts';

import { faixaDeContagem, plural } from '@/lib/formato';

import { urlDaFoto } from './banco';
import { numerosDasPlantas, plantasAVenda } from './empreendimento';
import {
  STATUS_NA_VITRINE,
  type Empreendimento,
  type FotoDoImovel,
  type Imovel,
  type PlantaDoEmpreendimento,
  type UnidadeDoEmpreendimento,
} from './tipos';

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
  /**
   * No empreendimento, o "a partir de"; nulo quando a tabela não é a do mês,
   * sem unidade disponível ou no suspenso.
   */
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
  /** "Sobre o imóvel" (jsonb). Vem como o banco guardou: passa por `normalizarCaracteristicas`. */
  features: unknown;
  is_featured: boolean;
  updated_at: string;
  media: MidiaDaLinha[] | null;
  /**
   * O empreendimento com unidades (migration 20261009000000); nulo no imóvel
   * comum. Opcional porque o banco de antes da migration não manda a chave, e
   * o site publicado antes dela não pode quebrar.
   */
  empreendimento?: EmpreendimentoDaLinha | null;
}

export interface MidiaDaLinha {
  storage_path: string;
  width: number | null;
  height: number | null;
  alt_text: string | null;
  caption: string | null;
  is_illustrative?: boolean | null;
}

export interface EmpreendimentoDaLinha {
  /** Sempre dia 1: "2026-10-01". */
  units_table_month: string | null;
  table_is_current: boolean;
  /** Quantas unidades estão disponíveis, calculado pelo banco. Zero no suspenso. */
  units_available: number | null;
  construction_status: string | null;
  delivery_year: number | null;
  incorporation_registry: string | null;
  incorporation_registry_office: string | null;
  payment_notes: string | null;
  floorplans: PlantaDaLinha[] | null;
}

export interface PlantaDaLinha {
  name: string;
  bedrooms: number | null;
  suites: number | null;
  bathrooms: number | null;
  parking_spots: number | null;
  area_built: number | null;
  units: UnidadeDaLinha[] | null;
}

export interface UnidadeDaLinha {
  label: string;
  floor: number | null;
  /** A da unidade, ou a da planta quando a unidade não tem uma. */
  area_built: number | null;
  /** Só na disponível, e só com a tabela do mês: a reservada chega sem preço. */
  price_cents: number | null;
  status: string;
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
const obraConhecida = (valor: string | null): valor is ConstructionStatus =>
  valor !== null && (CONSTRUCTION_STATUSES as readonly string[]).includes(valor);
const naVitrine = (valor: string): valor is UnidadeDoEmpreendimento['situacao'] =>
  valor === 'disponivel' || valor === 'reservado';

const textoOuNulo = (valor: string | null | undefined) => valor?.trim() || null;

/**
 * O título quando a Juliana não escreveu um: o que a pessoa procuraria.
 * "Apartamento com 2 quartos em Meia Praia, Itapema"; no empreendimento,
 * "Apartamentos com 2 ou 3 dormitórios em Morretes, Itapema", das plantas.
 */
export function tituloPadrao(
  linha: Pick<LinhaDoSite, 'property_type' | 'bedrooms' | 'suites' | 'neighborhood' | 'city' | 'empreendimento'>,
): string {
  const conhecido = tipoConhecido(linha.property_type) ? linha.property_type : null;
  const onde = [linha.neighborhood?.trim(), linha.city?.trim()].filter(Boolean).join(', ');
  const lugar = onde ? ` em ${onde}` : '';

  if (linha.empreendimento) {
    const tipo = conhecido ? PROPERTY_TYPE_PLURAL[conhecido].label : 'Imóveis';
    // As plantas dos números do cartão (as que têm unidade disponível), para o
    // título e o cartão não discordarem. O total já soma as suítes, e por isso
    // é "dormitórios", como no cartão (ver `numeros.ts`). O título não leva
    // preço, e por isso tanto faz a tabela do mês.
    const daLinha = plantasDaLinha(linha.empreendimento.floorplans, false);
    const plantas = plantasAVenda({ empreendimento: { plantas: daLinha } });
    const dormitorios = numerosDasPlantas(plantas).dormitorios.filter((n) => n > 0);
    const rotulo = Math.max(0, ...dormitorios) === 1 ? 'dormitório' : 'dormitórios';
    const quantos = dormitorios.length ? ` com ${faixaDeContagem(dormitorios)} ${rotulo}` : '';
    return `${tipo}${quantos}${lugar}`;
  }

  const tipo = conhecido ? PROPERTY_TYPE_LABEL[conhecido] : 'Imóvel';
  const dormitorios = (linha.bedrooms ?? 0) + (linha.suites ?? 0);
  const quartos = dormitorios ? ` com ${plural(dormitorios, 'quarto', 'quartos')}` : '';
  return `${tipo}${quartos}${lugar}`;
}

/**
 * As plantas com as unidades na vitrine (disponível ou reservada), e só as que
 * ficam com alguma. Sem `comPreco` (a tabela não é a do mês, ou o imóvel saiu
 * da vitrine), os preços saem nulos. A reservada sai sempre sem preço: o banco
 * já não o manda (é o da tabela do dia da reserva, e ela não está à venda), e
 * o site não mostra o que viesse.
 */
function plantasDaLinha(floorplans: PlantaDaLinha[] | null, comPreco: boolean): PlantaDoEmpreendimento[] {
  return (floorplans ?? [])
    .map((planta) => ({
      nome: planta.name.trim(),
      quartos: planta.bedrooms,
      suites: planta.suites,
      banheiros: planta.bathrooms,
      vagas: planta.parking_spots,
      areaM2: planta.area_built,
      unidades: (planta.units ?? [])
        .filter((u): u is UnidadeDaLinha & { status: UnidadeDoEmpreendimento['situacao'] } => naVitrine(u.status))
        .map((u) => ({
          rotulo: u.label,
          andar: u.floor,
          areaM2: u.area_built ?? planta.area_built,
          precoCents: comPreco && u.status === 'disponivel' ? u.price_cents : null,
          situacao: u.status,
        }))
        // O banco ordena por preço e, sem preço, pelo rótulo como texto ("1204"
        // antes de "506"). Sem preço, a ordem que se entende é a do andar.
        .sort(
          (a, b) =>
            (a.precoCents ?? Infinity) - (b.precoCents ?? Infinity) ||
            (a.andar ?? 0) - (b.andar ?? 0) ||
            a.rotulo.localeCompare(b.rotulo, 'pt-BR', { numeric: true }),
        ),
    }))
    .filter((planta) => planta.unidades.length > 0);
}

/**
 * O bloco do empreendimento, só com o que o site pode mostrar.
 *
 * O banco já manda os preços nulos quando a tabela não é a do mês; o relógio
 * daqui confere de novo, porque a resposta fica até uma hora no cache e pode
 * atravessar a virada do mês. Vale o mais restritivo dos dois.
 *
 * Fora da vitrine (suspenso, vendido), nada está à venda, e a página diz que o
 * imóvel "não está mais disponível". O banco zera a contagem e o "a partir de"
 * do suspenso, mas ainda manda o preço de cada unidade, que chegaria à oferta
 * para o Google: aqui ele sai nulo, e a contagem, zero.
 */
function empreendimentoDaLinha(linha: EmpreendimentoDaLinha, naVitrineDoSite: boolean, agora: Date): Empreendimento {
  const vigente = linha.table_is_current === true && tabelaVigente(linha.units_table_month, agora);
  const plantas = plantasDaLinha(linha.floorplans, vigente && naVitrineDoSite);

  return {
    tabelaDoMes: linha.units_table_month?.slice(0, 10) ?? null,
    tabelaVigente: vigente,
    // A contagem é só a do banco, nunca a das linhas da lista: o suspenso chega
    // com zero e ainda com as unidades.
    unidadesDisponiveis: naVitrineDoSite ? (linha.units_available ?? 0) : 0,
    obra: obraConhecida(linha.construction_status) ? linha.construction_status : null,
    anoDeEntrega: linha.delivery_year,
    registroDeIncorporacao: textoOuNulo(linha.incorporation_registry),
    cartorio: textoOuNulo(linha.incorporation_registry_office),
    condicaoDePagamento: textoOuNulo(linha.payment_notes),
    plantas,
  };
}

export function imovelDaLinha(linha: LinhaDoSite, urlDoBanco: string, agora: Date = new Date()): Imovel {
  const titulo = linha.public_title?.trim() || tituloPadrao(linha);
  const finalidades: FinalidadeDoSite[] = [];
  if (linha.for_rent) finalidades.push('aluguel');
  if (linha.for_sale) finalidades.push('venda');

  const status: PropertyStatus = situacaoConhecida(linha.status) ? linha.status : 'suspenso';
  const empreendimento = linha.empreendimento
    ? empreendimentoDaLinha(linha.empreendimento, STATUS_NA_VITRINE.includes(status), agora)
    : null;

  const fotos: FotoDoImovel[] = (linha.media ?? []).map((midia, i) => ({
    url: urlDaFoto(urlDoBanco, midia.storage_path),
    // Sem texto alternativo cadastrado, o título com a posição ainda descreve
    // a foto melhor do que nada (e é o que o Google Imagens lê).
    alt: midia.alt_text?.trim() || midia.caption?.trim() || `${titulo}, foto ${i + 1}`,
    largura: midia.width ?? LARGURA_PADRAO,
    altura: midia.height ?? ALTURA_PADRAO,
    ilustrativa: midia.is_illustrative === true,
  }));

  return {
    codigo: linha.public_code,
    slug: linha.slug,
    slugsAntigos: linha.old_slugs ?? [],
    titulo,
    descricao: linha.description?.trim() ?? '',
    tipo: tipoConhecido(linha.property_type) ? linha.property_type : 'outro',
    finalidades,
    status,
    // Preço de um regime que o imóvel não tem não aparece, mesmo que tenha
    // ficado gravado de quando ele estava à venda. No empreendimento, o "a
    // partir de" só com a tabela do mês e com unidade disponível, como o banco
    // manda (o do só reservadas seria o de uma reservada).
    precoVendaCents:
      linha.for_sale && (!empreendimento || (empreendimento.tabelaVigente && empreendimento.unidadesDisponiveis > 0))
        ? linha.price_cents
        : null,
    precoDeTabelaCents:
      linha.for_sale && !empreendimento ? precoDeTabela(linha.price_cents, linha.original_price_cents) : null,
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
    caracteristicas: normalizarCaracteristicas(linha.features),
    destaque: linha.is_featured,
    atualizadoEm: linha.updated_at,
    empreendimento,
  };
}
