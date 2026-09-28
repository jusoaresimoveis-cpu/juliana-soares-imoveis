import { CIDADES_ATENDIDAS } from '@juliana/contracts';

/**
 * Quem é a Juliana, do jeito que o Google precisa ler.
 *
 * Nome, endereço e telefone têm que ser IDÊNTICOS aos do Perfil da Empresa no
 * Google. Quando os dois divergem, o Google fica em dúvida se é o mesmo negócio,
 * e isso pesa justamente na busca local ("corretora em Itapema"). E existe uma
 * "Juliana Imóveis" na mesma cidade, sem relação com ela: o nome completo e o
 * CRECI em todo lugar são o que separa as duas.
 */
export const SITE = {
  nome: 'Juliana Soares Corretora de Imóveis',
  nomeCurto: 'Juliana Soares',
  url: 'https://julianasoaresimoveis.com.br',
  descricao:
    'Imóveis para alugar e à venda em Itapema e Porto Belo (SC) com a corretora Juliana Soares, CRECI/SC 53396-F.',
  creci: 'CRECI/SC 53396-F',
  telefone: {
    exibicao: '(47) 99735-4111',
    e164: '+5547997354111',
  },
  /** Só dígitos, que é como o wa.me aceita. */
  whatsapp: '5547997354111',
  /** O e-mail central das contas dela; na política de privacidade, é o canal dos pedidos de dados. */
  email: 'jusoaresimoveis@gmail.com',
  endereco: {
    logradouro: 'Rua 143, 40',
    complemento: 'Sala 08',
    bairro: 'Centro',
    cidade: 'Itapema',
    uf: 'SC',
    // CEP da rua ainda não confirmado. Fica fora em vez de ir o CEP geral da
    // cidade: dado de endereço errado é pior do que dado ausente.
  },
  areaAtendida: CIDADES_ATENDIDAS,
  redes: {
    instagram: 'https://www.instagram.com/julianassilvasc/',
  },
  /**
   * O widget da Trustindex com as avaliações do Perfil da Empresa no Google
   * (conta criada pelo usuário em 25/09/2026). Trocar o layout no painel deles
   * mantém este código. `null` tira a seção do site.
   */
  widgetDeAvaliacoes: '4187aac822083330d70624b8a38' as string | null,
} as const;

/**
 * Só a produção JÁ LANÇADA entra no Google.
 *
 * Toda pré-visualização da Vercel tem URL pública, e até o lançamento a
 * produção também vive num `.vercel.app`. Sem essa trava, o Google indexa uma
 * dessas versões, e ela passa a competir com o domínio oficial pelo mesmo
 * conteúdo. No dia do lançamento: `SITE_NO_AR=sim` nas variáveis de produção da
 * Vercel, junto com o domínio apontado.
 */
export const SITE_INDEXAVEL =
  process.env.VERCEL_ENV === 'production' && process.env.SITE_NO_AR === 'sim';
