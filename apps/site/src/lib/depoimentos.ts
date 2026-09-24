/**
 * Depoimentos: as avaliações REAIS do Perfil da Empresa da Juliana no Google.
 *
 * HOJE: em produção a lista sai vazia e a seção não aparece. Para puxar todas
 * as avaliações é preciso a API do Perfil da Empresa, com acesso aprovado pelo
 * Google (a do Places devolve só 5). No `next dev` entram exemplos marcados,
 * só para desenhar o carrossel. Depoimento inventado publicado é propaganda
 * enganosa.
 */

export interface Depoimento {
  nome: string;
  cidade?: string;
  /** De 1 a 5. */
  nota: number;
  texto: string;
  /** Link da avaliação original, quando houver. */
  link?: string;
}

const EXEMPLOS: Depoimento[] = [
  { nome: '[EXEMPLO] Cliente 1', cidade: 'Itapema - SC', nota: 5, texto: 'Texto de exemplo só para desenhar o carrossel no desenvolvimento.' },
  { nome: '[EXEMPLO] Cliente 2', cidade: 'Porto Belo - SC', nota: 5, texto: 'Texto de exemplo. Os depoimentos reais virão das avaliações do Google.' },
  { nome: '[EXEMPLO] Cliente 3', cidade: 'Itapema - SC', nota: 5, texto: 'Texto de exemplo, um pouco mais longo, para ver como o cartão se comporta quando a avaliação ocupa mais de três linhas na tela do celular.' },
  { nome: '[EXEMPLO] Cliente 4', nota: 5, texto: 'Texto de exemplo.' },
];

export async function carregarDepoimentos(): Promise<Depoimento[]> {
  if (process.env.NODE_ENV === 'development') return EXEMPLOS;
  return [];
}
