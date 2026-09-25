import { useMemo, useState, type FormEvent } from 'react';
import {
  Loader2,
  AlertCircle,
  Check,
  Copy,
  RefreshCw,
  DownloadCloud,
  Plug,
  Unplug,
  TriangleAlert,
  ArrowUp,
  ArrowDown,
  ChevronsUpDown,
} from 'lucide-react';
import {
  META_HEALTH_META,
  META_AD_LEVELS,
  META_AD_LEVEL_LABEL,
  RESULTADO_META,
  META_ENTREGA_META,
  formatarGasto,
  custoPorResultado,
  tipoDeResultado,
  resultadoDaLinha,
  entregaDoStatus,
  estaEntregando,
  type MetaAdLevel,
  type MetaEntrega,
} from '@contracts';
import {
  useIntegracoesMeta,
  useContasDeAnuncio,
  useGasto,
  useCobertura,
  useUltimaSincronizacao,
  useCampanhasNoPainel,
  useAlternarCampanhaNoPainel,
  type Sincronizacao,
  useEventosPresos,
  useSalvarCredenciais,
  useBuscarAtivos,
  useLigarConta,
  useDesconectar,
  useImportarGasto,
  type LinhaDeGasto,
} from '@/hooks/useMeta';
import { PaginasMeta } from '@/components/settings/PaginasMeta';
import { EnderecoWebhook } from '@/components/settings/EnderecoWebhook';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import {
  janelaDeDias,
  janelaDoPeriodo,
  PERIODOS_DE_JANELA,
  type PeriodoDeJanela,
} from '@/hooks/usePainel';
import { CamposDePeriodo } from '@/components/CamposDePeriodo';

