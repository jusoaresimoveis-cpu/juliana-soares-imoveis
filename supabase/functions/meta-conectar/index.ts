import {
  admin,
  quemChamou,
  json,
  CORS,
  graph,
  guardarSegredo,
  lerSegredo,
  digest,
  segredoDeWebhook,
  saudeDoErro,
  mensagemDoErro,
  idDaMeta,
  tokenDaPagina,
  type CacheDePagina,
  GRAPH_VERSION,
} from '../_shared/meta.ts';

/**
 * Conectar a conta da Meta, listar os ativos e ligar o que vai valer.
 *
 * O caminho é o de token de Usuário do Sistema, gerado no Business Manager do
 * cliente: ele cria, atribui a página e a conta de anúncios como ativos, e cola
 * aqui. Não passa por App Review, porque o aplicativo é do próprio cliente.
 *
 * A organização vem SEMPRE do perfil de quem chamou, nunca do corpo. Na
 * referência auditada, `meta-fetch-account-info` aceitava a organização como
 * parâmetro e caía para a do chamador quando divergia — o que significa que
 * pedir a organização errada não dava erro, dava o dado errado.
 */

interface Corpo {
  acao?: string;
  /** Em qual conexão mexer. Ausente = a do próprio chamador. */
  integracaoId?: string;
  /** Nome humano da conexão. Com duas BMs, "a integração" deixa de identificar. */
  rotulo?: string;
  appId?: string;
  appSecret?: string;
  accessToken?: string;
  adAccountId?: string;
  ligada?: boolean;
  pageId?: string;
  desdeDias?: number;
}

/**
 * A integração tem DUAS metades, e elas se conectam separado.
 *
 * `ads_read` traz o gasto. `leads_retrieval` traz o lead. Exigir as duas de uma
 * vez parece rigor e é obstáculo: quando a Página pertence a outro portfólio —
 * o caso comum de agência — o acesso a leads depende do cliente liberar, e
 * pode levar dias. Bloquear a conexão inteira por isso deixa o gestor sem ver
 * o gasto das campanhas que já estão rodando e gastando dinheiro hoje.
 *
 * Então: `ads_read` é obrigatória; `leads_retrieval` é registrada e a tela diz
 * o que ainda falta. Quando o cliente liberar, os leads começam a entrar sem
 * reconectar nada.
 */
const ESCOPO_OBRIGATORIO = 'ads_read';
const ESCOPO_DE_LEADS = 'leads_retrieval';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const sb = admin();

  try {
    const chamador = await quemChamou(req, sb);
    if (!chamador) return json({ erro: 'não autorizado' }, 401);

    const corpo = (await req.json().catch(() => ({}))) as Corpo;
    const org = chamador.orgId;

    /*
     * A permissão passou a ser por CONEXÃO, e não por papel.
     *
     * Era `if (!chamador.gestor) 403` para tudo, com o comentário "conta de
     * anúncio é dinheiro". O comentário continua certo — mas a corretora tem a
     * própria BM, paga a própria verba, e o token só pode sair de quem tem
     * acesso ao Business Manager dela. Exigir a gestão aqui obrigaria o gerente
     * a pedir o token dela para colar na tela dele.
     *
     * Agora: cada um conecta a SUA (a chave (organização, dono) garante uma por
     * pessoa), e mexe na sua. A gestão mexe em todas, porque é a mesma casa.
     */
    if (corpo.acao === 'salvar') return await salvar(sb, org, chamador.userId, corpo);

    const k = await conexaoDe(sb, chamador, corpo.integracaoId);
    // A MESMA frase de conexão inexistente: confirmar que o id existe já conta
    // ao curioso que ele acertou o palpite.
    if (!k) return json({ erro: 'não conectado' }, 400);

    switch (corpo.acao) {
      case 'ativos':
        return await ativos(sb, k);
      case 'ligar_conta':
        return await ligarConta(sb, k, corpo);
      case 'assinar_pagina':
        return await assinarPagina(sb, k, corpo);
      case 'buscar_leads_antigos':
        return await buscarLeadsAntigos(sb, k, corpo);
      case 'novo_webhook':
        return await novoWebhook(sb, k);
      case 'importar_gasto':
        return await importarGasto(sb, k);
      case 'desconectar':
        return await desconectar(sb, k);
      default:
        return json({ erro: 'ação desconhecida' }, 400);
    }
  } catch (e) {
    console.error('meta-conectar:', e);
    return json({ erro: 'interno' }, 500);
  }
});

