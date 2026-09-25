import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Bell, Check, Loader2, Volume2, VolumeX } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import {
  useNaoLidas,
  useNotificacoes,
  useMarcarLida,
  useNotificacoesAoVivo,
  type Notificacao,
} from '@/hooks/useNotifications';
import { NOTIFICATION_META } from '@contracts';
import { somLigado, definirSom, ouvir } from '@/lib/notificationSounds';
import { cn } from '@/lib/utils';

const LARGURA = 360;

function quando(iso: string): string {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return 'agora';
  if (min < 60) return `${min} min`;
  if (min < 1440) return `${Math.floor(min / 60)} h`;
  return `${Math.floor(min / 1440)} d`;
}

export function NotificationCenter() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [aberto, setAberto] = useState(false);
  const [comSom, setComSom] = useState(somLigado);
  const botao = useRef<HTMLButtonElement>(null);
  const [caixa, setCaixa] = useState<{ top: number; right: number } | null>(null);

  useNotificacoesAoVivo(profile?.id);
  const naoLidas = useNaoLidas(profile?.id);
  const lista = useNotificacoes(profile?.id, aberto);
  const marcar = useMarcarLida(profile?.id);

  // O painel vai para o body por portal: o painel do app tem overflow hidden e
  // recortaria qualquer coisa posicionada dentro dele.
  useEffect(() => {
    if (!aberto) return;
    const posicionar = () => {
      const r = botao.current?.getBoundingClientRect();
      if (r) setCaixa({ top: r.bottom + 10, right: Math.max(12, window.innerWidth - r.right) });
    };
    posicionar();
    const fechar = () => setAberto(false);
    window.addEventListener('resize', posicionar);
    window.addEventListener('scroll', fechar, true);
    return () => {
      window.removeEventListener('resize', posicionar);
      window.removeEventListener('scroll', fechar, true);
    };
  }, [aberto]);

  useEffect(() => {
    if (!aberto) return;
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && setAberto(false);
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [aberto]);

  const total = naoLidas.data ?? 0;

  function abrir(n: Notificacao) {
    if (!n.is_read) marcar.uma.mutate(n.id);
    setAberto(false);
    if (n.link_path) navigate(n.link_path);
  }

  return (
    <>
      <button
        ref={botao}
        onClick={() => setAberto((a) => !a)}
        aria-label={total > 0 ? `Notificações, ${total} não lidas` : 'Notificações'}
        aria-expanded={aberto}
        className={cn(
          'relative grid h-[34px] w-[34px] shrink-0 place-items-center rounded-full border border-line-2 bg-card text-tx-2 transition-colors hover:border-pri hover:text-tx',
          aberto && 'border-pri text-pri',
        )}
      >
        <Bell className="h-[15px] w-[15px]" />
        {total > 0 && (
          <span className="absolute -right-1 -top-1 grid h-[17px] min-w-[17px] place-items-center rounded-full bg-dng px-1 text-[10px] font-bold leading-none text-white ring-2 ring-sheet">
            {total > 99 ? '99+' : total}
          </span>
        )}
      </button>

      {aberto &&
        caixa &&
        createPortal(
          <>
            <div className="fixed inset-0 z-40" onClick={() => setAberto(false)} aria-hidden />
            <div
              role="dialog"
              aria-label="Notificações"
              style={{ top: caixa.top, right: caixa.right, width: LARGURA }}
              className="fixed z-50 overflow-hidden rounded-[18px] bg-sheet shadow-pop ring-1 ring-line-2"
            >
              <header className="flex items-center gap-2 border-b border-line px-4 py-3">
                <h2 className="text-base font-bold">Notificações</h2>

                <button
                  onClick={() => {
                    const novo = !comSom;
                    setComSom(novo);
                    definirSom(novo);
                    if (novo) ouvir('lead');
                  }}
                  aria-label={comSom ? 'Desligar som' : 'Ligar som'}
                  title={comSom ? 'Som ligado neste aparelho' : 'Som desligado neste aparelho'}
                  className="ml-auto grid h-7 w-7 place-items-center rounded-full text-tx-3 hover:bg-card-2 hover:text-tx"
                >
                  {comSom ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
                </button>

                {total > 0 && (
                  <button
                    onClick={() => marcar.todas.mutate()}
                    className="flex items-center gap-1 text-sm font-semibold text-tx-3 hover:text-pri"
                  >
                    <Check className="h-3 w-3" />
                    Limpar
                  </button>
                )}
              </header>

              <div className="max-h-[min(420px,60vh)] overflow-y-auto">
                {lista.isLoading && (
                  <p className="flex items-center justify-center gap-2 py-10 text-sm text-tx-3">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Carregando
                  </p>
                )}

                {!lista.isLoading && (lista.data ?? []).length === 0 && (
                  <div className="px-4 py-10 text-center">
                    <p className="text-base font-semibold text-tx-2">Nada por aqui</p>
                    <p className="mt-1 text-sm text-tx-3">
                      Lead novo, mensagem e lembrete aparecem neste sino.
                    </p>
                  </div>
                )}

                {(lista.data ?? []).map((n) => (
                  <button
                    key={n.id}
                    onClick={() => abrir(n)}
                    className={cn(
                      'flex w-full gap-3 border-b border-line px-4 py-3 text-left transition-colors last:border-0 hover:bg-card-2',
                      !n.is_read && 'bg-pri-soft/40',
                    )}
                  >
                    <span
                      className={cn(
                        'mt-1 h-2 w-2 shrink-0 rounded-full',
                        n.is_read ? 'bg-transparent' : 'bg-pri',
                      )}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-2">
                        <b className="truncate text-base font-bold">{n.title}</b>
                        {n.event_count > 1 && (
                          <span className="shrink-0 rounded-full bg-pri px-1.5 text-2xs font-bold text-pri-fg">
                            {n.event_count}
                          </span>
                        )}
                        <time className="ml-auto shrink-0 text-sm text-tx-3">
                          {quando(n.last_event_at)}
                        </time>
                      </span>
                      {n.body && <span className="mt-0.5 block truncate text-sm text-tx-3">{n.body}</span>}
                      <span className="mt-1 block text-2xs font-bold uppercase text-tx-3">
                        {NOTIFICATION_META[n.type]?.label ?? n.type}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </>,
          document.body,
        )}
    </>
  );
}
