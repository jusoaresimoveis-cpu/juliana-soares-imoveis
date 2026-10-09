import { useMemo, useState } from 'react';
import {
  Loader2,
  TriangleAlert,
  Info,
  ExternalLink,
  Target,
  Check,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { formatarGasto, entregaDoStatus, META_ENTREGA_META } from '@contracts';
import { useAuth } from '@/hooks/useAuth';
import { useInteligencia, useSalvarMetaCpl } from '@/hooks/useInteligencia';
import { PERIODOS, janelaDe, periodoInicial, type ChaveDePeriodo } from '@/hooks/usePainel';
import {
  acharProblemas,
  linkDoGerenciador,
  motivoDo,
  rotuloDoDestino,
  rotuloDoObjetivo,
  VEREDITO_META,
  type Achado,
  type CampanhaInteligencia,
  type Inteligencia as Dados,
} from '@/inteligencia';
import { Faixa } from '@/components/inteligencia/Faixa';
import { PorAngulo } from '@/components/inteligencia/PorAngulo';
import { AVolta } from '@/components/inteligencia/AVolta';
import { Cadeia } from '@/components/inteligencia/Cadeia';
import { cn } from '@/lib/utils';

/**
 * A MESA DE DECISÃO DE VERBA.
 *
 * A tela não tenta responder "qual campanha é a melhor" — com um a cinco leads
 * por dia espalhados por doze campanhas, essa pergunta não tem resposta, e
 * fingir que tem é como ela erraria.
 *
 * Ela responde três outras, que têm:
 *
 *   quanto de verba está saindo, e por onde;
 *   quanto disso deixa rastro até o CRM;
 *   o que a conta INTEIRA está dizendo — que é onde mora o volume.
 *
 * A peça de desenho que carrega tudo isso é a barra de faixa do custo por lead.
 * Um número sozinho ("R$ 8,64") convida à decisão; o mesmo número com a faixa
 * desenhada ao redor ("de R$ 4,05 a — não sabemos") desconvida na mesma
 * olhada, sem precisar de um parágrafo de aviso que ninguém lê.
 */

/* -------------------------------------------------------------------------- */

const CHIP: Record<string, string> = {
  ok: 'bg-ok-soft text-ok',
  dng: 'bg-dng-soft text-dng',
  warn: 'bg-warn-soft text-warn',
  neutro: 'bg-card-2 text-tx-3',
};

const GRAVIDADE: Record<Achado['gravidade'], { cor: string; rotulo: string }> = {
  alta: { cor: 'bg-dng-soft text-dng', rotulo: 'Resolver' },
  media: { cor: 'bg-warn-soft text-warn', rotulo: 'Atenção' },
  baixa: { cor: 'bg-card-2 text-tx-3', rotulo: 'Nota' },
};

function Cartao({
  titulo,
  valor,
  nota,
  alerta,
}: {
  titulo: string;
  valor: string;
  nota?: string | null;
  alerta?: boolean;
}) {
  return (
    <div className="rounded-md bg-card p-4 shadow-card">
      <div className="text-2xs font-semibold uppercase text-tx-3">{titulo}</div>
      <div className={cn('mt-1.5 text-2xl font-bold', alerta && 'text-dng')}>{valor}</div>
      {nota ? <div className="mt-0.5 text-xs text-tx-3">{nota}</div> : null}
    </div>
  );
}

/**
 * A FAIXA — o elemento mais importante desta tela.
 *
 * Desenha quatro coisas na mesma régua: o ALVO (onde a casa quer chegar), o
 * TETO (o máximo que ela aceita pagar), o custo medido, e a faixa onde esse
 * custo realmente pode estar. A largura da barra clara É a incerteza.
 *
 * As duas linhas existem porque o julgamento usa as duas, e usa as PONTAS da
 * faixa contra elas: vermelho quando nem o melhor caso cabe no teto, verde
 * quando o palpite bate o alvo e nem o pior caso estoura o teto. Desenhar só
 * uma linha esconderia metade do critério.
 *
 * Quando a faixa passa do fim da régua — porque o teto da faixa não existe, ou
 * porque existe e não cabe — a barra sai pela direita com um degradê, em vez de
 * terminar num ponto. Barra que termina afirma um limite; o degradê diz que
 * continua, e a legenda numérica embaixo diz qual dos dois casos é.
 *
 * A escala é fixa em 2,5× o TETO. Escala automática pelo maior valor faria a
 * mesma campanha mudar de aparência quando OUTRA campanha muda — e a pessoa
 * lendo juraria que algo aconteceu com esta.
 */
/** O funil depois do lead — o pedaço que a Meta nunca vai saber. */
function Funil({ c }: { c: CampanhaInteligencia }) {
  const passos: Array<[string, number]> = [
    ['leads', c.leads],
    ['atendidos', c.atendidos],
    ['visitas', c.visitas_agendadas],
    ['propostas', c.propostas],
    ['vendas', c.vendas],
  ];
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs text-tx-3">
      {passos.map(([rotulo, n], i) => (
        <span key={rotulo} className="flex items-baseline gap-1">
          {i > 0 ? <span className="text-tx-3/50">›</span> : null}
          <span className={cn('font-semibold', n > 0 ? 'text-tx' : 'text-tx-3')}>{n}</span>
          <span>{rotulo}</span>
        </span>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

// Por nome: rótulo, ajuda, valor e cor são todos string; trocados de lugar, o tsc não veria.
interface CampoDaMeta {
  rotulo: string;
  ajuda: string;
  valor: string;
  setValor: (v: string) => void;
  cor: string;
}

/**
 * As duas linhas, editadas juntas.
 *
 * Juntas porque elas só fazem sentido em relação uma à outra — e porque o banco
 * recusa alvo acima do teto. Dois campos separados em dois lugares deixariam a
 * pessoa salvar um estado inválido e descobrir pelo erro.
 *
 * O teto é o obrigatório: sem ele não há semáforo. O alvo é opcional e a
 * legenda diz o que se perde sem ele, em vez de exigir um número que ninguém
 * escolheu.
 */
function MetaDeCpl({
  alvo,
  teto,
  moeda,
  compacto,
}: {
  alvo: number | null;
  teto: number | null;
  moeda: string;
  compacto?: boolean;
}) {
  const { profile } = useAuth();
  const salvar = useSalvarMetaCpl();
  const [txtAlvo, setTxtAlvo] = useState(alvo == null ? '' : String(alvo / 100));
  const [txtTeto, setTxtTeto] = useState(teto == null ? '' : String(teto / 100));
  const [aberto, setAberto] = useState(false);

  const org = profile?.organization_id;
  const num = (t: string) => {
    const n = Number(t.replace(',', '.'));
    return t.trim() !== '' && Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
  };
  const nAlvo = num(txtAlvo);
  const nTeto = num(txtTeto);
  // O teto é obrigatório; o alvo, quando existe, não pode passar dele.
  const valido = nTeto != null && (nAlvo == null || nAlvo <= nTeto);

  if (compacto && !aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="flex items-center gap-1.5 rounded-full border border-line-2 px-3 py-1.5 text-xs font-medium text-tx-2 hover:text-tx"
      >
        <Target className="h-3.5 w-3.5" />
        {alvo != null ? (
          <>
            alvo <span className="text-ok">{formatarGasto(alvo, moeda)}</span> · teto{' '}
            <span className="text-dng">{formatarGasto(teto, moeda)}</span>
          </>
        ) : (
          <>
            teto <span className="text-dng">{formatarGasto(teto, moeda)}</span> · sem alvo
          </>
        )}
      </button>
    );
  }

  const campo = ({ rotulo, ajuda, valor, setValor, cor }: CampoDaMeta) => (
    <label className="flex flex-col gap-1">
      <span className={cn('text-2xs font-semibold uppercase', cor)}>{rotulo}</span>
      <span className="flex items-center gap-1.5 rounded-sm border border-line-2 bg-card px-3 py-2">
        <span className="text-sm text-tx-3">R$</span>
        <input
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          inputMode="decimal"
          placeholder="—"
          className="w-16 bg-transparent text-md font-semibold outline-none"
        />
      </span>
      <span className="text-2xs text-tx-3">{ajuda}</span>
    </label>
  );

  return (
    <div className="rounded-md border border-pri/30 bg-pri-soft/40 p-4">
      <div className="flex items-start gap-2">
        <Target className="mt-0.5 h-4 w-4 shrink-0 text-pri" />
        <div className="min-w-0 flex-1">
          <div className="text-md font-semibold">As duas linhas do custo por lead</div>
          <p className="mt-1 max-w-[64ch] text-sm text-tx-2">
            São perguntas diferentes. O <b>teto</b> é o máximo que dá para pagar — cruzou, para. O{' '}
            <b>alvo</b> é onde a operação começa a render de verdade. Entre os dois existe uma faixa
            larga de "aceitável, mas quero melhor", e é ela que o amarelo ocupa.
          </p>

          <div className="mt-3 flex flex-wrap items-start gap-4">
            {campo({
              rotulo: 'Alvo',
              ajuda: 'abaixo dele, verde',
              valor: txtAlvo,
              setValor: setTxtAlvo,
              cor: 'text-ok',
            })}
            {campo({
              rotulo: 'Teto',
              ajuda: 'acima dele, vermelho',
              valor: txtTeto,
              setValor: setTxtTeto,
              cor: 'text-dng',
            })}
            <button
              type="button"
              disabled={!valido || !org || salvar.isPending}
              onClick={() => {
                if (!org || !valido) return;
                salvar.mutate(
                  { org, alvo: nAlvo, teto: nTeto },
                  { onSuccess: () => setAberto(false) },
                );
              }}
              className="mt-[18px] flex items-center gap-1.5 rounded-sm bg-pri px-4 py-2 text-sm font-semibold text-pri-fg disabled:opacity-40"
            >
              {salvar.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="h-3.5 w-3.5" />
              )}
              Salvar
            </button>
            {compacto ? (
              <button
                type="button"
                onClick={() => setAberto(false)}
                className="mt-[18px] px-2 py-2 text-sm text-tx-3 hover:text-tx"
              >
                Cancelar
              </button>
            ) : null}
          </div>

          {nTeto == null ? (
            <p className="mt-2 text-sm text-tx-3">
              O teto é obrigatório — é ele que produz o vermelho. Sem ele o semáforo fica desligado.
            </p>
          ) : nAlvo == null ? (
            <p className="mt-2 text-sm text-tx-3">
              Sem alvo o vermelho e o amarelo funcionam, mas o verde nunca acende: não existe contra
              o que dizer que uma campanha está rendendo, só que ela é aceitável.
            </p>
          ) : null}
          {nAlvo != null && nTeto != null && nAlvo > nTeto ? (
            <p className="mt-2 text-sm text-dng">
              O alvo não pode ficar acima do teto — seria querer chegar num lugar onde você já teria
              parado.
            </p>
          ) : null}
          {salvar.isError ? (
            <p className="mt-2 text-sm text-dng">Não deu para salvar. Tente de novo.</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function Achados({ lista }: { lista: Achado[] }) {
  const [abertos, setAbertos] = useState<Set<string>>(() => new Set(lista.slice(0, 1).map((a) => a.chave)));
  if (lista.length === 0) return null;

  return (
    <section className="rounded-md bg-card shadow-card">
      <h2 className="px-4 pt-4 text-md font-bold">O que a conta está dizendo</h2>
      <p className="px-4 pb-1 text-sm text-tx-2">
        Estes achados olham a conta inteira, não campanha por campanha — é por isso que eles
        sustentam decisão mesmo quando nenhuma linha da tabela tem volume para um veredito.
      </p>
      <ul className="mt-2 divide-y divide-line">
        {lista.map((a) => {
          const aberto = abertos.has(a.chave);
          const g = GRAVIDADE[a.gravidade];
          return (
            <li key={a.chave}>
              <button
                type="button"
                onClick={() =>
                  setAbertos((s) => {
                    const n = new Set(s);
                    if (n.has(a.chave)) n.delete(a.chave);
                    else n.add(a.chave);
                    return n;
                  })
                }
                className="flex w-full items-start gap-2.5 px-4 py-3 text-left hover:bg-card-2"
              >
                {aberto ? (
                  <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-tx-3" />
                ) : (
                  <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-tx-3" />
                )}
                <span
                  className={cn(
                    'mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-2xs font-semibold uppercase',
                    g.cor,
                  )}
                >
                  {g.rotulo}
                </span>
                <span className="min-w-0 flex-1 text-md font-semibold">{a.titulo}</span>
              </button>
              {aberto ? (
                <div className="px-4 pb-4 pl-[70px]">
                  <p className="max-w-[76ch] text-sm text-tx-2">{a.detalhe}</p>
                  {a.quais && a.quais.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {a.quais.map((q) => (
                        <span
                          key={q}
                          className="rounded-full bg-card-2 px-2 py-0.5 text-2xs text-tx-2"
                        >
                          {q}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* -------------------------------------------------------------------------- */

function Linha({ c, d, moeda }: { c: CampanhaInteligencia; d: Dados; moeda: string }) {
  const v = VEREDITO_META[c.veredito];
  const entrega = entregaDoStatus(c.status);
  const destino = rotuloDoDestino(c.destino);

  return (
    <div className="border-t border-line px-4 py-4 first:border-t-0">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        <span
          className={cn('shrink-0 rounded-full px-2.5 py-1 text-2xs font-bold uppercase', CHIP[v.cor])}
        >
          {v.rotulo}
        </span>

        <div className="min-w-0 flex-1 basis-[240px]">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-md font-semibold">{c.nome ?? `#${c.id}`}</span>
            <span className="text-2xs text-tx-3">
              {META_ENTREGA_META[entrega].rotulo}
              {destino ? ` · ${destino}` : ''}
              {c.objetivo ? ` · ${rotuloDoObjetivo(c.objetivo)}` : ''}
            </span>
          </div>
          <div className="mt-0.5 text-2xs text-tx-3">
            {c.conta_nome ?? c.conta}
            {c.imovel ? ` · ${c.imovel}` : ''}
          </div>
        </div>

        <div className="flex shrink-0 items-baseline gap-4">
          <div className="text-right">
            <div className="text-2xs uppercase text-tx-3">Gasto</div>
            <div className="text-md font-bold">{formatarGasto(c.gasto, moeda)}</div>
          </div>
          <div className="text-right">
            <div className="text-2xs uppercase text-tx-3">Orçamento</div>
            <div className="text-md font-semibold">
              {c.orcamento == null ? (
                <span className="text-tx-3">—</span>
              ) : (
                <>
                  {formatarGasto(c.orcamento, moeda)}
                  <span className="text-2xs font-normal text-tx-3">
                    {c.orcamento_tipo === 'diario' ? '/dia' : ' total'}
                  </span>
                </>
              )}
            </div>
            {c.orcamento_nivel === 'conjuntos' ? (
              <div className="text-2xs text-tx-3">somando conjuntos</div>
            ) : null}
          </div>
        </div>

        <a
          href={linkDoGerenciador(c.conta, c.id)}
          target="_blank"
          rel="noreferrer"
          className="flex shrink-0 items-center gap-1 rounded-full border border-line-2 px-2.5 py-1 text-2xs font-medium text-tx-2 hover:text-tx"
        >
          Ver no Meta
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>

      <p className="mt-2 max-w-[80ch] text-sm text-tx-2">{motivoDo(c, d.meta_cpl, d.teto_cpl, moeda)}</p>

      <Faixa
        cpl={c.cpl}
        piso={c.cpl_piso}
        teto={c.cpl_teto}
        alvo={d.meta_cpl}
        limite={d.teto_cpl}
        moeda={moeda}
      />

      <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1">
        <Funil c={c} />
        <div className="flex flex-wrap items-baseline gap-x-3 text-2xs text-tx-3">
          {/*
            Os dois contadores lado a lado, e NUNCA somados.
            A Meta conta pelo clique, dentro da janela de atribuição dela; o CRM
            conta pela criação, depois de deduplicar por telefone. A diferença
            entre eles é diagnóstico, não erro.
          */}
          <span>
            Meta: <span className="font-semibold text-tx-2">{c.resultados_meta}</span>
          </span>
          {c.ctr != null ? (
            <span>
              CTR de link: <span className="font-semibold text-tx-2">{c.ctr.toFixed(2)}%</span>
            </span>
          ) : (
            <span className="text-tx-3">CTR de link: — (sem coleta)</span>
          )}
          {c.resposta_min != null ? (
            <span>
              1º contato: <span className="font-semibold text-tx-2">{c.resposta_min} min</span>
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * A tela, separada de quem busca o dado.
 *
 * A separação existe para haver um lugar onde OLHAR o desenho sem produção:
 * a prévia de desenvolvimento monta este componente com um retrato real
 * capturado do banco. É o mesmo recurso que os modelos de landing page já usam,
 * e pela mesma razão — desenho que só pode ser visto entrando na conta do
 * cliente é desenho que ninguém revisa.
 */
export function PainelDeInteligencia({
  data,
  chave,
  setChave,
}: {
  data: Dados;
  chave: ChaveDePeriodo;
  setChave: (c: ChaveDePeriodo) => void;
}) {
  const achados = useMemo(() => (!data.erro ? acharProblemas(data) : []), [data]);

  if (data.erro) {
    return (
      <div className="rounded-md bg-card p-8 shadow-card">
        <h1 className="text-xl font-bold">Área restrita</h1>
        <p className="mt-2 max-w-[52ch] text-md text-tx-2">
          Esta área é do administrador da imobiliária.
        </p>
      </div>
    );
  }

  return <Corpo data={data} achados={achados} chave={chave} setChave={setChave} />;
}

export default function Inteligencia() {
  const [chave, setChave] = useState<ChaveDePeriodo>(periodoInicial);
  const janela = useMemo(() => janelaDe(chave), [chave]);
  const { data, isLoading, error } = useInteligencia(janela.de, janela.ate);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-20 text-base text-tx-3">
        <Loader2 className="h-4 w-4 animate-spin" />
        Juntando gasto, lead e funil…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-md bg-card p-8 shadow-card">
        <h1 className="text-xl font-bold">Não deu para carregar</h1>
        <p className="mt-2 text-md text-tx-2">
          A consulta falhou. Se persistir, verifique a conexão com a Meta em Anúncios.
        </p>
      </div>
    );
  }

  return <PainelDeInteligencia data={data} chave={chave} setChave={setChave} />;
}

function Corpo({
  data,
  achados,
  chave,
  setChave,
}: {
  data: Dados;
  achados: Achado[];
  chave: ChaveDePeriodo;
  setChave: (c: ChaveDePeriodo) => void;
}) {
  const moeda = data.resumo.moeda ?? 'BRL';
  const janela = janelaDe(chave);
  const misturada = data.resumo.moedas > 1;
  const cob = data.cobertura;
  const pctCobertura = cob.leads > 0 ? Math.round((cob.na_tela / cob.leads) * 100) : null;

  // O custo por lead da CONTA — o único com volume para significar alguma coisa
  // nesta escala, e por isso o número grande do topo.
  const leadsNaTela = data.campanhas.reduce((t, c) => t + c.leads, 0);
  const cplConta = data.resumo.gasto != null && leadsNaTela > 0 ? data.resumo.gasto / leadsNaTela : null;

  /*
   * Ordem: quem gasta mais em cima.
   *
   * Não é ranking por eficiência de propósito. Ordenar por custo por lead
   * colocaria em primeiro a campanha de três leads que teve sorte — e a
   * primeira linha de uma tabela é lida como recomendação, mesmo sem rótulo
   * nenhum. Gasto é um fato sobre reais, não sobre amostra.
   */
  const campanhas = [...data.campanhas].sort((a, b) => b.gasto - a.gasto);
  const ativas = campanhas.filter((c) => (c.status ?? '').toUpperCase() === 'ACTIVE');
  const paradas = campanhas.filter((c) => (c.status ?? '').toUpperCase() !== 'ACTIVE');

  return (
    <div className="flex flex-col gap-5 pb-10">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Inteligência</h1>
          <p className="mt-0.5 text-sm text-tx-2">
            Onde a verba está entrando, e quanto dela chega ao CRM.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {data.teto_cpl != null ? (
            <MetaDeCpl alvo={data.meta_cpl} teto={data.teto_cpl} moeda={moeda} compacto />
          ) : null}
          <div className="flex gap-1 rounded-full bg-card p-1 shadow-card">
            {PERIODOS.filter((p) => p.key !== 'personalizado').map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => setChave(p.key)}
                className={cn(
                  'rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                  chave === p.key ? 'bg-pri text-pri-fg' : 'text-tx-2 hover:text-tx',
                )}
              >
                {p.rotulo}
              </button>
            ))}
          </div>
        </div>
      </header>

      {data.teto_cpl == null || data.meta_cpl == null ? (
        <MetaDeCpl alvo={data.meta_cpl} teto={data.teto_cpl} moeda={moeda} />
      ) : null}

      {!data.sincronizacao.ok ? (
        <div className="flex items-start gap-2 rounded-md border border-warn/40 bg-warn-soft/40 p-3">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
          <p className="text-sm text-tx-2">
            A última importação de gasto não terminou bem. Enquanto isso, nenhum veredito é emitido —
            número instável não sustenta decisão de cortar verba.
          </p>
        </div>
      ) : null}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Cartao
          titulo="Investido"
          valor={misturada ? '—' : formatarGasto(data.resumo.gasto, moeda)}
          nota={
            misturada
              ? `${data.resumo.moedas} moedas — não somamos`
              : `${data.resumo.campanhas} campanhas · ${data.resumo.contas} contas`
          }
        />
        <Cartao
          titulo="Leads no CRM"
          valor={String(cob.leads)}
          nota={`${cob.na_tela} com anúncio identificado`}
        />
        <Cartao
          titulo="Custo por lead"
          valor={cplConta == null ? '—' : formatarGasto(Math.round(cplConta), moeda)}
          nota="da conta inteira, onde há volume"
        />
        <Cartao
          titulo="Cobertura"
          valor={pctCobertura == null ? '—' : `${pctCobertura}%`}
          nota="dos leads casam com gasto"
          alerta={pctCobertura != null && pctCobertura < 70}
        />
      </section>

      <Achados lista={achados} />

      {/* Antes da tabela de campanhas de propósito: "qual argumento traz gente"
          é a pergunta que muda o criativo de amanhã; "qual campanha gastou" é a
          que muda o orçamento de hoje. A primeira decide a segunda. */}
      <PorAngulo de={janela.de} ate={janela.ate} moeda={moeda} />

      {/* Logo depois do ângulo, e antes das campanhas: o ângulo diz qual
          argumento traz gente, esta diz o que acontece com a gente que veio.
          As duas juntas respondem a pergunta que o custo por lead não
          responde — de que adianta o anúncio barato se o lead dele não anda. */}
      <Cadeia de={janela.de} ate={janela.ate} moeda={moeda} />

      {/* Depois do angulo e antes das campanhas: o angulo diz o que a Meta
          entregou, este cartao diz o que ela ficou sabendo em troca. Os dois
          juntos sao o ciclo — e ele so fecha quando a volta existe. */}
      <AVolta />

      <section className="rounded-md bg-card shadow-card">
        <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 pt-4">
          <h2 className="text-md font-bold">Campanhas no ar</h2>
          <span className="text-2xs text-tx-3">
            ordenadas por gasto — não por eficiência, para a primeira linha não parecer recomendação
          </span>
        </div>
        <div className="mt-3">
          {ativas.length === 0 ? (
            <p className="px-4 pb-4 text-sm text-tx-3">Nenhuma campanha ativa no período.</p>
          ) : (
            ativas.map((c) => <Linha key={c.id} c={c} d={data} moeda={moeda} />)
          )}
        </div>
      </section>

      {paradas.length > 0 ? (
        <section className="rounded-md bg-card shadow-card">
          <div className="px-4 pt-4">
            <h2 className="text-md font-bold">Já paradas, com gasto no período</h2>
            <p className="text-sm text-tx-2">
              Histórico. O dinheiro já saiu e não há ação possível aqui — elas aparecem para o total
              fechar.
            </p>
          </div>
          <div className="mt-3">
            {paradas.map((c) => (
              <Linha key={c.id} c={c} d={data} moeda={moeda} />
            ))}
          </div>
        </section>
      ) : null}

      <footer className="flex items-start gap-2 rounded-md border border-line px-4 py-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-tx-3" />
        <div className="text-sm text-tx-3">
          <p className="max-w-[80ch]">
            <span className="font-semibold text-tx-2">O que ainda não medimos:</span> alcance e
            frequência (a Meta só os entrega por período fechado, e somar dia a dia contaria a mesma
            pessoa várias vezes), criativo como entidade própria, e o valor da proposta separado do
            valor da venda. Enquanto não medirmos, estes campos ficam em branco em vez de estimados.
          </p>
          <p className="mt-1.5 max-w-[80ch]">
            Os três últimos dias ainda podem mudar: a Meta revisa gasto retroativamente por até 28
            dias.
            {data.sincronizacao.quando
              ? ` Última leitura em ${new Date(data.sincronizacao.quando).toLocaleString('pt-BR')}.`
              : ''}
          </p>
        </div>
      </footer>
    </div>
  );
}
