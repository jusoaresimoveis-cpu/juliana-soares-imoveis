/**
 * Peças compartilhadas da integração com a Meta.
 *
 * Os utilitários genéricos — cliente admin, quem chamou, Vault, digest — vêm de
 * `wa.ts`. O nome do arquivo é do WhatsApp por acidente histórico; o conteúdo
 * daquelas funções não é. Reimplementar aqui só criaria duas versões da mesma
 * regra de autorização, que é como sistemas ganham um caminho seguro e um
 * caminho esquecido.
 */
export { admin, quemChamou, lerSegredo, guardarSegredo, digest, segredoDeWebhook, json, CORS, servir } from './wa.ts';

/**
 * A versão da Graph API mora AQUI, e em nenhum outro lugar.
 *
 * O sistema auditado espalhou v18.0, v19.0 e v21.0 por arquivos diferentes. A
 * v18 já estava fora de suporte e a chamada que a usava falhava calada — o lead
 * não chegava, sem erro em lugar nenhum. Uma constante é o que impede isso de
 * acontecer de novo em um arquivo só.
 */
export const GRAPH_VERSION = 'v21.0';
export const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

/*
 * Estas três listas são cópia de `packages/contracts/meta.ts`.
 *
 * Não é preguiça: o Deno não alcança o pacote, e o teste
 * `contracts.test.ts` lê ESTE arquivo como texto e compara os números — se
 * alguém mexer num lado só, a suíte quebra. Sem esse guarda, os dois lados
 * divergem e o que a tela diz deixa de descrever o que o servidor decidiu.
 */

/** O token morreu. Só reconectar resolve. */
const ERROS_DE_TOKEN = [190];
/** O token vale; falta acesso ao objeto. Reconectar não muda nada. */
const ERROS_DE_PERMISSAO = [10, 200];
/** E os que significam "tente mais tarde". */
const ERROS_DE_LIMITE = [4, 17, 32, 613];

export type SaudeMeta = 'ok' | 'precisa_reconectar' | 'sem_permissao' | 'throttled' | 'erro';

export function saudeDoErro(codigo: number | null): SaudeMeta {
  if (codigo === null) return 'erro';
  if (ERROS_DE_TOKEN.includes(codigo)) return 'precisa_reconectar';
  if (ERROS_DE_PERMISSAO.includes(codigo)) return 'sem_permissao';
  if (ERROS_DE_LIMITE.includes(codigo)) return 'throttled';
  return 'erro';
}

/**
 * O erro da Graph em português.
 *
 * "Graph 200" foi o que a tela mostrou quando a busca de leads falhou: um
 * número que não diz o que houve nem o que fazer, e que ainda se parece com o
 * status HTTP de sucesso.
 */
export function mensagemDoErro(codigo: number | null, status?: number): string {
  switch (codigo) {
    case 190:
      return 'o acesso da Meta expirou ou foi revogado — reconecte';
    case 200:
    case 10:
      return 'a Meta negou acesso: a Página precisa estar atribuída ao usuário do sistema com controle total';
    case 4:
    case 17:
    case 32:
    case 613:
      return 'limite de consultas da Meta atingido — tente de novo mais tarde';
    case 100:
      return 'a Meta não reconheceu o pedido (campo ou id inválido)';
    case 803:
      return 'a Meta não encontrou este objeto, ou o acesso a ele não foi concedido';
    default:
      return codigo != null ? `erro ${codigo} da Meta` : `a Meta respondeu ${status ?? '?'}`;
  }
}

/**
 * Id da Meta que pode virar URL.
 *
 * O sistema auditado validava `^\d+$` em quatro ids e esquecia justamente do
 * `leadgen_id`, que era interpolado cru no caminho da Graph junto com o token
 * da organização. Um `leadgen_id` de "me/accounts?fields=access_token&x=" fazia
 * o servidor consultar outra coisa e despejar a resposta no log.
 *
 * Aqui não existe id privilegiado: ou passa por esta função, ou não toca em URL.
 */
export function idDaMeta(valor: unknown): string | null {
  return typeof valor === 'string' && /^\d{1,20}$/.test(valor) ? valor : null;
}

/**
 * Confere a assinatura do webhook.
 *
 * Três decisões, e cada uma fecha um defeito confirmado:
 *
 * 1. Recebe o corpo CRU. Reserializar o JSON antes de assinar produz bytes
 *    diferentes e o HMAC nunca bate — e a tentação é então "desligar a
 *    verificação porque não funciona".
 * 2. Usa `crypto.subtle.verify`, que compara em tempo constante. Comparar com
 *    `===` vaza, pelo tempo de resposta, quantos bytes do início batem.
 * 3. Valida o FORMATO antes. Sem isso, um cabeçalho vazio ou malformado passa
 *    por caminhos que tratam "não deu para conferir" como "está tudo bem".
 *
 * Quem chama trata `false` como 401. Não existe caminho em que a ausência de
 * segredo dispense a conferência — que é exatamente o que o sistema auditado
 * fazia, com `if (integration.meta_app_secret) { ...confere... }`.
 */
export async function assinaturaConfere(
  corpoCru: string,
  cabecalho: string | null,
  appSecret: string,
): Promise<boolean> {
  if (!cabecalho || !appSecret) return false;
  if (!/^sha256=[0-9a-f]{64}$/.test(cabecalho)) return false;

  const hex = cabecalho.slice('sha256='.length);
  const assinatura = new Uint8Array(32);
  for (let i = 0; i < 32; i++) assinatura[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);

  const chave = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(appSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  );

  return crypto.subtle.verify('HMAC', chave, assinatura, new TextEncoder().encode(corpoCru));
}

