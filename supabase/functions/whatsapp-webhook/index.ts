import { admin, digest } from '../_shared/wa.ts';

/**
 * Recebe os eventos do provedor.
 *
 * Faz três coisas e só três: confere o segredo, grava o envelope e responde
 * 200. O trabalho caro acontece depois, quando o registro de duplicata já
 * existe.
 *
 * Na referência auditada esta função baixava vídeo e chamava transcrição ANTES
 * de gravar a linha. Provedor com timeout menor que isso reentregava, o teste
 * de duplicata não encontrava nada — a linha ainda não existia — e todo o
 * trabalho recomeçava, concorrente com o primeiro.
 *
 * `verify_jwt = false`: quem chama é o provedor, que não tem sessão. A
 * autenticação é o segredo no caminho.
 */

// Sem CORS: navegador nenhum chama isto. Liberar origem aqui só ampliaria a
// superfície de um endpoint sem sessão.
const ok = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  const sb = admin();

  try {
    /*
     * Identificadores no CAMINHO, não na query.
     *
     * Com `addUrlEvents: true` o provedor anexa o nome do evento como segmento
     * no fim da URL configurada. Na referência, que usava `?cid=<uuid>`, isso
     * colava no último parâmetro: o UUID virava `<uuid>/messages`, inválido, e
     * TODA escrita falhava em silêncio — o painel ficava zerado enquanto o
     * WhatsApp mostrava conectado.
     *
     * No caminho, o mesmo acréscimo vira um terceiro segmento inofensivo. E
     * ainda é aproveitado como fonte do tipo de evento.
     */
    const depois = new URL(req.url).pathname.split('/whatsapp-webhook/')[1] ?? '';
    const [instanciaId, segredo, segmentoEvento] = depois.split('/');

    if (!instanciaId || !segredo) return ok({ erro: 'rota inválida' }, 404);

    const { data: instancia } = await sb
      .from('whatsapp_instances')
      .select('id, organization_id, webhook_secret_hash')
      .eq('id', instanciaId)
      .single();

    // Resposta idêntica para "não existe" e "segredo errado": distinguir os dois
    // entrega ao atacante a confirmação de que o id existe.
    if (!instancia?.webhook_secret_hash) return ok({ erro: 'não autorizado' }, 401);

    const conferido = await digest(segredo);
    if (conferido !== instancia.webhook_secret_hash) return ok({ erro: 'não autorizado' }, 401);

    const corpo = await req.json().catch(() => null);
    if (!corpo) return ok({ erro: 'corpo inválido' }, 400);

    // Cascata de quatro fontes, na ordem em que o provedor costuma preencher.
    const evento =
      corpo.EventType ??
      corpo.event ??
      corpo.type ??
      new URL(req.url).searchParams.get('event') ??
      segmentoEvento ??
      'desconhecido';

    const msg = corpo.message ?? corpo.data ?? {};
    const eventoId = corpo.id ?? msg.id ?? msg.messageid ?? null;

    const { error } = await sb.from('whatsapp_inbox').insert({
      organization_id: instancia.organization_id,
      instance_id: instancia.id,
      provider_event_id: eventoId,
      event_type: String(evento),
      payload: corpo,
    });

    // Chave repetida é reentrega: já está na fila, e responder 200 faz o
    // provedor parar de tentar.
    if (error && error.code !== '23505') {
      console.error('inbox insert:', error.message);
      return ok({ erro: 'falha ao enfileirar' }, 500);
    }


    /*
     * Responde primeiro; processa depois.
     *
     * O `.then()` NÃO é decoração: `sb.rpc()` devolve um construtor preguiçoso
     * que só dispara a requisição quando alguém o encadeia. A primeira versão
     * daqui fazia `void processar`, que não encadeia nada — a chamada nunca
     * saía, e o item só era processado pelo cron do minuto seguinte. O teste
     * ponta a ponta pegou: fila ainda `pendente` cinco segundos depois.
     */
    const processar = sb.rpc('processar_inbox', { _limit: 20 }).then(
      ({ error }) => {
        if (error) console.error('processar_inbox:', error.message);
      },
      (e) => console.error('processar_inbox:', e),
    );

    // @ts-expect-error EdgeRuntime é global do Deno Deploy, sem tipo no editor.
    if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(processar);

    return ok({ recebido: true });
  } catch (e) {
    console.error('whatsapp-webhook:', e);
    // Detalhe fica no log. A referência devolvia rastro de pilha na resposta de
    // uma função sem autenticação.
    return ok({ erro: 'interno' }, 500);
  }
});
