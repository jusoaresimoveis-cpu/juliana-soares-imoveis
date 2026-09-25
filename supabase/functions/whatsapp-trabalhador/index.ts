import { admin, lerSegredo, provedor, traduzirEstado } from '../_shared/wa.ts';

/**
 * Esvazia a fila de saída.
 *
 * Chamado pelo cron do Postgres. Autentica por segredo PRÓPRIO do módulo: na
 * referência um único `gcal_cron_secret` era compartilhado entre Google
 * Calendar, anúncios e WhatsApp — quem tivesse esse segredo mandava WhatsApp em
 * nome de qualquer cliente.
 */

const ok = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  const esperado = Deno.env.get('WHATSAPP_CRON_SECRET');
  if (!esperado) {
    // Falha ALTO. Na referência a credencial ausente virava header nulo e a
    // chamada respondia 401 em silêncio, de minuto em minuto, para sempre.
    console.error('WHATSAPP_CRON_SECRET ausente — recusando por precaução');
    return ok({ erro: 'worker não configurado' }, 503);
  }
  if (req.headers.get('X-Cron-Secret') !== esperado) return ok({ erro: 'não autorizado' }, 401);

  const sb = admin();
  let enviadas = 0;
  let falhas = 0;

  try {
    // Reserva antes de trabalhar, e só o que já está na hora.
    const { data: lote } = await sb
      .from('whatsapp_outbox')
      .select('id, organization_id, instance_id, message_id, to_e164, body, attempts, max_attempts')
      .eq('status', 'pendente')
      .lte('next_attempt_at', new Date().toISOString())
      .order('next_attempt_at')
      .limit(20);

    for (const item of lote ?? []) {
      await sb.from('whatsapp_outbox').update({ status: 'enviando' }).eq('id', item.id);

      const { data: inst } = await sb
        .from('whatsapp_instances')
        .select('base_url, token_secret_id, status, label')
        .eq('id', item.instance_id)
        .single();

      const token = inst?.token_secret_id ? await lerSegredo(sb, inst.token_secret_id) : null;

      if (!inst || !token) {
        await marcarFalha(sb, item, 'Número sem credencial. Reconecte em Configurações.');
        falhas++;
        continue;
      }

      const r = await provedor(inst.base_url, '/send/text', {
        token,
        corpo: { number: item.to_e164.replace('+', ''), text: item.body },
      });

      if (r.ok) {
        const provId = (r.dados.id ?? r.dados.messageid) as string | undefined;
        await sb.from('whatsapp_outbox').update({
          status: 'enviada',
          sent_at: new Date().toISOString(),
          provider_message_id: provId ?? null,
          error: null,
        }).eq('id', item.id);

        await sb.from('whatsapp_messages').update({
          status: 'enviada',
          status_at: new Date().toISOString(),
          provider_message_id: provId ?? null,
          // O id do provedor também vira chave de duplicata: assim o eco do
          // próprio envio, se vier pelo webhook, é reconhecido e descartado.
          ...(provId ? { dedupe_key: provId } : {}),
        }).eq('id', item.message_id);

        enviadas++;
        continue;
      }

      // 401 e 404 significam credencial ou instância morta: rebaixa o número em
      // vez de continuar tentando. Na referência o envio falhava para sempre e
      // o status seguia dizendo "conectado".
      if (r.status === 401 || r.status === 404) {
        await sb.from('whatsapp_instances').update({
          status: 'desconectada',
          last_error: 'O provedor recusou a credencial. Reconecte o número.',
        }).eq('id', item.instance_id);

        await sb.rpc('create_notification', {
          _org: item.organization_id,
          _recipients: await gestores(sb, item.organization_id),
          _type: 'sistema',
          _title: `WhatsApp desconectado: ${inst.label}`,
          _body: 'O provedor recusou a credencial. Reconecte em Configurações.',
          _link_path: '/configuracoes?aba=whatsapp',
          _entity_type: 'whatsapp_instance',
          _entity_id: item.instance_id,
        });
      }

      await marcarFalha(sb, item, `Provedor respondeu HTTP ${r.status}`);
      falhas++;
    }

    /*
     * Mídia e foto são o trabalho MENOS importante deste worker, e os dois
     * únicos com rede de terceiro embaixo. Por isso cada um tem o seu `catch`.
     *
     * Sem ele, um defeito no download devolve 500 e derruba a resposta inteira
     * — inclusive o envio de mensagem, que é a razão de este arquivo existir.
     * Foi exatamente o que aconteceu na primeira subida, com o avatar.
     *
     * `baixarMidias` estava desprotegida, e só não tinha derrubado nada porque
     * nunca rodou: até a 125, `media_status` nascia sempre `sem_midia` e a
     * consulta de pendentes devolvia vazio. Com a 125 ela passa a fazer
     * trabalho de verdade, então ganha a mesma proteção.
     */
    let midias = 0;
    try {
      midias = await baixarMidias(sb);
    } catch (e) {
      console.error('baixarMidias:', e);
    }

    let fotos = 0;
    try {
      fotos = await baixarFotos(sb);
    } catch (e) {
      console.error('baixarFotos:', e);
    }

    const conferidos = await conferirNumeros(sb);
    return ok({ enviadas, falhas, midias, fotos, conferidos });
  } catch (e) {
    console.error('whatsapp-trabalhador:', e);
    return ok({ erro: 'interno' }, 500);
  }
});