/* -------------------------------------------------------------------------- */

/** A conexão em que a ação vai mexer, já conferida. */
interface Conexao {
  id: string;
  organization_id: string;
  owner_id: string | null;
  label: string | null;
  app_secret_id: string | null;
  access_token_id: string | null;
}

/**
 * Qual conexão, e se ela é de quem pediu.
 *
 * Sem `integracaoId`, resolve a do próprio chamador — é o caso de quase toda
 * chamada, e evita a tela ter de saber o id antes de perguntar qualquer coisa.
 * Com `integracaoId`, só passa se for dele ou se ele for da gestão.
 *
 * Lido com `service_role`, que ignora RLS: a comparação de dono tem de acontecer
 * AQUI, à mão. Ler pela policy não serviria — a função precisa distinguir "não
 * existe" de "existe e não é sua", e a policy responde a mesma coisa nos dois.
 */
async function conexaoDe(
  sb: ReturnType<typeof admin>,
  chamador: { userId: string; orgId: string; gestor: boolean },
  integracaoId?: string,
): Promise<Conexao | null> {
  const COLUNAS = 'id, organization_id, owner_id, label, app_secret_id, access_token_id';

  if (integracaoId) {
    const { data } = await sb
      .from('meta_integrations')
      .select(COLUNAS)
      .eq('id', integracaoId)
      .eq('organization_id', chamador.orgId)
      .maybeSingle();
    if (!data) return null;
    if (!chamador.gestor && data.owner_id !== chamador.userId) return null;
    return data as Conexao;
  }

  const { data } = await sb
    .from('meta_integrations')
    .select(COLUNAS)
    .eq('organization_id', chamador.orgId)
    .eq('owner_id', chamador.userId)
    .maybeSingle();
  return (data as Conexao) ?? null;
}

