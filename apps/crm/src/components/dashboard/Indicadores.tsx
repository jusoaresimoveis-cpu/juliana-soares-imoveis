import {
  DollarSign,
  Users,
  BarChart3,
  Handshake,
  Banknote,
  CalendarCheck,
  FileText,
  Timer,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  type LucideIcon,
} from 'lucide-react';
import {
  dinheiro,
  duracao,
  custoPorLeadMeta,
  investimento,
  variacao,
  type JanelaDoPainel,
} from '@/hooks/usePainel';
import { cn } from '@/lib/utils';

interface Indicador {
  key: string;
  rotulo: string;
  icone: LucideIcon;
  tom: string;
  valor: (j: JanelaDoPainel) => string;
  /** O número cru dos dois períodos, para a comparação. */
  cru: (j: JanelaDoPainel) => number | null;
  /** Subir é bom? Custo e tempo de atendimento sobem para o lado errado. */
  subirEBom: boolean;
  nota?: (j: JanelaDoPainel) => string | null;
  /**
   * O cartão depende de LER A VERBA de anúncio.
   *
   * As funções do painel são `security invoker`: para quem não enxerga nenhuma
   * conta de anúncio, a soma volta zero. Exibir "R$ 0,00" em Investimento e '—'
   * em Custo por lead não seria discrição, seria a tela AFIRMANDO que ninguém
   * investiu nada. O cartão sai inteiro.
   *
   * Quem responde "você enxerga alguma conta?" é o banco, no campo `ve_verba` —
   * e não o papel da pessoa. Desde a 087 a corretora tem a própria BM, então
   * papel deixou de ser resposta para essa pergunta.
   */
  exigeVerba?: boolean;
}

/**
 * Os oito indicadores.
 *
 * O painel de referência tinha nove; o de comissões saiu porque a imobiliária de origem não
 * trabalha com bônus por venda, e um card que mostra sempre R$ 0,00 ensina o
 * olho a pular a linha inteira.
 */
const INDICADORES: Indicador[] = [
  {
    key: 'investido',
    rotulo: 'Investimento Meta',
    icone: DollarSign,
    tom: 'text-pri bg-pri-soft',
    valor: (j) => dinheiro(investimento(j)),
    cru: investimento,
    subirEBom: false,
    exigeVerba: true,
    // Com moedas diferentes o card não some: ele diz por que não há número.
    nota: (j) => (j.moedas > 1 ? `${j.moedas} moedas no período` : null),
  },
  {
    key: 'leads',
    rotulo: 'Total de leads',
    icone: Users,
    tom: 'text-ok bg-ok-soft',
    valor: (j) => String(j.leads),
    cru: (j) => j.leads,
    subirEBom: true,
    nota: (j) => (j.leads > 0 ? `${j.leads_meta} vieram de anúncio` : null),
  },
  {
    key: 'cpl',
    rotulo: 'Custo por lead',
    icone: BarChart3,
    tom: 'text-warn bg-warn-soft',
    valor: (j) => dinheiro(custoPorLeadMeta(j)),
    cru: custoPorLeadMeta,
    // Custo por lead subindo é notícia ruim, e a seta precisa dizer isso.
    subirEBom: false,
    // O denominador vai JUNTO: sem ele, o número afirma uma precisão que não
    // tem. É o mesmo cuidado da tela de anúncios.
    nota: (j) =>
      j.leads_meta > 0 ? `sobre ${j.leads_meta} leads de anúncio` : 'nenhum lead de anúncio',
    exigeVerba: true,
  },
  {
    key: 'vendas',
    rotulo: 'Vendas fechadas',
    icone: Handshake,
    tom: 'text-ok bg-ok-soft',
    valor: (j) => String(j.vendas),
    cru: (j) => j.vendas,
    subirEBom: true,
  },
  {
    key: 'vgv',
    rotulo: 'VGV gerado',
    icone: Banknote,
    tom: 'text-pri bg-pri-soft',
    valor: (j) => dinheiro(j.vgv_centavos),
    cru: (j) => j.vgv_centavos,
    subirEBom: true,
  },
  {
    key: 'visitas',
    rotulo: 'Visitas agendadas',
    icone: CalendarCheck,
    tom: 'text-pri bg-pri-soft',
    valor: (j) => String(j.visitas),
    cru: (j) => j.visitas,
    subirEBom: true,
    /*
     * O denominador da frase vai junto: o cartão conta visitas MARCADAS no
     * período, não visitas que acontecem nele. Sem esta nota, "1" ao lado de uma
     * agenda com uma visita em setembro parece coincidência — e, pior, parecia
     * zero antes, porque o número era contado pela data da visita dentro de uma
     * janela que termina hoje.
     */
    nota: () => 'marcadas no período',
  },
  {
    key: 'propostas',
    rotulo: 'Propostas abertas',
    icone: FileText,
    tom: 'text-warn bg-warn-soft',
    valor: (j) => String(j.propostas),
    cru: (j) => j.propostas,
    subirEBom: true,
  },
  {
    key: 'tempo',
    rotulo: 'Tempo até o 1º contato',
    icone: Timer,
    tom: 'text-dng bg-dng-soft',
    valor: (j) => duracao(j.minutos_ate_contato),
    cru: (j) => j.minutos_ate_contato,
    // Demorar mais para atender é pior, sempre.
    subirEBom: false,
    nota: (j) =>
      j.leads > 0 && j.contatados < j.leads
        ? `${j.leads - j.contatados} ainda sem contato`
        : null,
  },
];

