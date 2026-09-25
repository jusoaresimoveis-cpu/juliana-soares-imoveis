import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Loader2, ArrowLeft, ArrowRight, MailCheck, ShieldCheck } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { MARCA } from '@/config/marca';
import { ENTRADA } from './temaEntrada';

/*
 * As duas telas da recuperação de senha, no mesmo arquivo.
 *
 * Elas são as duas metades de UM fluxo — pedir e trocar — e só existem por
 * causa uma da outra. Separadas em dois arquivos, a moldura compartilhada
 * viraria uma terceira peça, e quem mexesse numa esqueceria a outra.
 *
 * O caminho inteiro:
 *
 *   /esqueci    a pessoa informa o e-mail  → Supabase manda o link
 *   e-mail      o link traz um token de recuperação no fim da URL
 *   /redefinir  o cliente troca o token por sessão e ela escolhe a senha nova
 *
 * O `detectSessionInUrl: true` do cliente é quem faz a terceira etapa sozinho:
 * ao carregar `/redefinir` com o token no endereço, ele consome, guarda a
 * sessão e dispara `PASSWORD_RECOVERY`. Sem isso, o `updateUser` abaixo não
 * teria em nome de quem escrever.
 */

/**
 * A moldura das duas: a mesma da entrada, sem a ilustração.
 *
 * Veste a paleta da porta de entrada (`temaEntrada`), e não os tokens do
 * painel — quem chega aqui ainda não entrou, então continua sem preferência de
 * tema. Sair da entrada roxa e cair numa tela escura de recuperação faria a
 * pessoa achar que mudou de sistema no meio do caminho.
 */
function Moldura({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-svh p-3 sm:p-5 lg:p-7" style={{ background: ENTRADA.papel }}>
      <div
        className="mx-auto grid min-h-[calc(100svh-1.5rem)] place-items-center overflow-hidden rounded-[26px] px-5 py-10 sm:rounded-[32px] lg:min-h-[calc(100svh-3.5rem)]"
        style={{ background: ENTRADA.moldura }}
      >
        <div className="w-full max-w-[420px]">
          <div className="mb-6 flex items-center gap-3">
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

          <div
            className="rounded-[24px] border p-6 shadow-[0_24px_60px_-30px_rgb(60_45_25_/_0.3)] backdrop-blur-xl sm:p-7"
            style={{ background: ENTRADA.vidro, borderColor: ENTRADA.vidroBorda }}
          >
            {children}
          </div>

          <p className="mt-5 flex items-center gap-2 text-base" style={{ color: ENTRADA.apagado }}>
            <ShieldCheck className="h-4 w-4 shrink-0" style={{ color: ENTRADA.marca }} aria-hidden />
            Seus dados 100% seguros
          </p>
        </div>
      </div>
    </div>
  );
}

const CAMPO =
  'w-full rounded-xl border px-3.5 py-3 text-[16px] outline-none transition-colors min-h-[52px]';

const ESTILO_CAMPO = {
  background: ENTRADA.campo,
  borderColor: ENTRADA.campoBorda,
  color: ENTRADA.titulo,
};

const BOTAO =
  'mt-5 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl px-5 text-md font-semibold transition-colors disabled:opacity-60';

const ESTILO_BOTAO = {
  background: ENTRADA.marca,
  color: ENTRADA.marcaTinta,
  boxShadow: '0 12px 26px -12px rgb(107 70 229 / 0.85)',
};

/* -------------------------------------------------------------------------- */

