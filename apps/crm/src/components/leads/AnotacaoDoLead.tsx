import { useMemo, useState } from 'react';
import { Loader2, Wand2, BellRing, Check, X } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useAnotar, type LeadFull } from '@/hooks/useLead';
import { ReminderDialog } from '@/components/reminders/ReminderDialog';
import { useLembretes, useCriarLembrete, useAcoesLembrete } from '@/hooks/useReminders';
import type { TeamMember } from '@/types/db';
import { cn } from '@/lib/utils';
import { inputCls } from '@/components/leads/CampoDaFicha';
import {
  atendeLead,
  parseReminderHint,
  REMINDER_STATUS_LABEL,
  SNOOZE_OPCOES,
  type DicaDeLembrete,
} from '@contracts';

/**
 * Fuso da imobiliária.
 *
 * A coluna organizations.timezone existe desde a 001 e já vale
 * America/Sao_Paulo. O valor fica aqui como constante enquanto o produto
 * atende UMA imobiliária; quando atender várias, é daqui que se lê a coluna —
 * e nunca do fuso do navegador, porque o corretor pode estar viajando e o
 * cliente continua onde sempre esteve.
 */
const FUSO = 'America/Sao_Paulo';

/**
 * A anotação do lead e os lembretes dele, na aba Visão geral.
 *
 * Andam juntos porque a frase da anotação sugere o lembrete, o botão da lista
 * abre o mesmo diálogo, e o lembrete criado leva a anotação para o histórico.
 */