async function salvar(sb: ReturnType<typeof admin>, org: string, userId: string, c: Corpo) {
  const appId = c.appId?.trim();
  const appSecret = c.appSecret?.trim();
  const token = c.accessToken?.trim();
  if (!appId || !appSecret || !token) return json({ erro: 'faltam campos' }, 400);

  /*
   * O token é CONFERIDO antes de ser guardado.
   *
   * `/debug_token` diz de quem ele é, quando expira e quais escopos tem. A
   * referência guardava o que fosse colado e só descobria o problema quando o
   * primeiro lead não chegava — e como o erro da Graph era descartado, nem
   * então descobria.
   */
  const info = await graph(
    `/debug_token?input_token=${encodeURIComponent(token)}`,
    `${appId}|${appSecret}`,
  );

  if (!info.ok) {
    return json(
      { erro: 'A Meta recusou estas credenciais.', detalhe: `código ${info.codigo ?? info.status}` },
      400,
    );
  }

  const d = (info.dados.data ?? {}) as {
    is_valid?: boolean;
    scopes?: string[];
    type?: string;
    expires_at?: number;
    data_access_expires_at?: number;
  };

  if (!d.is_valid) return json({ erro: 'O token não é válido.' }, 400);

  const escopos = d.scopes ?? [];
  /*
   * Sem `ads_read` não há NADA a fazer: nem gasto, nem custo por lead. Aqui o
   * salvamento é recusado mesmo — guardar produziria uma integração que aparece
   * conectada e não funciona, e a pessoa procuraria o problema em todo lugar
   * menos na permissão que não concedeu.
   */
  if (!escopos.includes(ESCOPO_OBRIGATORIO)) {
    return json(
      {
        erro: `Faltou a permissão ${ESCOPO_OBRIGATORIO}.`,
        detalhe: 'Sem ela não dá para ler o gasto das campanhas. Gere o token novamente marcando-a.',
      },
      400,
    );
  }

  // Falta só a de leads: conecta, e a tela avisa o que ainda não funciona.
  const temLeads = escopos.includes(ESCOPO_DE_LEADS);

  // `expires_at = 0` significa que não expira (token de Usuário do Sistema).
  // Mas o acesso ao DADO expira mesmo assim, e é esse o prazo que importa.
  const expiraEm = d.data_access_expires_at || d.expires_at || 0;

  /*
   * O NOME do segredo no cofre passa a ter a pessoa.
   *
   * Era `meta_app_secret_${org}`, e `vault_guardar` substitui o valor quando o
   * nome se repete — está escrito no comentário dele, e é a decisão certa para
   * rotação de token. Só que com duas BMs na mesma casa isso significa que a
   * segunda conexão grava POR CIMA do token e do app secret da primeira. O
   * sintoma seria a importação de gasto do gerente parar de crescer, sem erro.
   *
   * Por pessoa, e não pelo id da conexão, porque o nome precisa existir ANTES
   * da linha: `app_secret_id` e `access_token_id` são `not null`, então não dá
   * para inserir a linha primeiro e guardar o segredo depois.
   */
  const idSecret = await guardarSegredo(sb, `meta_app_secret_${org}_${userId}`, appSecret);
  const idToken = await guardarSegredo(sb, `meta_access_token_${org}_${userId}`, token);
  if (!idSecret || !idToken) return json({ erro: 'falha ao guardar com segurança' }, 500);

  // O segredo do webhook aparece UMA vez. Depois só existe como digest.
  const segredo = segredoDeWebhook();

  // Os segredos ANTERIORES desta mesma conexão, para não ficarem órfãos no cofre
  // depois que a linha passar a apontar para os novos. Credencial viva que
  // ninguém mais vigia é exatamente o que `desconectar` existe para evitar.
  const { data: antes } = await sb
    .from('meta_integrations')
    .select('id, app_secret_id, access_token_id')
    .eq('organization_id', org)
    .eq('owner_id', userId)
    .maybeSingle();

  const linha = {
    organization_id: org,
    owner_id: userId,
    app_id: appId,
    app_secret_id: idSecret,
    access_token_id: idToken,
    token_type: d.type ?? null,
    token_expires_at: expiraEm ? new Date(expiraEm * 1000).toISOString() : null,
    scopes: escopos,
    webhook_secret_hash: await digest(segredo),
    health: 'ok',
    health_error_code: null,
    health_message: null,
  } as Record<string, unknown>;

  /*
   * O rótulo só entra quando VEIO.
   *
   * Num upsert, mandar `label: undefined` ainda sobrescreveria o valor gravado
   * com nulo na hora de reconectar — e a conexão perderia o nome justamente na
   * operação que a pessoa faz quando algo deu errado. Só se acrescenta a chave
   * quando há o que gravar.
   */
  const rotulo = c.rotulo?.trim();
  if (rotulo) linha.label = rotulo;

  const { data, error } = await sb
    .from('meta_integrations')
    // A chave passou a ser (organização, dono): uma BM por pessoa, quantas
    // pessoas houver. Era `organization_id` sozinho, e a segunda conexão
    // substituía a linha da primeira.
    .upsert(linha, { onConflict: 'organization_id,owner_id' })
    .select('id')
    .single();

  if (error || !data) {
    console.error('salvar integração:', error?.message);
    return json({ erro: 'falha ao salvar' }, 500);
  }

  for (const velho of [antes?.app_secret_id, antes?.access_token_id]) {
    if (velho && velho !== idSecret && velho !== idToken) {
      await sb.rpc('vault_apagar', { _id: velho });
    }
  }

  const base = Deno.env.get('SUPABASE_URL') ?? '';
  return json({
    ok: true,
    // Esta URL vai colada no aplicativo da Meta, em Webhooks → Página → leadgen.
    // O mesmo valor serve de token de verificação no aperto de mão.
    webhookUrl: `${base}/functions/v1/meta-webhook/${data.id}/${segredo}`,
    verifyToken: segredo,
    escopos,
    // A tela usa isto para mostrar "gasto conectado, leads pendentes" em vez de
    // um verde que promete mais do que entrega.
    leadsHabilitados: temLeads,
    expiraEm: expiraEm ? new Date(expiraEm * 1000).toISOString() : null,
    versao: GRAPH_VERSION,
  });
}

