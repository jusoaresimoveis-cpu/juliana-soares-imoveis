import { linkDoCanal } from '@/lib/whatsapp';

/**
 * `/w/<canal>` e `/w/<canal>/<imóvel>`: abrem o WhatsApp com o canal no código
 * (ver `linkDoCanal`).
 *
 * 302 e sem cache. Um 301 ficaria gravado no navegador de quem clicou, e uma
 * mensagem corrigida um dia nunca chegaria a essas pessoas.
 */
export async function GET(_pedido: Request, ctx: RouteContext<'/w/[...rota]'>) {
  const { rota } = await ctx.params;
  return new Response(null, {
    status: 302,
    headers: { Location: linkDoCanal(rota), 'Cache-Control': 'no-store' },
  });
}
