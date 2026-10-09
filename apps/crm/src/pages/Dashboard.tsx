import { useState, useMemo } from 'react';
import {
  FileText,
  Home,
  CalendarCheck,
  CalendarRange,
  UserRound,
  Undo2,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import { motivoDaRetomada } from '@contracts';
import { usePaginaDoLead, useEtiquetasDoLead } from '@/hooks/useLead';
import { Link } from 'react-router-dom';
import { Indicadores } from '@/components/dashboard/Indicadores';
import {
  usePainel,
  janelaDe,
  PERIODOS,
  periodoInicial,
  janelaPersonalizada,
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
import { Atalho } from '@/components/dashboard/Atalho';
import { Tag } from '@/components/dashboard/Tag';
import { Saudacao } from '@/components/dashboard/Saudacao';
import { UltimosLeads } from '@/components/dashboard/UltimosLeads';
import { CartaoDoFunil } from '@/components/dashboard/CartaoDoFunil';
import { EsperandoResposta } from '@/components/dashboard/EsperandoResposta';
import { AnaliseDePerformance } from '@/components/dashboard/AnaliseDePerformance';
import { formatarJanela } from '@/lib/formatosDoPainel';

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
      <Saudacao
        primeiroNome={primeiroNome}
        carteiraVazia={carteiraVazia}
        esperando={esperando}
        painel={painel}
      />

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

      <UltimosLeads recentes={recentes} fotos={fotos} paginas={paginas} etiquetas={etiquetas} />

      {/* funil */}
      <CartaoDoFunil painel={painel} janela={janela} />

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
        <EsperandoResposta fila={fila} fotos={fotos} />
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

      <AnaliseDePerformance painel={painel} janela={janela} />
    </div>
  );
}