/**
 * Descobre as páginas e as contas de anúncio que o token enxerga.
 *
 * As contas entram DESLIGADAS. A referência gravava todas as contas visíveis
 * sob a organização que sincronizou — um gestor de tráfego que atende três
 * imobiliárias traria o gasto das outras duas junto, e o custo por lead sairia
 * calculado sobre verba de terceiro.
 */
async function ativos(sb: ReturnType<typeof admin>, k: Conexao) {
  const org = k.organization_id;
  const token = k.access_token_id ? await lerSegredo(sb, k.access_token_id) : null;
  if (!token) return json({ erro: 'não conectado' }, 400);

  const contas = await graph(
    '/me/adaccounts?fields=id,account_id,name,currency,timezone_name,account_status&limit=100',
    token,
  );
  if (!contas.ok) {
    await sb.rpc('meta_saude', {
      _integracao: k.id,
      _saude: saudeDoErro(contas.codigo),
      _codigo: contas.codigo,
      _msg: 'falha ao listar contas',
    });
    return json({ erro: 'A Meta recusou a consulta.', detalhe: `código ${contas.codigo}` }, 400);
  }

  /*
   * REIVINDICAR, e não `upsert`.
   *
   * O que estava aqui era `upsert({organization_id, ad_account_id, ...},
   * {onConflict: 'ad_account_id'})`. O único de `ad_account_id` é GLOBAL, e
   * `on conflict do update` sobre um único global não recusa nada: ele reescreve
   * a linha, `organization_id` inclusive. Quem clicasse em "Buscar da Meta"
   * levava para dentro da própria imobiliária a conta de anúncio — ou a página —
   * de outra, sem erro, sem log e sem sintoma.
   *
   * Não é hipótese neste produto: quem opera o CRM é gestor de tráfego de mais
   * de um cliente, e é o token dele que enxerga contas de casas diferentes. O
   * comentário da 017 já prometia que a segunda casa "recebe erro na hora de
   * conectar, não em silêncio no webhook" — agora o código faz isso.
   *
   * A função do banco decide antes de escrever e devolve o que aconteceu. O que
   * ela recusar volta para a tela: uma conta que some sem explicação faz o
   * gerente clicar em "Buscar da Meta" de novo, para sempre.
   */
  /*
   * O que a Meta mostrou e o CRM não pegou, COM O MOTIVO.
   *
   * São duas recusas diferentes e a diferença importa para quem lê: "é de outra
   * imobiliária" é uma fronteira que ninguém deve atravessar; "é de outra
   * conexão desta casa" é uma escolha de qual BM administra aquela conta — e a
   * segunda é justamente o sinal de que ESTE token enxerga a conta, o que
   * decide se dá para movê-la.
   */
  const recusadas: { nome: string; motivo: string }[] = [];

  for (const bruta of (contas.dados.data ?? []) as Record<string, unknown>[]) {
    const id = String(bruta.id ?? '');
    if (!id) continue;
    const { data: r } = await sb.rpc('meta_reivindicar_conta', {
      _integracao: k.id,
      _ad_account_id: id,
      _nome: String(bruta.name ?? ''),
      _moeda: String(bruta.currency ?? ''),
      _fuso: String(bruta.timezone_name ?? ''),
    });
    if (r === 'de_outra_casa' || r === 'de_outra_conexao') {
      recusadas.push({ nome: String(bruta.name ?? id), motivo: String(r) });
    }
  }

  const paginas = await graph('/me/accounts?fields=id,name&limit=100', token);
  for (const bruta of (paginas.dados.data ?? []) as Record<string, unknown>[]) {
    const id = String(bruta.id ?? '');
    if (!id) continue;
    const { data: r } = await sb.rpc('meta_reivindicar_pagina', {
      _integracao: k.id,
      _page_id: id,
      _nome: String(bruta.name ?? ''),
    });
    if (r === 'de_outra_casa' || r === 'de_outra_conexao') {
      recusadas.push({ nome: String(bruta.name ?? id), motivo: String(r) });
    }
  }

  await sb.rpc('meta_saude', { _integracao: k.id, _saude: 'ok' });

  // Só os ativos DESTA conexão. Sem o filtro, a tela da corretora listaria as
  // contas do gerente e vice-versa — e o botão de ligar responderia 403 depois
  // de a pessoa já ter clicado.
  const { data: lista } = await sb
    .from('meta_ad_accounts')
    .select('id, ad_account_id, name, currency, timezone_name, enabled')
    .eq('organization_id', org)
    .eq('integration_id', k.id)
    .order('name');

  const { data: pgs } = await sb
    .from('meta_pages')
    .select('id, page_id, page_name')
    .eq('organization_id', org)
    .eq('integration_id', k.id);

  return json({ contas: lista ?? [], paginas: pgs ?? [], recusadas });
}

