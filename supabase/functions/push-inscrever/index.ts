import { CORS, json, admin, quemChamou } from '../_shared/wa.ts';

/**
 * Registra ou remove o aparelho que vai receber push.
 *
 * A organização vem do perfil de quem chamou, nunca do corpo — mesmo padrão de
 * `criar-corretor`.
 */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json({ erro: 'Método não permitido' }, 405);

  const sb = admin();

  try {
    const chamador = await quemChamou(req, sb);
    if (!chamador) return json({ erro: 'Sessão inválida.' }, 401);

    const corpo = await req.json().catch(() => null);
    const acao = String(corpo?.acao ?? 'inscrever');

    if (acao === 'remover') {
      const endpoint = String(corpo?.endpoint ?? '');
      if (!endpoint) return json({ erro: 'Endpoint ausente.' }, 400);
      await sb.from('push_subscriptions').delete().eq('endpoint', endpoint);
      return json({ removido: true });
    }

    const ins = corpo?.inscricao;
    const endpoint = String(ins?.endpoint ?? '');
    const p256dh = String(ins?.keys?.p256dh ?? '');
    const auth = String(ins?.keys?.auth ?? '');

    if (!endpoint.startsWith('https://') || !p256dh || !auth) {
      return json({ erro: 'Inscrição inválida.' }, 400);
    }

    /*
     * Conflito no ENDPOINT, e o aparelho troca de dono.
     *
     * É o caso real: um corretor sai e outro entra no mesmo navegador. Com
     * conflito no par (dono, endpoint), a inscrição antiga sobreviveria e o
     * aparelho passaria a receber aviso de duas pessoas. Aqui o dono é
     * sobrescrito junto com o login.
     */
    const { error } = await sb.from('push_subscriptions').upsert(
      {
        organization_id: chamador.orgId,
        profile_id: chamador.userId,
        endpoint,
        p256dh,
        auth,
        user_agent: String(corpo?.userAgent ?? '').slice(0, 200),
        last_seen_at: new Date().toISOString(),
        failure_count: 0,
      },
      { onConflict: 'endpoint' },
    );

    if (error) {
      console.error('push-inscrever:', error.message);
      return json({ erro: 'Não foi possível registrar o aparelho.' }, 500);
    }

    return json({ inscrito: true });
  } catch (e) {
    console.error('push-inscrever:', e);
    return json({ erro: 'Erro interno.' }, 500);
  }
});
