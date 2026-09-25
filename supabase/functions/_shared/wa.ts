import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * Peças compartilhadas das funções de WhatsApp.
 *
 * Segue o padrão que `criar-corretor` estabeleceu: a organização é lida do
 * perfil de quem chamou, NUNCA do corpo da requisição. Na referência auditada a
 * função de envio aceitava o tenant como parâmetro e rodava com service_role
 * sem conferir o `Authorization` — bastava conhecer a URL para escrever na
 * conta de qualquer cliente.
 */

/*
 * `APP_ORIGIN` é uma LISTA, separada por vírgula.
 *
 * Era um valor só, e isso quebrou na primeira tentativa de conectar um número:
 * o mesmo app é servido por três endereços — o `app.` do domínio do cliente, o apex
 * e a URL da Vercel — mais o `localhost` do desenvolvimento. A função devolvia
 * sempre `app.` como origem permitida, o navegador comparava com a origem de
 * onde a página realmente estava, não batia, e a resposta era descartada antes
 * de chegar no código. Na tela: "Failed to send a request to the Edge
 * Function", que não diz nada sobre origem.
 *
 * A lista continua sendo uma lista, e não `*`: estes endpoints criam usuário e
 * mandam mensagem em nome da imobiliária. `*` deixaria qualquer página aberta
 * no navegador do corretor chamar em nome dele.
 */
const PERMITIDAS = (Deno.env.get('APP_ORIGIN') ?? '')
  .split(',')
  .map((o) => o.trim().replace(/\/$/, ''))
  .filter(Boolean);

/** A origem de quem chamou, se ela estiver na lista. Senão, a primeira. */
export function origemPermitida(req: Request): string {
  const pedida = (req.headers.get('Origin') ?? '').replace(/\/$/, '');
  if (PERMITIDAS.length === 0) return '*';
  return PERMITIDAS.includes(pedida) ? pedida : (PERMITIDAS[0] as string);
}