async function ligarConta(sb: ReturnType<typeof admin>, k: Conexao, c: Corpo) {
  if (!c.adAccountId) return json({ erro: 'conta não informada' }, 400);
  const { error } = await sb
    .from('meta_ad_accounts')
    .update({ enabled: c.ligada === true })
    .eq('organization_id', k.organization_id)
    .eq('integration_id', k.id)
    .eq('ad_account_id', c.adAccountId);
  if (error) return json({ erro: 'falha ao atualizar' }, 500);
  return json({ ok: true });
}

/**
 * Desconectar apaga o SEGREDO, não só a linha.
 *
 * Deixar o token no Vault depois de desconectar é guardar uma credencial viva
 * que ninguém mais vigia.
 */
async function desconectar(sb: ReturnType<typeof admin>, k: Conexao) {
  for (const id of [k.app_secret_id, k.access_token_id]) {
    if (id) await sb.rpc('vault_apagar', { _id: id });
  }

  // Pelo ID da conexão, nunca pela organização: com duas BMs na casa, apagar
  // por organização levaria a do colega junto.
  await sb.from('meta_integrations').delete().eq('id', k.id);
  // As contas e páginas ficam: elas não guardam segredo, e apagar perderia a
  // allowlist que a pessoa montou. O gasto histórico também fica — ele é o
  // registro do que já foi pago, e não deixa de ser verdade por desconectar.
  return json({ ok: true });
}


/**
 * Assina o app na Página para receber os eventos de formulário.
 *
 * É o passo invisível: configurar o webhook no painel da Meta faz o endereço
 * ser aceito, mas NÃO faz a Página mandar nada. Falta esta chamada, e a
 * ausência dela não produz erro em lugar nenhum — só silêncio. Foi a primeira
 * coisa que faltava no que eu tinha construído.
 *
 * A assinatura é feita com o token DA PÁGINA, não com o do usuário do sistema.
 * O da página é obtido pedindo `access_token` na própria página — o que só
 * funciona se ela estiver atribuída ao usuário do sistema com controle total.
 */