/**
 * Os indicadores que este papel pode ver.
 *
 * Exportada porque é regra, não desenho: o teste compara a lista dos dois
 * escopos, e uma regra que só existe dentro do JSX não tem como ser conferida.
 */
export function indicadoresDoEscopo(veVerba: boolean): Indicador[] {
  return veVerba ? INDICADORES : INDICADORES.filter((i) => !i.exigeVerba);
}

export function Indicadores({
  atual,
  anterior,
  carregando,
  veVerba,
}: {
  atual: JanelaDoPainel | null;
  anterior: JanelaDoPainel | null;
  carregando: boolean;
  veVerba: boolean;
}) {
  const cartoes = indicadoresDoEscopo(veVerba);

  return (
    /*
     * Três colunas quando são seis cartões, quatro quando são oito.
     *
     * Fixo em quatro, o corretor via uma fileira cheia e outra com dois cartões
     * e metade da faixa vazia — parece tela quebrada, não recorte proposital.
     */
    <div className={cn('grid grid-cols-2 gap-3', cartoes.length === 6 ? 'lg:grid-cols-3' : 'lg:grid-cols-4')}>
      {cartoes.map((ind) => (
        <Card key={ind.key} ind={ind} atual={atual} anterior={anterior} carregando={carregando} />
      ))}
    </div>
  );
}

function Card({
  ind,
  atual,
  anterior,
  carregando,
}: {
  ind: Indicador;
  atual: JanelaDoPainel | null;
  anterior: JanelaDoPainel | null;
  carregando: boolean;
}) {
  const Icone = ind.icone;

  const agora = atual ? ind.cru(atual) : null;
  const antes = anterior ? ind.cru(anterior) : null;
  const pct = agora !== null && antes !== null ? variacao(agora, antes) : null;
  const nota = atual ? (ind.nota?.(atual) ?? null) : null;

  return (
    <section className="rounded-lg bg-card p-3.5 shadow-card">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold leading-snug text-tx-2">{ind.rotulo}</h3>
        <span className={cn('grid h-7 w-7 shrink-0 place-items-center rounded-lg', ind.tom)}>
          <Icone className="h-3.5 w-3.5" />
        </span>
      </div>

      <p className="mt-1.5 text-2xl font-extrabold tabular-nums">
        {carregando ? <span className="text-tx-3">…</span> : (atual ? ind.valor(atual) : '—')}
      </p>

      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <Variacao pct={pct} subirEBom={ind.subirEBom} />
        {nota && <span className="text-2xs text-tx-3">{nota}</span>}
      </div>
    </section>
  );
}

/**
 * A seta de comparação.
 *
 * Duas coisas que o painel de referência errava:
 *
 * 1. Sem período anterior, ele mostrava `+∞%` ou `NaN%`. Aqui é "sem
 *    comparação" — de zero para oito não é aumento de nada, é a primeira vez.
 * 2. A cor vinha do SINAL. Então custo por lead subindo aparecia em verde, e
 *    tempo de atendimento piorando também. Aqui quem decide a cor é a direção
 *    que interessa àquele indicador.
 */
function Variacao({ pct, subirEBom }: { pct: number | null; subirEBom: boolean }) {
  if (pct === null) {
    return <span className="text-2xs text-tx-3">sem comparação</span>;
  }

  if (pct === 0) {
    return (
      <span className="flex items-center gap-0.5 text-2xs font-semibold text-tx-3">
        <Minus className="h-2.5 w-2.5" /> igual
      </span>
    );
  }

  const subiu = pct > 0;
  const bom = subiu === subirEBom;
  const Seta = subiu ? ArrowUpRight : ArrowDownRight;

  return (
    <span
      className={cn(
        'flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-2xs font-bold tabular-nums',
        bom ? 'bg-ok-soft text-ok' : 'bg-dng-soft text-dng',
      )}
    >
      <Seta className="h-2.5 w-2.5" />
      {subiu ? '+' : ''}
      {pct}%
    </span>
  );
}