/**
 * A foto do contato, para dentro de casa — e só a de quem é CLIENTE.
 *
 * O link chega de graça em toda mensagem e a tela usa ele direto para mostrar
 * qualquer conversa. Isto aqui é outra coisa: é a CÓPIA, e cópia muda o público
 * da imagem. Quem decide quem entra na fila é `whatsapp_fotos_pendentes`, que
 * só devolve conversa ligada a um lead — contato pessoal e grupo nunca chegam
 * aqui. A regra mora no banco de propósito, e não neste laço: assim ela vale
 * para qualquer caminho que venha a existir depois.
 *
 * Por que copiar, já que o link funciona: ele é assinado e vence em ~2 dias.
 * O cartão de um cliente que parou de escrever em março precisa ter rosto em
 * setembro, e o link de março morreu faz tempo.
 */
async function baixarFotos(sb: ReturnType<typeof admin>): Promise<number> {
  const { data: pendentes } = await sb.rpc('whatsapp_fotos_pendentes', { _limite: 10 });

  let prontas = 0;

  for (const c of (pendentes ?? []) as Array<{
    id: string;
    organization_id: string;
    foto_url: string;
    caminho_novo: string;
  }>) {
    const falhar = async (motivo: string) => {
      await sb.from('whatsapp_conversations')
        .update({ foto_erro: motivo, foto_em: new Date().toISOString() })
        .eq('id', c.id);
    };

    /*
     * A origem é conferida DE NOVO aqui.
     *
     * O gatilho do banco já barra o que não vem de `pps.whatsapp.net`, e mesmo
     * assim confiro: este laço roda com chave de serviço e faz uma requisição
     * de saída para onde a string mandar. Uma trava só é uma trava que, no dia
     * em que alguém mexer no gatilho, ninguém lembra que existia.
     */
    if (!c.foto_url?.startsWith('https://pps.whatsapp.net/')) {
      await falhar('Link de origem fora do CDN esperado.');
      continue;
    }

    let resposta: Response;
    try {
      /*
       * Timeout explícito. O `provedor()` compartilhado não tem nenhum, e um
       * CDN pendurado seguraria o trabalhador até o limite da Edge Function —
       * levando junto o envio de mensagem, que é o que ele faz de mais
       * importante. Uma foto não pode custar isso.
       */
      resposta = await fetch(c.foto_url, { signal: AbortSignal.timeout(10_000) });
    } catch {
      await falhar('O CDN não respondeu a tempo.');
      continue;
    }

    if (!resposta.ok) {
      // 403 é o caso comum e esperado: a assinatura do link venceu. A próxima
      // mensagem da pessoa traz uma nova, e a fila tenta de novo depois.
      await falhar(`O CDN recusou (HTTP ${resposta.status}).`);
      continue;
    }

    const mime = (resposta.headers.get('content-type') ?? '').split(';')[0].trim();
    if (!mime.startsWith('image/')) {
      await falhar(`O CDN devolveu ${mime || 'algo que não é imagem'}.`);
      continue;
    }

    const bytes = new Uint8Array(await resposta.arrayBuffer());

    // A miniatura de perfil tem ~1 KB e 96x96. Um megabyte aqui significa que
    // veio outra coisa no lugar, e o teto evita descobrir isso pela conta.
    if (bytes.length === 0 || bytes.length > 1_000_000) {
      await falhar(`Tamanho inesperado (${bytes.length} bytes).`);
      continue;
    }

    /*
     * A pasta é o id da organização, como manda a policy do bucket, que separa
     * imobiliária por `(storage.foldername(name))[1]`. O nome do arquivo é o id
     * da CONVERSA — assim a foto nova sobrescreve a antiga e não sobra rastro
     * de imagem velha de ninguém.
     */
    const ext = mime.split('/')[1]?.split('+')[0] ?? 'jpg';
    const caminho = `${c.organization_id}/avatar/${c.id}.${ext}`;

    const { error } = await sb.storage
      .from('whatsapp-media')
      .upload(caminho, bytes, { contentType: mime, upsert: true });

    if (error) {
      await falhar('Falha ao guardar a foto.');
      continue;
    }

    await sb.from('whatsapp_conversations').update({
      foto_path: caminho,
      // O caminho da URL (sem a assinatura) é o que diz "esta imagem já está
      // em casa". Enquanto ele não mudar, a fila não pede de novo.
      foto_origem: c.caminho_novo,
      foto_em: new Date().toISOString(),
      foto_erro: null,
    }).eq('id', c.id);

    prontas++;
  }

  return prontas;
}