async function assinarPagina(sb: ReturnType<typeof admin>, k: Conexao, c: Corpo) {
  const org = k.organization_id;
  const pageId = c.pageId?.trim();
  if (!pageId) return json({ erro: 'página não informada' }, 400);

  /*
   * A página precisa ser DESTA CONEXÃO, não só desta organização.
   *
   * Assinar é `POST /{page-id}/subscribed_apps`, e "app" ali é o aplicativo do
   * token que está assinando. Com duas BMs na casa, assinar a página de uma
   * usando o token da outra ou falha, ou — pior — assina o aplicativo errado, e
   * os eventos passam a chegar na URL de outra conexão.
   */
  const { data: pagina } = await sb
    .from('meta_pages')
    .select('page_id, page_name')
    .eq('organization_id', org)
    .eq('integration_id', k.id)
    .eq('page_id', pageId)
    .maybeSingle();
  if (!pagina) return json({ erro: 'esta página não é desta conexão' }, 403);

  const token = k.access_token_id ? await lerSegredo(sb, k.access_token_id) : null;
  if (!token) return json({ erro: 'não conectado' }, 400);

  const daPagina = await tokenDaPagina(pageId, token);

  if (!daPagina.token) {
    const motivo = mensagemDoErro(daPagina.codigo, daPagina.status);
    await sb
      .from('meta_pages')
      .update({ subscribe_error: `não foi possível obter o token da Página: ${motivo}` })
      .eq('organization_id', org)
      .eq('page_id', pageId);
    return json(
      {
        erro: 'A Meta não liberou o token desta Página.',
        detalhe: `${motivo}. Confirme também que o token tem pages_show_list e pages_manage_metadata.`,
      },
      400,
    );
  }

  const r = await graph(`/${pageId}/subscribed_apps?subscribed_fields=leadgen`, daPagina.token, {
    metodo: 'POST',
  });

  if (!r.ok) {
    const motivo = mensagemDoErro(r.codigo, r.status);
    await sb
      .from('meta_pages')
      .update({ subscribe_error: motivo })
      .eq('organization_id', org)
      .eq('page_id', pageId);
    await sb.rpc('meta_saude', {
      _integracao: k.id,
      _saude: saudeDoErro(r.codigo),
      _codigo: r.codigo,
      _msg: 'falha ao assinar a Página',
    });
    return json({ erro: 'A Meta recusou a assinatura.', detalhe: motivo }, 400);
  }

  await sb
    .from('meta_pages')
    .update({ subscribed_at: new Date().toISOString(), subscribe_error: null })
    .eq('organization_id', org)
    .eq('page_id', pageId);

  return json({ ok: true, pagina: pagina.page_name ?? pageId });
}


/** Teto por rodada. Existe para a função não rodar até o timeout. */
const MAX_FORMULARIOS = 25;
const MAX_PAGINAS_DE_LEADS = 10;

/**
 * Traz os leads que entraram ANTES da conexão.
 *
 * O webhook só entrega o que acontece depois da assinatura. Quem já tem
 * campanha rodando — que é o caso normal de quem procura um CRM — perderia
 * tudo que veio antes, e são justamente os leads mais quentes.
 *
 * A implementação faz o mínimo de propósito: descobre os `leadgen_id` e os
 * ENFILEIRA na mesma caixa de entrada do webhook. Quem processa é o trabalhador
 * que já existe — com a mesma deduplicação, a mesma atribuição e o mesmo
 * tratamento de erro. Um segundo caminho de criação de lead seria um segundo
 * lugar para os defeitos morarem.
 */
