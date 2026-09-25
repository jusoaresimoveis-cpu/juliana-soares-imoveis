/**
 * Onde o site lê os imóveis: o mesmo Supabase do CRM, pela chave pública.
 *
 * A chave publicável é feita para ser pública; quem protege o dado é o banco.
 * O site só alcança a função `site_imoveis`, que devolve o que já está
 * publicado e nada além disso (sem dono, observação interna ou endereço que a
 * Juliana não liberou).
 *
 * Sem as variáveis, o site segue sem banco: no `next dev` com os imóveis de
 * exemplo, e em produção com a vitrine vazia. É o estado de antes do
 * lançamento, e não pode derrubar o build.
 */
export interface ConfiguracaoDoBanco {
  url: string;
  chave: string;
  /** `slug` da organização da Juliana no CRM. */
  organizacao: string;
}

export function configuracaoDoBanco(): ConfiguracaoDoBanco | null {
  const url = process.env.SUPABASE_URL?.replace(/\/+$/, '');
  const chave = process.env.SUPABASE_PUBLISHABLE_KEY;
  const organizacao = process.env.SITE_ORGANIZACAO;
  if (!url || !chave || !organizacao) return null;
  return { url, chave, organizacao };
}

/** As fotos ficam no bucket público do CRM. O caminho gravado é relativo a ele. */
export function urlDaFoto(urlDoBanco: string, caminho: string): string {
  const semBarra = caminho.replace(/^\/+/, '');
  return `${urlDoBanco}/storage/v1/object/public/property-media/${semBarra.split('/').map(encodeURIComponent).join('/')}`;
}
