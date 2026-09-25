import { useEffect, type ReactNode } from 'react';
import {
  Download,
  Share,
  PlusSquare,
  Check,
  MoreVertical,
  Loader2,
  X,
  Monitor,
  Smartphone,
} from 'lucide-react';
import { useInstalarApp } from '@/hooks/useInstalarApp';

/**
 * Instalar o CRM como aplicativo.
 *
 * O que faz o site abrir em janela própria, sem barra de endereço, é o
 * manifesto — que já existe desde o dia do push. O botão só dispara o diálogo
 * na hora certa, e quando não há diálogo (iPhone sempre, Firefox e Safari no
 * computador) ensina o caminho na mão.
 *
 * O passo a passo NÃO é um plano B: é o caminho normal de boa parte dos
 * usuários. Sem ele o botão não faz nada em metade dos aparelhos.
 */

/* -------------------------------------------------------------------------- */
/* Os passos, escritos uma vez só                                             */
/* -------------------------------------------------------------------------- */

/**
 * A mesma lista aparece aqui e na tela de avisos no celular. Escrita duas
 * vezes, uma envelheceria — e são instruções que a pessoa segue com o aparelho
 * na mão, onde um passo errado significa desistir.
 */
export function PassosDeInstalacao({ ios }: { ios: boolean }) {
  return ios ? (
    <ol className="flex flex-col gap-2">
      <Passo n={1} icone={Share}>
        Toque em <b>Compartilhar</b>, na barra de baixo do Safari.
      </Passo>
      <Passo n={2} icone={PlusSquare}>
        Role a lista e escolha <b>Adicionar à Tela de Início</b>.
      </Passo>
      <Passo n={3} icone={Check}>
        Toque em <b>Adicionar</b>. O ícone do CRM aparece na tela do
        aparelho.
      </Passo>
    </ol>
  ) : (
    <ol className="flex flex-col gap-2">
      <Passo n={1} icone={MoreVertical}>
        Abra o <b>menu do navegador</b> — os três pontinhos no canto.
      </Passo>
      <Passo n={2} icone={Download}>
        Toque em <b>Instalar app</b> ou <b>Adicionar à tela inicial</b>.
      </Passo>
      <Passo n={3} icone={Check}>
        Confirme. O CRM passa a abrir em janela própria.
      </Passo>
    </ol>
  );
}

function Passo({
  n,
  icone: Icone,
  children,
}: {
  n: number;
  icone: typeof Share;
  children: ReactNode;
}) {
  return (
    <li className="flex items-start gap-2.5">
      <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-pri text-2xs font-bold text-pri-fg">
        {n}
      </span>
      <span className="flex items-start gap-1.5 text-sm text-tx-2">
        <Icone className="mt-0.5 h-3.5 w-3.5 shrink-0 text-pri" />
        <span>{children}</span>
      </span>
    </li>
  );
}

/* -------------------------------------------------------------------------- */
/* O diálogo                                                                  */
/* -------------------------------------------------------------------------- */

