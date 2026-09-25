import webpush from 'npm:web-push@3.6.7';
import { admin } from '../_shared/wa.ts';

/**
 * Esvazia a fila de push.
 *
 * Usa `npm:web-push` em vez de implementar o protocolo à mão. O CRM auditado
 * escreveu as ~200 linhas de criptografia (VAPID JWT + aes128gcm/ECDH/HKDF) e
 * carregava uma função morta e comprovadamente quebrada no meio delas — código
 * de criptografia caseiro que ninguém revisita é dívida com juros altos.
 *
 * Segredo PRÓPRIO do módulo, não compartilhado: na referência um único
 * `gcal_cron_secret` valia para Google Calendar, anúncios e WhatsApp.
 */

const ok = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });

const MAX_TENTATIVAS = 5;

/** Bytes de um base64url, ou null se não for base64 válido. */
function bytesDeB64Url(v: string): Uint8Array | null {
  try {
    const b64 = v.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

function b64UrlDeBytes(b: Uint8Array): string {
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * A chave privada nos 32 bytes crus que o `web-push` exige — aceitando também
 * o PKCS#8 que o `openssl` entrega.
 *
 * Esta função existe por causa de um defeito real: a chave em produção tinha
 * 138 bytes decodificados em vez de 32, e o worker morria em silêncio a cada
 * minuto desde 09/08. 138 é o tamanho de uma chave P-256 em PKCS#8/DER — o que
 * sai de `openssl ecparam -genkey`. Quem gerou fez o certo com a ferramenta
 * errada, e nada em lugar nenhum disse qual formato era esperado.
 *
 * Absorver os dois formatos é melhor do que trocar o segredo por três razões:
 * a chave PÚBLICA continua a mesma, então a inscrição que já existe no aparelho
 * segue valendo; não é preciso mexer em `VITE_VAPID_PUBLIC_KEY` no front, que
 * mora noutro provedor; e ninguém precisa se reinscrever.
 *
 * Dentro do PKCS#8 mora um ECPrivateKey, e nele a chave privada é o OCTET
 * STRING de 32 bytes logo depois da versão — a sequência `02 01 01 04 20`.
 * Procuro por esse marcador em vez de contar posições: deslocamento fixo quebra
 * calado quando o gerador acrescenta um campo opcional.
 */
function escalarVapid(priv: string): string | null {
  const b = bytesDeB64Url(priv);
  if (!b) return null;

  // Já no formato que o web-push quer.
  if (b.length === 32) return priv;

  for (let i = 0; i + 37 <= b.length; i++) {
    if (b[i] === 0x02 && b[i + 1] === 0x01 && b[i + 2] === 0x01 && b[i + 3] === 0x04 && b[i + 4] === 0x20) {
      return b64UrlDeBytes(b.slice(i + 5, i + 37));
    }
  }
  return null;
}

/**
 * O QUE ESTÁ ERRADO NA VAPID, sem dizer qual é a chave.
 *
 * Escrito depois de achar este worker devolvendo 500 a cada minuto desde
 * 19/08 — sessenta por hora, ininterruptos, com 117 avisos parados na fila e
 * `attempts = 0` em todos eles: o laço de envio nunca rodou uma vez.
 *
 * A causa era estrutural e vale mais do que a chave errada: `setVapidDetails`
 * ficava FORA do `try`. Ele valida formato e levanta — e o que levanta antes
 * do `try` não vira `{erro:'interno'}`, vira o "Internal Server Error" de
 * texto puro do runtime, sem uma linha dizendo o quê. Um erro de configuração
 * apareceu como defeito anônimo por oito dias.
 *
 * Devolve só TAMANHO e ESQUEMA. Uma chave privada num corpo de resposta que
 * fica gravado em `net._http_response` seria trocar um defeito por um
 * vazamento.
 */
function diagnosticoVapid(subject: string, pub: string, priv: string): string[] {
  const queixas: string[] = [];

  if (!/^(mailto:|https:\/\/)/.test(subject)) {
    queixas.push(`VAPID_SUBJECT precisa começar com "mailto:" ou "https://" (veio "${subject.split(':')[0]}...")`);
  }

  const bytes = (b64url: string): number => {
    try {
      const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
      return atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4)).length;
    } catch {
      return -1;
    }
  };

  const nPub = bytes(pub);
  if (nPub !== 65) {
    queixas.push(`VAPID_PUBLIC_KEY deveria ter 65 bytes decodificados, tem ${nPub < 0 ? 'base64 inválido' : nPub}`);
  }

  const nPriv = bytes(priv);
  if (nPriv !== 32) {
    queixas.push(`VAPID_PRIVATE_KEY deveria ter 32 bytes decodificados, tem ${nPriv < 0 ? 'base64 inválido' : nPriv}`);
  }

  return queixas;
}

Deno.serve(async (req) => {
  const esperado = Deno.env.get('PUSH_CRON_SECRET');
  if (!esperado) {
    // Falha ALTO. Credencial ausente que vira 401 silencioso a cada minuto foi
    // o defeito mais caro da referência.
    console.error('PUSH_CRON_SECRET ausente — recusando');
    return ok({ erro: 'worker não configurado' }, 503);
  }
  if (req.headers.get('X-Cron-Secret') !== esperado) return ok({ erro: 'não autorizado' }, 401);

  const priv = Deno.env.get('VAPID_PRIVATE_KEY');
  const pub = Deno.env.get('VAPID_PUBLIC_KEY');
  const subject = Deno.env.get('VAPID_SUBJECT');
  if (!priv || !pub || !subject) return ok({ erro: 'VAPID não configurado' }, 503);

  /*
   * DENTRO do try, e é a correção que importa.
   *
   * Este era o ponto exato onde o worker morria: configuração inválida virava
   * exceção não tratada, e o cron via um 500 opaco por minuto, para sempre.
   * Agora ela vira uma frase que diz o que consertar.
   */
  const privCru = escalarVapid(priv);
  if (!privCru) {
    const motivo = diagnosticoVapid(subject, pub, priv).join(' | ')
      || 'VAPID_PRIVATE_KEY não é nem 32 bytes crus nem um PKCS#8 reconhecível.';
    console.error('push-trabalhador: VAPID recusada —', motivo);
    return ok({ erro: 'VAPID inválida', motivo }, 503);
  }

  try {
    webpush.setVapidDetails(subject, pub, privCru);
  } catch (e) {
    const queixas = diagnosticoVapid(subject, pub, priv);
    const motivo = queixas.length ? queixas.join(' | ') : String((e as Error)?.message ?? e).slice(0, 200);
    console.error('push-trabalhador: VAPID recusada —', motivo);
    return ok({ erro: 'VAPID inválida', motivo }, 503);
  }

  const sb = admin();
  let enviados = 0;
  let mortos = 0;
  let falhas = 0;

  try {
    const { data: lote } = await sb
      .from('push_outbox')
      .select('id, subscription_id, payload, attempts')
      .eq('status', 'pendente')
      .lte('available_at', new Date().toISOString())
      .order('available_at')
      .limit(50);

    for (const item of lote ?? []) {
      const { data: sub } = await sb
        .from('push_subscriptions')
        .select('id, endpoint, p256dh, auth')
        .eq('id', item.subscription_id)
        .single();

      if (!sub) {
        await sb.from('push_outbox').update({ status: 'descartado', last_error: 'Inscrição removida' }).eq('id', item.id);
        continue;
      }

      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(item.payload),
          { TTL: 3600 },
        );

        await sb.from('push_outbox').update({
          status: 'enviado',
          sent_at: new Date().toISOString(),
          last_error: null,
        }).eq('id', item.id);

        await sb.from('push_subscriptions').update({
          last_success_at: new Date().toISOString(),
          failure_count: 0,
        }).eq('id', sub.id);

        enviados++;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode ?? 0;

        /*
         * 404 e 410 são a forma canônica de "este endpoint morreu": o usuário
         * desinstalou, limpou os dados ou o navegador expirou a inscrição.
         * Apagar é obrigatório — sem isso a fila tenta para sempre um destino
         * que nunca mais vai existir, e a taxa de erro deixa de significar algo.
         */
        if (status === 404 || status === 410) {
          await sb.from('push_subscriptions').delete().eq('id', sub.id);
          await sb.from('push_outbox').update({
            status: 'descartado',
            last_error: 'Aparelho não recebe mais (inscrição expirada)',
          }).eq('id', item.id);
          mortos++;
          continue;
        }

        const acabou = item.attempts + 1 >= MAX_TENTATIVAS;
        await sb.from('push_outbox').update({
          status: acabou ? 'falhou' : 'pendente',
          attempts: item.attempts + 1,
          last_error: `HTTP ${status || '?'}`,
          available_at: new Date(Date.now() + (item.attempts + 1) * 120_000).toISOString(),
        }).eq('id', item.id);

        await sb.rpc('incrementar_falha_push', { _id: sub.id }).catch(() => {});
        falhas++;
      }
    }

    return ok({ enviados, mortos, falhas });
  } catch (e) {
    console.error('push-trabalhador:', e);
    return ok({ erro: 'interno' }, 500);
  }
});
