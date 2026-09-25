import { useState, useMemo } from 'react';
import {
  FileText,
  Home,
  CalendarCheck,
  CalendarRange,
  UserRound,
  MessageCircleReply,
  Undo2,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { cn, greeting } from '@/lib/utils';
import {
  DEFAULT_STAGES,
  LEAD_SOURCE_LABEL_CURTO,
  motivoDaRetomada,
  type LeadSource,
} from '@contracts';
import { usePaginaDoLead, useEtiquetasDoLead } from '@/hooks/useLead';
import { Link } from 'react-router-dom';
import { FunilVisual } from '@/components/dashboard/FunilVisual';
import { Indicadores } from '@/components/dashboard/Indicadores';
import { SerieDeLeads } from '@/components/dashboard/SerieDeLeads';
import { CanaisDeAquisicao } from '@/components/dashboard/CanaisDeAquisicao';
import {
  usePainel,
  janelaDe,
  PERIODOS,
  periodoInicial,
  janelaPersonalizada,
  dinheiro,
  custoPorLeadMeta,
  useUltimosLeads,
  useParaRetomar,
  useEsperando,
  desde,
  type ChaveDePeriodo,
} from '@/hooks/usePainel';
import { Avatar } from '@/components/Avatar';
import { CamposDePeriodo } from '@/components/CamposDePeriodo';
import { useFotosGuardadas } from '@/hooks/useFotosGuardadas';
import { SeloDeTemperatura } from '@/components/leads/SeloDeTemperatura';

export default function Dashboard() {
  const { profile, isAdminOrAbove } = useAuth();
  // Estado inicial em função, e não valor: `periodoInicial` lê a largura da
  // janela, e chamá-la a cada renderização desfaria a escolha da pessoa.
  const [periodo, setPeriodo] = useState<ChaveDePeriodo>(periodoInicial);
  /*
   * As duas datas do "Personalizado" começam preenchidas com a janela padrão.
   *
   * Começar vazio faria o painel zerar no instante do clique, antes de a pessoa
   * escolher qualquer coisa — e painel zerado lê como "não há dado", não como
   * "escolha uma data".
   */
  const [aMao, setAMao] = useState(() => janelaDe(periodoInicial()));
  const janela = useMemo(
    () => (periodo === 'personalizado' ? janelaPersonalizada(aMao.de, aMao.ate) : janelaDe(periodo)),
    [periodo, aMao],
  );
  const painel = usePainel(janela.de, janela.ate);
  const recentes = useUltimosLeads();
  const fila = useEsperando();
  const retomar = useParaRetomar();
  const idsRecentes = useMemo(() => (recentes.data ?? []).map((l) => l.id), [recentes.data]);
  /* As duas listas juntas numa assinatura só: a mesma pessoa costuma aparecer
     nas duas, e cada chamada extra é uma ida ao servidor por foto. */
  const fotos = useFotosGuardadas([
    ...(recentes.data ?? []).map((l) => l.foto_path),
    ...(fila.data ?? []).map((l) => l.foto_path),
  ]);
  const paginas = usePaginaDoLead(idsRecentes);
  const etiquetas = useEtiquetasDoLead(idsRecentes);
  const esperando = (painel.data?.atual.leads ?? 0) - (painel.data?.atual.contatados ?? 0);
  /*
   * Quem MANDA no recorte é o banco — `painel_indicadores` devolve o escopo
   * junto dos números, e é ele que vale.
   *
   * O papel que já está na sessão serve só enquanto a resposta não chega: sem
   * esse palpite, o painel abriria com os oito cartões e encolheria para seis
   * meio segundo depois, na cara de quem está olhando.
   */
  const escopo = painel.data?.escopo ?? (isAdminOrAbove() ? 'todos' : 'meus');
  /*
   * Ver a verba deixou de ser função do papel.
   *
   * O banco responde no campo `ve_verba`: "existe conta de anúncio que você
   * enxerga?". Enquanto a resposta não chega, o papel serve de palpite — sem
   * ele o painel abriria com oito cartões e encolheria para seis meio segundo
   * depois, na cara de quem está olhando.
   */
  const veVerba = painel.data?.ve_verba ?? isAdminOrAbove();
  /*
   * Carteira vazia precisa DIZER que está vazia por falta de distribuição.
   *
   * O lead nasce sem responsável quando chega do WhatsApp ou de uma landing
   * page, e o corretor não enxerga lead sem responsável. Sem esta frase, quem
   * entra pela primeira vez vê zero em tudo e conclui que o CRM não está
   * puxando os leads — que é a leitura mais natural do mundo, e a errada.
   *
   * `painel.data &&` porque enquanto carrega o total também é zero: a frase
   * apareceria por meio segundo em todo carregamento, inclusive no do gerente.
   */
  const carteiraVazia = !!painel.data && escopo === 'meus' && painel.data.atual.leads === 0;
  const primeiroNome = profile?.full_name?.split(' ')[0] ?? 'corretor';

  return (
    <div className="grid grid-cols-12 gap-4">
      {/* saudação */}
      <section className="col-span-12 pt-1 lg:col-span-4">
        <h1 className="text-[clamp(1.5rem,2.6vw,2rem)] font-bold leading-tight tracking-[-0.035em]">
          {greeting()}, <span className="text-pri">{primeiroNome}</span>!
          <br />
          Por onde você começa hoje?
        </h1>
        {/* A frase diz o que o banco sabe. Antes eram dois números fixos no
            código — e número inventado na primeira linha do painel ensina a
            desconfiar de todo o resto. */}
        <p className="mt-3 max-w-[34ch] text-md leading-relaxed text-tx-2">
          {carteiraVazia ? (
            <>
              Nenhum lead no seu nome neste período. Quem distribui os que chegam é a gerência —
              assim que um for seu, ele aparece aqui.
            </>
          ) : (
            <>
          {esperando > 0 ? (
            <>
              <strong className="text-tx">
                {esperando} lead{esperando === 1 ? '' : 's'}
              </strong>{' '}
              ainda sem primeiro contato
            </>
          ) : (
            <>Nenhum lead esperando primeiro contato</>
          )}
          {' '}e{' '}
          {/*
            As visitas da saudação são as que ainda VÃO acontecer, e não as do
            período. A pergunta aqui é "por onde você começa hoje?" — e visita
            agendada é sempre futura, então ela nunca cabia numa janela que
            termina hoje. O painel dizia "0 visitas" no mesmo dia em que a agenda
            mostrava uma marcada para setembro.
          */}
          {(painel.data?.atual.visitas_proximas ?? 0) === 0 ? (
            <>nenhuma visita marcada.</>
          ) : (
            <>
              <strong className="text-tx">
                {painel.data?.atual.visitas_proximas} visita
                {painel.data?.atual.visitas_proximas === 1 ? '' : 's'}
              </strong>{' '}
              marcada{painel.data?.atual.visitas_proximas === 1 ? '' : 's'}.
            </>
          )}
            </>
          )}
        </p>
      </section>

      {/*
        Atalhos e filtro dividem a coluna da direita, um sobre o outro.

        Antes os atalhos ficavam abaixo dos indicadores, e o painel abria com
        uma faixa larga de números antes de qualquer coisa que se pudesse FAZER.
        Subindo, a primeira dobra passa a ter as três ações ao lado da saudação
        — que é a pergunta que ela faz: "por onde você começa hoje?".
      */}
      <section className="col-span-12 flex flex-col justify-end gap-3 lg:col-span-8">
        {/*
          Do `sm` para cima os atalhos param de esticar e encostam à DIREITA.

          Em grade de três colunas eles ocupavam a largura toda da seção e
          ficavam largos demais para o que carregam — duas linhas curtas de
          texto num bloco de 300px, com metade dele vazia. Em `flex`, cada um
          mede o próprio conteúdo, e o `justify-end` empurra o trio para o
          canto: sobra um vão entre a saudação e o primeiro botão, que é o que
          separa a frase do painel das ações.

          No telefone continuam em grade de duas colunas. Encostados à direita
          numa tela estreita eles quebrariam em linhas desalinhadas, e aí o
          bloco vira um amontoado em vez de um trio.
        */}
        <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap sm:justify-end sm:gap-2.5">
          {/* `?novo=1` abre o cadastro direto, sem passar pela lista e procurar
              o botão. Quem clicou aqui já decidiu o que quer fazer. */}
          <Atalho
            icon={Home}
            titulo="Cadastrar"
            titulo2="imóvel"
            sub="Fotos, valores e ficha"
            para="/imoveis?novo=1"
          />
          <Atalho
            icon={CalendarCheck}
            titulo="Agenda"
            titulo2="de visitas"
            sub="Hoje e a semana"
            para="/agenda"
          />
          <Atalho
            icon={FileText}
            titulo="Documentos"
            titulo2="e contratos"
            sub="Proposta, recibo e contrato"
            para="/documentos"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-sm font-semibold text-tx-3">
            <span className="flex items-center gap-1.5">
              <CalendarRange className="h-3.5 w-3.5" />
              {formatarJanela(janela)}
            </span>
            {/*
              Sem esta etiqueta, o corretor lê "Total de leads: 3" e conclui que
              a imobiliária teve três leads no mês. O número está certo; o que
              faltava era dizer de quem ele é.
            */}
            {escopo === 'meus' && (
              <span
                className="flex items-center gap-1 rounded-full bg-pri-soft px-2.5 py-1 text-xs font-semibold text-pri"
                title="Estes números são dos leads que estão no seu nome. O funil segue o mesmo recorte."
              >
                <UserRound className="h-3 w-3" />
                Sua carteira
              </span>
            )}
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            {PERIODOS.map((p) => (
              <button
                key={p.key}
                onClick={() => setPeriodo(p.key)}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors',
                  periodo === p.key
                    ? 'border-pri bg-pri text-pri-fg'
                    : 'border-line-2 bg-card text-tx-2 hover:border-pri-light hover:text-tx',
                )}
              >
                {p.rotulo}
              </button>
            ))}

            {/*
              As datas aparecem SÓ quando "Personalizado" está escolhido.
              Dois campos permanentes ao lado das pastilhas competiriam com elas
              o tempo todo — e a pergunta que eles respondem é justamente a que
              as pastilhas já responderam nos outros três casos.
            */}
            {periodo === 'personalizado' && (
              <CamposDePeriodo de={aMao.de} ate={aMao.ate} onChange={setAMao} />
            )}
          </div>
        </div>
      </section>

      {/* indicadores */}
      <div className="col-span-12">
        <Indicadores
          atual={painel.data?.atual ?? null}
          anterior={painel.data?.anterior ?? null}
          carregando={painel.isLoading}
          veVerba={veVerba}
        />
      </div>

      <section className="col-span-12 rounded-lg bg-card p-5 shadow-card lg:col-span-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">Últimos leads</h2>
          <button className="text-sm font-semibold text-tx-3 transition-colors hover:text-pri">
            Ver todos
          </button>
        </div>

        {recentes.isLoading ? (
          <p className="py-6 text-base text-tx-3">Carregando…</p>
        ) : (recentes.data ?? []).length === 0 ? (
          /* Vazio de verdade é informação. Antes havia cinco nomes inventados
             aqui, e nome inventado na primeira dobra do painel ensina a
             desconfiar de todo o resto da tela. */
          <p className="py-6 text-base text-tx-3">
            Nenhum lead ainda. O primeiro que entrar — por anúncio, WhatsApp ou cadastro — aparece
            aqui.
          </p>
        ) : (
          <ul>
            {(recentes.data ?? []).map((lead, i) => (
              <li
                key={lead.id}
                className={cn(
                  'grid grid-cols-[34px_1fr_auto] items-center gap-3 py-3',
                  i < (recentes.data ?? []).length - 1 && 'border-b border-line',
                )}
              >
                <Avatar
                  nome={lead.full_name}
                  foto={(lead.foto_path && fotos.data?.[lead.foto_path]) || lead.foto_url}
                  className="h-[34px] w-[34px] rounded-[11px] text-sm"
                />
                <div className="min-w-0">
                  {/* `flex-wrap` porque a linha ganhou duas etiquetas: com quatro
                      delas num nome longo, sem quebra a última sai da tela. */}
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-md font-bold">
                    <Link to={`/leads/${lead.id}`} className="truncate hover:text-pri">
                      {lead.full_name}
                    </Link>
                    <Tag tom={lead.source === 'meta_ads' ? 'pri' : lead.source === 'google_ads' ? 'ok' : 'warn'}>
                      {LEAD_SOURCE_LABEL_CURTO[lead.source as LeadSource] ?? lead.source}
                    </Tag>
                    {/* O canal e a PÁGINA são coisas diferentes: dois leads de
                        "WhatsApp" podem ter vindo de páginas diferentes, e é a
                        página que está em teste. */}
                    {/* Nome longo de empreendimento não pode empurrar a linha:
                        corta no CSS e o título completo fica no `title`. */}
                    {paginas.data?.[lead.id] && (
                      <Tag tom="neutro" titulo={paginas.data[lead.id]!.rotulo}>
                        {paginas.data[lead.id]!.rotulo}
                      </Tag>
                    )}
                    {/*
                      De qual CONTA DE ANÚNCIO veio.
                      Com duas BMs na casa, "Meta Ads" parou de identificar: dois
                      leads do mesmo canal podem ter saído da conta do gerente ou
                      da corretora, e é essa diferença que diz de quem é o
                      resultado. Sem conta conhecida a etiqueta não aparece — o
                      anúncio ainda não teve gasto importado, e etiqueta
                      adivinhada é pior do que etiqueta ausente.
                    */}
                    {etiquetas.data?.[lead.id]?.conta && (
                      <Tag tom="warn" titulo={etiquetas.data[lead.id]!.conta!}>
                        {etiquetas.data[lead.id]!.conta!}
                      </Tag>
                    )}
                    {/* Quem atende. "Sem responsável" é informação, não lacuna:
                        é o lead que está esperando alguém pegar. */}
                    <Tag
                      tom={etiquetas.data?.[lead.id]?.responsavel ? 'ok' : 'neutro'}
                      titulo={etiquetas.data?.[lead.id]?.responsavel ?? 'Ninguém pegou este lead'}
                    >
                      {etiquetas.data?.[lead.id]?.responsavel ?? 'Sem responsável'}
                    </Tag>
                  </div>
                  <p className="mt-0.5 truncate text-sm text-tx-3">
                    {lead.ultima_mensagem ?? lead.etapa ?? '—'}
                  </p>
                </div>
                <div className="text-right">
                  <time className="block text-xs font-semibold text-tx-3">
                    {desde(lead.created_at)}
                  </time>
                  {lead.nao_lidas > 0 && (
                    <span className="mt-1 inline-grid h-[18px] min-w-[18px] place-items-center rounded-full bg-pri px-1 text-2xs font-bold text-pri-fg">
                      {lead.nao_lidas}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* funil */}
      <section className="col-span-12 flex flex-col rounded-lg bg-gradient-to-br from-pri-light via-pri to-pri-deep p-5 text-pri-fg shadow-[0_18px_36px_-18px_var(--brilho-2)] lg:col-span-4">
        <h2 className="text-lg font-bold">Funil</h2>
        <p className="mb-4 mt-0.5 text-xs opacity-70">Etapas cumulativas · {formatarJanela(janela)}</p>

        <FunilVisual
          etapas={(painel.data?.funil ?? []).map((e) => ({
            key: e.key,
            label: e.label,
            total: e.total,
            ganho: DEFAULT_STAGES.find((s) => s.key === e.key)?.isWon,
          }))}
        />

        <div className="mt-auto flex items-center justify-between gap-3 border-t border-white/20 pt-3.5 text-xs opacity-80">
          <span>
            Conversão total
            <b className="block text-lg font-extrabold opacity-100">{conversao(painel.data)}</b>
          </span>
          <span className="text-right">
            Custo por lead
            <b className="block text-lg font-extrabold opacity-100">
              {painel.data ? dinheiro(custoPorLeadMeta(painel.data.atual)) : '—'}
            </b>
          </span>
        </div>
      </section>

      {/* -------------------------------------------------------------- */}
      {/* com quem eu falo agora                                          */}
      {/*
        AS DUAS FILAS, LADO A LADO, e é a vizinhança que as explica.

        Esquerda: a casa deve resposta. Direita: o cliente sumiu. São os dois
        lados da mesma conversa, e vistas juntas respondem uma pergunta só —
        com quem eu falo agora. Empilhadas em largura cheia elas ocupavam duas
        dobras inteiras e pareciam dois assuntos.

        DEPOIS do funil e dos últimos leads, de propósito: o topo do painel
        responde "como está o mês", e isto responde "o que eu faço hoje". São
        perguntas diferentes, e misturá-las fazia a tela não ter começo.

        Cada uma só aparece quando tem gente dentro. Cartão vazio na primeira
        dobra todo dia ensina a pular aquele pedaço da tela.
      */}
      {(fila.data ?? []).length > 0 && (
        <section className="col-span-12 self-start rounded-lg bg-card p-5 shadow-card lg:col-span-6">
          <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
            <h2 className="flex items-center gap-2 text-lg font-bold">
              <MessageCircleReply className="h-4 w-4 text-warn" />
              Esperando resposta
            </h2>
            <p className="text-sm text-tx-3">
              {(fila.data ?? []).length === 1
                ? 'uma pessoa escreveu e ainda não teve retorno'
                : `${(fila.data ?? []).length} pessoas escreveram e ainda não tiveram retorno`}
            </p>
          </div>

          <ul>
            {(fila.data ?? []).map((lead, i) => (
              <li
                key={lead.id}
                className={cn(
                  'grid grid-cols-[34px_1fr_auto] items-center gap-3 py-3',
                  i < (fila.data ?? []).length - 1 && 'border-b border-line',
                )}
              >
                <Avatar
                  nome={lead.full_name}
                  foto={(lead.foto_path && fotos.data?.[lead.foto_path]) || lead.foto_url}
                  className="h-[34px] w-[34px] rounded-[11px] text-sm"
                />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-md font-bold">
                    <Link to={`/leads/${lead.id}`} className="truncate hover:text-pri">
                      {lead.full_name}
                    </Link>
                    <SeloDeTemperatura valor={lead.temperatura} />
                    {lead.etapa && <Tag tom="neutro">{lead.etapa}</Tag>}
                  </div>
                  <p className="mt-0.5 truncate text-sm text-tx-3">
                    {lead.ultima_mensagem ?? 'Mensagem sem texto'}
                  </p>
                </div>
                {/*
                  O tempo é o assunto desta lista, então ele é o que tem cor.
                  Acima de duas horas vira alerta — é o limite em que uma pessoa
                  que perguntou preço já procurou outra imobiliária.
                */}
                <time
                  className={cn(
                    'text-right text-xs font-bold tabular-nums',
                    Date.now() - new Date(lead.esperando_desde).getTime() > 2 * 3_600_000
                      ? 'text-dng'
                      : 'text-tx-3',
                  )}
                >
                  {desde(lead.esperando_desde)}
                </time>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* PARA RETOMAR — a coluna da direita: aqui é o cliente que sumiu. */}
      {(retomar.data ?? []).length > 0 && (
        <section className="col-span-12 self-start rounded-lg bg-card p-5 shadow-card lg:col-span-6">
          <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
            <h2 className="flex items-center gap-2 text-lg font-bold">
              <Undo2 className="h-4 w-4 text-pri" />
              Para retomar
            </h2>
            <p className="text-sm text-tx-3">
              {/*
                O número que justifica a lista, e ele é medido: de 645 retornos,
                97,8% vieram no mesmo dia — quem ia voltar sozinho já voltou. E
                das mensagens que a casa mandou sem ter sido respondida, uma em
                cada cinco trouxe o cliente de volta.
              */}
              pararam de responder — uma em cada cinco volta quando a casa fala de novo
            </p>
          </div>

          <ul>
            {(retomar.data ?? []).map((lead, i) => {
              const dias = (Date.now() - new Date(lead.silencio_desde).getTime()) / 86_400_000;
              return (
                <li
                  key={lead.id}
                  className={cn(
                    'grid grid-cols-[34px_1fr_auto] items-center gap-3 py-3',
                    i < (retomar.data ?? []).length - 1 && 'border-b border-line',
                  )}
                >
                  <Avatar
                    nome={lead.full_name}
                    foto={(lead.foto_path && fotos.data?.[lead.foto_path]) || lead.foto_url}
                    className="h-[34px] w-[34px] rounded-[11px] text-sm"
                  />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-md font-bold">
                      <Link to={`/leads/${lead.id}`} className="truncate hover:text-pri">
                        {lead.full_name}
                      </Link>
                      <SeloDeTemperatura valor={lead.temperatura} />
                      {lead.etapa && <Tag tom="neutro">{lead.etapa}</Tag>}
                    </div>
                    <p className="mt-0.5 truncate text-sm text-tx-3">
                      {motivoDaRetomada(dias, lead.toques_sem_resposta)}
                    </p>
                  </div>
                  {/*
                    Aqui o tempo NÃO é alarme: ninguém está devendo resposta.
                    Quanto mais recente o silêncio, maior a chance de a pessoa
                    voltar — então o número é informação, não cobrança.
                  */}
                  <time className="text-right text-xs font-bold tabular-nums text-tx-3">
                    {desde(lead.silencio_desde)}
                  </time>
                </li>
              );
            })}
          </ul>
        </section>
      )}


      {/* -------------------------------------------------------------- */}
      {/* análise de performance                                          */}

      <section className="col-span-12 rounded-lg bg-card p-5 shadow-card lg:col-span-8">
        <h2 className="text-lg font-bold">Entrada de leads</h2>
        <p className="mt-0.5 text-sm text-tx-3">
          {painel.data?.serie.passo === 'semana' ? 'Por semana' : 'Por dia'} ·{' '}
          {formatarJanela(janela)}
        </p>

        {painel.isLoading ? (
          <p className="py-16 text-center text-base text-tx-3">Carregando…</p>
        ) : (
          <SerieDeLeads
            pontos={painel.data?.serie.pontos ?? []}
            passo={painel.data?.serie.passo ?? 'dia'}
          />
        )}
      </section>

      <section className="col-span-12 flex flex-col rounded-lg bg-card p-5 shadow-card lg:col-span-4">
        <h2 className="text-lg font-bold">Canais de aquisição</h2>
        <p className="mb-3 mt-0.5 text-sm text-tx-3">Participação por origem</p>

        {painel.isLoading ? (
          <p className="py-16 text-center text-base text-tx-3">Carregando…</p>
        ) : (
          <CanaisDeAquisicao origens={painel.data?.origens ?? []} />
        )}
      </section>
    </div>
  );
}

/**
 * Atalho do painel.
 *
 * `para` é obrigatório de propósito. Estes três cartões nasceram sem destino
 * nenhum: pareciam botões, tinham `hover`, e não faziam nada. Um controle que
 * parece clicável e não responde ensina a pessoa a desconfiar do resto da tela
 * — e ela para de tentar antes de descobrir o que funciona.
 *
 * Com o destino no tipo, criar outro atalho morto deixa de compilar.
 *
 * O ROXO é o mesmo do menu lateral e do funil — `pri-light` a `pri-deep`, na
 * mesma direção. Eles eram cartões brancos entre outros cartões brancos, e o
 * painel inteiro é feito de cartão branco: nada dizia que ali se clicava. Cheio
 * de cor, o atalho para de ser mais um bloco de leitura e vira botão.
 *
 * A sombra usa a própria cor da marca, e não preto. Sombra preta embaixo de
 * roxo saturado suja o tom; a mesma cor mais fundo mantém a peça inteira.
 */
function Atalho({
  icon: Icon,
  titulo,
  titulo2,
  sub,
  para,
}: {
  icon: typeof Home;
  /** Primeira metade do rótulo. No celular ela fica sozinha na linha de cima. */
  titulo: string;
  /** Segunda metade. Desce no celular e volta a fluir ao lado no computador. */
  titulo2: string;
  sub: string;
  para: string;
}) {
  return (
    <Link
      to={para}
      className="flex min-h-[84px] flex-col justify-between gap-2 rounded-lg bg-gradient-to-br from-pri-light via-pri to-pri-deep p-3 text-left text-pri-fg shadow-[0_10px_22px_-12px_var(--brilho)] transition-transform hover:-translate-y-0.5 sm:min-h-[92px] sm:p-3.5"
    >
      {/* O véu branco por cima do roxo, e não uma cor sólida: assim o quadrado
          do ícone acompanha o degradê em vez de brigar com ele. */}
      <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-pri-fg/20">
        <Icon className="h-4 w-4" />
      </span>
      <span>
        {/*
          A quebra é ESCRITA, não deixada para a largura decidir.

          Três botões numa tela de 375 dão ~105px cada, e o rótulo caberia em
          duas linhas por acaso — até um aparelho mais estreito, uma fonte
          maior por acessibilidade ou uma tradução mudarem a conta e "Agenda de
          visitas" virar três linhas, desalinhando o trio. Com as metades
          declaradas, a quebra é a mesma em qualquer aparelho.

          `sm:inline` devolve a frase inteira numa linha só no computador, onde
          o botão é medido pelo conteúdo e não há aperto.
        */}
        <b className="block text-base font-bold leading-tight">
          {titulo}
          <span className="block sm:inline"> {titulo2}</span>
        </b>
        {/* O apoio some no celular: em 105px ele viraria três linhas de 12px e
            o botão deixaria de ser botão para virar parágrafo. */}
        <small className="mt-0.5 hidden text-sm leading-snug text-pri-fg/75 sm:block">{sub}</small>
      </span>
    </Link>
  );
}

function Tag({ tom, children, titulo }: { tom: string; children: string; titulo?: string }) {
  const cores: Record<string, string> = {
    pri: 'bg-pri-soft text-pri',
    ok: 'bg-ok-soft text-ok',
    warn: 'bg-warn-soft text-warn',
    // Discreta de propósito: ela acompanha o canal, não disputa com ele.
    neutro: 'bg-card-2 text-tx-2',
  };
  return (
    <span
      title={titulo}
      className={cn(
        'max-w-[18ch] truncate whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-bold',
        cores[tom] ?? cores['pri'],
      )}
    >
      {children}
    </span>
  );
}

/** "11/07 – 09/08/26", que é como se lê um período de relance. */
function formatarJanela({ de, ate }: { de: string; ate: string }): string {
  const f = (s: string, comAno: boolean) => {
    const [a, m, d] = s.split('-');
    return comAno ? `${d}/${m}/${a?.slice(2)}` : `${d}/${m}`;
  };
  return `${f(de, false)} – ${f(ate, true)}`;
}

/**
 * Conversão de ponta a ponta: quantos dos leads do período fecharam.
 *
 * Devolve '—' sem lead nenhum. Zero por cento com zero lead não é desempenho
 * ruim, é ausência de dado — e o painel auditado exibia 0% nos dois casos, o
 * que faz o começo de mês parecer fracasso.
 */
function conversao(p: { atual: { leads: number; vendas: number } } | null | undefined): string {
  if (!p || p.atual.leads === 0) return '—';
  return `${((p.atual.vendas / p.atual.leads) * 100).toFixed(1).replace('.', ',')}%`;
}