export interface RespostaGraph {
  ok: boolean;
  status: number;
  dados: Record<string, unknown>;
  /** Código de erro da Graph, que NÃO é o status HTTP. */
  codigo: number | null;
  /** Quanto do limite da aplicação já foi consumido, de 0 a 100. */
  uso: number;
}

/**
 * Chamada à Graph API.
 *
 * O token vai no CABEÇALHO. O sistema auditado o passava na query string em
 * todas as 30 chamadas — e URL inteira vai para log de servidor, de proxy e de
 * qualquer intermediário no caminho.
 *
 * E o erro é lido do CORPO: a Graph responde 200 com `{"error": {...}}` em
 * vários casos. Quem olha só o status HTTP conclui que deu certo e grava o
 * resultado vazio por cima do bom.
 */
export async function graph(
  caminho: string,
  token: string,
  opcoes: { metodo?: string; corpo?: unknown } = {},
): Promise<RespostaGraph> {
  const r = await fetch(`${GRAPH}${caminho}`, {
    method: opcoes.metodo ?? 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      ...(opcoes.corpo === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: opcoes.corpo === undefined ? undefined : JSON.stringify(opcoes.corpo),
  });

  const texto = await r.text();
  let dados: Record<string, unknown> = {};
  try {
    dados = texto ? JSON.parse(texto) : {};
  } catch {
    // O corpo não é registrado: pode conter nome, telefone e e-mail de quem
    // preencheu o formulário.
    dados = { erro_de_leitura: true };
  }

  const erro = dados.error as { code?: number; message?: string } | undefined;

  return {
    ok: r.ok && !erro,
    status: r.status,
    dados,
    codigo: erro?.code ?? null,
    uso: usoDoLimite(r.headers),
  };
}

/**
 * Cache de token de Página, com a vida de UMA invocação.
 *
 * Quem chama cria o mapa dentro do próprio handler e o descarta ao responder.
 * É de propósito: token de Página é credencial viva, e guardá-lo em escopo de
 * módulo o faria sobreviver a requisições de outras pessoas dentro do mesmo
 * isolate, além de ficar velho quando o cargo na Página mudasse — falhando
 * então com um token que ninguém mais consegue explicar de onde veio.
 */
export type CacheDePagina = Map<string, string>;

/**
 * O token DA PÁGINA — o único que a Meta aceita para ler lead.
 *
 * Este foi o defeito que deixou a primeira busca voltar "0 formulários": as
 * chamadas de `leadgen_forms`, de `/{form}/leads` e a leitura do próprio lead
 * iam com o token do USUÁRIO DO SISTEMA. A Graph responde 200 (erro de
 * permissão, não status HTTP) e devolve lista vazia — parece "não há nada",
 * quando na verdade é "você pediu com a credencial errada". A distinção some
 * justamente no caso em que a campanha está rodando e o cliente jura que tem
 * lead.
 *
 * A troca só funciona se a Página estiver atribuída ao usuário do sistema com
 * controle total; é o mesmo pré-requisito da assinatura.
 */
export async function tokenDaPagina(
  pageId: string,
  tokenDoUsuario: string,
  cache?: CacheDePagina,
): Promise<{ token: string | null; codigo: number | null; status: number }> {
  // O id vem do banco, mas o banco recebeu da tela. Nada entra em URL sem
  // passar por aqui — não existe id privilegiado.
  const seguro = idDaMeta(pageId);
  if (!seguro) return { token: null, codigo: null, status: 0 };

  const guardado = cache?.get(seguro);
  if (guardado) return { token: guardado, codigo: null, status: 200 };

  const r = await graph(`/${seguro}?fields=access_token`, tokenDoUsuario);
  const bruto = r.dados.access_token;
  const token = typeof bruto === 'string' && bruto.length > 0 ? bruto : null;

  if (!r.ok || !token) return { token: null, codigo: r.codigo, status: r.status };

  cache?.set(seguro, token);
  return { token, codigo: null, status: r.status };
}

/**
 * Quanto do limite da Graph já foi gasto.
 *
 * A Meta anuncia isso em cabeçalho e o sistema auditado nunca leu nenhum dos
 * dois — em nenhuma das sete funções. O resultado é descobrir o limite quando
 * ele estoura, e então tentar de novo imediatamente, o que prolonga o bloqueio.
 *
 * Com o número em mãos dá para parar ANTES, que é a única forma de um app novo
 * sobreviver ao primeiro mês (o teto sobe com histórico de gasto).
 */
function usoDoLimite(h: Headers): number {
  let maior = 0;
  for (const nome of ['x-app-usage', 'x-business-use-case-usage', 'x-ad-account-usage']) {
    const bruto = h.get(nome);
    if (!bruto) continue;
    try {
      const v = JSON.parse(bruto) as unknown;
      for (const n of numerosDe(v)) maior = Math.max(maior, n);
    } catch {
      // Cabeçalho ilegível não é motivo para derrubar a chamada.
    }
  }
  return maior;
}

function numerosDe(v: unknown): number[] {
  if (typeof v === 'number') return [v];
  if (Array.isArray(v)) return v.flatMap(numerosDe);
  if (v && typeof v === 'object') return Object.values(v).flatMap(numerosDe);
  return [];
}

/** Acima disto, para de puxar e volta depois. */
export const LIMITE_PRUDENTE = 75;
