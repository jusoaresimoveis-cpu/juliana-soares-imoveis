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
} as const;

/**
 * Só a produção entra no Google.
 *
 * Toda pré-visualização da Vercel tem URL pública. Sem essa trava, o Google
 * indexa a versão de teste, e ela passa a competir com o site de verdade pelo
 * mesmo conteúdo.
 */
export const SITE_INDEXAVEL = process.env.VERCEL_ENV === 'production';