function PassoAPasso({ ios, onFechar }: { ios: boolean; onFechar: () => void }) {
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => e.key === 'Escape' && onFechar();
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [onFechar]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Instalar o CRM"
      className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4"
      onClick={(e) => e.target === e.currentTarget && onFechar()}
    >
      <div className="w-full max-w-[420px] rounded-[22px] bg-sheet p-6 shadow-sheet">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold">Instalar o CRM</h2>
            <p className="mt-0.5 text-sm text-tx-2">
              {ios
                ? 'No iPhone a instalação é na mão — a Apple não deixa nenhum site fazer isso sozinho.'
                : 'Este navegador não abriu o atalho de instalação. Dá para instalar pelo menu:'}
            </p>
          </div>
          <button
            type="button"
            onClick={onFechar}
            aria-label="Fechar"
            className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-tx-3 hover:bg-card-2 hover:text-tx"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <PassosDeInstalacao ios={ios} />

        <p className="mt-4 border-t border-line pt-3 text-sm text-tx-3">
          {ios ? (
            <>
              Só funciona pelo <b>Safari</b>: Chrome e Firefox no iPhone não
              instalam.
            </>
          ) : (
            <>
              No computador, quem instala é o <b>Chrome</b> ou o <b>Edge</b> —
              Firefox e Safari não têm essa opção. E se você já instalou, é só
              abrir pelo ícone do CRM.
            </>
          )}
        </p>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* O botão do topo                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Aparece enquanto não estiver instalado e some sozinho depois — inclusive
 * quando a instalação vem pelo menu do navegador, sem passar por aqui. Some
 * sozinho é o que o autoriza a ocupar espaço num topo já cheio.
 */
export function BotaoInstalarApp() {
  const { instalado, ocupado, passoAPasso, instalar, fecharPassoAPasso, ehIOS } =
    useInstalarApp();

  if (instalado) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => void instalar()}
        disabled={ocupado}
        title="Instalar o CRM como aplicativo"
        /* No celular sobra só o ícone, e `hidden` é `display:none` — o leitor
           de tela não lê o rótulo escondido. Sem este aria-label o botão vira
           um ícone mudo justamente no aparelho onde ele mais importa. */
        aria-label="Instalar app"
        className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-pri-light bg-pri-soft px-2.5 py-1.5 text-sm font-semibold text-pri transition-colors hover:bg-pri hover:text-pri-fg sm:px-3"
      >
        {ocupado ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <Download className="h-3 w-3" />
        )}
        <span className="hidden sm:inline" aria-hidden="true">
          Instalar app
        </span>
      </button>

      {passoAPasso && <PassoAPasso ios={ehIOS} onFechar={fecharPassoAPasso} />}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* O cartão das configurações                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Fica ACIMA de "Avisos no celular", e não é arrumação: no iPhone o push só
 * existe depois que o app está na tela de início. Quem lê de cima para baixo
 * encontra o pré-requisito antes do recurso que depende dele.
 */
export function CartaoInstalarApp() {
  const { instalado, umClique, ocupado, passoAPasso, instalar, fecharPassoAPasso, ehIOS } =
    useInstalarApp();

  return (
    <section className="max-w-[680px] rounded-lg bg-card p-5 shadow-card">
      <h2 className="text-lg font-bold">Instalar o app</h2>
      <p className="mt-0.5 text-base text-tx-2">
        Vale só <b>neste aparelho</b>. O CRM passa a abrir em janela
        própria, sem barra de endereço, com ícone junto dos outros apps.
      </p>

      {instalado ? (
        <p className="mt-3 flex items-center gap-1.5 text-sm font-semibold text-ok">
          <Check className="h-3.5 w-3.5" />
          Você já está usando o app instalado.
        </p>
      ) : (
        <>
          <button
            type="button"
            onClick={() => void instalar()}
            disabled={ocupado}
            className="mt-3 inline-flex items-center gap-2 rounded-full bg-pri px-4 py-2 text-base font-semibold text-pri-fg transition-colors hover:bg-pri-deep disabled:opacity-60"
          >
            {ocupado ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            {umClique ? 'Instalar agora' : 'Como instalar'}
          </button>

          <p className="mt-2.5 flex items-start gap-1.5 text-sm text-tx-3">
            {ehIOS ? (
              <Smartphone className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            ) : (
              <Monitor className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            )}
            <span>
              {umClique
                ? 'O navegador vai pedir sua confirmação.'
                : 'Este navegador não instala por um clique — o botão mostra o caminho na mão.'}
            </span>
          </p>
        </>
      )}

      <p className="mt-3 border-t border-line pt-3 text-sm text-tx-3">
        No iPhone isso não é enfeite: o <b>aviso no celular só funciona com o app
        instalado</b>. No Android e no computador o push funciona dos dois jeitos
        — instalado, ele chega mesmo com o navegador fechado.
      </p>

      {passoAPasso && <PassoAPasso ios={ehIOS} onFechar={fecharPassoAPasso} />}
    </section>
  );
}
