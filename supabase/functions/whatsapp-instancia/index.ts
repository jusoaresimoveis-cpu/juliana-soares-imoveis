import {
  CORS,
  servir,
  json,
  admin,
  quemChamou,
  guardarSegredo,
  lerSegredo,
  segredoDeWebhook,
  digest,
  provedor,
  traduzirEstado,
} from '../_shared/wa.ts';

/**
 * Conectar, consultar e desconectar um número de WhatsApp.
 *
 * As três ações numa função só porque compartilham autenticação, resolução de
 * organização e cliente do provedor — separar em três daria três cópias da
 * mesma verificação, que é onde as divergências nascem.
 *
 * Endpoints do provedor confirmados lendo o cliente da referência
 * (`_shared/uazapi.ts`), não inventados:
 *   POST /instance/init      (admintoken)  → cria e devolve o token da instância
 *   GET  /instance/status    (token)       → estado + QR
 *   POST /instance/connect   (token)       → inicia o pareamento
 *   POST /instance/disconnect(token)       → encerra a sessão, mantém a instância
 *   DELETE /instance         (token)       → remove a instância
 *   POST /webhook            (token)       → registra o recebimento
 */

const EVENTOS = ['messages', 'messages_update', 'connection'];

/**
 * O número é de quem o conectou.
 *
 * A instância é lida com `service_role`, que ignora RLS — então a comparação
 * tem de acontecer AQUI, à mão. Ler pela policy não serviria: a função precisa
 * distinguir "não existe" de "existe e não é seu", e a policy devolve a mesma
 * resposta para os dois.
 */
async function podeMexer(
  sb: ReturnType<typeof admin>,
  chamador: { userId: string; orgId: string; gestor: boolean },
  instanciaId: string,
): Promise<boolean> {
  if (chamador.gestor) return true;
  const { data } = await sb
    .from('whatsapp_instances')
    .select('owner_id')
    .eq('id', instanciaId)
    .eq('organization_id', chamador.orgId)
    .maybeSingle();
  return !!data && data.owner_id === chamador.userId;
}

// `servir` carimba a origem na saída — inclusive no preflight, que é onde o
// navegador decide se vai mandar a chamada — e segura exceção que escape do
// handler. Sem ele, um erro não tratado sai como 500 SEM cabeçalho de origem, e
// o navegador transforma isso em "erro de rede", que manda investigar a coisa
// errada.
servir(tratar);

async function tratar(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json({ erro: 'Método não permitido' }, 405);

  const sb = admin();

  try {
    const chamador = await quemChamou(req, sb);
    if (!chamador) return json({ erro: 'Sessão inválida.' }, 401);

    const corpo = await req.json().catch(() => ({}));
    const acao = String(corpo?.acao ?? '');
    const instanciaId = corpo?.instanciaId ? String(corpo.instanciaId) : null;

    /*
     * A permissão passou a ser por NÚMERO, e não por papel.
     *
     * Antes era papel puro: só gerente e administrador mexiam em qualquer
     * coisa. Isso deixava a corretora sem conseguir conectar o próprio celular
     * — e o pareamento é um QR CODE que ela precisa ler no aparelho dela. Com
     * a regra por papel, conectar o número dela exigiria o gerente com o
     * telefone dela na mão.
     *
     * Agora: quem é dono do número manda no número dele; a gestão manda em
     * todos. Quantos números cada um pode ter é problema do banco — a 080 põe
     * o teto de um por corretor, e a 010 o teto do que a imobiliária contratou.
     */
    if (acao === 'desconectar' && corpo?.remover === true && !chamador.gestor) {
      /*
       * REMOVER é diferente de desconectar, e por isso continua da gestão.
       *
       * Desconectar encerra a sessão e o número volta com o mesmo QR. Remover
       * apaga a instância no provedor e o token do Vault: devolve um recurso
       * pago e leva junto o vínculo das conversas com aquele número. Não é uma
       * ação que alguém deva conseguir fazer sozinho num momento de irritação.
       */
      return json({ erro: 'Só gerente ou administrador remove um número.' }, 403);
    }

    if (instanciaId && !(await podeMexer(sb, chamador, instanciaId))) {
      // A MESMA frase de número inexistente, de propósito: confirmar que o id
      // existe já conta ao curioso que ele acertou o palpite.
      return json({ erro: 'Número não encontrado.' }, 404);
    }

    if (acao === 'conectar') return await conectar(sb, chamador, corpo);
    if (acao === 'status') return await status(sb, chamador, corpo);
    if (acao === 'desconectar') return await desconectar(sb, chamador, corpo);
    return json({ erro: 'Ação desconhecida.' }, 400);
  } catch (e) {
    console.error('whatsapp-instancia:', e);
    return json({ erro: 'Erro interno.' }, 500);
  }
}