export const CORS = {
  'Access-Control-Allow-Origin': PERMITIDAS[0] ?? '*',
  // Os quatro são obrigatórios: o supabase-js manda `apikey` e `x-client-info`
  // além do token. Cortar a lista faz o preflight recusar e o navegador nem
  // enviar, com a mensagem inútil "Failed to send a request".
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/**
 * Carimba a origem certa na SAÍDA, uma vez só.
 *
 * A alternativa seria passar o `Request` para as dezenove chamadas de `json()`
 * espalhadas pela função. Aqui a resposta já está pronta e só o cabeçalho
 * muda — e como acontece no ponto único por onde tudo passa, não há caminho de
 * retorno que escape.
 *
 * `Vary: Origin` não é detalhe: sem ele, um cache intermediário guardaria a
 * resposta com a origem de quem chamou primeiro e a serviria para os outros.
 */
export function comOrigem(resposta: Response, req: Request): Response {
  const h = new Headers(resposta.headers);
  h.set('Access-Control-Allow-Origin', origemPermitida(req));
  h.append('Vary', 'Origin');
  return new Response(resposta.body, { status: resposta.status, headers: h });
}

export const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

/**
 * Serve um handler garantindo que NADA saia sem cabeçalho de origem.
 *
 * O padrão `Deno.serve((req) => comOrigem(await tratar(req), req))` tem um
 * buraco: se `tratar` ESTOURA, o `await` rejeita, `comOrigem` nunca roda, e o
 * runtime devolve um 500 cru — sem CORS. O navegador então descarta a resposta
 * e mostra "Failed to send a request to the Edge Function", que não diz nada
 * sobre o que quebrou.
 *
 * Foi assim que a criação da segunda corretora falhou em silêncio: preflight
 * certo, função alcançável, e uma exceção lá dentro virando erro de rede na
 * tela. Com este envelope, exceção vira 500 com CORS e uma frase legível — e o
 * detalhe fica no log do servidor, onde é seguro.
 */
export function servir(handler: (req: Request) => Promise<Response>) {
  return Deno.serve(async (req) => {
    try {
      return comOrigem(await handler(req), req);
    } catch (e) {
      console.error('exceção não tratada:', e);
      return comOrigem(json({ erro: 'Falha inesperada no servidor.' }, 500), req);
    }
  });
}

export function admin(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export interface Chamador {
  userId: string;
  orgId: string;
  gestor: boolean;
}

/** Resolve quem chamou pelo JWT, e de qual organização — sempre pelo banco. */
export async function quemChamou(req: Request, sb: SupabaseClient): Promise<Chamador | null> {
  const cabecalho = req.headers.get('Authorization');
  if (!cabecalho?.startsWith('Bearer ')) return null;

  const { data, error } = await sb.auth.getUser(cabecalho.replace('Bearer ', ''));
  if (error || !data.user) return null;

  const { data: perfil } = await sb
    .from('profiles')
    .select('organization_id, is_active')
    .eq('id', data.user.id)
    .single();
  if (!perfil?.organization_id || !perfil.is_active) return null;

  const { data: papeis } = await sb
    .from('user_roles')
    .select('role')
    .eq('user_id', data.user.id)
    .eq('organization_id', perfil.organization_id);

  const meus = (papeis ?? []).map((p) => p.role as string);
  return {
    userId: data.user.id,
    orgId: perfil.organization_id,
    gestor: meus.includes('admin') || meus.includes('gerente'),
  };
}

/**
 * Guarda um segredo no Vault e devolve o id.
 *
 * O token do provedor nunca vira coluna: `whatsapp_instances` guarda só esta
 * referência. Vault cifra em repouso com chave fora do banco, o que protege de
 * RLS mal configurada, de `select *` distraído e de dump de backup legível.
 */
export async function guardarSegredo(
  sb: SupabaseClient,
  nome: string,
  valor: string,
): Promise<string | null> {
  const { data, error } = await sb.rpc('vault_guardar', { _nome: nome, _valor: valor });
  if (error) {
    console.error('vault_guardar:', error.message);
    return null;
  }
  return data as string;
}

export async function lerSegredo(sb: SupabaseClient, id: string): Promise<string | null> {
  const { data, error } = await sb.rpc('vault_ler', { _id: id });
  if (error) {
    console.error('vault_ler:', error.message);
    return null;
  }
  return data as string | null;
}

/** 32 bytes de entropia real, em base64url — o segredo do webhook. */
export function segredoDeWebhook(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export async function digest(valor: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(valor));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

/* -------------------------------------------------------------------------- */
/* Limite de acessos nas portas públicas                                      */
/* -------------------------------------------------------------------------- */

/**
 * Quem está chamando, reduzido a uma chave que não é um endereço.
 *
 * O IP nunca é gravado. O que vai para a tabela é o SHA-256 de
 * `porta|ip|service_role`, cortado em 32 caracteres. O sal ser a chave de
 * serviço não é economia: ela já existe no ambiente de toda função, nunca sai
 * dali, e sem ela a tabela seria um índice de IPs reversível por força bruta —
 * o espaço do IPv4 tem quatro bilhões de entradas, o que um computador percorre
 * numa tarde. Um segredo novo só para isto seria mais uma variável para criar à
 * mão, e variável esquecida é defesa desligada.
 *
 * PRIMEIRO salto do `x-forwarded-for`, e isto foi MEDIDO, não deduzido.
 *
 * A escolha natural seria o último salto: ele é escrito pelo servidor que
 * recebeu a conexão e não se falsifica de fora, enquanto o primeiro vem de quem
 * chama. Foi assim que esta função nasceu — e em produção sete pedidos seguidos,
 * do mesmo computador, geraram CINCO contadores diferentes. O último salto no
 * Supabase é o nó de borda que atendeu, e há vários; ele identifica a
 * infraestrutura, não o visitante. Como chave de limite, não limita nada.
 *
 * O primeiro salto é o endereço de quem chamou, constante entre os pedidos, que
 * é o que um contador precisa. O preço está escrito na porta: quem souber
 * montar o cabeçalho na mão e trocá-lo a cada envio passa por baixo disto. Esse
 * é trabalho de WAF — de pôr a Cloudflare na frente de verdade, em vez de só
 * como DNS — e não de uma função que já está atrás dele. O que fica aqui é a
 * defesa contra o robô que não forja cabeçalho, que é o que existe hoje.
 */
async function chaveDeAcesso(req: Request, porta: string): Promise<string | null> {
  const saltos = (req.headers.get('x-forwarded-for') ?? '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);

  const ip = saltos[0];
  if (!ip) return null;

  const sal = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  return `${porta}:${(await digest(`${porta}|${ip}|${sal}`)).slice(0, 32)}`;
}

/**
 * Duas janelas: o laço e o gotejamento.
 *
 * 5 por minuto pega o robô que dispara em sequência; 60 por hora pega o que
 * espera entre um envio e outro para parecer gente.
 *
 * Os tetos são generosos de propósito. Uma pessoa preenche o formulário uma vez,
 * duas se errar o telefone — nem perto de cinco no mesmo minuto. A folga existe
 * para o outro lado: operadora de celular põe muitos assinantes atrás do mesmo
 * endereço, e escritório inteiro sai por um IP só. Um teto apertado recusaria
 * lead de verdade nesses casos, que é o único desfecho pior do que não ter
 * defesa nenhuma.
 *
 * Contra robô distribuído em muitos endereços isto não faz nada, e não tenta
 * fazer: sem WAF na frente, não há como.
 */
export async function passouNoLimite(
  req: Request,
  sb: SupabaseClient,
  porta: string,
): Promise<boolean> {
  const chave = await chaveDeAcesso(req, porta);
  // Sem cabeçalho não há como contar. Recusar aqui derrubaria a porta inteira
  // no dia em que a plataforma mudar o nome do cabeçalho — e o sintoma seria
  // "o formulário parou de funcionar", sem nada no log dizendo por quê.
  if (!chave) {
    console.warn(`${porta}: sem x-forwarded-for, limite não aplicado`);
    return true;
  }

  for (const [teto, janela] of [[5, '1 minute'], [60, '1 hour']] as const) {
    const { data, error } = await sb.rpc('limitar', {
      _chave: `${chave}:${janela.replace(' ', '')}`,
      _teto: teto,
      _janela: janela,
    });

    /*
     * Falha do contador deixa passar, de propósito.
     *
     * Se o banco não responde ao `limitar`, ele também não vai gravar o lead
     * logo abaixo — recusar aqui não protegeria nada e só trocaria uma
     * mensagem de erro por outra. Fechar a porta por causa de uma indisponi-
     * bilidade seria construir o ataque de negação de serviço em vez de
     * impedi-lo.
     */
    if (error) {
      console.error(`${porta}: limitar falhou —`, error.message);
      return true;
    }

    if (data !== true) {
      // Sem o IP e sem o hash inteiro: o suficiente para ver que existe abuso e
      // qual janela estourou, sem transformar o log num registro de quem visita.
      console.warn(`${porta}: teto de ${teto}/${janela} atingido`);
      return false;
    }
  }

  return true;
}

/** Chamada ao provedor, com o token no cabeçalho e erro legível. */
export async function provedor(
  baseUrl: string,
  caminho: string,
  opcoes: {
    metodo?: string;
    token?: string;
    adminToken?: string;
    corpo?: unknown;
    /**
     * Teto de tempo para ESTA chamada, em milissegundos.
     *
     * Sem ele o `fetch` espera para sempre, e quem chama não tem como saber a
     * diferença entre "o provedor está pensando" e "esta chamada nunca volta".
     * O envio de mensagem não passa disto (é rápido ou falha); o download de
     * mídia, sim: um arquivo grande pode segurar a execução inteira, e aí um
     * arquivo só trava a fila de todos os outros.
     */
    tetoMs?: number;
  } = {},
): Promise<{ ok: boolean; status: number; dados: Record<string, unknown> }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opcoes.token) headers.token = opcoes.token;
  if (opcoes.adminToken) headers.admintoken = opcoes.adminToken;

  const r = await fetch(`${baseUrl.replace(/\/$/, '')}${caminho}`, {
    method: opcoes.metodo ?? 'POST',
    headers,
    body: opcoes.corpo === undefined ? undefined : JSON.stringify(opcoes.corpo),
    signal: opcoes.tetoMs ? AbortSignal.timeout(opcoes.tetoMs) : undefined,
  });

  const texto = await r.text();
  let dados: Record<string, unknown> = {};
  try {
    dados = texto ? JSON.parse(texto) : {};
  } catch {
    dados = { bruto: texto.slice(0, 300) };
  }
  return { ok: r.ok, status: r.status, dados };
}

/**
 * Traduz o estado que o provedor devolve para o nosso vocabulário.
 *
 * O estado do meio é o que a referência calculava e descartava: pareado, mas
 * com o celular fora da internet. Ele muda a instrução na tela de "escaneie o
 * QR" para "não faça nada, volta sozinho".
 */
export function traduzirEstado(bruto: unknown): string {
  const s = String(bruto ?? '').toLowerCase();
  if (['connected', 'open', 'online'].includes(s)) return 'conectada';
  if (['connecting', 'qrcode', 'pairing', 'close'].includes(s)) return 'pareando';
  if (['disconnected', 'logout', 'closed'].includes(s)) return 'desconectada';
  if (['offline', 'unpaired_idle', 'timeout'].includes(s)) return 'credenciada_offline';
  return 'erro';
}
