import { custoPorResultado, tipoDeResultado, type MetaAdLevel } from '@contracts';
import type { LinhaDeGasto, Sincronizacao } from '@/hooks/useMeta';

/**
 * A conta da tela "Anúncios", fora da tela para ser testada: o frescor do
 * conjunto de contas, as colunas da tabela de desempenho e a ordem dela.
 */

/**
 * O estado do conjunto de contas, a partir das execuções.
 *
 * Exportada e pura porque a regra que importa aqui é uma decisão, não um
 * desenho: o frescor do conjunto é o da conta MAIS ATRASADA, nunca o da mais
 * recente. Com duas contas ligadas, mostrar a última que terminou repete a
 * mentira do selo fixo de "Tempo real" que este cartão existe para eliminar — a
 * conta parada há três dias fica escondida atrás da que importou agora. Quem lê
 * "importado às 14h" precisa poder confiar que TODO número da tela é de 14h.
 */
export function frescorDoConjunto(linhas: Sincronizacao[]) {
  const porConta = linhas.filter((s) => s.kind === 'insights');
  const problemas = porConta.filter(
    (s) => s.status === 'erro' || s.status === 'parcial' || s.truncated,
  );
  const terminadas = porConta
    .map((s) => s.finished_at)
    .filter((d): d is string => !!d)
    .sort();

  return {
    vazio: porConta.length === 0,
    total: porConta.length,
    /** A execução mais ANTIGA que terminou. Nula quando nenhuma terminou. */
    maisAtrasada: terminadas[0] ?? null,
    problemas: problemas.length,
    emAndamento: porConta.filter((s) => !s.finished_at).length,
    falhou: problemas.some((s) => s.status === 'erro'),
    truncado: problemas.some((s) => s.truncated),
  };
}

/**
 * Quantas colunas a tabela tem, e como o rodapé as cobre.
 *
 * O rodapé usa `colSpan` para pular as colunas de texto e as de cauda. Errar
 * uma unidade não quebra nada: a tabela renderiza, e o total simplesmente
 * aparece embaixo do número errado — o gasto total alinhado com a coluna de
 * cliques, por exemplo. Ninguém percebe até tomar uma decisão em cima disso.
 *
 * Como função pura, a soma vira uma coisa que o teste confere.
 *
 * `rotulo` são as colunas de texto (nome, campanha, conta) que o "Total" cobre;
 * `cauda` são as que vêm depois de gasto e resultados (custo, cliques e, só no
 * nível do anúncio, "No CRM").
 */
export function colunasDaTabela(nivel: MetaAdLevel): {
  mostrarCampanha: boolean;
  rotulo: number;
  cauda: number;
  total: number;
} {
  /*
   * No nível de campanha a coluna "Campanha" repetiria a primeira — o objeto da
   * linha JÁ é a campanha. Repetir o mesmo texto lado a lado gasta largura e
   * ainda faz duvidar se são a mesma coisa.
   */
  const mostrarCampanha = nivel !== 'campaign';
  const rotulo = 1 + (mostrarCampanha ? 1 : 0) + 1; // nome + campanha? + conta
  const cauda = 2 + (nivel === 'ad' ? 1 : 0); //       custo + cliques + noCRM?
  return { mostrarCampanha, rotulo, cauda, total: rotulo + 2 + cauda };
}

/* -------------------------------------------------------------------------- */
/* Ordenação                                                                  */
/* -------------------------------------------------------------------------- */

export type ChaveDeOrdem =
  | 'nome'
  | 'campanha'
  | 'conta'
  | 'gasto'
  | 'resultados'
  | 'custo'
  | 'cliques'
  | 'crm';

export interface Ordem {
  chave: ChaveDeOrdem;
  desc: boolean;
}

/**
 * Para que lado a coluna abre no PRIMEIRO clique.
 *
 * Cada coluna responde a uma pergunta, e a pergunta já diz a direção: "quem
 * gastou mais", "quem teve mais resultado", "quem está com o MENOR custo". Abrir
 * todas em ordem crescente obrigaria dois cliques em quase todas — e o custo,
 * que é a única onde o menor interessa, ficaria mostrando primeiro os mais
 * caros.
 */
export const PRIMEIRO_CLIQUE: Record<ChaveDeOrdem, boolean> = {
  nome: false,
  campanha: false,
  conta: false,
  gasto: true,
  resultados: true,
  cliques: true,
  crm: true,
  custo: false,
};

/*
 * `numeric` para "Azure — 2" vir antes de "Azure — 10", e `sensitivity: base`
 * para acento e caixa não separarem o que é o mesmo nome. Sem os dois, a lista
 * ordenada por texto parece embaralhada justamente onde os nomes se repetem com
 * um número no fim, que é como esta conta nomeia tudo.
 */
const COLACAO = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });

export interface LinhaCalculada {
  l: LinhaDeGasto;
  tipo: ReturnType<typeof tipoDeResultado>;
  resultados: number | null;
  custo: ReturnType<typeof custoPorResultado>;
}

function valorDaColuna(x: LinhaCalculada, chave: ChaveDeOrdem): string | number | null {
  switch (chave) {
    case 'nome':
      return x.l.nome ?? '';
    case 'campanha':
      return x.l.campanha ?? '';
    case 'conta':
      return x.l.conta ?? '';
    case 'gasto':
      return x.l.spend_minor;
    case 'resultados':
      return x.resultados;
    case 'custo':
      return x.custo.valor;
    case 'cliques':
      return x.l.clicks;
    case 'crm':
      return x.l.leads_atribuidos;
  }
}

/**
 * Ordena sem nunca deixar o vazio na frente.
 *
 * Duas regras, e as duas vieram de olhar a tabela real:
 *
 * · AUSÊNCIA VAI SEMPRE PARA O FIM, nos dois sentidos. Resultado e custo são
 *   nulos quando a importação ainda não trouxe o número, e "menor custo"
 *   crescente colocaria uma tela inteira de "—" no topo — a pergunta ficaria
 *   sem resposta justamente no clique feito para respondê-la.
 * · EMPATE DESEMPATA PELO GASTO, decrescente. Ordenar por conta junta todas as
 *   linhas da mesma conta, e dentro do grupo a ordem seria a que o banco
 *   devolveu por acaso. Com o desempate, cada grupo continua com o mais caro em
 *   cima, que é a leitura útil.
 */
export function ordenar(linhas: LinhaCalculada[], ordem: Ordem): LinhaCalculada[] {
  const { chave, desc } = ordem;

  return [...linhas].sort((A, B) => {
    const a = valorDaColuna(A, chave);
    const b = valorDaColuna(B, chave);

    const vazioA = a === null || a === '';
    const vazioB = b === null || b === '';
    if (vazioA !== vazioB) return vazioA ? 1 : -1;

    if (!vazioA && !vazioB) {
      if (typeof a === 'string' || typeof b === 'string') {
        const r = COLACAO.compare(String(a), String(b));
        if (r !== 0) return desc ? -r : r;
      } else if (a !== b) {
        return desc ? (b as number) - (a as number) : (a as number) - (b as number);
      }
    }

    return B.l.spend_minor - A.l.spend_minor;
  });
}