// -----------------------------------------------------------------------------

async function conectar(
  sb: ReturnType<typeof admin>,
  chamador: { userId: string; orgId: string },
  corpo: Record<string, unknown>,
) {
  const rotulo = String(corpo?.rotulo ?? '').trim();
  const instanciaId = corpo?.instanciaId ? String(corpo.instanciaId) : null;

  const baseUrl = Deno.env.get('UAZAPI_BASE_URL') ?? '';
  const adminToken = Deno.env.get('UAZAPI_ADMIN_TOKEN') ?? '';
  if (!baseUrl || !adminToken) {
    // Falha alto. Na referência, credencial ausente virava header nulo e a
    // chamada respondia erro em silêncio, de minuto em minuto.
    console.error('UAZAPI_BASE_URL ou UAZAPI_ADMIN_TOKEN ausentes');
    return json({ erro: 'Integração de WhatsApp não configurada no servidor.' }, 503);
  }

  // Reconectar uma instância existente, ou provisionar uma nova.
  let linha: Record<string, unknown> | null = null;

  if (instanciaId) {
    const { data } = await sb
      .from('whatsapp_instances')
      .select('*')
      .eq('id', instanciaId)
      .eq('organization_id', chamador.orgId)
      .single();
    if (!data) return json({ erro: 'Número não encontrado.' }, 404);
    linha = data;
  } else {
    if (rotulo.length < 2) return json({ erro: 'Dê um nome ao número (ex: "Plantão Moema").' }, 400);

    // O INSERT vem primeiro de propósito: o gatilho da 010 checa o teto sob
    // advisory lock. Provisionar no provedor antes seria pagar por uma
    // instância que o banco vai recusar.
    const { data, error } = await sb
      .from('whatsapp_instances')
      .insert({
        organization_id: chamador.orgId,
        label: rotulo,
        base_url: baseUrl,
        created_by: chamador.userId,
        /*
         * Quem conecta o número é o DONO dele, e isso decide privacidade.
         *
         * `owner_id` existe desde a 010 e nunca era preenchido — o ramo "a
         * conversa é do dono do número" nas policies era código morto. Desde a
         * 067 é ele quem define quem enxerga as conversas pessoais daquele
         * número, e ninguém mais. Nascer nulo aqui significaria um número cujas
         * conversas particulares não têm dono — ou seja, invisíveis para todos.
         */
        owner_id: chamador.userId,
        status: 'desconectada',
      })
      .select('*')
      .single();

    if (error) {
      /*
       * A frase do GATILHO chega inteira ao usuário.
       *
       * O teto da imobiliária (010) e o de um número por corretor (080) usam
       * `raise ... using errcode = 'check_violation'` com um texto escrito para
       * ser lido por gente. Reescrevê-lo aqui criaria uma segunda versão da
       * mesma regra, e é a daqui que ficaria para trás quando o teto mudar.
       *
       * A negativa exclui a violação de constraint DE VERDADE, que tem o
       * formato "violates check constraint" e nome de objeto interno dentro —
       * isso não vai para a tela.
       */
      const doGatilho = error.code === '23514' && !/violates check constraint/i.test(error.message);
      const repetido = error.code === '23505';
      return json(
        {
          erro: doGatilho
            ? error.message
            : repetido
              ? 'Já existe um número com esse nome.'
              : 'Não foi possível registrar o número.',
        },
        doGatilho || repetido ? 409 : 500,
      );
    }
    linha = data;
  }

  const id = String(linha.id);

  // Token da instância: cria no provedor se ainda não existe.
  let token = linha.token_secret_id ? await lerSegredo(sb, String(linha.token_secret_id)) : null;

  if (!token) {
    const nome = `sc_${chamador.orgId.slice(0, 8)}_${id.slice(0, 8)}`;
    const r = await provedor(baseUrl, '/instance/init', { adminToken, corpo: { name: nome } });
    const novo = (r.dados.token ?? r.dados.apikey) as string | undefined;

    if (!r.ok || !novo) {
      await sb.from('whatsapp_instances').update({
        status: 'erro',
        last_error: `Provedor recusou a criação (HTTP ${r.status})`,
      }).eq('id', id);
      return json({ erro: 'O provedor recusou a criação do número.' }, 502);
    }

    token = novo;
    const secretId = await guardarSegredo(sb, `wa_token_${id}`, novo);
    await sb.from('whatsapp_instances').update({
      token_secret_id: secretId,
      provider_instance_name: (r.dados.name as string) ?? nome,
      provider_instance_id:
        ((r.dados.instance as Record<string, unknown>)?.id as string) ??
        (r.dados.id as string) ??
        null,
    }).eq('id', id);
  }

  // Webhook: segredo novo a cada conexão, guardado só como digest.
  const segredo = segredoDeWebhook();
  const urlWebhook = `${Deno.env.get('SUPABASE_URL')}/functions/v1/whatsapp-webhook/${id}/${segredo}`;

  const rw = await provedor(baseUrl, '/webhook', {
    token,
    corpo: {
      url: urlWebhook,
      events: EVENTOS,
      // Explícito porque o provedor cria com `false` em silêncio — bug de
      // produção já pago na referência.
      enabled: true,
      // Não queremos o eco do que nós mesmos mandamos.
      excludeMessages: ['wasSentByApi'],
      addUrlEvents: true,
    },
  });

  await sb.from('whatsapp_instances').update({
    webhook_secret_hash: await digest(segredo),
    webhook_rotated_at: new Date().toISOString(),
    // Só grava se o provedor confirmou. Na referência isto era incondicional,
    // com um `.catch(() => {})` que nem pegava erro HTTP — a tela dizia
    // "recebimento configurado" enquanto nenhuma mensagem entrava.
    webhook_configured_at: rw.ok ? new Date().toISOString() : null,
    last_error: rw.ok ? null : `Webhook recusado (HTTP ${rw.status})`,
  }).eq('id', id);

  // Inicia o pareamento e devolve o QR — que NUNCA é persistido.
  const rc = await provedor(baseUrl, '/instance/connect', { token, corpo: {} });
  const qr =
    (rc.dados.qrcode as string) ??
    ((rc.dados.instance as Record<string, unknown>)?.qrcode as string) ??
    null;

  await sb.from('whatsapp_instances').update({
    status: qr ? 'pareando' : traduzirEstado(rc.dados.status ?? rc.dados.state),
    last_seen_at: new Date().toISOString(),
  }).eq('id', id);

  return json({ id, qrcode: qr, webhookOk: rw.ok });
}