export function AnotacaoDoLead({ lead, equipe }: { lead: LeadFull; equipe: Record<string, TeamMember> }) {
  const anotar = useAnotar(lead.id);
  const [nota, setNota] = useState('');
  const [lembrando, setLembrando] = useState<DicaDeLembrete | null | 'novo'>(null);

  const { profile } = useAuth();
  const criar = useCriarLembrete(lead.id, profile?.organization_id);

  // A frase vira SUGESTÃO, nunca lembrete automático. Um lembrete criado errado
  // por adivinhação de texto ensina o corretor a ignorar o sino — e o sino é um
  // só, então lead novo e mensagem morrem junto.
  const dica = useMemo(
    () => (nota.trim().length > 6 ? parseReminderHint(nota, new Date(), FUSO) : null),
    [nota],
  );

  const abrirLembrete = (d?: DicaDeLembrete) => {
    criar.reset();
    setLembrando(d ?? 'novo');
  };

  return (
    <>
      <div className="rounded-lg bg-card p-5 shadow-card">
        <h2 className="mb-1 text-lg font-bold">Anotação</h2>
        <p className="mb-3 text-sm text-tx-3">
          Cada anotação entra no histórico com autor e data, em vez de sobrescrever a anterior.
        </p>
        <textarea
          rows={3}
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          placeholder="Cliente pediu para retornar depois das 18h…"
          className={cn(inputCls, 'resize-none')}
        />
        {dica && (
          <button
            type="button"
            onClick={() => abrirLembrete(dica)}
            className="mt-3 flex w-full items-start gap-2 rounded-xl bg-pri-soft p-3 text-left text-sm leading-snug text-pri transition-colors hover:brightness-95"
          >
            <Wand2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Li <b>“{dica.trecho}”</b> aqui. Quer que eu te lembre em{' '}
              <b>{dica.remindAt.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</b>?
            </span>
          </button>
        )}

        <button
          disabled={!nota.trim() || anotar.isPending}
          onClick={() => anotar.mutate(nota.trim(), { onSuccess: () => setNota('') })}
          className="mt-3 inline-flex items-center gap-2 rounded-xl bg-pri px-4 py-2 text-base font-semibold text-pri-fg hover:bg-pri-deep disabled:opacity-40"
        >
          {anotar.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Registrar
        </button>
      </div>

      <Lembretes leadId={lead.id} abrir={() => abrirLembrete()} />

      {lembrando && profile && (
        <ReminderDialog
          lead={lead}
          equipe={Object.values(equipe).filter((m) => m.role && atendeLead(m.role))}
          euId={profile.id}
          fuso={FUSO}
          dica={lembrando === 'novo' ? null : lembrando}
          salvando={criar.isPending}
          erro={criar.error ? (criar.error as Error).message : null}
          onCancelar={() => setLembrando(null)}
          onConfirmar={(l) =>
            criar.mutate(l, {
              onSuccess: () => {
                setLembrando(null);
                // A anotação que gerou a sugestão vira histórico junto, senão o
                // contexto do lembrete se perde na ficha.
                if (nota.trim()) anotar.mutate(nota.trim(), { onSuccess: () => setNota('') });
              },
            })
          }
        />
      )}
    </>
  );
}

/**
 * Os lembretes do lead.
 *
 * Adiar soma no contador em vez de criar linha nova: um retorno adiado quatro
 * vezes é um sinal de que o lead esfriou, e essa informação some se cada
 * adiamento virar um lembrete novo.
 */
function Lembretes({ leadId, abrir }: { leadId: string; abrir: () => void }) {
  const { data, isLoading } = useLembretes(leadId);
  const { concluir, cancelar, adiar } = useAcoesLembrete(leadId);

  const lista = data ?? [];
  const abertos = lista.filter((l) => l.status === 'pendente' || l.status === 'notificado');
  const fechados = lista.filter((l) => l.status === 'concluido' || l.status === 'cancelado');

  return (
    <div className="rounded-lg bg-card p-5 shadow-card">
      <div className="mb-3 flex items-center gap-3">
        <h2 className="text-lg font-bold">Lembretes</h2>
        <button
          onClick={abrir}
          className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-line-2 bg-card px-3.5 py-1.5 text-sm font-semibold text-tx-2 transition-colors hover:border-pri hover:text-pri"
        >
          <BellRing className="h-3.5 w-3.5" />
          Lembrar-me
        </button>
      </div>

      {isLoading && <p className="text-base text-tx-3">Carregando…</p>}

      {!isLoading && lista.length === 0 && (
        <p className="rounded-xl border border-dashed border-line-2 p-4 text-center text-base text-tx-3">
          Nenhum retorno marcado. Escreva “retornar depois das 18h” na anotação e eu sugiro um.
        </p>
      )}

      {abertos.map((l) => {
        const quando = new Date(l.remind_at);
        const atrasado = quando < new Date();
        return (
          <article key={l.id} className="mb-2 rounded-xl border border-line-2 p-3 last:mb-0">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <b className="text-base font-bold">{l.title}</b>
              <span
                className={cn(
                  'rounded px-1.5 py-0.5 text-2xs font-bold',
                  atrasado ? 'bg-dng-soft text-dng' : 'bg-pri-soft text-pri',
                )}
              >
                {atrasado ? 'atrasado' : REMINDER_STATUS_LABEL[l.status]}
              </span>
              <time className="ml-auto text-sm text-tx-3">
                {quando.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
              </time>
            </div>

            {l.body && <p className="mt-1 text-sm text-tx-2">{l.body}</p>}

            {l.snooze_count > 0 && (
              <p className="mt-1 text-sm text-warn">
                Adiado {l.snooze_count}× — talvez o lead tenha esfriado.
              </p>
            )}

            <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-line pt-2.5">
              <button
                onClick={() => concluir.mutate(l.id)}
                className="inline-flex items-center gap-1 rounded px-2 py-1 text-sm font-bold text-ok hover:bg-ok-soft"
              >
                <Check className="h-3 w-3" />
                Concluir
              </button>

              {SNOOZE_OPCOES.map((m) => (
                <button
                  key={m}
                  onClick={() => adiar.mutate({ id: l.id, minutos: m })}
                  className="rounded px-2 py-1 text-sm font-semibold text-tx-3 hover:bg-card-2 hover:text-tx"
                >
                  +{m < 60 ? `${m}min` : m < 1440 ? `${m / 60}h` : '1d'}
                </button>
              ))}

              <button
                onClick={() => cancelar.mutate(l.id)}
                className="ml-auto inline-flex items-center gap-1 rounded px-2 py-1 text-sm font-semibold text-tx-3 hover:bg-dng-soft hover:text-dng"
              >
                <X className="h-3 w-3" />
                Cancelar
              </button>
            </div>
          </article>
        );
      })}

      {fechados.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-sm font-semibold text-tx-3">
            {fechados.length} encerrado{fechados.length > 1 ? 's' : ''}
          </summary>
          <div className="mt-2 flex flex-col gap-1">
            {fechados.map((l) => (
              <p key={l.id} className="flex items-baseline gap-2 text-sm text-tx-3">
                <span className="truncate">{l.title}</span>
                <span className="ml-auto shrink-0">{REMINDER_STATUS_LABEL[l.status]}</span>
              </p>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
