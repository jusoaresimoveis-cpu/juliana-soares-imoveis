/**
 * A caixa-preta do app.
 *
 * Até aqui, um erro de JavaScript no CRM era tela branca: sem mensagem, sem
 * log, sem rastro e sem nenhum caminho para quem está do outro lado contar o
 * que aconteceu. O que chegava era "deu erro" — sem a rota, sem a versão, sem a
 * pilha, e quase sempre horas depois.
 *
 * Este módulo guarda o que a pessoa NÃO tem como digitar e manda para a função
 * `reportar-erro`. O comentário dela é opcional e vem depois, porque é o único
 * pedaço que pode faltar sem prejuízo.
 */

export type TipoDePasso = 'rota' | 'console';

export interface Passo {
  /** Milissegundos desde que a aba abriu. Relativo, não relógio: o que importa
      é a distância entre os passos, e assim nada aqui vira carimbo de hora. */
  ms: number;
  tipo: TipoDePasso;
  texto: string;
}

export interface Relato {
  origem: 'tela' | 'janela' | 'promessa';
  mensagem: string;
  pilha?: string;
  rota?: string;
  agente?: string;
  tela?: string;
  versao?: string;
  rastro: Passo[];
}

/** Vinte passos cobrem a navegação inteira que antecede uma queda. */
const MAX_PASSOS = 20;
/** Um passo é uma pista, não um documento. Cortado antes de sair da máquina. */
const MAX_TEXTO = 200;
/** A pilha inteira do Chrome cabe folgada; o resto é ruído de framework. */
const MAX_PILHA = 4000;

/*
 * Teto de relatos automáticos por aba.
 *
 * Um erro dentro do `render` reaparece a cada tentativa do React, e um erro
 * dentro de um `setInterval` reaparece para sempre. Sem teto, a primeira queda
 * de um laço vira mil linhas na tabela e um pedido por segundo saindo do
 * navegador de quem já está com o sistema quebrado.
 */
const MAX_AUTOMATICOS = 3;

const passos: Passo[] = [];
const inicio = Date.now();
const jaRelatados = new Set<string>();
let automaticos = 0;
/** Trava de reentrada: erro que nasce DENTRO do relato não vira outro relato. */
let relatando = false;

const cortar = (v: string, max: number) => (v.length > max ? `${v.slice(0, max)}…` : v);

/** Registra um passo no rastro. Só isto: nunca envia nada. */
export function anotar(tipo: TipoDePasso, texto: string): void {
  passos.push({ ms: Date.now() - inicio, tipo, texto: cortar(texto, MAX_TEXTO) });
  if (passos.length > MAX_PASSOS) passos.shift();
}

export function rastro(): Passo[] {
  return [...passos];
}

/** Identidade de um erro, para não relatar mil vezes o mesmo. */
function assinatura(mensagem: string, pilha?: string): string {
  return `${mensagem}|${(pilha ?? '').split('\n')[1]?.trim() ?? ''}`;
}

export function montarRelato(
  origem: Relato['origem'],
  mensagem: string,
  pilha?: string,
): Relato {
  return {
    origem,
    mensagem: cortar(mensagem || 'erro sem mensagem', 500),
    pilha: pilha ? cortar(pilha, MAX_PILHA) : undefined,
    rota: typeof location === 'undefined' ? undefined : location.pathname + location.search,
    agente: typeof navigator === 'undefined' ? undefined : cortar(navigator.userAgent, 300),
    tela: typeof window === 'undefined' ? undefined : `${window.innerWidth}x${window.innerHeight}`,
    // `typeof` porque em teste o `define` do Vite não substitui nada e a
    // constante simplesmente não existe.
    versao: typeof __VERSAO__ === 'undefined' ? 'dev' : __VERSAO__,
    rastro: rastro(),
  };
}

/**
 * Onde fica a função, carregado só na hora de usar.
 *
 * `env` valida as variáveis no momento em que é importado e ESTOURA quando falta
 * alguma. Trazê-lo no topo faria a caixa-preta depender de a configuração estar
 * certa — justamente uma das coisas que ela precisa conseguir relatar. Assim o
 * módulo carrega sempre, e só o envio é que falha quando não há para onde
 * enviar. De quebra, o arquivo passa a ser importável em teste sem `.env`.
 */
async function destino(): Promise<{ url: string; chave: string } | null> {
  try {
    const { env } = await import('./env');
    return { url: env.supabaseUrl, chave: env.supabaseKey };
  } catch {
    return null;
  }
}