// -----------------------------------------------------------------------------

async function status(
  sb: ReturnType<typeof admin>,
  chamador: { orgId: string },
  corpo: Record<string, unknown>,
) {
  const id = String(corpo?.instanciaId ?? '');
  const { data: linha } = await sb
    .from('whatsapp_instances')
    .select('id, base_url, token_secret_id')
    .eq('id', id)
    .eq('organization_id', chamador.orgId)
    .single();

  if (!linha) return json({ erro: 'Número não encontrado.' }, 404);
  if (!linha.token_secret_id) return json({ status: 'desconectada', qrcode: null });

  const token = await lerSegredo(sb, String(linha.token_secret_id));
  if (!token) return json({ erro: 'Credencial indisponível.' }, 500);

  const r = await provedor(String(linha.base_url), '/instance/status', {
    token,
    metodo: 'GET',
  });

  const inst = (r.dados.instance as Record<string, unknown>) ?? {};

  /*
   * O estado ANINHADO manda, e isso custou o primeiro dia do cliente no ar.
   *
   * O número da imobiliária de origem pareou, o webhook recebeu `{instance:{status:"connected"}}`
   * e as mensagens começaram a chegar — mas esta consulta gravou `erro`, porque
   * lia o `status` do NÍVEL DE CIMA do envelope, que carrega outra coisa. Com a
   * instância em `erro`, `enfileirar_mensagem` recusa toda resposta e a landing
   * page esconde o botão de WhatsApp: o número funcionava e o CRM inteiro se
   * comportava como se estivesse quebrado.
   *
   * `instance.status` é o mesmo campo que o webhook entrega, no mesmo
   * vocabulário — é a fonte que já provou estar certa.
   */
  const bruto = inst.status ?? r.dados.state ?? r.dados.status;
  const estado = traduzirEstado(bruto);

  /*
   * Palavra desconhecida NÃO é defeito.
   *
   * `traduzirEstado` devolve 'erro' tanto para "o provedor disse que quebrou"
   * quanto para "não conheço essa palavra" — e as duas coisas não são a mesma.
   * Rebaixar por desconhecimento desliga o envio de um número que está
   * funcionando. Quando não dá para reconhecer, o estado anterior fica de pé e
   * a palavra crua vai para `last_error`, que é onde alguém vai procurar.
   */
  const reconhecido = estado !== 'erro';
  const cru = String(bruto ?? '').slice(0, 40);
  const qr = (r.dados.qrcode as string) ?? (inst.qrcode as string) ?? null;

  const telefoneBruto = (inst.owner as string) ?? (r.dados.owner as string) ?? null;
  const digitos = telefoneBruto?.split(':')[0]?.split('@')[0]?.replace(/\D/g, '') ?? '';

  // PERSISTE. Na referência o estado só era escrito ao clicar em conectar, e a
  // tela repetia "conectado" enquanto o envio falhava para sempre.
  await sb.from('whatsapp_instances').update({
    // `status` sai do objeto quando não foi reconhecido: o que estava gravado
    // continua valendo.
    ...(reconhecido ? { status: estado } : {}),
    last_seen_at: new Date().toISOString(),
    connected_phone_e164: digitos.length >= 10 ? `+${digitos}` : null,
    connected_name: (inst.profileName as string) ?? (r.dados.profileName as string) ?? null,
    last_error: !r.ok
      ? `Provedor respondeu HTTP ${r.status}`
      : reconhecido
        ? null
        : `Estado não reconhecido do provedor: "${cru}"`,
  }).eq('id', id);

  // Para a tela, o que vale é o que está gravado — não a palavra que não
  // entendemos. Sem isto o botão de conectar reapareceria a cada consulta.
  if (!reconhecido) {
    const { data: atual } = await sb
      .from('whatsapp_instances')
      .select('status')
      .eq('id', id)
      .single();
    return json({ status: atual?.status ?? 'desconectada', qrcode: qr });
  }

  return json({ status: estado, qrcode: qr });
}

