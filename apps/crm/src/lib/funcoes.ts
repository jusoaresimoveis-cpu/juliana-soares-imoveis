import { supabase } from './supabase';

/**
 * Chamar uma edge function sem cair na armadilha do token.
 *
 * O `supabase-js` resolve o `Authorization` sozinho: usa o token da sessão
 * quando existe, e cai para a chave publicável quando não existe. Só que a chave
 * nova (`sb_publishable_…`) NÃO é um JWT — e toda função com `verify_jwt = true`
 * exige um. Quando essa queda acontece, o PORTÃO recusa com 401 antes da função
 * rodar, e recusa sem cabeçalho de origem: o navegador descarta a resposta e
 * mostra "Failed to send a request to the Edge Function".
 *
 * Com a chave antiga (`eyJ…`, que era um JWT) a mesma queda passava
 * despercebida: o portão aceitava, a função rodava e devolvia "Sessão
 * inválida" — que ao menos dizia a verdade. A troca de formato de chave
 * transformou um erro legível num erro mudo.
 *
 * Isto nasceu dentro de `useWhatsApp` e ficou só lá. Hoje o gerente tentou
 * criar uma corretora e recebeu exatamente aquela mensagem: `criar-corretor`,
 * `redefinir-senha`, `meta-conectar` e `push-inscrever` chamavam cru. Uma
 * correção que mora em um hook só é uma correção pela metade.
 */

/**
 * O erro parece queda de rede?
 *
 * Duas causas muito diferentes com a mesma mensagem: uma se conserta no
 * servidor, a outra a pessoa conserta sozinha recarregando. Sem separar as
 * duas, toda sessão vencida vira chamado de suporte.
 */
function pareceFalhaDeRede(erro: unknown): boolean {
  const m = (erro as { message?: string })?.message ?? '';
  return /failed to send|failed to fetch|networkerror|load failed/i.test(m);
}

/**
 * A mensagem que a função mandou, quando dá para lê-la.
 *
 * O formato de `context` mudou entre versões do supabase-js — já foi `Response`,
 * já foi objeto simples. Uma versão anterior chamava `.json()` às cegas e
 * estourava "resposta.json is not a function", ESCONDENDO o erro real atrás de
 * um erro sobre o erro. Aqui cada forma é tentada e nenhuma falha derruba a
 * mensagem original.
 */
async function mensagemDoCorpo(erro: unknown): Promise<string | null> {
  try {
    const ctx = (erro as { context?: unknown }).context;
    if (!ctx) return null;

    if (typeof (ctx as Response).json === 'function') {
      const corpo = (await (ctx as Response).json()) as { erro?: unknown } | null;
      if (corpo?.erro) return String(corpo.erro);
    }
    if (typeof (ctx as { body?: unknown }).body === 'string') {
      const corpo = JSON.parse((ctx as { body: string }).body) as { erro?: unknown } | null;
      if (corpo?.erro) return String(corpo.erro);
    }
    if (typeof ctx === 'object' && 'erro' in ctx) return String((ctx as { erro: unknown }).erro);
  } catch {
    /* extração falhou: a mensagem crua ainda é melhor que um erro sobre o erro */
  }
  return null;
}

export async function chamarFuncao<T = unknown>(
  nome: string,
  corpo: Record<string, unknown>,
  /** O que dizer quando a função falha e não explica. */
  generico = 'Não foi possível concluir a operação.',
): Promise<T> {
  const { data: sessao } = await supabase.auth.getSession();
  if (!sessao.session) {
    throw new Error('Sua sessão expirou. Recarregue a página e entre novamente.');
  }

  // O token que ACABOU de ser conferido, explícito. Assim não há queda possível
  // para a chave publicável.
  let { data, error } = (await supabase.functions.invoke(nome, {
    body: corpo,
    headers: { Authorization: `Bearer ${sessao.session.access_token}` },
  })) as { data: unknown; error: unknown };

  /*
   * Uma segunda chance, e uma só.
   *
   * `getSession` já renova sozinho quando o token está vencido; este
   * `refreshSession` cobre o caso em que a renovação automática ficou para trás
   * — aba em segundo plano por horas, máquina que dormiu. Insistir mais que uma
   * vez transformaria servidor fora do ar em espera longa sem explicação.
   */
  if (error && pareceFalhaDeRede(error)) {
    const { data: renovada } = await supabase.auth.refreshSession();
    if (renovada.session) {
      ({ data, error } = (await supabase.functions.invoke(nome, {
        body: corpo,
        headers: { Authorization: `Bearer ${renovada.session.access_token}` },
      })) as { data: unknown; error: unknown });
    }
    if (error && pareceFalhaDeRede(error)) {
      throw new Error(
        'Não foi possível falar com o servidor. Recarregue a página; se persistir, saia e entre de novo.',
      );
    }
  }

  if (error) {
    const doCorpo = await mensagemDoCorpo(error);
    throw new Error(doCorpo ?? (error as { message?: string }).message ?? generico);
  }

  // Função que responde 200 com `{erro}` no corpo: acontece quando a regra de
  // negócio recusa e o status não é o canal certo para dizer isso.
  if ((data as { erro?: string } | null)?.erro) {
    throw new Error(String((data as { erro: string }).erro));
  }

  return data as T;
}