/**
 * Manda o relato e devolve o id, para o comentário poder alcançar a mesma linha.
 *
 * Silencioso por completo: se falhar, engole. A alternativa seria um erro dentro
 * do tratador de erro, que é como se transforma uma tela quebrada num navegador
 * travado.
 */
export async function enviarRelato(relato: Relato): Promise<string | null> {
  relatando = true;
  try {
    const onde = await destino();
    if (!onde) return null;

    const cabecalhos: Record<string, string> = {
      'Content-Type': 'application/json',
      apikey: onde.chave,
    };

    /*
     * A sessão entra quando existe, e não faz falta quando não existe.
     *
     * Sem ela o relato fica sem organização e sem usuário — que é exatamente o
     * caso da tela de entrar, o lugar onde um erro é mais caro de reproduzir
     * depois. Import dinâmico para o módulo do banco não virar dependência de
     * carregamento de um arquivo que precisa funcionar quando o resto quebrou.
     */
    try {
      const { supabase } = await import('./supabase');
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (token) cabecalhos.Authorization = `Bearer ${token}`;
    } catch {
      /* sem sessão, segue sem ela */
    }

    const r = await fetch(`${onde.url}/functions/v1/reportar-erro`, {
      method: 'POST',
      headers: cabecalhos,
      body: JSON.stringify(relato),
    });
    if (!r.ok) return null;
    const corpo = (await r.json()) as { id?: string };
    return corpo.id ?? null;
  } catch {
    return null;
  } finally {
    relatando = false;
  }
}

/** O que a pessoa escreveu, colado no relato que já foi. */
export async function comentar(id: string, comentario: string): Promise<boolean> {
  try {
    const onde = await destino();
    if (!onde) return false;

    const r = await fetch(`${onde.url}/functions/v1/reportar-erro`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: onde.chave },
      body: JSON.stringify({ id, comentario }),
    });
    return r.ok;
  } catch {
    return false;
  }
}

/** Vale a pena mandar este, ou já mandamos o mesmo — ou já mandamos demais? */
export function deveRelatar(mensagem: string, pilha?: string): boolean {
  if (relatando) return false;
  if (automaticos >= MAX_AUTOMATICOS) return false;

  const chave = assinatura(mensagem, pilha);
  if (jaRelatados.has(chave)) return false;

  jaRelatados.add(chave);
  automaticos += 1;
  return true;
}

/**
 * Liga a captura do que escapa do React.
 *
 * A moldura de erro pega o que quebra durante a renderização. Ela NÃO pega o
 * que estoura dentro de um `onClick`, de um `setTimeout` ou de uma promessa sem
 * `catch` — e é justamente aí que mora o erro que não deixa marca na tela: a
 * pessoa clica em salvar, nada acontece, e ninguém fica sabendo.
 */
export function instalarCaptura(): void {
  if (typeof window === 'undefined') return;

  window.addEventListener('error', (ev) => {
    const mensagem = ev.message || String(ev.error ?? 'erro');
    const pilha = ev.error instanceof Error ? ev.error.stack : undefined;

    /*
     * "Script error." sem pilha é o que o navegador diz quando o erro veio de
     * um script de OUTRA origem — ele esconde o detalhe por segurança e não há
     * nada dentro do relato para agir.
     *
     * Nosso pacote é servido da mesma origem, então isto nunca é nosso: é
     * extensão do navegador da pessoa. Os dois primeiros relatos que a
     * caixa-preta recebeu na vida foram exatamente isso, e uma caixa-preta que
     * enche de linha inútil é uma que ninguém abre.
     */
    if (!pilha && mensagem === 'Script error.') return;

    if (!deveRelatar(mensagem, pilha)) return;
    void enviarRelato(montarRelato('janela', mensagem, pilha));
  });

  window.addEventListener('unhandledrejection', (ev) => {
    const motivo: unknown = ev.reason;
    const mensagem = motivo instanceof Error ? motivo.message : String(motivo);
    const pilha = motivo instanceof Error ? motivo.stack : undefined;
    if (!deveRelatar(mensagem, pilha)) return;
    void enviarRelato(montarRelato('promessa', mensagem, pilha));
  });

  /*
   * `console.error` vira passo do rastro, não relato.
   *
   * O React avisa por aí antes de quebrar de verdade — chave repetida, hook
   * fora de ordem, resposta em formato inesperado. Sozinho não é incidente;
   * junto da pilha, costuma ser a linha que explica.
   */
  const original = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    try {
      anotar('console', args.map((a) => (a instanceof Error ? a.message : String(a))).join(' '));
    } catch {
      /* anotar nunca pode impedir o console de funcionar */
    }
    original(...args);
  };
}