async function buscarLeadsAntigos(sb: ReturnType<typeof admin>, k: Conexao, c: Corpo) {
  const org = k.organization_id;
  const dias = Math.min(Math.max(c.desdeDias ?? 30, 1), 90);
  const desde = Math.floor((Date.now() - dias * 86400000) / 1000);

  const token = k.access_token_id ? await lerSegredo(sb, k.access_token_id) : null;
  if (!token) return json({ erro: 'não conectado' }, 400);

  // As páginas DESTA conexão: o token de página só sai para quem o aplicativo
  // desta BM enxerga.
  const { data: paginas } = await sb
    .from('meta_pages')
    .select('page_id, page_name')
    .eq('organization_id', org)
    .eq('integration_id', k.id);

  if (!paginas?.length) return json({ erro: 'nenhuma página conhecida' }, 400);

  let formularios = 0;
  let encontrados = 0;
  let enfileirados = 0;
  let truncado = false;
  const problemas: string[] = [];

  /*
   * O cache morre junto com esta requisição.
   *
   * Uma chamada à Graph por Página, e não uma por formulário — mas sem deixar
   * credencial de Página viva em escopo de módulo, onde ela atravessaria
   * requisições de outras pessoas no mesmo isolate.
   */
  const cache: CacheDePagina = new Map();

  for (const p of paginas) {
    /*
     * Leitura de lead exige o token DA PÁGINA.
     *
     * Com o token do usuário do sistema a Graph responde erro 200 e a tela
     * escrevia "0 leads encontrados em 0 formulários" — que lê como "não há
     * lead nenhum" quando a verdade era "você perguntou com a credencial
     * errada". A campanha estava rodando o tempo todo.
     */
    const daPagina = await tokenDaPagina(p.page_id, token, cache);
    if (!daPagina.token) {
      problemas.push(
        `${p.page_name ?? p.page_id}: ${mensagemDoErro(daPagina.codigo, daPagina.status)}`,
      );
      continue;
    }

    const lista = await graph(
      `/${p.page_id}/leadgen_forms?fields=id,name&limit=${MAX_FORMULARIOS}`,
      daPagina.token,
    );
    if (!lista.ok) {
      problemas.push(
        `formulários de ${p.page_name ?? p.page_id}: ${mensagemDoErro(lista.codigo, lista.status)}`,
      );
      continue;
    }

    for (const f of (lista.dados.data ?? []) as Array<{ id?: string; name?: string }>) {
      const formId = idDaMeta(f.id);
      if (!formId) continue;
      formularios++;

      await sb.from('meta_forms').upsert(
        {
          organization_id: org,
          integration_id: k.id,
          form_id: formId,
          page_id: p.page_id,
          name: f.name ?? null,
        },
        { onConflict: 'organization_id,form_id' },
      );

      /*
       * O filtro por data vai na CONSULTA, não depois.
       *
       * Um formulário antigo pode ter milhares de leads; trazer tudo para
       * filtrar aqui gastaria o limite da Graph à toa e ainda arriscaria o
       * tempo da função.
       */
      const filtro = encodeURIComponent(
        JSON.stringify([{ field: 'time_created', operator: 'GREATER_THAN', value: desde }]),
      );
      let caminho = `/${formId}/leads?fields=id,created_time&limit=100&filtering=${filtro}`;
      let pagina = 0;

      while (caminho && pagina < MAX_PAGINAS_DE_LEADS) {
        const r = await graph(caminho, daPagina.token);
        pagina++;

        if (!r.ok) {
          problemas.push(
            `leads do formulário ${f.name ?? formId}: ${mensagemDoErro(r.codigo, r.status)}`,
          );
          break;
        }

        const linhas = [];
        for (const l of (r.dados.data ?? []) as Array<{ id?: string }>) {
          const leadgenId = idDaMeta(l.id);
          if (!leadgenId) continue;
          encontrados++;
          linhas.push({
            organization_id: org,
            // De qual conexão o evento veio: é ela que diz com qual token o
            // trabalhador vai buscar o lead na Graph.
            integration_id: k.id,
            leadgen_id: leadgenId,
            page_id: p.page_id,
            form_id: formId,
            payload: { leadgen_id: leadgenId, form_id: formId, origem: 'backfill' },
            // Veio de chamada autenticada à Graph, não de um POST anônimo: a
            // procedência está provada por outro caminho, não pelo HMAC.
            signature_ok: true,
          });
        }

        if (linhas.length > 0) {
          const { error, count } = await sb
            .from('meta_webhook_inbox')
            .upsert(linhas, {
              onConflict: 'organization_id,leadgen_id',
              ignoreDuplicates: true,
              count: 'exact',
            });
          if (error) {
            problemas.push(`enfileirar: ${error.message.slice(0, 120)}`);
            break;
          }
          enfileirados += count ?? 0;
        }

        const proxima = (r.dados.paging as { next?: string } | undefined)?.next;
        caminho = proxima ? proxima.replace(/^https:\/\/graph\.facebook\.com\/v\d+\.\d+/, '') : '';
        if (pagina >= MAX_PAGINAS_DE_LEADS && proxima) truncado = true;
      }
    }
  }

  // Acorda o trabalhador para não esperar o cron do minuto seguinte.
  const url = Deno.env.get('SUPABASE_URL');
  const segredoCron = Deno.env.get('META_CRON_SECRET');
  if (url && segredoCron && enfileirados > 0) {
    await fetch(`${url}/functions/v1/meta-trabalhador`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Cron-Secret': segredoCron },
      body: '{}',
    }).catch(() => {});
  }

  return json({
    ok: true,
    dias,
    formularios,
    encontrados,
    // Já conhecidos entram como 0: a chave de idempotência é a mesma do
    // webhook, então rodar duas vezes não duplica nada.
    enfileirados,
    truncado,
    problemas: problemas.slice(0, 5),
  });
}


