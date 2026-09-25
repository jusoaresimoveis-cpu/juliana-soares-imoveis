import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Navigate, Link, useLocation } from 'react-router-dom';
import { Loader2, ArrowRight, Eye, EyeOff, User, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { definirLembrar } from '@/lib/supabase';
import { MARCA } from '@/config/marca';
import { ENTRADA } from './temaEntrada';

/**
 * A ÚNICA tela do CRM que um buscador alcança.
 *
 * Todo o resto está atrás de `Protegida` — o robô não tem sessão, é mandado
 * para cá e é isto que ele indexaria. O `noindex` global saiu do `index.html`
 * porque barrava as landing pages junto; aqui ele volta, no único lugar onde
 * ainda faz sentido.
 *
 * Dinâmico e não estático de propósito: é o inverso do defeito anterior. Se
 * esta linha falhar, o pior que acontece é uma tela de login indexada — e não
 * uma página de venda invisível na busca.
 */
function useNaoIndexar() {
  useEffect(() => {
    const tag = document.createElement('meta');
    tag.name = 'robots';
    tag.content = 'noindex, nofollow';
    document.head.appendChild(tag);
    return () => tag.remove();
  }, []);
}

/**
 * A porta de entrada do CRM.
 *
 * Papel branco, e sobre ele UM cartão grande de canto redondo que emoldura a
 * tela inteira — a mesma linguagem do painel que vem depois. A ilustração mora
 * no canto de cima à esquerda desse cartão e SANGRA para fora dele; quem corta
 * é o `overflow-hidden` da moldura, então a curva do canto arredondado passa
 * por cima do desenho. É esse corte que dá a sensação de janela.
 *
 * Três blocos, e a ordem deles muda com a tela:
 *
 *   celular       cena · cartão · marca   (o cartão cavalga a borda da cena)
 *   computador    cena              cartão
 *                 marca
 *
 * É a mesma marcação nas duas; quem reordena é a grade. Duplicar o formulário
 * para cada faixa daria dois formulários que divergem na primeira correção
 * feita num só — e formulário de login é onde isso dói mais.
 */
export default function Auth() {
  useNaoIndexar();
  const { user, loading, signIn } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [verSenha, setVerSenha] = useState(false);
  const [lembrar, setLembrar] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const campoEmail = useRef<HTMLInputElement>(null);

  // O cursor já começa no e-mail: é sempre o primeiro campo, e quem entra
  // todo dia digita sem olhar.
  useEffect(() => {
    campoEmail.current?.focus();
  }, []);

  if (loading) return <FullPageLoader />;

  if (user) {
    const from = (location.state as { from?: string } | null)?.from ?? '/';
    return <Navigate to={from} replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    // ANTES de entrar: a escolha decide onde a sessão nova será escrita.
    definirLembrar(lembrar);
    const { error } = await signIn(email, senha);
    setEnviando(false);
    if (error) setErro(error);
  }

  return (
    <div className="min-h-svh p-3 sm:p-5 lg:p-7" style={{ background: ENTRADA.papel }}>
      <div
        className="relative mx-auto grid min-h-[calc(100svh-1.5rem)] max-w-[1360px] overflow-hidden rounded-[26px] sm:rounded-[32px] lg:min-h-[calc(100svh-3.5rem)] lg:grid-cols-[1.04fr_0.96fr] lg:grid-rows-[1fr_auto]"
        style={{ background: ENTRADA.moldura }}
      >
        <Cena />

        {/*
          O cartão CAVALGA a cena no celular — é o que amarra os dois em vez de
          empilhar uma coisa sobre a outra. No computador ele ocupa a coluna da
          direita inteira e a margem negativa não existe: lá não há nada acima
          dele para invadir.
        */}
        <div className="relative z-10 -mt-16 px-4 pb-8 sm:-mt-24 sm:px-6 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:mt-0 lg:flex lg:items-center lg:px-10 lg:pb-0">
          <div className="mx-auto w-full max-w-[420px]">
            <form
              onSubmit={onSubmit}
              className="rounded-[24px] border p-6 shadow-[0_24px_60px_-30px_rgb(60_45_25_/_0.3)] backdrop-blur-xl sm:p-7"
              style={{ background: ENTRADA.vidro, borderColor: ENTRADA.vidroBorda }}
            >
              <h1 className="text-2xl font-bold sm:text-3xl" style={{ color: ENTRADA.titulo }}>
                Olá <span style={{ color: ENTRADA.marca }}>de novo!</span>
              </h1>
              <p className="mb-6 mt-1 text-md" style={{ color: ENTRADA.texto }}>
                Acesse sua conta para continuar
              </p>

              <Campo rotulo="E-mail">
                <input
                  ref={campoEmail}
                  type="email"
                  required
                  autoComplete="email"
                  inputMode="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={CAMPO}
                  style={ESTILO_CAMPO}
                />
                <User className={ICONE} style={{ color: ENTRADA.apagado }} aria-hidden />
              </Campo>

              <div className="h-3.5" />

              <Campo rotulo="Senha">
                <input
                  type={verSenha ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  placeholder="••••••••••••"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  className={CAMPO}
                  style={ESTILO_CAMPO}
                />
                {/*
                  O olho é BOTÃO, e fora do rótulo do campo.
                  Dentro do `<label>`, tocar nele daria foco ao input e o
                  teclado do celular subiria junto — a pessoa quer conferir o
                  que digitou, não voltar a digitar.
                */}
                <button
                  type="button"
                  onClick={() => setVerSenha((v) => !v)}
                  aria-label={verSenha ? 'Ocultar senha' : 'Mostrar senha'}
                  className="absolute right-1 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-lg"
                  style={{ color: ENTRADA.apagado }}
                >
                  {verSenha ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </Campo>

              <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2">
                <label
                  className="flex cursor-pointer select-none items-center gap-2 text-base"
                  style={{ color: ENTRADA.texto }}
                >
                  <input
                    type="checkbox"
                    checked={lembrar}
                    onChange={(e) => setLembrar(e.target.checked)}
                    className="h-4 w-4 shrink-0"
                    style={{ accentColor: ENTRADA.marca }}
                  />
                  Lembrar de mim
                </label>

                <Link
                  to="/esqueci"
                  className="text-base font-semibold underline-offset-2 hover:underline"
                  style={{ color: ENTRADA.marca }}
                >
                  Esqueci minha senha
                </Link>
              </div>

              {erro && (
                <p
                  role="alert"
                  className="mt-3.5 rounded-xl px-3.5 py-2.5 text-base font-medium"
                  style={{ background: '#FDEBEC', color: '#B4232E' }}
                >
                  {erro}
                </p>
              )}

              <button
                type="submit"
                disabled={enviando}
                className="mt-5 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl px-5 text-md font-semibold transition-colors disabled:opacity-60"
                style={{
                  background: ENTRADA.marca,
                  color: ENTRADA.marcaTinta,
                  boxShadow: '0 12px 26px -12px rgb(139 106 64 / 0.7)',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = ENTRADA.marcaFunda)}
                onMouseLeave={(e) => (e.currentTarget.style.background = ENTRADA.marca)}
              >
                {enviando ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Entrando…
                  </>
                ) : (
                  <>
                    Entrar
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </form>
          </div>
        </div>

        <Marca />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/*
 * 16px no campo, e não o `text-md` de 14 que o resto do painel usa.
 *
 * Abaixo de 16 o iPhone dá zoom sozinho ao focar, e a tela inteira salta. É a
 * primeira coisa que o corretor toca no sistema — saltar aqui é o pior lugar
 * possível para essa primeira impressão. `min-h-[52px]` pela mesma razão: alvo
 * de dedo, não de mouse.
 */
const CAMPO =
  'w-full rounded-xl border px-3.5 py-3 pr-11 text-[16px] outline-none transition-colors min-h-[52px]';

const ESTILO_CAMPO = {
  background: ENTRADA.campo,
  borderColor: ENTRADA.campoBorda,
  color: ENTRADA.titulo,
};

const ICONE = 'pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2';

function Campo({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-base font-semibold" style={{ color: ENTRADA.texto }}>
        {rotulo}
      </span>
      <span className="relative block">{children}</span>
    </label>
  );
}

/**
 * A ilustração, sangrando pelo canto de cima à esquerda.
 *
 * A forma orgânica vem no ALFA do PNG, e não de `clip-path` nem de
 * `border-radius`: é um contorno desenhado, com reentrâncias e bolhas soltas,
 * que nenhuma primitiva de CSS reproduz. O que o CSS faz é o segundo corte —
 * o canto arredondado da moldura passa por cima do desenho, e é dele que vem a
 * sensação de janela.
 *
 * O sangramento é feito com MARGEM NEGATIVA, e não com `translate`.
 *
 * A primeira versão usava `absolute` e ficou bonita e errada: fora do fluxo, a
 * ilustração não ocupava a linha da grade, a linha colapsou, e o bloco de marca
 * subiu para debaixo do desenho. Medi onde o logo caía — 99% opaco, sobre a
 * folhagem índigo `rgb(34,31,146)` — e o nome da marca, em índigo escuro,
 * ficava sobre índigo escuro. Ilegível, e sem nenhum aviso: as duas coisas
 * apareciam na tela, só que uma dentro da outra.
 *
 * Com margem, o navegador desconta o deslocamento da altura da célula. A
 * ilustração continua sangrando para fora da moldura, e a linha de baixo
 * começa exatamente onde ela termina.
 *
 * `aria-hidden` e `alt` vazio: é cenário. Quem usa leitor de tela não ganha
 * nada com "ilustração de cidade litorânea" antes do formulário de entrada.
 */
function Cena() {
  return (
    /*
     * `min-h-0` é o que permite esta célula ENCOLHER.
     *
     * Item de grade tem tamanho mínimo automático igual ao conteúdo, então uma
     * linha `1fr` com uma imagem grande dentro não encolhe: ela empurra a
     * moldura para baixo e a tela de login passa a rolar. Ajustei a largura da
     * ilustração duas vezes tentando fazer caber em 1440 antes de ver que o
     * problema não era o número — era a célula não poder ceder.
     */
    <div className="pointer-events-none lg:col-start-1 lg:row-start-1 lg:min-h-0">
      <img
        src="/marca/login-cena-1170.webp"
        srcSet="/marca/login-cena-700.webp 700w, /marca/login-cena-1170.webp 1170w"
        sizes="(min-width: 1024px) 58vw, 118vw"
        alt=""
        aria-hidden
        width={1170}
        height={1024}
        /*
         * A altura vem da TELA, não da célula — e a diferença não é estilo.
         *
         * A versão anterior media a imagem em `100% + 2.5rem` da própria linha
         * da grade. Isso é circular: a linha depende do conteúdo e o conteúdo
         * depende da linha. O navegador desempata pelo tamanho intrínseco, a
         * linha travou em 347px onde cabiam 328, e a tela voltou a rolar — 19px
         * que nenhum ajuste de porcentagem ia resolver, porque o problema era a
         * referência, não o número.
         *
         * `100svh - 332px` fecha a conta: 56 de respiro da página, 316 do bloco
         * de marca abaixo, menos os 40 que o topo sangra para fora. O `0.95`
         * é a redução de 5% pedida. Se o texto da marca mudar de altura, o 332
         * é o número a revisitar.
         *
         * O DESLOCAMENTO é grande de propósito. O canto de cima à esquerda do
         * DESENHO é vazio — medido no arquivo: na primeira linha a tinta só
         * começa aos 30,9% da largura, e na altura de 10% aos 13,8%. O recorte
         * curva para dentro justamente ali. Encostar a imagem no canto da
         * moldura deixaria a curva à mostra e a areia do cartão apareceria por
         * trás; empurrando, é a barriga da forma que passa pelo canto.
         */
        className="-ml-[16%] -mt-9 w-[132%] max-w-none select-none lg:-ml-[15%] lg:-mt-[74px] lg:h-[calc((100svh-332px)*0.95)] lg:w-auto lg:object-contain lg:object-left-top"
      />
    </div>
  );
}

/** Logo, promessa e o selo — o que diz de quem é este sistema. */
function Marca() {
  return (
    /* Centralizado no celular, alinhado à esquerda no computador: lá o bloco
       se apoia na margem da coluna; aqui ele é a última coisa da tela, sozinho
       na largura, e encostado à esquerda ficaria torto sob um cartão centrado. */
    <div className="relative px-6 pb-9 text-center sm:px-8 lg:col-start-1 lg:row-start-2 lg:px-12 lg:pb-11 lg:pt-2 lg:text-left">
      <div className="mx-auto max-w-[420px] lg:mx-0 lg:max-w-[480px]">
        <div className="flex items-center justify-center gap-3 lg:justify-start">
          <img src={MARCA.icone} alt="" className="h-11 w-11 shrink-0 rounded-[13px]" />
          <span>
            <span className="block text-xl font-bold leading-none" style={{ color: ENTRADA.titulo }}>
              {MARCA.nome}
            </span>
            <span className="block text-base" style={{ color: ENTRADA.apagado }}>
              {MARCA.subtitulo}
            </span>
          </span>
        </div>

        <h2
          className="mt-6 text-2xl font-bold leading-[1.2] sm:text-3xl"
          style={{ color: ENTRADA.titulo }}
        >
          Seus clientes,
          <br />
          seus imóveis,
          <br />
          <span style={{ color: ENTRADA.marca }}>num lugar só.</span>
        </h2>

        <p className="mx-auto mt-3 max-w-[40ch] text-md lg:mx-0" style={{ color: ENTRADA.texto }}>
          Leads, imóveis, visitas e conversas do WhatsApp, de venda e de aluguel.
        </p>

        <p
          className="mt-6 flex items-center justify-center gap-2 text-base lg:justify-start"
          style={{ color: ENTRADA.apagado }}
        >
          <ShieldCheck className="h-4 w-4 shrink-0" style={{ color: ENTRADA.marca }} aria-hidden />
          Seus dados 100% seguros
        </p>
      </div>
    </div>
  );
}

export function FullPageLoader() {
  return (
    <div className="grid min-h-svh place-items-center" style={{ background: ENTRADA.papel }}>
      <Loader2 className="h-6 w-6 animate-spin" style={{ color: ENTRADA.marca }} />
    </div>
  );
}
