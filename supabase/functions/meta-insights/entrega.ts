/**
 * O ESTADO de cada campanha, conjunto e anúncio no gerenciador — e, desde a
 * 105, o ORÇAMENTO e a ESTRATÉGIA DE LANCE.
 *
 * O insights não devolve nada disso. Ele só responde "quanto gastou de tal a
 * tal dia" — e um objeto que gastou R$ 500 na semana passada e foi pausado
 * ontem continua aparecendo com os mesmos R$ 500, indistinguível do que está
 * rodando agora. A tela de decisão de verba ficava listando as duas coisas
 * juntas.
 *
 * Por isso vem de outra borda (`/campaigns`, `/adsets`, `/ads`), que é uma
 * chamada por nível por conta — e não uma por objeto.
 *
 * POR QUE OS CAMPOS MUDAM POR NÍVEL
 *
 * `daily_budget` e `lifetime_budget` existem em campanha e conjunto, e NÃO
 * existem em anúncio. Pedir um campo inexistente não é ignorado pela Graph: ela
 * responde erro e derruba a página inteira — e com ela o `effective_status`,
 * que é o motivo original desta consulta existir. Por isso cada borda carrega a
 * própria lista.
 *
 * `destination_type` mora no CONJUNTO, e é ele que separa clique-para-WhatsApp
 * de formulário nativo dentro do mesmo `OUTCOME_LEADS`. Sem essa distinção as
 * duas coisas caem na mesma coluna de "leads" e o custo por resultado compara
 * conversa com cadastro — que são denominadores diferentes.
 *
 * Este arquivo não importa nada do Deno de propósito: assim a suíte do
 * navegador consegue exercitar as regras, que é onde moram os defeitos.
 */

export interface ObjetoDaMeta {
  id?: string;
  effective_status?: string;
  daily_budget?: unknown;
  lifetime_budget?: unknown;
  bid_strategy?: unknown;
  destination_type?: unknown;
}

export interface LinhaDeEntrega {
  organization_id: string;
  level: string;
  object_id: string;
  ad_account_id: string;
  effective_status: string;
  budget_minor: number | null;
  budget_kind: string | null;
  bid_strategy: string | null;
  destination_type: string | null;
  synced_at: string;
}

/**
 * Nível ↔ borda da Graph ↔ campos daquele nível.
 *
 * `effective_status` e não `status`: um anúncio ligado dentro de campanha
 * pausada retorna `CAMPAIGN_PAUSED`, então a mesma coluna serve aos três níveis
 * sem junção extra.
 */
export const BORDAS_DE_ENTREGA = [
  {
    nivel: 'campaign',
    borda: 'campaigns',
    campos: 'id,effective_status,daily_budget,lifetime_budget,bid_strategy',
  },
  {
    nivel: 'adset',
    borda: 'adsets',
    campos: 'id,effective_status,daily_budget,lifetime_budget,bid_strategy,destination_type',
  },
  // Anúncio não tem orçamento nem destino próprios: os dois moram acima dele.
  { nivel: 'ad', borda: 'ads', campos: 'id,effective_status' },
] as const;

/**
 * ORÇAMENTO JÁ VEM NA UNIDADE MÍNIMA. Não multiplicar por 100.
 *
 * Esta é a armadilha desta migração inteira, e ela é silenciosa nos dois
 * sentidos. A Graph responde `spend` em unidade MAIOR — `"12.34"` são doze
 * reais e trinta e quatro centavos — e responde `daily_budget` em unidade
 * MENOR — `"10000"` são cem reais. Os dois chegam como string na mesma
 * resposta, e nada no formato distingue um do outro.
 *
 * Passar o orçamento por `paraMenor` (que multiplica por 100, e está certo para
 * o gasto) transformaria R$ 100/dia em R$ 10.000/dia na tela. A recomendação de
 * "+20%" viria em cima disso, e o número continuaria parecendo plausível para
 * quem não conhece a conta.
 */
function orcamentoDe(bruto: unknown): number | null {
  if (typeof bruto === 'number') {
    return Number.isFinite(bruto) && bruto > 0 ? Math.trunc(bruto) : null;
  }
  if (typeof bruto !== 'string') return null;
  const t = bruto.trim();
  // String vazia não é zero. `Number('')` é 0, e essa conversão silenciosa já
  // produziu gasto zerado neste mesmo projeto.
  if (t === '') return null;
  const n = Number(t);
  /*
   * Zero é DESCARTADO, e de propósito: a Meta devolve `daily_budget: "0"` no
   * objeto que não carrega orçamento naquele nível — campanha em ABO, conjunto
   * em CBO. Gravar zero afirmaria "esta campanha tem orçamento de zero reais",
   * e a tela mostraria uma campanha que gastou R$ 300 com orçamento R$ 0.
   * Nulo diz a verdade: o orçamento está no outro nível.
   */
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}

/** Texto curto e limpo, ou nulo. Nunca string vazia gravada como valor. */
function texto(bruto: unknown, teto = 40): string | null {
  if (typeof bruto !== 'string') return null;
  const t = bruto.trim();
  return t === '' ? null : t.slice(0, teto);
}

