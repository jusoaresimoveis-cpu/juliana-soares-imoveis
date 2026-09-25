import { NavLink, useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import {
  LayoutGrid,
  Users,
  Home,
  MessageCircle,
  CalendarDays,
  FileText,
  Megaphone,
  BarChart3,
  Gauge,
  Zap,
  Search,
  Settings,
  Sun,
  Moon,
  LogOut,
} from 'lucide-react';
import { cn, initials } from '@/lib/utils';
import { NotificationCenter } from '@/components/notifications/NotificationCenter';
import { FaixaWhatsappFora } from './FaixaWhatsappFora';
import { BotaoInstalarApp } from '@/components/InstalarApp';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';
import { useCorDoSistema } from '@/hooks/useCorDoSistema';
import { MARCA } from '@/config/marca';

const RAIL = [
  { to: '/', icon: LayoutGrid, label: 'Dashboard', end: true },
  { to: '/leads', icon: Users, label: 'Leads' },
  { to: '/imoveis', icon: Home, label: 'Imóveis' },
  { to: '/conversas', icon: MessageCircle, label: 'Conversas' },
  { to: '/agenda', icon: CalendarDays, label: 'Agenda de visitas' },
  { divider: true as const },
  { to: '/documentos', icon: FileText, label: 'Documentos' },
  /*
   * Anúncios voltou a ser de todo mundo, e o motivo mudou.
   *
   * Estava escondido para o corretor porque `meta_ads_spend` só era legível
   * pela gestão: a tela abriria zerada, o que parece integração quebrada e não
   * permissão. Desde a 087 a corretora tem a PRÓPRIA BM — ela precisa desta
   * tela para conectar, e o que ela vê ali é o dinheiro dela. Quem não tem
   * conexão encontra o formulário de conectar, que é a coisa certa a mostrar.
   */
  { to: '/anuncios', icon: Megaphone, label: 'Anúncios e campanhas' },
  /*
   * A mesa de decisão de verba — e o ÚNICO item deste menu com cargo próprio.
   *
   * Anúncios é de todo mundo porque cada corretora com BM própria vê o dinheiro
   * dela ali. Aqui é o contrário: a tela compara as contas TODAS da casa entre
   * si, mostra orçamento e emite recomendação de onde tirar verba. Isso é do
   * dono, e nem do gerente.
   */
  { to: '/inteligencia', icon: Gauge, label: 'Inteligência', admin: true as const },
  { to: '/atribuicao', icon: BarChart3, label: 'Atribuição' },
  { to: '/automacoes', icon: Zap, label: 'Automações' },
];

const TOP = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/leads', label: 'Funil' },
  { to: '/imoveis', label: 'Imóveis' },
];

