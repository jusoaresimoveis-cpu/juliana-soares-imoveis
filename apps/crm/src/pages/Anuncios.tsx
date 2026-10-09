import { useMemo, useState } from 'react';
import { Loader2, AlertCircle, Check, TriangleAlert } from 'lucide-react';
import {
  META_HEALTH_META,
  META_AD_LEVELS,
  META_AD_LEVEL_LABEL,
  estaEntregando,
  type MetaAdLevel,
} from '@contracts';
import {
  useIntegracoesMeta,
  useGasto,
  useCobertura,
  useEventosPresos,
} from '@/hooks/useMeta';
import { PaginasMeta } from '@/components/settings/PaginasMeta';
import { EnderecoWebhook } from '@/components/settings/EnderecoWebhook';
import { ContasDeAnuncio } from '@/components/settings/ContasDeAnuncio';
import { ConectarMeta } from '@/components/settings/ConectarMeta';
import { Pilula } from '@/components/anuncios/Pilula';
import { Frescor } from '@/components/anuncios/Frescor';
import { Cobertura } from '@/components/anuncios/Cobertura';
import { Ocultas } from '@/components/anuncios/Ocultas';
import { TabelaDeDesempenho } from '@/components/anuncios/TabelaDeDesempenho';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import {
  janelaDeDias,
  janelaDoPeriodo,
  PERIODOS_DE_JANELA,
  type PeriodoDeJanela,
} from '@/hooks/usePainel';
import { CamposDePeriodo } from '@/components/CamposDePeriodo';

// As regras puras da tela moram em lib/anuncios; quem já as importava daqui
// (carteira.test.ts, graficos.test.ts) continua importando sem mudar nada.
export { colunasDaTabela, frescorDoConjunto, ordenar, type LinhaCalculada } from '@/lib/anuncios';

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
        <ConectarMeta />
      ) : (
        <>
          {/*
            O id da conexão desce para os cartões que AGEM.
            Sem ele, o gerente escolheria a conexão da corretora no seletor e o
            botão "Buscar da Meta" mexeria na dele — a tela mostrando uma coisa
            e o servidor fazendo outra.
          */}
          <ContasDeAnuncio conexaoId={integracao.data.id} />
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

            <TabelaDeDesempenho
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
