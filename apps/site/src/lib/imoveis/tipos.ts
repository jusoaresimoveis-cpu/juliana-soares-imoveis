import type {
  CaracteristicasDoImovel,
  ConstructionStatus,
  FinalidadeDoSite,
  PropertyStatus,
  PropertyType,
  UnitStatus,
} from '@juliana/contracts';

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
  /** Render ou decorado: o site avisa "Imagem ilustrativa" sobre a foto (nada inventado no site). */
  ilustrativa: boolean;
}

/** Uma unidade do empreendimento. Só disponível ou reservada: a vendida nem sai do banco. */
export interface UnidadeDoEmpreendimento {
  /** O identificador puro ("804"). Na tela é sempre "Apto 804" (`rotuloDaUnidade`). */
  rotulo: string;
  andar: number | null;
  /** A da unidade quando ela difere da planta (sala comercial), senão a da planta. */
  areaM2: number | null;
  /**
   * Só a disponível tem preço, e só com a tabela do mês (sem ela, "Consulte").
   * A reservada é sempre nula: na tela, só o selo.
   */
  precoCents: number | null;
  situacao: Exclude<UnitStatus, 'vendido'>;
}

export interface PlantaDoEmpreendimento {
  nome: string;
  /** Os quartos SEM as suítes, como no imóvel: 2 quartos e 1 suíte são 3 dormitórios. */
  quartos: number | null;
  suites: number | null;
  banheiros: number | null;
  vagas: number | null;
  areaM2: number | null;
  /** Em ordem de preço; sem preço, em ordem de andar. */
  unidades: UnidadeDoEmpreendimento[];
}

/**
 * O empreendimento com várias unidades (migration 20261009000000). Continua
 * sendo UM imóvel, com uma página e um código; as unidades são linhas dentro
 * dele, sem página própria.
 *
 * A construtora não está aqui de propósito: ela fica só no CRM, para o cliente
 * não ir comprar direto com ela.
 */
export interface Empreendimento {
  /** O mês da tabela aplicada ("2026-10-01"). */
  tabelaDoMes: string | null;
  /**
   * A tabela é a do mês corrente. A da construtora sai todo 1º dia útil (CUB/SC),
   * e até a Juliana aplicar a nova, todo preço do empreendimento é "Consulte".
   */
  tabelaVigente: boolean;
  /**
   * O `units_available` do banco, e só ele: zero no suspenso e fora da vitrine,
   * mesmo com unidades na lista. A contagem nunca sai das linhas.
   */
  unidadesDisponiveis: number;
  obra: ConstructionStatus | null;
  /** Só o ano ("Entrega em 2030"): é o que a construtora divulga. */
  anoDeEntrega: number | null;
  /** Exigido no anúncio pela Lei 4.591/64, art. 32, § 3º, com o cartório. */
  registroDeIncorporacao: string | null;
  cartorio: string | null;
  condicaoDePagamento: string | null;
  /**
   * Só as plantas que ainda têm unidade disponível ou reservada. Vazia antes
   * da primeira tabela (as unidades nascem vendidas) e com tudo vendido: aí a
   * página não tem "Unidades" nem "Ver as unidades", e o preço é "Consulte".
   */
  plantas: PlantaDoEmpreendimento[];
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

  /**
   * No empreendimento, é o "a partir de": o menor preço entre as unidades
   * disponíveis, e nulo ("Consulte") sem a tabela do mês ou sem disponível.
   */
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
  /** "Sobre o imóvel": itens marcados e texto livre por categoria, já normalizados. */
  caracteristicas: CaracteristicasDoImovel;
  destaque: boolean;
  /** ISO 8601. Entra no sitemap como `lastModified`. */
  atualizadoEm: string;
  /** Nulo no imóvel comum (revenda, aluguel). */
  empreendimento: Empreendimento | null;
}

/**
 * Situações que aparecem nas listagens.
 *
 * Alugado e vendido saem da listagem, mas a página do imóvel continua no ar
 * (com aviso e sem indexação): ela pode estar num grupo de WhatsApp ou num
 * anúncio antigo, e um 404 ali é um lead perdido. A página mostra os parecidos.
 */
export const STATUS_NA_VITRINE: readonly PropertyStatus[] = ['disponivel', 'reservado'];
