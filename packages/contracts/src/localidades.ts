/**
 * Onde a Juliana atua.
 *
 * As cidades são fixas: são a área de atendimento declarada no Perfil da
 * Empresa no Google, e o site precisa dizer a mesma coisa que o perfil.
 *
 * Os bairros NÃO são uma lista fixa. Eles saem dos imóveis publicados, pelo
 * `slugify` do campo bairro. Uma lista escrita à mão teria dois problemas: gera
 * página de bairro sem nenhum imóvel (o Google trata como conteúdo raso e isso
 * pesa contra o site inteiro), e fixa um nome que ninguém conferiu.
 */

export const CIDADES_ATENDIDAS = [
  { slug: 'itapema', nome: 'Itapema', uf: 'SC' },
  { slug: 'porto-belo', nome: 'Porto Belo', uf: 'SC' },
] as const;

export type CidadeAtendida = (typeof CIDADES_ATENDIDAS)[number];

export function cidadePeloSlug(slug: string): CidadeAtendida | null {
  return CIDADES_ATENDIDAS.find((cidade) => cidade.slug === slug) ?? null;
}

/**
 * "Meia Praia" → "meia-praia", "Perequê" → "pereque".
 *
 * O site e o CRM precisam chegar no MESMO slug a partir do mesmo nome, porque o
 * CRM vai montar link para a página do bairro. Por isso a função mora aqui.
 */
export function slugify(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