// -----------------------------------------------------------------------------

async function desconectar(
  sb: ReturnType<typeof admin>,
  chamador: { orgId: string },
  corpo: Record<string, unknown>,
) {
  const id = String(corpo?.instanciaId ?? '');
  const remover = corpo?.remover === true;

  const { data: linha } = await sb
    .from('whatsapp_instances')
    .select('id, base_url, token_secret_id')
    .eq('id', id)
    .eq('organization_id', chamador.orgId)
    .single();

  if (!linha) return json({ erro: 'Número não encontrado.' }, 404);

  const token = linha.token_secret_id ? await lerSegredo(sb, String(linha.token_secret_id)) : null;

  if (token) {
    await provedor(String(linha.base_url), remover ? '/instance' : '/instance/disconnect', {
      token,
      metodo: remover ? 'DELETE' : 'POST',
      corpo: remover ? undefined : {},
    });
  }

  if (remover) {
    // O segredo some junto. Deixar o token no Vault depois de apagar a linha é
    // credencial órfã que ninguém mais sabe que existe.
    if (linha.token_secret_id) await sb.rpc('vault_apagar', { _id: linha.token_secret_id });
    await sb.from('whatsapp_instances').delete().eq('id', id);
    return json({ removido: true });
  }

  await sb.from('whatsapp_instances').update({
    status: 'desconectada',
    connected_phone_e164: null,
    connected_name: null,
    last_seen_at: new Date().toISOString(),
  }).eq('id', id);

  return json({ status: 'desconectada' });
}
