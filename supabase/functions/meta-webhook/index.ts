import { admin, digest, assinaturaConfere, lerSegredo, idDaMeta } from '../_shared/meta.ts';

/**
 * Recebe os eventos de formulário de anúncio da Meta.
 *
 * Faz três coisas e só três: confere quem está falando, grava o envelope e
 * responde 200. Nenhuma chamada à Graph, nenhuma consulta de lead, nenhuma
 * notificação acontece aqui.
 *
 * O sistema auditado fazia, DENTRO da requisição e em série por lead: uma
 * chamada à Graph, uma varredura da tabela de leads inteira para a memória, o
 * insert e a notificação. A Meta corta em poucos segundos e REENTREGA por até
 * 36 horas o que não recebeu 200 — então o processamento lento não só demorava,
 * ele multiplicava o próprio trabalho, com as cópias rodando concorrentes.
 *
 * `verify_jwt = false`: quem chama é a Meta, que não tem sessão. A autenticação
 * é dupla — segredo no caminho E assinatura HMAC do corpo.
 */

// Sem CORS: navegador nenhum chama isto.
const responde = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });

/** Corpo maior que isto não é entrega legítima de formulário. */
const LIMITE_BYTES = 256 * 1024;
/** Nem lote maior que isto. */
const LIMITE_ENTRADAS = 50;