/**
 * As linhas de estado de uma página de resultados.
 *
 * Três regras, e todas existem para não DESTRUIR dado bom:
 *
 * 1. Objeto sem `effective_status` fica de fora, em vez de gravar nulo. Gravar
 *    apagaria o último estado conhecido, e a tela passaria a mostrar "sem
 *    estado" para algo que ela sabia estar no ar — o filtro esconderia uma
 *    campanha ativa e ninguém entenderia por quê.
 * 2. O lote carrega SÓ o que esta consulta sabe, nunca o nome. O nome vem do
 *    insights, e um lote com `name: null` o apagaria de todas as linhas de uma
 *    vez. É a mesma armadilha que `dimensoesDe` já evita do outro lado.
 * 3. Orçamento nulo é gravado como nulo DE PROPÓSITO, e aqui a regra se inverte
 *    em relação ao nome: campanha que trocou de CBO para ABO precisa mesmo
 *    perder o orçamento que tinha no nível de campanha. Manter o valor antigo
 *    faria a tela sugerir "+20% sobre R$ 300" para uma campanha que não tem
 *    mais orçamento próprio.
 *
 * E deduplica pelo id: página que se sobrepõe faria o upsert receber a mesma
 * chave duas vezes no mesmo comando, e o Postgres recusa o lote INTEIRO com
 * "ON CONFLICT DO UPDATE command cannot affect row a second time".
 */
export function entregaDe(
  objetos: ObjetoDaMeta[],
  nivel: string,
  org: string,
  adAccountId: string,
  agora: string,
): LinhaDeEntrega[] {
  const porId = new Map<string, LinhaDeEntrega>();

  for (const o of objetos) {
    const id = typeof o.id === 'string' ? o.id.trim() : '';
    if (!id) continue;

    const estado = typeof o.effective_status === 'string' ? o.effective_status.trim() : '';
    if (!estado) continue;

    /*
     * Diário PRIMEIRO, e a ordem é a decisão.
     *
     * Um objeto tem um ou outro, nunca os dois — mas a Meta às vezes devolve o
     * que não vale como `"0"`, e `orcamentoDe` já descarta zero. Olhar o total
     * primeiro faria uma campanha com orçamento vitalício antigo e diário atual
     * exibir o número errado.
     */
    const diario = orcamentoDe(o.daily_budget);
    const total = diario === null ? orcamentoDe(o.lifetime_budget) : null;

    porId.set(id, {
      organization_id: org,
      level: nivel,
      object_id: id,
      ad_account_id: adAccountId,
      effective_status: estado,
      budget_minor: diario ?? total,
      budget_kind: diario !== null ? 'diario' : total !== null ? 'total' : null,
      bid_strategy: texto(o.bid_strategy),
      destination_type: texto(o.destination_type),
      synced_at: agora,
    });
  }

  return [...porId.values()];
}

/**
 * A PÁGINA DE ONDE O ANÚNCIO FALA.
 *
 * Existe por uma recusa da Meta, e por uma que só apareceu na quarta tentativa
 * de devolver uma conversão (a 144):
 *
 *   "Para eventos de CTWA, o parâmetro 'ctwa_clid' deve ser gerado usando o
 *    mesmo ID que o parâmetro 'page_id'."
 *
 * Quer dizer: o clique que abriu a conversa pertence a uma Página, e o evento
 * tem de dizer QUAL. A Página conectada ao CRM não serve — é a do anúncio que
 * vale, e numa casa com quatro contas de anúncio elas não são a mesma.
 *
 * `effective_object_story_id` vem no formato `<page_id>_<post_id>`, e é por ele
 * e não por `object_story_spec{page_id}` de propósito: é um campo raso. Campo
 * aninhado que a Graph não entende derruba a PÁGINA INTEIRA da resposta — e
 * esta consulta compartilha borda com o `effective_status`, que é o que separa
 * anúncio no ar de anúncio pausado na tela de verba.
 */
export const BORDA_DA_PAGINA = {
  borda: 'ads',
  campos: 'id,creative{effective_object_story_id}',
} as const;

export interface LinhaDePagina {
  organization_id: string;
  level: string;
  object_id: string;
  ad_account_id: string;
  page_id: string;
}

interface AnuncioComCriativo {
  id?: string;
  creative?: { effective_object_story_id?: unknown } | null;
}

export function paginasDeAnuncio(
  objetos: AnuncioComCriativo[],
  org: string,
  adAccountId: string,
): LinhaDePagina[] {
  const porId = new Map<string, LinhaDePagina>();

  for (const o of objetos) {
    const id = typeof o.id === 'string' ? o.id.trim() : '';
    if (!id) continue;

    const historia = o.creative?.effective_object_story_id;
    if (typeof historia !== 'string') continue;

    /*
     * Só a parte ANTES do sublinhado, e só se for número.
     *
     * Um criativo sem história publicada devolve o campo ausente, e aí a linha
     * fica de fora — nunca gravada como nula. Gravar nulo apagaria uma página
     * que já tinha sido descoberta numa rodada anterior, e o evento voltaria a
     * ser recusado sem nada ter mudado na tela.
     */
    const pagina = historia.split('_')[0]?.trim() ?? '';
    if (!/^[0-9]{8,20}$/.test(pagina)) continue;

    porId.set(id, {
      organization_id: org,
      level: 'ad',
      object_id: id,
      ad_account_id: adAccountId,
      page_id: pagina,
    });
  }

  return [...porId.values()];
}