/**
 * Traz a mídia recebida para dentro de casa.
 *
 * Rehospedar é obrigatório, não zelo: o link do provedor expira em cerca de dois
 * dias, e um histórico com links mortos apodrece sozinho — o corretor abre uma
 * conversa de três meses atrás para conferir um comprovante e não encontra nada.
 *
 * O destino é o bucket `whatsapp-media`, PRIVADO. Cliente manda RG, comprovante
 * de renda e contrato: nada disso pode ter URL aberta. Na referência este bucket
 * era público com policy para o papel `public` sem filtro nenhum.
 */
async function baixarMidias(sb: ReturnType<typeof admin>): Promise<number> {
  const { data: pendentes } = await sb
    .from('whatsapp_messages')
    .select('id, organization_id, instance_id, provider_message_id, kind, media_mime')
    .eq('media_status', 'pendente')
    .not('provider_message_id', 'is', null)
    /*
     * ORDEM, e um lote pequeno. A 127 conta a história inteira.
     *
     * Sem ordem, a consulta reencontra as mesmas linhas a cada execução — e se
     * as primeiras forem vídeos grandes que não terminam a tempo, a fila para
     * de andar para todo o resto. Aconteceu: nove arquivos baixaram e depois
     * zero por meia hora.
     *
     * Do mais novo para o mais velho porque é o que o corretor tem na tela
     * agora. Quatro por vez cabem com folga nos 25 s, e ainda são 5.760 por dia.
     */
    .order('occurred_at', { ascending: false })
    .limit(4);

  let prontas = 0;

  /*
   * ORÇAMENTO DE BYTES, e não só de quantidade.
   *
   * A 127 resolveu o RELÓGIO (o `pg_net` desistia em 5 s) e deixou passar a
   * MEMÓRIA. A Edge Function tem 150 MB, e o provedor entrega mídia em base64:
   * um vídeo de 9 MB vira ~12 MB de string, mais o `atob`, mais o array, mais o
   * corpo do upload. Quatro vídeos na mesma execução estouram — e quando
   * estouram, nada é marcado, a consulta reencontra os MESMOS quatro no minuto
   * seguinte e a fila para de andar para sempre.
   *
   * Aconteceu duas vezes em 23/09, com `WORKER_RESOURCE_LIMIT` de minuto em
   * minuto e a fila parada por quase duas horas.
   *
   * Com o orçamento, arquivo pequeno continua saindo de quatro em quatro e
   * vídeo grande sai um por execução — que ainda são 1.440 por dia.
   */
  const TETO_POR_EXECUCAO = 8_000_000;
  /*
   * E um teto de TEMPO para o laço inteiro.
   *
   * O `pg_net` desiste da execução em 25 s. Quatro arquivos a oito segundos
   * cada já passam disso — e execução que não termina é execução que não marca
   * nada, com a fila voltando ao mesmo lugar no minuto seguinte. Doze segundos
   * aqui mais oito do último arquivo cabem com folga nos 25.
   */
  const TETO_DE_TEMPO_MS = 12_000;
  const comecou = Date.now();
  let bytesNoRun = 0;

  for (const m of pendentes ?? []) {
    if (bytesNoRun > TETO_POR_EXECUCAO) break;
    if (Date.now() - comecou > TETO_DE_TEMPO_MS) break;

    const { data: inst } = await sb
      .from('whatsapp_instances')
      .select('base_url, token_secret_id')
      .eq('id', m.instance_id)
      .single();

    const token = inst?.token_secret_id ? await lerSegredo(sb, inst.token_secret_id) : null;
    if (!inst || !token) {
      await sb.from('whatsapp_messages')
        .update({ media_status: 'falhou', error: 'Número sem credencial para baixar a mídia.' })
        .eq('id', m.id);
      continue;
    }

    /*
     * Oito segundos por ARQUIVO, e o erro vira `falhou` em vez de derrubar a
     * execução.
     *
     * O `pg_net` desiste da execução inteira em 25 s. Sem teto por arquivo, um
     * único download lento gasta esses 25 s sozinho, ninguém é marcado, e no
     * minuto seguinte a consulta devolve o mesmo arquivo — a fila inteira fica
     * refém dele. Medido em 23/09: a fila parou por quase duas horas assim.
     */
    let r: Awaited<ReturnType<typeof provedor>>;
    try {
      r = await provedor(inst.base_url, '/message/download', {
        token,
        corpo: { id: m.provider_message_id, return_link: true, return_base64: true },
        tetoMs: 8_000,
      });
    } catch {
      await sb.from('whatsapp_messages')
        .update({ media_status: 'falhou', error: 'O provedor demorou demais para entregar.' })
        .eq('id', m.id);
      continue;
    }

    const base64 = (r.dados.base64Data ?? r.dados.base64) as string | undefined;
    const mime = String(r.dados.mimetype ?? m.media_mime ?? 'application/octet-stream')
      .split(';')[0]
      .trim();

    if (!r.ok || !base64) {
      await sb.from('whatsapp_messages')
        .update({ media_status: 'falhou', error: `Download recusado (HTTP ${r.status})` })
        .eq('id', m.id);
      continue;
    }

    /*
     * Grande demais para decodificar: marca e segue.
     *
     * Sem esta guarda, um único arquivo enorme trava a fila inteira — ele nunca
     * termina, nunca é marcado, e volta a ser o primeiro da lista no minuto
     * seguinte. `falhou` é a verdade sobre ele e deixa os outros passarem.
     */
    if (base64.length > 24_000_000) {
      await sb.from('whatsapp_messages')
        .update({ media_status: 'falhou', error: 'Arquivo grande demais para copiar.' })
        .eq('id', m.id);
      continue;
    }

    // O provedor às vezes devolve o data URI inteiro.
    const puro = /^data:.+?;base64,(.+)$/.exec(base64)?.[1] ?? base64;
    const bytes = Uint8Array.from(atob(puro), (c) => c.charCodeAt(0));

    // A pasta é o id da organização: é assim que a policy do bucket separa uma
    // imobiliária da outra, com `(storage.foldername(name))[1]`.
    const ext = mime.split('/')[1]?.split('+')[0] ?? 'bin';
    const caminho = `${m.organization_id}/${m.id}.${ext}`;

    const { error } = await sb.storage
      .from('whatsapp-media')
      .upload(caminho, bytes, { contentType: mime, upsert: true });

    if (error) {
      await sb.from('whatsapp_messages')
        .update({ media_status: 'falhou', error: 'Falha ao guardar a mídia.' })
        .eq('id', m.id);
      continue;
    }

    await sb.from('whatsapp_messages').update({
      media_status: 'pronta',
      media_path: caminho,
      media_mime: mime,
      media_bytes: bytes.length,
      error: null,
    }).eq('id', m.id);

    bytesNoRun += bytes.length;
    prontas++;
  }

  return prontas;
}