export default function Anuncios() {
  const { profile } = useAuth();
  const [periodo, setPeriodo] = useState<PeriodoDeJanela>('30');
  /*
   * As datas do "Personalizado". Só valem com ele escolhido — e, ao escolhê-lo,
   * recebem a janela que já estava na tela (ver o clique na pastilha): a tabela
   * não pula no instante do clique, e a pessoa ajusta a partir do que estava
   * vendo em vez de partir de um padrão qualquer.
   */
  const [aMao, setAMao] = useState(() => janelaDeDias(30));
  const [nivel, setNivel] = useState<MetaAdLevel>('ad');
  /*
   * Começa LIGADO — a pergunta que abre esta tela é "o que está rodando".
   *
   * Mas ligado sozinho não basta: o estado de cada objeto chega numa
   * importação, e antes dela tudo está "sem estado". Numa organização que
   * acabou de conectar, filtrar esvaziaria a tabela e a pessoa concluiria que o
   * gasto sumiu. Por isso o filtro só VALE quando há estado — ver `filtrando`.
   */
  const [somenteAtivos, setSomenteAtivos] = useState(true);

  const janela = useMemo(() => janelaDoPeriodo(periodo, aMao), [periodo, aMao]);
  const since = janela.de;
  const until = janela.ate;

  /*
   * A imobiliária pode ter mais de uma BM — a do gerente e a da corretora.
   *
   * A tela mostra UMA de cada vez, e a escolhida por padrão é a da própria
   * pessoa: quem abre Anúncios está quase sempre olhando o próprio dinheiro.
   * Quem não tem conexão nenhuma cai na primeira que enxerga, e quem não
   * enxerga nenhuma vê o formulário de conectar.
   */
  const conexoes = useIntegracoesMeta();
  const [escolhida, setEscolhida] = useState<string | null>(null);
  const minha = (conexoes.data ?? []).find((i) => i.owner_id === profile?.id);
  const atual =
    (conexoes.data ?? []).find((i) => i.id === escolhida) ?? minha ?? (conexoes.data ?? [])[0] ?? null;
  const integracao = { isLoading: conexoes.isLoading, data: atual };
  const gasto = useGasto(since, until, nivel);
  const cobertura = useCobertura(since, until);
  const presos = useEventosPresos();

  const todas = useMemo(() => gasto.data ?? [], [gasto.data]);
  /*
   * "Já sabemos o estado de alguma coisa?"
   *
   * Enquanto a resposta for não, o filtro fica travado. Deixá-lo clicável
   * esvaziaria a tabela inteira e a explicação — "nenhum gasto no período" —
   * seria falsa: o gasto está lá, o que falta é a importação do estado.
   */
  const temEstado = useMemo(() => todas.some((l) => l.status), [todas]);
  const ativas = useMemo(() => todas.filter((l) => estaEntregando(l.status)), [todas]);
  /*
   * Querer filtrar e PODER filtrar são coisas diferentes.
   *
   * Sem estado importado o filtro não se aplica, mesmo ligado. É o que impede a
   * tela de abrir vazia numa organização recém-conectada, onde o gasto existe e
   * o que falta é a primeira importação de estado.
   */
  const filtrando = somenteAtivos && temEstado;
  const linhas = filtrando ? ativas : todas;
  const ocultas = useMemo(
    () => (filtrando ? todas.filter((l) => !estaEntregando(l.status)) : []),
    [filtrando, todas],
  );

  if (conexoes.isLoading) {
    return (
      <p className="flex items-center gap-2 p-6 text-base text-tx-3">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
      </p>
    );
  }

  const saude = integracao.data?.health;
  const meta = saude ? META_HEALTH_META[saude] : null;

  return (
    <div className="flex flex-col gap-4 pb-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Anúncios e campanhas</h1>
          <p className="mt-0.5 text-base text-tx-2">
            O que a Meta cobrou, e quantos leads vieram de cada anúncio.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/*
            O seletor só aparece quando há mais de uma conexão.
            Com uma só, ele seria um controle que não controla nada — e ainda
            faria a pessoa se perguntar o que está escolhendo.
          */}
          {(conexoes.data ?? []).length > 1 && (
            <select
              value={atual?.id ?? ''}
              onChange={(e) => setEscolhida(e.target.value)}
              aria-label="Conexão da Meta"
              className="rounded-full border border-line-2 bg-card px-3 py-1.5 text-sm font-semibold text-tx-2 outline-none focus:border-pri"
            >
              {(conexoes.data ?? []).map((i) => (
                <option key={i.id} value={i.id}>
                  {i.label ?? 'Conexão'}
                  {i.owner_id === profile?.id ? ' (sua)' : ''}
                </option>
              ))}
            </select>
          )}

          {meta && (
            <span
              className={cn(
                'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold',
                meta.grave ? 'bg-dng-soft text-dng' : 'bg-ok-soft text-ok',
              )}
            >
              {meta.grave ? <AlertCircle className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
              {meta.rotulo}
            </span>
          )}
        </div>
      </header>

      {meta?.grave && (
        <p className="flex items-start gap-2 rounded-xl bg-dng-soft p-3.5 text-base text-dng">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {meta.instrucao}
            {integracao.data?.health_message && (
              <span className="mt-0.5 block text-sm opacity-80">
                {integracao.data.health_message}
              </span>
            )}
          </span>
        </p>
      )}

      {/* Verba paga que não virou lead no CRM. Não pode ficar só numa coluna. */}
      {(presos.data ?? 0) > 0 && (
        <p className="flex items-start gap-2 rounded-xl bg-warn-soft p-3.5 text-base text-warn">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <b>
              {presos.data} lead{presos.data === 1 ? '' : 's'} da Meta não conseguiu entrar.
            </b>{' '}
            O anúncio gerou o lead e o CRM não processou — é verba paga sem retorno.
          </span>
        </p>
      )}

      {!integracao.data ? (
        <Conectar />
      ) : (
        <>
          {/*
            O id da conexão desce para os cartões que AGEM.
            Sem ele, o gerente escolheria a conexão da corretora no seletor e o
            botão "Buscar da Meta" mexeria na dele — a tela mostrando uma coisa
            e o servidor fazendo outra.
          */}
          <Contas conexaoId={integracao.data.id} />
          <EnderecoWebhook conexaoId={integracao.data.id} />
          <PaginasMeta conexaoId={integracao.data.id} />

          <section className="rounded-lg bg-card p-5 shadow-card">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold">Desempenho</h2>
                <Frescor />
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {PERIODOS_DE_JANELA.map((p) => (
                  <Pilula
                    key={p.key}
                    ativa={periodo === p.key}
                    onClick={() => {
                      if (p.key === 'personalizado' && periodo !== 'personalizado') setAMao(janela);
                      setPeriodo(p.key);
                    }}
                  >
                    {p.rotulo}
                  </Pilula>
                ))}
                {/* As datas ficam ao lado de "Personalizado", e só com ele
                    escolhido — é a pastilha que elas completam. */}
                {periodo === 'personalizado' && (
                  <CamposDePeriodo de={aMao.de} ate={aMao.ate} onChange={setAMao} />
                )}
                <span className="mx-1 h-4 w-px bg-line-2" />
                {META_AD_LEVELS.map((n) => (
                  <Pilula key={n} ativa={nivel === n} onClick={() => setNivel(n)}>
                    {META_AD_LEVEL_LABEL[n]}
                  </Pilula>
                ))}
                <span className="mx-1 h-4 w-px bg-line-2" />
                <Pilula
                  ativa={somenteAtivos}
                  desabilitada={!temEstado}
                  onClick={() => setSomenteAtivos((v) => !v)}
                  titulo={
                    temEstado
                      ? 'Mostra só o que está entregando agora no gerenciador'
                      : 'Disponível depois da próxima importação, que é quem traz o estado de cada objeto'
                  }
                >
                  Só no ar
                  {temEstado && <span className="ml-1 opacity-70">{ativas.length}</span>}
                </Pilula>
              </div>
            </div>

            <Cobertura
              com={cobertura.data?.com_atribuicao ?? 0}
              total={cobertura.data?.total ?? 0}
              nivel={nivel}
            />

            <Ocultas linhas={ocultas} nivel={nivel} />

            <Tabela
              linhas={linhas}
              carregando={gasto.isLoading}
              nivel={nivel}
              erro={gasto.error ? String(gasto.error) : null}
              filtrando={filtrando}
              ehHoje={periodo === 'hoje'}
            />
          </section>
        </>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function Pilula({
  ativa,
  onClick,
  children,
  desabilitada,
  titulo,
}: {
  ativa: boolean;
  onClick: () => void;
  children: React.ReactNode;
  desabilitada?: boolean;
  titulo?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={desabilitada}
      title={titulo}
      className={cn(
        'rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45',
        ativa
          ? 'border-pri bg-pri text-pri-fg'
          : 'border-line-2 bg-card text-tx-2 hover:border-pri-light hover:text-tx',
      )}
    >
      {children}
    </button>
  );
}

/**
 * De onde vem o "atualizado às".
 *
 * Do HISTÓRICO de sincronização, nunca do conteúdo da tabela. O sistema
 * auditado desenhava um selo fixo de "Tempo real" e calculava a última
 * atualização como a data máxima das linhas — que é a data do GASTO, não a da
 * importação. Com a integração parada há uma semana, o selo continuava verde.
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

function Frescor() {
  const sync = useUltimaSincronizacao();
  const f = frescorDoConjunto(sync.data ?? []);

  if (f.vazio) return <p className="mt-0.5 text-sm text-tx-3">Nenhuma importação ainda.</p>;

  const quando = f.maisAtrasada
    ? new Date(f.maisAtrasada).toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'em andamento';

  const problema = f.problemas > 0;
  // "1 de 2 contas" só quando há mais de uma: com uma conta só, o número seria
  // ruído sobre uma informação que não tem alternativa.
  const quantas = f.total > 1 ? ` de ${f.total} contas` : '';

  return (
    <p className={cn('mt-0.5 flex items-center gap-1.5 text-sm', problema ? 'text-warn' : 'text-tx-3')}>
      {problema && <TriangleAlert className="h-3 w-3 shrink-0" />}
      Importado em {quando}
      {problema && ` — ${f.problemas}${quantas} com problema`}
      {f.falhou && ' (falhou)'}
      {f.truncado && ' (interrompido pelo limite da Meta)'}
      {!problema && f.emAndamento > 0 && ` — ${f.emAndamento} importando agora`}
    </p>
  );
}

/**
 * O denominador, ao lado do número.
 *
 * Custo por lead só significa alguma coisa com a cobertura da atribuição
 * visível. O sistema auditado dividia o gasto por TODOS os leads da
 * organização, indicação e placa na rua incluídas: o custo saía barato e a
 * decisão de verba era tomada em cima disso.
 */
function Cobertura({ com, total, nivel }: { com: number; total: number; nivel: MetaAdLevel }) {
  if (nivel !== 'ad') {
    return (
      <p className="mb-3 rounded-xl bg-card-2 p-3 text-sm text-tx-2">
        O lead carrega o id do <b>anúncio</b>, não o da campanha. Por isso a coluna de leads e o
        custo por lead só aparecem no nível de anúncio — somar por campanha aqui inventaria um
        número.
      </p>
    );
  }

  const pct = total > 0 ? Math.round((com / total) * 100) : 0;
  const pouco = total > 0 && pct < 60;

  return (
    <p
      className={cn(
        'mb-3 flex items-start gap-2 rounded-xl p-3 text-sm',
        pouco ? 'bg-warn-soft text-warn' : 'bg-card-2 text-tx-2',
      )}
    >
      {pouco && <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
      <span>
        <b>
          {com} de {total} leads
        </b>{' '}
        do período têm atribuição da Meta ({pct}%). O custo por lead divide o gasto só por esses —
        os outros {total - com} vieram de outro caminho ou não puderam ser atribuídos.
      </span>
    </p>
  );
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

/**
 * O que o filtro escondeu — e quanto isso custou no período.
 *
 * Sem esta linha o filtro seria uma armadilha. A tabela continua somando um
 * "Total", e com metade das linhas fora ele deixa de ser o gasto do período
 * sem nada na tela dizendo isso: um número errado com cara de certo, na tela
 * onde se decide verba.
 *
 * E o que está "com problema" aparece em destaque. É o pior caso possível de
 * esconder: gastou, parou de entregar, e ninguém mandou parar — a única linha
 * aqui que pede alguém hoje.
 */
function Ocultas({ linhas, nivel }: { linhas: LinhaDeGasto[]; nivel: MetaAdLevel }) {
  if (linhas.length === 0) return null;

  const moeda = linhas[0]?.currency ?? 'BRL';
  // Moedas diferentes não se somam — o mesmo cuidado do total da tabela.
  const umaMoeda = linhas.every((l) => l.currency === moeda);
  const gasto = linhas.reduce((s, l) => s + l.spend_minor, 0);

  const porEstado = new Map<MetaEntrega, number>();
  for (const l of linhas) {
    const e = entregaDoStatus(l.status);
    porEstado.set(e, (porEstado.get(e) ?? 0) + 1);
  }

  const pedeAtencao = [...porEstado.keys()].some((e) => META_ENTREGA_META[e].atencao);
  const substantivo = META_AD_LEVEL_LABEL[nivel].toLowerCase() + (linhas.length === 1 ? '' : 's');

  return (
    <p
      className={cn(
        'mb-3 rounded-xl px-3 py-2 text-sm',
        pedeAtencao ? 'bg-warn-soft text-warn' : 'bg-card-2 text-tx-2',
      )}
    >
      <b>{linhas.length}</b> {substantivo} fora do ar
      {umaMoeda && (
        <>
          {' '}
          {linhas.length === 1 ? 'gastou' : 'gastaram'} <b>{formatarGasto(gasto, moeda)}</b> no
          período
        </>
      )}{' '}
      e {linhas.length === 1 ? 'está oculto' : 'estão ocultos'} —{' '}
      {[...porEstado.entries()]
        .map(([e, n]) => `${n} ${META_ENTREGA_META[e].rotulo.toLowerCase()}`)
        .join(' · ')}
      .
    </p>
  );
}

function EtiquetaDeEstado({ status }: { status: string | null }) {
  if (!status) return null;
  const entrega = entregaDoStatus(status);
  if (entrega === 'ativo') return null;

  const meta = META_ENTREGA_META[entrega];
  return (
    <span
      // O status cru no `title`: "CAMPAIGN_PAUSED" diz em qual degrau alguém
      // pausou, e é o que faz a pessoa procurar no lugar certo do gerenciador.
      title={status}
      className={cn(
        'ml-2 rounded-full px-2 py-0.5 text-2xs font-bold',
        meta.atencao ? 'bg-warn-soft text-warn' : 'bg-card-2 text-tx-3',
      )}
    >
      {meta.rotulo}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Ordenação                                                                  */
/* -------------------------------------------------------------------------- */

type ChaveDeOrdem =
  | 'nome'
  | 'campanha'
  | 'conta'
  | 'gasto'
  | 'resultados'
  | 'custo'
  | 'cliques'
  | 'crm';

interface Ordem {
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
const PRIMEIRO_CLIQUE: Record<ChaveDeOrdem, boolean> = {
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

/**
 * "Esta campanha conta no painel?"
 *
 * Existe porque nem toda verba da Meta é verba de captação. A imobiliária de origem rodava uma
 * campanha para CONTRATAR corretor: o dinheiro é despesa de recrutamento e quem
 * responde é candidato a vaga, não comprador de apartamento. Somados ao resto,
 * os dois estragam o custo por lead — o gasto pelo numerador, os candidatos pelo
 * denominador.
 *
 * Desligar não apaga nada: os candidatos continuam no funil e nas conversas,
 * porque é gente de verdade com quem alguém precisa falar. O que sai é a
 * MEDIÇÃO.
 */
function BotaoNoPainel({
  conta,
  ocupado,
  onAlternar,
}: {
  conta: boolean;
  ocupado: boolean;
  onAlternar: (conta: boolean) => void;
}) {
  return (
    <button
      onClick={() => onAlternar(!conta)}
      disabled={ocupado}
      title={
        conta
          ? 'Esta campanha entra no painel. Clique para tirar o gasto e os leads dela das contas.'
          : 'Fora do painel: o gasto não soma e os leads dela não contam. Nada foi apagado — clique para voltar.'
      }
      className={cn(
        'ml-2 rounded-full border px-2 py-0.5 text-2xs font-bold transition-colors disabled:opacity-50',
        conta
          ? 'border-line-2 text-tx-3 hover:border-dng hover:text-dng'
          : 'border-warn bg-warn-soft text-warn',
      )}
    >
      {conta ? 'no painel' : 'fora do painel'}
    </button>
  );
}

function Cabecalho({
  chave,
  ordem,
  aoClicar,
  direita,
  titulo,
  children,
}: {
  chave: ChaveDeOrdem;
  ordem: Ordem;
  aoClicar: (c: ChaveDeOrdem) => void;
  direita?: boolean;
  titulo?: string;
  children: React.ReactNode;
}) {
  const ativa = ordem.chave === chave;
  const Seta = !ativa ? ChevronsUpDown : ordem.desc ? ArrowDown : ArrowUp;

  return (
    <th
      scope="col"
      // `aria-sort` é o que faz um leitor de tela anunciar a ordem. Sem ele a
      // seta é informação só para quem enxerga.
      aria-sort={ativa ? (ordem.desc ? 'descending' : 'ascending') : 'none'}
      className={cn('px-2 py-2 font-semibold', direita ? 'text-right' : 'text-left')}
    >
      <button
        type="button"
        onClick={() => aoClicar(chave)}
        title={titulo ?? 'Ordenar por esta coluna'}
        className={cn(
          'inline-flex items-center gap-1 rounded-sm transition-colors hover:text-tx',
          direita && 'flex-row-reverse',
          ativa && 'text-tx',
        )}
      >
        {children}
        <Seta className={cn('h-3 w-3 shrink-0', ativa ? 'text-pri' : 'opacity-35')} />
      </button>
    </th>
  );
}

function Tabela({
  linhas,
  carregando,
  nivel,
  erro,
  filtrando,
  ehHoje,
}: {
  linhas: LinhaDeGasto[];
  carregando: boolean;
  nivel: MetaAdLevel;
  erro: string | null;
  filtrando: boolean;
  ehHoje: boolean;
}) {
  /*
   * Os ganchos vêm ANTES dos retornos curtos — carregando, erro, lista vazia.
   * Chamados depois, a quantidade de ganchos mudaria entre uma renderização e
   * outra e o React quebra a tela inteira com "rendered fewer hooks than
   * expected".
   */
  // O padrão é o mesmo que o banco já devolvia: mais caro em cima.
  const [ordem, setOrdem] = useState<Ordem>({ chave: 'gasto', desc: true });
  const noPainel = useCampanhasNoPainel();
  const alternar = useAlternarCampanhaNoPainel();

  const calculadas = useMemo<LinhaCalculada[]>(
    () =>
      linhas.map((l) => {
        const tipo = tipoDeResultado(l.objective, l.cadastros, l.conversas);
        const resultados = resultadoDaLinha(tipo, l);
        return { l, tipo, resultados, custo: custoPorResultado(l.spend_minor, resultados) };
      }),
    [linhas],
  );

  const ordenadas = useMemo(() => ordenar(calculadas, ordem), [calculadas, ordem]);

  const aoClicar = (chave: ChaveDeOrdem) =>
    setOrdem((o) => (o.chave === chave ? { chave, desc: !o.desc } : { chave, desc: PRIMEIRO_CLIQUE[chave] }));

  if (carregando) {
    return (
      <p className="flex items-center gap-2 py-6 text-base text-tx-3">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
      </p>
    );
  }

  if (erro) {
    return (
      <p className="flex items-start gap-2 rounded-xl bg-dng-soft p-3 text-sm text-dng">
        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Não foi possível ler o gasto. {erro}
      </p>
    );
  }

  if (linhas.length === 0) {
    /*
     * Duas ausências diferentes, duas frases diferentes.
     *
     * "Nenhum gasto no período" com o filtro ligado seria mentira: o gasto
     * existe, o que não existe é nada entregando agora. Quem lesse a frase
     * errada iria conferir a importação em vez de olhar o gerenciador.
     */
    return filtrando ? (
      <p className="py-6 text-base text-tx-3">
        Nada no ar neste período. Desligue <b>Só no ar</b> para ver o que já rodou.
      </p>
    ) : ehHoje ? (
      /*
       * "Hoje" vazio de manhã cedo é o normal, não defeito. O gasto é lido de
       * hora em hora, aos 7 minutos; antes da primeira leitura do dia não há o
       * que mostrar — e a frase de "acabou de conectar" mandaria a pessoa
       * conferir a importação à toa.
       */
      <p className="py-6 text-base text-tx-3">
        Nenhum gasto hoje ainda. O gasto é lido de hora em hora, aos 7 minutos — o que a Meta já
        contou do dia aparece na próxima leitura.
      </p>
    ) : (
      <p className="py-6 text-base text-tx-3">
        Nenhum gasto no período. Se você acabou de conectar, a primeira importação roda na próxima
        hora — ou clique em <b>Importar agora</b> acima.
      </p>
    );
  }

  const totalGasto = linhas.reduce((s, l) => s + l.spend_minor, 0);
  const moeda = linhas[0]?.currency ?? 'BRL';
  // Moedas diferentes não se somam. Se houver mais de uma, o total vira '—'.
  const umaMoeda = linhas.every((l) => l.currency === moeda);

  /*
   * O total sai POR TIPO, e nunca somado.
   *
   * "18 resultados" quando 5 são cadastro de formulário e 13 são conversa de
   * WhatsApp é um número que não responde pergunta nenhuma — nem "quantos
   * cadastros eu tive", nem "quantas conversas". A Meta soma assim no
   * Gerenciador; aqui não.
   */
  const totais = calculadas.reduce(
    (acc, x) => {
      if (x.resultados != null) acc[x.tipo] += x.resultados;
      return acc;
    },
    { cadastro: 0, conversa: 0, clique: 0 },
  );

  const { mostrarCampanha, rotulo: colsDeRotulo, cauda: colsDaCauda } = colunasDaTabela(nivel);

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[980px] border-collapse text-base">
        <thead>
          {/*
            Todo cabeçalho ordena. Ordenar por "Conta" é o que junta numa faixa
            só tudo que saiu da mesma conta — que era a pergunta com duas contas
            ligadas e as linhas intercaladas.
          */}
          <tr className="border-b border-line text-sm text-tx-3">
            <Cabecalho chave="nome" ordem={ordem} aoClicar={aoClicar}>
              {META_AD_LEVEL_LABEL[nivel]}
            </Cabecalho>
            {mostrarCampanha && (
              <Cabecalho chave="campanha" ordem={ordem} aoClicar={aoClicar}>
                Campanha
              </Cabecalho>
            )}
            <Cabecalho
              chave="conta"
              ordem={ordem}
              aoClicar={aoClicar}
              titulo="Agrupa as linhas de cada conta de anúncio"
            >
              Conta
            </Cabecalho>
            <Cabecalho chave="gasto" ordem={ordem} aoClicar={aoClicar} direita titulo="Quem gastou mais">
              Gasto
            </Cabecalho>
            {/* Sem plural fixo: cada linha diz se são cadastros ou conversas. */}
            <Cabecalho
              chave="resultados"
              ordem={ordem}
              aoClicar={aoClicar}
              direita
              titulo="Quem teve mais resultado"
            >
              Resultados
            </Cabecalho>
            <Cabecalho
              chave="custo"
              ordem={ordem}
              aoClicar={aoClicar}
              direita
              // Abre no MENOR: é a pergunta que a coluna responde. Quem ainda
              // não tem custo fica no fim, nos dois sentidos.
              titulo="Menor custo primeiro"
            >
              Custo
            </Cabecalho>
            <Cabecalho chave="cliques" ordem={ordem} aoClicar={aoClicar} direita>
              Cliques
            </Cabecalho>
            {nivel === 'ad' && (
              <Cabecalho
                chave="crm"
                ordem={ordem}
                aoClicar={aoClicar}
                direita
                titulo="Leads que realmente entraram no CRM, por atribuição de primeiro toque"
              >
                No CRM
              </Cabecalho>
            )}
          </tr>
        </thead>
        <tbody>
          {ordenadas.map(({ l, tipo, resultados, custo }) => {
            /*
             * Gasto sem resultado nenhum é o achado mais acionável da tela, e
             * por isso fica MARCADO. O sistema auditado montava a tabela a
             * partir dos leads, e por isso o anúncio que gastou e não converteu
             * simplesmente não aparecia — sumia justo o que precisa ser
             * desligado.
             *
             * O que conta é o resultado DAQUELE tipo de campanha. Antes isto
             * olhava só o lead do CRM, e os 21 anúncios de mensagem desta conta
             * ficavam todos vermelhos para sempre: eles nunca produziriam
             * formulário, e o alarme que dispara sempre deixa de ser lido.
             *
             * E nulo não é zero: enquanto os resultados não foram importados,
             * não há acusação a fazer.
             */
            const queimando = l.spend_minor > 0 && resultados === 0;

            return (
              <tr
                key={l.object_id}
                className={cn('border-b border-line-2 last:border-0', queimando && 'bg-dng-soft/40')}
              >
                <td className="px-2 py-2.5">
                  <span className="font-medium">{l.nome ?? `#${l.object_id}`}</span>
                  {/*
                    O estado só aparece quando NÃO está no ar, e só quando é
                    conhecido. Uma etiqueta "No ar" em toda linha viraria ruído
                    de fundo; uma etiqueta "Sem estado" em todas, antes da
                    primeira importação, seria ruído E alarme falso.
                  */}
                  <EtiquetaDeEstado status={l.status} />
                  {queimando && (
                    <span className="ml-2 rounded-full bg-dng-soft px-2 py-0.5 text-2xs font-bold text-dng">
                      sem {RESULTADO_META[tipo].singular}
                    </span>
                  )}
                  {!l.nome && (
                    <span className="ml-2 text-sm text-tx-3">nome ainda não sincronizado</span>
                  )}

                  {/*
                    O interruptor fica DENTRO da célula do nome, e não numa coluna
                    própria: coluna nova mexeria no `colSpan` do rodapé e nas
                    larguras de tudo, para um controle que só existe num dos três
                    níveis. Colado no nome ele também lê melhor — a decisão é
                    sobre AQUELA campanha.
                  */}
                  {nivel === 'campaign' && (
                    <BotaoNoPainel
                      conta={noPainel.data?.[l.object_id] ?? true}
                      ocupado={alternar.isPending}
                      onAlternar={(conta) => alternar.mutate({ objectId: l.object_id, conta })}
                    />
                  )}
                </td>

                {mostrarCampanha && (
                  <td className="max-w-[240px] px-2 py-2.5 text-sm text-tx-2">
                    {/* Nome de campanha é longo por natureza — "LEADS | Azure |
                        Cidades Invest Imov — CTV4". Truncado com o texto
                        completo no `title`, para não empurrar as colunas de
                        número para fora da tela. */}
                    <span className="block truncate" title={l.campanha ?? undefined}>
                      {l.campanha ?? '—'}
                    </span>
                  </td>
                )}

                <td className="whitespace-nowrap px-2 py-2.5 text-sm text-tx-2">
                  {l.conta ?? '—'}
                </td>

                <td className="px-2 py-2.5 text-right tabular-nums">
                  {formatarGasto(l.spend_minor, l.currency)}
                </td>

                <td className="px-2 py-2.5 text-right tabular-nums">
                  {resultados == null ? (
                    <span className="text-tx-3" title="Ainda não importado">
                      —
                    </span>
                  ) : (
                    <>
                      {resultados}
                      {/* O tipo vem junto do número: sem ele, a coluna mistura
                          cadastro com conversa e ninguém sabe o que leu. */}
                      <span className="ml-1 text-2xs text-tx-3">
                        {resultados === 1
                          ? RESULTADO_META[tipo].singular
                          : RESULTADO_META[tipo].plural}
                      </span>
                    </>
                  )}
                </td>

                <td className="px-2 py-2.5 text-right tabular-nums">
                  {/* Sem resultado o custo é '—', nunca R$ 0,00 — que leria
                      como anúncio de graça. */}
                  <span className={cn(!custo.confiavel && 'text-tx-3')}>
                    {formatarGasto(custo.valor, l.currency)}
                  </span>
                  {custo.valor !== null && !custo.confiavel && (
                    <span
                      className="ml-1 text-2xs text-tx-3"
                      title={`Menos de 5 ${RESULTADO_META[tipo].plural}`}
                    >
                      ~
                    </span>
                  )}
                </td>

                <td className="px-2 py-2.5 text-right tabular-nums text-tx-2">{l.clicks ?? '—'}</td>

                {nivel === 'ad' && (
                  <td className="px-2 py-2.5 text-right tabular-nums text-tx-2">
                    {l.leads_atribuidos}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-line font-bold">
            {/* O "Total" cobre as colunas de TEXTO — nome, campanha e conta. Se
                o número de colunas mudar sem que estas contas mudem junto, o
                rodapé desalinha das colunas de cima e o total aparece embaixo
                do número errado. */}
            <td className="px-2 py-2.5" colSpan={colsDeRotulo}>
              Total
            </td>
            <td className="px-2 py-2.5 text-right tabular-nums">
              {umaMoeda ? (
                formatarGasto(totalGasto, moeda)
              ) : (
                <span className="text-tx-3" title="Há contas em moedas diferentes">
                  —
                </span>
              )}
            </td>
            <td className="px-2 py-2.5 text-right text-sm tabular-nums">
              <span className="flex flex-col items-end gap-0.5">
                {totais.cadastro > 0 && <span>{totais.cadastro} cadastros</span>}
                {totais.conversa > 0 && <span>{totais.conversa} conversas</span>}
                {totais.cadastro === 0 && totais.conversa === 0 && (
                  <span className="text-tx-3">—</span>
                )}
              </span>
            </td>
            {/* Custo, cliques e — no nível do anúncio — "No CRM". */}
            <td colSpan={colsDaCauda} />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function Contas({ conexaoId }: { conexaoId: string }) {
  const contas = useContasDeAnuncio(conexaoId);
  const buscar = useBuscarAtivos(conexaoId);
  const importar = useImportarGasto(conexaoId);
  // A resposta de "Buscar da Meta" diz o que foi recusado por já pertencer a
  // outra imobiliária. Vem como `unknown` do invoke, então o estreitamento é aqui.
  const recusadas = ((buscar.data as { recusadas?: unknown })?.recusadas ?? []) as {
    nome: string;
    motivo: string;
  }[];
  const deOutraCasa = recusadas.filter((r) => r.motivo === 'de_outra_casa');
  const deOutraConexao = recusadas.filter((r) => r.motivo === 'de_outra_conexao');
  const ligar = useLigarConta(conexaoId);
  const desconectar = useDesconectar(conexaoId);

  return (
    <section className="rounded-lg bg-card p-5 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">Contas de anúncio</h2>
          <p className="mt-0.5 text-base text-tx-2">
            Ligue só as contas desta imobiliária. O gasto das desligadas não entra em conta nenhuma.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {/* O texto da tabela vazia prometia este botão e ele não existia. O
              cron de hora em hora está certo para o dia a dia e errado no
              minuto seguinte à conexão, que é quando se quer ver número. */}
          <button
            onClick={() => importar.mutate()}
            disabled={importar.isPending}
            className="inline-flex items-center gap-1.5 rounded-full bg-pri px-3 py-1.5 text-sm font-semibold text-pri-fg transition-colors hover:bg-pri-deep disabled:opacity-60"
          >
            {importar.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <DownloadCloud className="h-3 w-3" />
            )}
            Importar agora
          </button>

          <button
            onClick={() => buscar.mutate()}
            disabled={buscar.isPending}
            className="inline-flex items-center gap-1.5 rounded-full border border-line-2 bg-card px-3 py-1.5 text-sm font-semibold text-tx-2 hover:text-tx"
          >
            {buscar.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
            Buscar da Meta
          </button>
          <button
            onClick={() => desconectar.mutate()}
            disabled={desconectar.isPending}
            className="inline-flex items-center gap-1.5 rounded-full border border-line-2 bg-card px-3 py-1.5 text-sm font-semibold text-tx-3 hover:text-dng"
          >
            <Unplug className="h-3 w-3" />
            Desconectar
          </button>
        </div>
      </div>

      {(buscar.error || importar.error) && (
        <p className="mt-3 flex items-start gap-2 rounded-xl bg-dng-soft p-3 text-sm text-dng">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {((buscar.error ?? importar.error) as Error).message}
        </p>
      )}

      {importar.data != null && (
        <p className="mt-3 flex items-start gap-2 rounded-xl bg-card-2 p-3 text-sm text-tx-2">
          <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ok" />
          Importação disparada. O resultado aparece em <b>Desempenho</b>, logo abaixo.
        </p>
      )}

      {/*
        O que a Meta mostrou e o CRM NÃO pegou.
        Sem esta linha, a conta aparece no Gerenciador de Anúncios e não aparece
        aqui, e o gerente clica em "Buscar da Meta" de novo achando que falhou.
        Antes o sistema pegava mesmo assim — reescrevia a linha da outra
        imobiliária e ficava com ela. Recusar é a decisão certa; recusar em
        silêncio, não.
      */}
      {deOutraCasa.length > 0 && (
        <p className="mt-3 flex items-start gap-2 rounded-xl bg-warn-soft p-3 text-sm text-warn">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Fora da lista: <b>{deOutraCasa.map((r) => r.nome).join(', ')}</b> — já
            {deOutraCasa.length === 1 ? ' está cadastrado' : ' estão cadastrados'} em{' '}
            <b>outra imobiliária</b> deste sistema. Quem registrou primeiro fica com o ativo.
          </span>
        </p>
      )}

      {/*
        A recusa por "outra conexão" é INFORMAÇÃO, não problema.
        Ela diz duas coisas de uma vez: a conta já tem dono aqui dentro, e este
        token consegue enxergá-la — que é exatamente o que se precisa saber para
        decidir se dá para movê-la de BM.
      */}
      {deOutraConexao.length > 0 && (
        <p className="mt-3 flex items-start gap-2 rounded-xl bg-card-2 p-3 text-sm text-tx-2">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-tx-3" />
          <span>
            <b>{deOutraConexao.map((r) => r.nome).join(', ')}</b> —{' '}
            {deOutraConexao.length === 1 ? 'está administrada' : 'estão administradas'} por outra
            conexão desta imobiliária, então {deOutraConexao.length === 1 ? 'ficou' : 'ficaram'} de
            fora desta lista. Este token enxerga{deOutraConexao.length === 1 ? '' : 'm'} — o que
            muda é qual BM responde por {deOutraConexao.length === 1 ? 'ela' : 'elas'}.
          </span>
        </p>
      )}

      {(contas.data ?? []).length === 0 ? (
        <p className="mt-3 text-base text-tx-3">
          Nenhuma conta ainda. Clique em <b>Buscar da Meta</b>.
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {(contas.data ?? []).map((c) => (
            <li
              key={c.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-line-2 p-3"
            >
              <span>
                <span className="block text-base font-semibold">{c.name ?? c.ad_account_id}</span>
                <span className="block text-sm text-tx-3">
                  {c.ad_account_id}
                  {c.currency && ` · ${c.currency}`}
                  {c.timezone_name && ` · ${c.timezone_name}`}
                </span>
              </span>
              <label className="flex shrink-0 cursor-pointer items-center gap-2 text-sm font-semibold">
                <input
                  type="checkbox"
                  checked={c.enabled}
                  disabled={ligar.isPending}
                  onChange={(e) =>
                    ligar.mutate({ adAccountId: c.ad_account_id, ligada: e.target.checked })
                  }
                  className="h-4 w-4 accent-pri"
                />
                {c.enabled ? 'Em uso' : 'Desligada'}
              </label>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* -------------------------------------------------------------------------- */

function Conectar() {
  const salvar = useSalvarCredenciais();
  const [appId, setAppId] = useState('');
  const [appSecret, setAppSecret] = useState('');
  const [token, setToken] = useState('');

  function enviar(e: FormEvent) {
    e.preventDefault();
    salvar.mutate({ appId: appId.trim(), appSecret: appSecret.trim(), accessToken: token.trim() });
  }

  const url = (salvar.data as { webhookUrl?: string } | undefined)?.webhookUrl;

  if (url) {
    return (
      <section className="max-w-[760px] rounded-lg bg-card p-5 shadow-card">
        <h2 className="flex items-center gap-2 text-lg font-bold text-ok">
          <Check className="h-4 w-4" /> Conectado
        </h2>

        {/* Verde que promete mais do que entrega é pior do que amarelo honesto. */}
        {(salvar.data as { leadsHabilitados?: boolean } | undefined)?.leadsHabilitados === false && (
          <p className="mt-2 flex items-start gap-2 rounded-xl bg-warn-soft p-3 text-sm text-warn">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              O <b>gasto</b> já vai aparecer. Os <b>leads</b> ainda não: falta a permissão{' '}
              <b>leads_retrieval</b> no token. Quando o cliente liberar o acesso a leads da Página,
              gere o token de novo e cole aqui — o resto continua valendo.
            </span>
          </p>
        )}
        <p className="mt-1 text-base text-tx-2">
          Falta um passo, e ele só aparece <b>agora</b>: cole este endereço no seu aplicativo da
          Meta, em <b>Webhooks → Página → leadgen</b>. O mesmo valor serve de token de verificação.
        </p>

        <div className="mt-3 flex items-start gap-2 rounded-xl bg-card-2 p-3">
          <code className="min-w-0 flex-1 break-all font-mono text-sm">{url}</code>
          <button
            onClick={() => void navigator.clipboard.writeText(url)}
            className="shrink-0 rounded-lg border border-line-2 bg-card p-1.5 text-tx-2 hover:text-tx"
            aria-label="Copiar endereço"
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
        </div>

        <p className="mt-3 flex items-start gap-2 rounded-xl bg-warn-soft p-3 text-sm text-warn">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Guarde agora. O segredo dentro deste endereço <b>não é gravado em lugar nenhum</b> — o
          banco tem só o resumo dele. Se perder, é preciso gerar outro.
        </p>
      </section>
    );
  }

  return (
    <form onSubmit={enviar} className="max-w-[760px] rounded-lg bg-card p-5 shadow-card">
      <h2 className="flex items-center gap-2 text-lg font-bold">
        <Plug className="h-4 w-4 text-pri" /> Conectar a Meta
      </h2>
      <p className="mt-1 text-base text-tx-2">
        No <b>Gerenciador de Negócios</b> da imobiliária: crie um Usuário do Sistema, atribua o
        aplicativo, a Página e as contas de anúncio como ativos dele, e gere um token.
      </p>

      {/* As duas metades conectam separado, e dizer isso evita a espera à toa:
          quando a Página é de outro portfólio, o acesso a leads depende do
          cliente liberar e pode levar dias. O gasto não espera por isso. */}
      <div className="mt-3 flex flex-col gap-1.5 rounded-xl bg-card-2 p-3 text-sm">
        <span className="flex items-start gap-2">
          <b className="shrink-0 text-tx">ads_read</b>
          <span className="text-tx-2">
            obrigatória — é o gasto das campanhas
          </span>
        </span>
        <span className="flex items-start gap-2">
          <b className="shrink-0 text-tx">leads_retrieval</b>
          <span className="text-tx-2">
            para receber lead. Pode vir depois: conecte agora com o que tiver, que o gasto já
            aparece e os leads entram quando a permissão chegar.
          </span>
        </span>
      </div>

      <div className="mt-4 flex flex-col gap-3">
        <Campo rotulo="ID do aplicativo" valor={appId} onChange={setAppId} />
        <Campo rotulo="Chave secreta do aplicativo" valor={appSecret} onChange={setAppSecret} secreto />
        <Campo rotulo="Token de acesso" valor={token} onChange={setToken} secreto />
      </div>

      {salvar.error && (
        <p className="mt-3 flex items-start gap-2 rounded-xl bg-dng-soft p-3 text-sm text-dng">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {(salvar.error as Error).message}
        </p>
      )}

      <button
        type="submit"
        disabled={salvar.isPending || !appId || !appSecret || !token}
        className="mt-4 inline-flex items-center gap-2 rounded-full bg-pri px-4 py-2 text-base font-semibold text-pri-fg transition-colors hover:bg-pri-deep disabled:opacity-60"
      >
        {salvar.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        Conectar
      </button>

      <p className="mt-3 border-t border-line pt-3 text-sm text-tx-3">
        O token é <b>conferido com a Meta antes de ser guardado</b>: se faltar permissão, a conexão
        é recusada na hora em vez de aparecer conectada e não funcionar. Depois disso ele vive
        cifrado no cofre do banco — nunca volta para esta tela, nem para nenhuma outra.
      </p>
    </form>
  );
}

function Campo({
  rotulo,
  valor,
  onChange,
  secreto,
}: {
  rotulo: string;
  valor: string;
  onChange: (v: string) => void;
  secreto?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-semibold text-tx-2">{rotulo}</span>
      <input
        type={secreto ? 'password' : 'text'}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
        spellCheck={false}
        className="rounded-xl border border-line-2 bg-sheet px-3 py-2 font-mono text-base outline-none focus:border-pri"
      />
    </label>
  );
}
