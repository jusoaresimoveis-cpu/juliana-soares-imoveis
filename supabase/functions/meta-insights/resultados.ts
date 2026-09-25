/**
 * Os RESULTADOS de um anúncio — cadastros e conversas.
 *
 * Gasto e clique não dizem se a campanha funcionou. O que diz é quantas pessoas
 * chegaram do outro lado, e isso muda de nome conforme o tipo de campanha: um
 * anúncio de formulário produz CADASTRO, um de mensagem produz CONVERSA
 * INICIADA. Chamar os dois de "conversão" e somar num número só é o começo de
 * um relatório que ninguém consegue auditar.
 *
 * Por isso as duas contagens moram em colunas separadas. A tela escolhe qual
 * mostrar; o banco nunca precisa adivinhar.
 *
 * Este número é o da META, e não substitui o lead do CRM — são medidas
 * diferentes da mesma coisa, e a diferença entre elas é informação: "a Meta diz
 * 12, chegaram 9" significa que três se perderam no caminho, e isso é
 * exatamente o tipo de buraco que passa despercebido quando existe só um
 * número.
 *
 * Sem import do Deno de propósito, para a suíte conseguir exercitá-lo.
 */

/**
 * Cadastro de formulário na própria Meta.
 *
 * A ordem importa e não é alfabética: `lead` é a contagem crua e
 * `onsite_conversion.lead_grouped` é a AGRUPADA, que a Meta às vezes devolve
 * junto e que inclui outras origens. Somar as duas dobraria o número de
 * cadastros de todo anúncio em que as duas aparecem — e o resultado dobrado
 * continua parecendo plausível na tela, que é o que o torna perigoso.
 */
export const ACOES_DE_CADASTRO = ['lead', 'onsite_conversion.lead_grouped'] as const;

/**
 * Conversa iniciada por mensagem.
 *
 * `messaging_conversation_started_7d` é a métrica que a Meta mostra como
 * "conversas por mensagem iniciadas". A conexão total entra como reserva,
 * também na ordem de preferência, nunca somada.
 */
export const ACOES_DE_CONVERSA = [
  'onsite_conversion.messaging_conversation_started_7d',
  'onsite_conversion.total_messaging_connection',
] as const;

export interface Resultados {
  /** Cadastros. `null` = a Meta mandou algo que não é número. */
  cadastros: number | null;
  conversas: number | null;
}

interface Acao {
  action_type?: unknown;
  value?: unknown;
}

/**
 * Uma contagem, pela primeira ação da lista que existir.
 *
 * Devolve `0` quando nenhuma aparece: a Meta omite o tipo de ação que ficou em
 * zero, então ausência AQUI significa mesmo zero. E devolve `null` quando o
 * valor existe mas não é número — que é diferente de zero e precisa continuar
 * diferente. `Number(x) || 0` transformaria as duas coisas em "nenhum
 * resultado", e um anúncio que converteu apareceria como desperdício.
 */
function numeroDe(bruto: unknown): number | null {
  if (typeof bruto === 'number') {
    return Number.isFinite(bruto) && bruto >= 0 ? Math.trunc(bruto) : null;
  }
  if (typeof bruto !== 'string') return null;
  const t = bruto.trim();
  // String vazia não é zero: `Number('')` é 0, e essa conversão silenciosa já
  // produziu gasto zero neste mesmo projeto.
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : null;
}

function contar(acoes: Acao[], tipos: readonly string[]): number | null {
  let viuZero = false;
  let viuLixo = false;

  for (const tipo of tipos) {
    const achada = acoes.find((a) => a.action_type === tipo);
    if (!achada) continue;

    const n = numeroDe(achada.value);
    if (n === null) {
      viuLixo = true;
      continue;
    }
    /*
     * O primeiro POSITIVO ganha, não o primeiro presente.
     *
     * A ordem da lista diz qual métrica é a mais precisa, e parar no primeiro
     * presente seria o certo se a Meta nunca devolvesse a precisa zerada junto
     * com a agrupada preenchida. Ela devolve, em algumas contas — e aí o
     * anúncio que converteu apareceria com zero, marcado em vermelho como
     * desperdício. Continuar procurando não corre risco de dobrar a contagem:
     * um valor é escolhido, nunca dois somados.
     */
    if (n > 0) return n;
    viuZero = true;
  }

  // Nenhum tipo apareceu, ou todos vieram zerados: é zero de verdade — a Meta
  // omite o tipo de ação que ficou em zero.
  if (viuZero || !viuLixo) return 0;
  // Só veio valor ilegível. Zero afirmaria que não converteu; nulo diz que não
  // sabemos, e a tela escreve '—'.
  return null;
}

export function resultadosDe(bruto: unknown): Resultados {
  // Anúncio sem nenhuma ação no dia não traz o campo. É zero de verdade.
  if (!Array.isArray(bruto)) return { cadastros: 0, conversas: 0 };

  const acoes = bruto.filter((a): a is Acao => !!a && typeof a === 'object');

  return {
    cadastros: contar(acoes, ACOES_DE_CADASTRO),
    conversas: contar(acoes, ACOES_DE_CONVERSA),
  };
}