Deno.serve(async (req) => {
  const sb = admin();

  try {
    const depois = new URL(req.url).pathname.split('/meta-webhook/')[1] ?? '';
    const [integracaoId, segredo] = depois.split('/');
    if (!integracaoId || !segredo) return responde({ erro: 'rota inválida' }, 404);

    const { data: integracao } = await sb
      .from('meta_integrations')
      .select('id, organization_id, app_secret_id, webhook_secret_hash')
      .eq('id', integracaoId)
      .single();

    // Resposta idêntica para "não existe" e "segredo errado": distinguir os dois
    // confirma ao atacante que o id existe.
    if (!integracao?.webhook_secret_hash) return responde({ erro: 'não autorizado' }, 401);
    if ((await digest(segredo)) !== integracao.webhook_secret_hash) {
      return responde({ erro: 'não autorizado' }, 401);
    }

    /*
     * O aperto de mão da Meta, que só acontece na configuração.
     *
     * Ela chama com GET e espera o `hub.challenge` de volta em texto puro. O
     * `hub.verify_token` é conferido contra o mesmo segredo do caminho — não
     * existe um segundo segredo para esquecer de configurar.
     */
    if (req.method === 'GET') {
      const q = new URL(req.url).searchParams;
      const desafio = q.get('hub.challenge');
      if (q.get('hub.mode') === 'subscribe' && q.get('hub.verify_token') === segredo && desafio) {
        return new Response(desafio, { status: 200, headers: { 'Content-Type': 'text/plain' } });
      }
      return responde({ erro: 'não autorizado' }, 401);
    }

    if (req.method !== 'POST') return responde({ erro: 'método' }, 405);

    /*
     * O corpo CRU, e é ele que a assinatura cobre.
     *
     * Reserializar o JSON antes de conferir produz bytes diferentes e o HMAC
     * nunca bate. É por aí que times acabam "desligando a verificação porque
     * não funciona".
     */
    const corpoCru = await req.text();
    if (corpoCru.length > LIMITE_BYTES) return responde({ erro: 'corpo grande demais' }, 413);

    const appSecret = await lerSegredo(sb, integracao.app_secret_id);
    /*
     * SEGREDO AUSENTE É 401, NUNCA "PULA A VERIFICAÇÃO".
     *
     * Este é o defeito mais grave do sistema auditado, e o comentário dele
     * chega a descrever a intenção certa: "when a secret is configured a valid
     * signature is REQUIRED". Quando não estava configurado — coluna anulável,
     * campo opcional no formulário — nada era exigido, e o endpoint aceitava
     * qualquer POST anônimo. Bastava o page_id, que é público.
     */
    if (!appSecret) {
      console.error('meta-webhook: app_secret ausente no Vault para', integracao.id);
      return responde({ erro: 'não autorizado' }, 401);
    }

    const assinado = await assinaturaConfere(
      corpoCru,
      req.headers.get('x-hub-signature-256'),
      appSecret,
    );
    if (!assinado) return responde({ erro: 'não autorizado' }, 401);

    // Só agora o corpo vira objeto — depois de provado que veio de quem diz.
    let corpo: { object?: string; entry?: unknown[] };
    try {
      corpo = JSON.parse(corpoCru);
    } catch {
      return responde({ erro: 'corpo inválido' }, 400);
    }

    const entradas = Array.isArray(corpo.entry) ? corpo.entry.slice(0, LIMITE_ENTRADAS) : [];
    const linhas: Record<string, unknown>[] = [];

    for (const bruta of entradas) {
      const entrada = bruta as { id?: unknown; changes?: unknown[] };
      const pageId = idDaMeta(entrada.id);
      if (!pageId) continue;

      /*
       * A página precisa ser DESTA organização.
       *
       * O sistema auditado roteava só pelo page_id do corpo, e o vínculo era um
       * campo digitado à mão: quem digitasse o número de outra imobiliária
       * passava a receber os leads dela. Aqui a organização vem do caminho
       * autenticado, e o page_id só CONFIRMA.
       */
      const { data: pagina } = await sb
        .from('meta_pages')
        .select('page_id')
        .eq('organization_id', integracao.organization_id)
        .eq('page_id', pageId)
        .maybeSingle();

      for (const mudanca of (entrada.changes ?? []) as { field?: string; value?: unknown }[]) {
        if (mudanca.field !== 'leadgen') continue;
        const v = (mudanca.value ?? {}) as Record<string, unknown>;

        const leadgenId = idDaMeta(v.leadgen_id);
        if (!leadgenId) continue;

        linhas.push({
          organization_id: integracao.organization_id,
          /*
           * De QUAL CONEXÃO o evento chegou.
           *
           * A URL do webhook sempre carregou este id — é ela que autenticou a
           * chamada — e a linha do inbox o jogava fora. Com uma BM só ninguém
           * notava: o trabalhador redescobria o token pela organização. Com
           * duas, essa busca devolve duas linhas e o `.single()` erra; ou, pior,
           * acerta a errada e lê a Página de uma BM com a credencial da outra.
           */
          integration_id: integracao.id,
          leadgen_id: leadgenId,
          page_id: pageId,
          form_id: idDaMeta(v.form_id),
          payload: v,
          signature_ok: true,
          // Página desconhecida NÃO é descartada em silêncio: fica registrada
          // com o motivo. No sistema auditado isso era um `continue` e um 200,
          // então a Meta via 100% de entregas com sucesso enquanto o CRM
          // registrava zero leads, por semanas.
          status: pagina ? 'pendente' : 'descartado',
          motivo: pagina ? null : `página ${pageId} não pertence a esta organização`,
        });
      }
    }

    if (linhas.length > 0) {
      /*
       * `ignoreDuplicates` é a defesa contra reentrega, e é ela que substitui a
       * comparação de telefone que o sistema auditado usava. Quando o
       * formulário não pedia telefone, aquela comparação não achava nada e cada
       * reentrega criava um LEAD NOVO, consumindo uma posição da fila de
       * corretores por vez.
       */
      const { error } = await sb
        .from('meta_webhook_inbox')
        .upsert(linhas, { onConflict: 'organization_id,leadgen_id', ignoreDuplicates: true });

      if (error) {
        console.error('meta_webhook_inbox:', error.message);
        // 500 faz a Meta reentregar, que é o certo: o evento não foi guardado.
        return responde({ erro: 'falha ao enfileirar' }, 500);
      }
    }

    /*
     * Responde primeiro; processa depois.
     *
     * Se este disparo falhar, o cron pega em até um minuto — a fila é a fonte
     * da verdade, não esta chamada. Ela existe só para o lead chegar ao
     * corretor em segundos em vez de em um minuto, o que no imobiliário é a
     * diferença entre atender e perder.
     */
    const url = Deno.env.get('SUPABASE_URL');
    const segredoCron = Deno.env.get('META_CRON_SECRET');
    if (url && segredoCron && linhas.some((l) => l.status === 'pendente')) {
      const acorda = fetch(`${url}/functions/v1/meta-trabalhador`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Cron-Secret': segredoCron },
        body: '{}',
      }).catch((e) => console.error('acordar trabalhador:', e));

      // @ts-expect-error EdgeRuntime é global do Deno Deploy, sem tipo no editor.
      if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(acorda);
    }

    return responde({ recebido: linhas.length });
  } catch (e) {
    console.error('meta-webhook:', e);
    // Detalhe fica no log. O sistema auditado devolvia rastro de pilha na
    // resposta de um endpoint sem autenticação.
    return responde({ erro: 'interno' }, 500);
  }
});