/**
 * Altura fixa, rolagem interna.
 *
 * A versão anterior deixava o painel crescer com o conteúdo e posicionava o
 * trilho de forma absoluta dentro dele. Numa tela curta — a de Conversas, por
 * exemplo — o painel encolhia até o tamanho do card e o menu ficava cortado
 * pela metade.
 *
 * Agora o painel ocupa a altura da janela, o trilho entra no fluxo (então
 * nunca é cortado) e só a área de conteúdo rola. Como efeito colateral bom,
 * o topo e o menu ficam sempre visíveis.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { profile, signOut, isAdmin } = useAuth();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();

  /*
   * A paleta é aplicada AQUI, no invólucro de toda tela autenticada.
   *
   * Antes só a tela de configurações montava este hook. Escolher a cor lá
   * funcionava, mas trocar de claro para escuro em qualquer outra tela não
   * reaplicava nada: ficavam os tokens do tema anterior, com a cor de texto de
   * um e o fundo do outro. Só aparece quando se troca o tema fora das
   * configurações — que é o lugar onde o botão de tema realmente vive.
   */
  useCorDoSistema();

  /*
   * O menu ESCONDE; quem fecha é o banco.
   *
   * A versão anterior filtrava por uma propriedade `gestao` que nenhum item do
   * RAIL declarava — o filtro nunca removeu nada, e o comentário afirmava que
   * "a rota também é guardada em App", o que também não era verdade. Duas
   * camadas de proteção que não existiam, uma citando a outra.
   *
   * Agora o item traz `admin` de verdade, `Protegida papel="admin"` guarda a
   * rota, e `e_admin` guarda a função no banco. Só a terceira é proteção; as
   * duas primeiras existem para ninguém ver uma porta que não abre.
   */
  const ehAdmin = isAdmin();
  const rail = RAIL.filter((i) => !('admin' in i && i.admin) || ehAdmin);

  return (
    <div className="flex h-svh bg-bg p-3 md:p-5 lg:p-6">
      <div className="relative mx-auto flex w-full max-w-[1560px] flex-col overflow-hidden rounded-[26px] bg-sheet shadow-sheet md:rounded-[30px]">
        {/* topo */}
        <header className="flex shrink-0 flex-wrap items-center gap-x-5 gap-y-3 px-4 py-3.5 md:px-6 md:py-4">
          <div className="flex items-center gap-2 text-lg font-bold">
            <img src={MARCA.icone} alt="" className="h-[22px] w-[22px] rounded-[7px]" />
            {MARCA.nome}
          </div>

          <nav className="hidden items-center gap-5 lg:flex">
            {TOP.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    'whitespace-nowrap border-b-2 border-transparent pb-1 text-md font-medium text-tx-2 transition-colors hover:text-tx',
                    isActive && 'border-tx font-semibold text-tx',
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <label className="flex min-w-[160px] max-w-[340px] flex-1 items-center gap-2 rounded-full border border-line-2 bg-card px-3.5 py-2">
            <Search className="h-3.5 w-3.5 shrink-0 text-tx-3" />
            <input
              type="search"
              placeholder="Buscar lead, imóvel ou campanha"
              aria-label="Buscar"
              className="w-full bg-transparent text-base outline-none placeholder:text-tx-3"
            />
          </label>

          <div className="ml-auto flex items-center gap-2">
            {/* Some sozinho depois de instalado — é o que o autoriza a ocupar
                espaço num topo já cheio. */}
            <BotaoInstalarApp />

            {/*
              No celular ele é só o ÍCONE; a palavra some.

              Estava `hidden sm:flex`, escondido inteiro abaixo de 640px — o
              botão é largo por causa do rótulo e não cabia no topo. Só que
              esconder o botão para caber o rótulo é resolver o problema errado:
              quem usa o CRM no telefone ficava sem trocar o tema, e a única
              saída era abrir no computador.

              Redondo e do tamanho dos vizinhos, ele vira mais um da fileira; a
              partir de `sm` a palavra volta. O `aria-label` já dizia a ação por
              extenso, então quem usa leitor de tela não perde nada — era o
              rótulo visível que estava sobrando, não a informação.
            */}
            <button
              onClick={toggle}
              aria-label={theme === 'dark' ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
              className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-full border border-line-2 bg-card text-sm font-semibold text-tx-2 transition-colors hover:border-pri-light hover:text-tx sm:flex sm:h-auto sm:w-auto sm:items-center sm:gap-1.5 sm:px-3 sm:py-1.5"
            >
              {theme === 'dark' ? <Moon className="h-3 w-3" /> : <Sun className="h-3 w-3" />}
              <span className="hidden sm:inline">{theme === 'dark' ? 'Escuro' : 'Claro'}</span>
            </button>

            <NotificationCenter />
            <IconButton label="Configurações" onClick={() => navigate('/configuracoes')}>
              <Settings className="h-[15px] w-[15px]" />
            </IconButton>

            {/*
              O "Novo imóvel" saiu daqui em 14/08/2026.
              Ele apontava para `/imoveis?novo=1`, o MESMO destino do atalho
              roxo do painel — e desde que os atalhos subiram para a primeira
              dobra, os dois ficaram na mesma tela, um acima do outro. Dois
              botões idênticos lado a lado não dão duas saídas: dão a dúvida de
              qual é o certo. Quem entra por outra tela chega pela lista de
              imóveis, que tem o botão dela.
            */}
            <span
              title={profile?.full_name ?? ''}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-pri-light to-pri-deep text-xs font-bold text-pri-fg"
            >
              {initials(profile?.full_name ?? '?')}
            </span>
            <IconButton label="Sair" onClick={() => void signOut()}>
              <LogOut className="h-[15px] w-[15px]" />
            </IconButton>
          </div>
        </header>

        {/* Trilho centralizado no PAINEL inteiro, não na área de conteúdo —
            senão ele fica visivelmente mais baixo, deslocado pela altura do
            topo. Posicionamento absoluto é seguro aqui porque o painel tem
            altura fixa: foi o painel encolhendo com o conteúdo que cortava o
            menu na versão anterior, não o posicionamento em si. */}
        <aside
          aria-label="Menu principal"
          className="absolute left-0 top-1/2 z-10 hidden w-[74px] -translate-y-1/2 flex-col items-center gap-1 rounded-r-[38px] bg-gradient-to-b from-pri-light via-pri to-pri-deep py-5 shadow-[8px_0_30px_-14px_var(--brilho-2)] md:flex [@media(max-height:780px)]:gap-0.5 [@media(max-height:780px)]:py-3"
        >
          {rail.map((item, i) =>
            'divider' in item ? (
              <span key={`d${i}`} className="my-1.5 h-px w-6 bg-pri-fg/25 [@media(max-height:780px)]:my-0.5" />
            ) : (
              <RailLink key={item.to} {...item} />
            ),
          )}
        </aside>

        {/*
          Só esta área rola. O topo e o menu ficam parados.

          O recuo da esquerda é a largura do trilho (74px) MAIS o respiro, e o
          da direita é o mesmo respiro — é isso que faz o conteúdo parecer
          centrado entre o menu e a borda. Antes eram 18px de um lado e 28px do
          outro, e o conteúdo encostava no trilho enquanto sobrava folga à
          direita.
        */}
        {/*
          FORA do <main>, e é o ponto todo.
          Dentro dele a faixa rolaria junto com a página e sumiria no primeiro
          scroll — um alarme que só existe no topo do documento é um alarme que
          se perde exatamente quando a pessoa está trabalhando.
        */}
        <FaixaWhatsappFora />

        <main className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 pt-2 md:pl-[106px] md:pr-8 md:pt-3 lg:pl-[118px] lg:pr-11">
          {children}
        </main>

        {/* no celular o trilho vira barra inferior */}
        <nav
          aria-label="Menu principal"
          /*
           * `mb-1.5` levanta a barra 6px do fundo do painel.
           *
           * E com ela sobe o arredondamento: era `rounded-t`, porque a barra
           * encostava embaixo e quem fazia as quinas de baixo era o
           * `overflow-hidden` do painel. Levantada, esse corte deixa de
           * alcançá-la — sem arredondar os quatro cantos, os de baixo voltariam
           * retos e a barra pareceria uma faixa cortada em vez de uma peça
           * solta.
           */
          className="mb-1.5 shrink-0 overflow-x-auto rounded-[20px] bg-gradient-to-r from-pri-light via-pri to-pri-deep px-3 py-2 md:hidden"
        >
          {/* `mx-auto` e não `justify-center`: os dois centralizam quando os
              ícones cabem, mas num contêiner que rola o `justify-center` empurra
              o começo da fila para fora do alcance quando eles NÃO cabem —
              `scrollLeft` não vai a negativo, e o primeiro ícone fica
              inacessível. Margem automática vira zero quando não há espaço
              livre, então a fila volta a começar na borda e rola inteira.
              Com 9 ícones, isso acontece em qualquer celular estreito. */}
          <div className="mx-auto flex w-max items-center gap-1">
            {rail.filter((i) => !('divider' in i)).map((item) => (
              <RailLink key={(item as { to: string }).to} {...(item as (typeof RAIL)[0] & { to: string })} compacto />
            ))}
          </div>
        </nav>
      </div>
    </div>
  );
}

function RailLink({
  to,
  icon: Icon,
  label,
  end,
  compacto,
}: {
  to: string;
  icon: typeof Home;
  label: string;
  end?: boolean;
  compacto?: boolean;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      aria-label={label}
      className={({ isActive }) =>
        cn(
          'group relative grid shrink-0 place-items-center rounded-[13px] text-pri-fg/70 transition-colors hover:bg-pri-fg/15 hover:text-pri-fg',
          // Em tela baixa os ícones encolhem para o trilho nunca precisar de
          // rolagem — que cortaria as dicas ao passar o mouse.
          compacto ? 'h-9 w-9' : 'h-10 w-10 [@media(max-height:780px)]:h-9 [@media(max-height:780px)]:w-9',
          isActive && 'bg-card text-pri shadow-[0_6px_14px_-6px_rgba(0,0,0,.35)] hover:bg-card hover:text-pri',
        )
      }
    >
      <Icon className="h-[18px] w-[18px]" />
      {!compacto && (
        <span className="pointer-events-none absolute left-[calc(100%+14px)] top-1/2 z-30 -translate-x-1.5 -translate-y-1/2 whitespace-nowrap rounded-lg bg-tx px-3 py-1.5 text-sm font-semibold text-sheet opacity-0 shadow-pop transition-all group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100">
          {label}
        </span>
      )}
    </NavLink>
  );
}

// O prop `badge` saiu junto com o sino falso. Ele existia só para desenhar uma
// bolinha vermelha fixa, que anunciava novidade sem nada por trás — o contador
// agora vem do banco, dentro do NotificationCenter.
function IconButton({
  children,
  label,
  onClick,
}: {
  children: ReactNode;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-full border border-line-2 bg-card text-tx-2 transition-colors hover:border-pri-light hover:text-tx"
    >
      {children}
    </button>
  );
}
