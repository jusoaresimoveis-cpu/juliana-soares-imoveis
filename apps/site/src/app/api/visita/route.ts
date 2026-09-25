import { SITE } from '@/config/site';
import { configuracaoDoBanco } from '@/lib/imoveis/banco';

/**
 * Conta uma visita à página de um imóvel, a pedido da própria página
 * (`ContadorDeVisita`). O banco guarda por imóvel e por dia
 * (`registrar_visita`), e a Juliana vê o total na ficha do imóvel no CRM.
 *
 * Passa por aqui, e não do navegador direto ao banco, por dois motivos:
 *
 *   - o robô que respeita o `robots.txt` não chama `/api/`. O do Google executa
 *     o JavaScript da página, e sem isso contaria como visita;
 *   - só a produção conta. As pré-visualizações e o `next dev` ligado ao banco
 *     não inflam o número.
 */
export async function POST(request: Request) {
  if (process.env.VERCEL_ENV !== 'production') return new Response(null, { status: 204 });

  // Só a própria página chama. Quem forja a origem ainda passa, mas uma página
  // de outro site não conta visita aqui.
  const origem = request.headers.get('origin');
  if (origem && origem !== SITE.url) return new Response(null, { status: 403 });

  const corpo = (await request.json().catch(() => null)) as { codigo?: unknown } | null;
  const codigo = typeof corpo?.codigo === 'string' ? corpo.codigo : '';
  if (!/^[A-Za-z0-9]{1,12}$/.test(codigo)) return new Response(null, { status: 400 });

  const banco = configuracaoDoBanco();
  if (!banco) return new Response(null, { status: 204 });

  const resposta = await fetch(`${banco.url}/rest/v1/rpc/registrar_visita`, {
    method: 'POST',
    headers: { apikey: banco.chave, 'Content-Type': 'application/json' },
    body: JSON.stringify({ _organizacao: banco.organizacao, _codigo: codigo }),
    cache: 'no-store',
  });
  return new Response(null, { status: resposta.ok ? 204 : 502 });
}