/**
 * Gera um endereço de webhook novo.
 *
 * Existe porque o segredo aparece UMA vez e o banco guarda só o resumo dele —
 * e porque a primeira versão desta tela destruía o painel que o mostrava assim
 * que a conexão era salva. Quem perdeu o endereço não tinha como recuperá-lo.
 *
 * Gerar outro invalida o anterior na hora: o webhook antigo passa a responder
 * 401. Isso é bom quando o endereço vazou, e é o que precisa ser dito na tela
 * quando não vazou.
 */
async function novoWebhook(sb: ReturnType<typeof admin>, k: Conexao) {
  const segredo = segredoDeWebhook();

  const { data, error } = await sb
    .from('meta_integrations')
    .update({ webhook_secret_hash: await digest(segredo) })
    // Pelo id: por organização, gerar um endereço novo para uma BM invalidaria
    // o webhook da outra ao mesmo tempo, e ninguém saberia por quê.
    .eq('id', k.id)
    .select('id')
    .single();

  if (error || !data) return json({ erro: 'não conectado' }, 400);

  const base = Deno.env.get('SUPABASE_URL') ?? '';
  return json({
    ok: true,
    webhookUrl: `${base}/functions/v1/meta-webhook/${data.id}/${segredo}`,
    verifyToken: segredo,
  });
}

/**
 * Dispara a importação de gasto na hora.
 *
 * O cron roda de hora em hora, o que é certo para o dia a dia e errado no
 * minuto seguinte à conexão — a pessoa acabou de ligar tudo e quer ver número.
 * O segredo do cron vive no servidor: a tela pede, o servidor chama.
 */
async function importarGasto(sb: ReturnType<typeof admin>, k: Conexao) {
  const org = k.organization_id;
  const url = Deno.env.get('SUPABASE_URL');
  const segredo = Deno.env.get('META_CRON_SECRET');
  if (!url || !segredo) return json({ erro: 'importação não configurada' }, 500);

  const { count } = await sb
    .from('meta_ad_accounts')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', org)
    .eq('integration_id', k.id)
    .eq('enabled', true);

  if (!count) {
    return json(
      {
        erro: 'Nenhuma conta de anúncio ligada.',
        detalhe: 'Ligue ao menos uma conta antes de importar — sem isso não há o que buscar.',
      },
      400,
    );
  }

  const r = await fetch(`${url}/functions/v1/meta-insights`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Cron-Secret': segredo },
    body: JSON.stringify({ modo: 'quente', org }),
  });

  const dados = await r.json().catch(() => ({}));
  if (!r.ok) return json({ erro: 'A importação falhou.', detalhe: JSON.stringify(dados).slice(0, 200) }, 400);

  return json({ ok: true, ...dados });
}