async function marcarFalha(
  sb: ReturnType<typeof admin>,
  item: { id: string; message_id: string; attempts: number; max_attempts: number },
  motivo: string,
) {
  const acabou = item.attempts + 1 >= item.max_attempts;

  await sb.from('whatsapp_outbox').update({
    status: acabou ? 'falhou' : 'pendente',
    attempts: item.attempts + 1,
    error: motivo,
    // Espera crescente entre tentativas.
    next_attempt_at: new Date(Date.now() + (item.attempts + 1) * 60_000).toISOString(),
  }).eq('id', item.id);

  if (acabou) {
    // A LINHA CONTINUA NA THREAD, marcada. É a diferença que importa: na
    // referência a mensagem sumia do histórico e o corretor achava que enviou.
    await sb.from('whatsapp_messages').update({
      status: 'falhou',
      error: motivo,
      status_at: new Date().toISOString(),
    }).eq('id', item.message_id);
  }
}

async function gestores(sb: ReturnType<typeof admin>, orgId: string): Promise<string[]> {
  const { data } = await sb
    .from('user_roles')
    .select('user_id, role')
    .eq('organization_id', orgId)
    .in('role', ['admin', 'gerente']);
  return (data ?? []).map((r) => r.user_id as string);
}

/**
 * Pergunta ao provedor se o número ainda está lá.
 *
 * O vigia (`whatsapp_saude`) marca `credenciada_offline` quando `last_seen_at`
 * passa da janela — e até aqui NINGUÉM nunca perguntava nada ao provedor. Esse
 * campo só era tocado quando chegava mensagem ou quando alguém abria a tela de
 * configuração. Ou seja: o vigia media o NOSSO TRÁFEGO e chamava isso de saúde
 * do número.
 *
 * O efeito aparecia toda manhã. Madrugada sem mensagem, o número é declarado
 * morto, `enfileirar_mensagem` recusa todo envio, e o corretor abre o CRM com
 * "número não conectado" enquanto o WhatsApp dele está perfeitamente ligado.
 * Ausência de mensagem não é prova de desconexão — é prova de silêncio.
 *
 * Só pergunta para quem está QUIETO há mais de três minutos: número movimentado
 * já se prova vivo pelo próprio tráfego, e uma chamada por minuto por instância
 * seria pagar para saber o que já se sabe.
 */