export default function Esqueci() {
  const [email, setEmail] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/redefinir`,
    });
    setEnviando(false);
    if (error) setErro(error.message);
    else setEnviado(true);
  }

  /*
   * A confirmação é a MESMA exista ou não a conta.
   *
   * Responder "não encontramos esse e-mail" transformaria esta tela num
   * verificador de quem tem conta no sistema: qualquer um testaria endereços
   * até achar os corretores de uma imobiliária. O Supabase já responde igual
   * nos dois casos; a tela precisa acompanhar.
   */
  if (enviado) {
    return (
      <Moldura>
        <MailCheck className="h-8 w-8" style={{ color: '#1F9D63' }} aria-hidden />
        <h1 className="mt-3 text-2xl font-bold" style={{ color: ENTRADA.titulo }}>Confira seu e-mail</h1>
        <p className="mt-2 text-md" style={{ color: ENTRADA.texto }}>
          Se existir uma conta para <b style={{ color: ENTRADA.titulo }}>{email.trim()}</b>, o link para criar uma
          senha nova chega em instantes. Ele vale por uma hora.
        </p>
        <p className="mt-3 text-base" style={{ color: ENTRADA.apagado }}>
          Não chegou? Veja no spam — ou peça ao gerente da sua imobiliária uma senha nova pelo painel
          da Equipe.
        </p>
        <Link
          to="/entrar"
          className="mt-6 inline-flex items-center gap-1.5 text-base font-semibold hover:underline"
          style={{ color: ENTRADA.marca }}
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar para a entrada
        </Link>
      </Moldura>
    );
  }

  return (
    <Moldura>
      <h1 className="text-2xl font-bold" style={{ color: ENTRADA.titulo }}>Esqueci minha senha</h1>
      <p className="mb-6 mt-1 text-md" style={{ color: ENTRADA.texto }}>
        Informe o e-mail da sua conta e mandamos um link para você criar uma nova.
      </p>

      <form onSubmit={onSubmit}>
        <label className="block">
          <span className="mb-1.5 block text-base font-semibold" style={{ color: ENTRADA.texto }}>E-mail</span>
          <input
            type="email"
            required
            autoFocus
            autoComplete="email"
            inputMode="email"
            placeholder="seu@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={CAMPO}
            style={ESTILO_CAMPO}
          />
        </label>

        {erro && (
          <p role="alert" className="mt-3.5 rounded-xl px-3.5 py-2.5 text-base font-medium"
            style={{ background: '#FDEBEC', color: '#B4232E' }}>
            {erro}
          </p>
        )}

        <button type="submit" disabled={enviando} className={BOTAO} style={ESTILO_BOTAO}>
          {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {enviando ? 'Enviando…' : 'Enviar link'}
          {!enviando && <ArrowRight className="h-4 w-4" />}
        </button>
      </form>

      <Link
        to="/entrar"
        className="mt-5 inline-flex items-center gap-1.5 text-base font-semibold hover:underline"
        style={{ color: ENTRADA.marca }}
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar para a entrada
      </Link>
    </Moldura>
  );
}

/* -------------------------------------------------------------------------- */

export function Redefinir() {
  const navigate = useNavigate();
  const [pronta, setPronta] = useState<boolean | null>(null);
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  /*
   * Espera a sessão de recuperação existir ANTES de mostrar o formulário.
   *
   * O cliente consome o token do endereço de forma assíncrona. Perguntando
   * cedo demais, `getSession` devolve nulo numa página que vai funcionar em
   * seguida — e a pessoa lê "link inválido" com o link bom na mão.
   */
  useEffect(() => {
    let vivo = true;

    const { data: assinatura } = supabase.auth.onAuthStateChange((evento) => {
      if (evento === 'PASSWORD_RECOVERY' || evento === 'SIGNED_IN') {
        if (vivo) setPronta(true);
      }
    });

    void supabase.auth.getSession().then(({ data }) => {
      if (data.session && vivo) setPronta(true);
    });

    // Se em 4 segundos nada chegou, o link não trouxe token válido.
    const prazo = setTimeout(() => {
      if (vivo) setPronta((p) => (p === null ? false : p));
    }, 4000);

    return () => {
      vivo = false;
      clearTimeout(prazo);
      assinatura.subscription.unsubscribe();
    };
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (senha.length < 8) {
      setErro('A senha precisa de pelo menos 8 caracteres.');
      return;
    }
    setErro(null);
    setSalvando(true);
    const { error } = await supabase.auth.updateUser({ password: senha });
    setSalvando(false);
    if (error) setErro(error.message);
    else navigate('/', { replace: true });
  }

  if (pronta === null) {
    return (
      <div className="grid min-h-svh place-items-center" style={{ background: ENTRADA.papel }}>
        <Loader2 className="h-6 w-6 animate-spin" style={{ color: ENTRADA.marca }} />
      </div>
    );
  }

  if (!pronta) {
    return (
      <Moldura>
        <h1 className="text-2xl font-bold" style={{ color: ENTRADA.titulo }}>Link expirado</h1>
        <p className="mt-2 text-md" style={{ color: ENTRADA.texto }}>
          Links de recuperação valem por uma hora e servem uma vez só. Peça outro — leva um minuto.
        </p>
        <Link to="/esqueci" className={BOTAO} style={ESTILO_BOTAO}>
          Pedir novo link
          <ArrowRight className="h-4 w-4" />
        </Link>
      </Moldura>
    );
  }

  return (
    <Moldura>
      <h1 className="text-2xl font-bold" style={{ color: ENTRADA.titulo }}>Crie sua nova senha</h1>
      <p className="mb-6 mt-1 text-md" style={{ color: ENTRADA.texto }}>
        Escolha uma senha que você não use em outro lugar.
      </p>

      <form onSubmit={onSubmit}>
        <label className="block">
          <span className="mb-1.5 block text-base font-semibold" style={{ color: ENTRADA.texto }}>Nova senha</span>
          <input
            type="password"
            required
            autoFocus
            minLength={8}
            /* `new-password` e não `current-password`: é o que faz o
               gerenciador de senhas OFERECER uma senha forte em vez de
               preencher a antiga, que é justamente a que não serve mais. */
            autoComplete="new-password"
            placeholder="Pelo menos 8 caracteres"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            className={CAMPO}
            style={ESTILO_CAMPO}
          />
        </label>

        {erro && (
          <p role="alert" className="mt-3.5 rounded-xl px-3.5 py-2.5 text-base font-medium"
            style={{ background: '#FDEBEC', color: '#B4232E' }}>
            {erro}
          </p>
        )}

        <button type="submit" disabled={salvando} className={BOTAO} style={ESTILO_BOTAO}>
          {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
          {salvando ? 'Salvando…' : 'Salvar e entrar'}
        </button>
      </form>
    </Moldura>
  );
}
