import type { FinalidadeDoSite, PropertyStatus, PropertyType } from '@juliana/contracts';

/**
 * O imóvel como o SITE precisa dele.
 *
 * Não é o espelho da tabela `properties`: é o que a página pública pode mostrar.
 * Observação interna, dono do imóvel, comissão e endereço exato (quando o
 * corretor não liberou) nunca chegam aqui. A tradução linha → `Imovel` fica num
 * lugar só (a fonte de dados), e o resto do site não conhece o banco.
 */

export interface FotoDoImovel {
  url: string;
  /** Obrigatório: é acessibilidade e é SEO de imagem. */
  alt: string;
  largura: number;
  altura: number;
}

export interface Imovel {
  /** `public_code` do CRM. É o código que a Juliana fala no WhatsApp. */
  codigo: string;
  slug: string;
  /**
   * Endereços antigos do imóvel. O CRM troca o slug quando a Juliana muda o nome
   * público; o link velho pode estar num anúncio ou num grupo de WhatsApp, então
   * ele redireciona em vez de dar 404.
   */
  slugsAntigos: string[];
  titulo: string;
  descricao: string;
  tipo: PropertyType;
  /** Venda, aluguel ou os dois. */
  finalidades: FinalidadeDoSite[];
  status: PropertyStatus;

  precoVendaCents: number | null;
  /**
   * O preço de tabela da venda com desconto: o "de" do "de R$ X por R$ Y". Busca
   * e ordem usam o preço de venda, que é o que se paga.
   */
  precoDeTabelaCents: number | null;
  /** Aluguel mensal. */
  aluguelCents: number | null;
  condominioCents: number | null;
  iptuAnualCents: number | null;

  quartos: number | null;
  suites: number | null;
  banheiros: number | null;
  vagas: number | null;
  /** Área privativa/construída, que é a que a pessoa compara. */
  areaM2: number | null;
  /** Área total (com as áreas comuns, ou o terreno da casa), quando cadastrada. */
  areaTotalM2: number | null;

  bairro: string | null;
  /** Nome da cidade como cadastrado. */
  cidade: string | null;

  fotos: FotoDoImovel[];
  comodidades: string[];
  destaque: boolean;
  /** ISO 8601. Entra no sitemap como `lastModified`. */
  atualizadoEm: string;
}

/**
 * Situações que aparecem nas listagens.
 *
 * Alugado e vendido saem da listagem, mas a página do imóvel continua no ar
 * (com aviso e sem indexação): ela pode estar num grupo de WhatsApp ou num
 * anúncio antigo, e um 404 ali é um lead perdido. A página mostra os parecidos.
 */
export const STATUS_NA_VITRINE: readonly PropertyStatus[] = ['disponivel', 'reservado'];