async function conferirNumeros(sb: ReturnType<typeof admin>): Promise<number> {
  const limite = new Date(Date.now() - 3 * 60_000).toISOString();

  const { data: instancias } = await sb
    .from('whatsapp_instances')
    .select('id, base_url, token_secret_id, status, last_seen_at')
    .not('token_secret_id', 'is', null)
    // `desconectada` fica de fora: é logout de verdade, e quem desfaz isso é
    // uma pessoa lendo o QR, não uma consulta.
    .in('status', ['conectada', 'credenciada_offline', 'pareando'])
    .or(`last_seen_at.is.null,last_seen_at.lt.${limite}`)
    .limit(10);

  let n = 0;
  for (const inst of instancias ?? []) {
    const token = await lerSegredo(sb, String(inst.token_secret_id));
    if (!token) continue;

    const r = await provedor(String(inst.base_url), '/instance/status', {
      token,
      metodo: 'GET',
    });

    /*
     * Provedor fora do ar não é número fora do ar.
     *
     * Um timeout ou um 502 dizem que NÓS não conseguimos perguntar, e derrubar
     * o número por causa disso trocaria uma indisponibilidade deles por uma
     * nossa. Fica como está e tenta de novo no minuto seguinte.
     */
    if (!r.ok) continue;

    const dentro = (r.dados.instance as Record<string, unknown>) ?? {};
    const estado = traduzirEstado(dentro.status ?? r.dados.state ?? r.dados.status);

    // Palavra desconhecida não rebaixa — a lição da 069. Mas o silêncio foi
    // quebrado: conseguimos falar com o provedor, então o número deu sinal.
    const patch: Record<string, unknown> = { last_seen_at: new Date().toISOString() };
    if (estado !== 'erro') {
      patch.status = estado;
      patch.last_error = null;
    }

    await sb.from('whatsapp_instances').update(patch).eq('id', inst.id);
    n++;
  }

  return n;
}
