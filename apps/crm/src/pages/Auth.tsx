import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Navigate, Link, useLocation } from 'react-router-dom';
import { Loader2, ArrowRight, Eye, EyeOff, User } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { definirLembrar } from '@/lib/supabase';
import { Cena, Marca } from '@/components/auth/Cena';
import { ENTRADA } from '@/config/temaEntrada';

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
              onSubmit={(e) => void onSubmit(e)}
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

export function FullPageLoader() {
  return (
    <div className="grid min-h-svh place-items-center" style={{ background: ENTRADA.papel }}>
      <Loader2 className="h-6 w-6 animate-spin" style={{ color: ENTRADA.marca }} />
    </div>
  );
}
