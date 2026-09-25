import { useMemo, useState, type FormEvent } from 'react';
import { X, AlertTriangle, Loader2 } from 'lucide-react';
import { DEFAULT_VISIT_MINUTES } from '@contracts';
import type { TeamMember } from '@/types/db';
import { useConflitos, type NovaVisita } from '@/hooks/useVisits';
import { useInteresses } from '@/hooks/useLead';

interface Props {
  lead: { id: string; full_name: string; assigned_to: string | null };
  equipe: TeamMember[];
  onCancelar: () => void;
  onConfirmar: (v: NovaVisita) => void;
  salvando?: boolean;
  erro?: string | null;
}

const DURACOES = [30, 45, 60, 90, 120];

/** Amanhã às 10h, no fuso de quem está olhando. */
function padraoInicial(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(10, 0, 0, 0);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

/**
 * Marcar visita ao mover o lead para a etapa que exige agenda.
 *
 * O aviso de conflito vem do banco enquanto o usuário digita, mas ele NÃO
 * bloqueia o botão: a autoridade é a restrição de exclusão no `insert`. Se a
 * tela bloqueasse por conta própria, bastaria uma consulta desatualizada para
 * o corretor ficar com dois compromissos no mesmo horário — que é justamente o
 * que a restrição existe para impedir.
 */
export function ScheduleVisitDialog({ lead, equipe, onCancelar, onConfirmar, salvando, erro }: Props) {
  const [quando, setQuando] = useState(padraoInicial);
  const [minutos, setMinutos] = useState(DEFAULT_VISIT_MINUTES);
  const [corretor, setCorretor] = useState(lead.assigned_to ?? '');
  const [imovel, setImovel] = useState('');
  const [obs, setObs] = useState('');

  const interesses = useInteresses(lead.id);

  const janela = useMemo(() => {
    const i = new Date(quando);
    if (Number.isNaN(i.getTime())) return null;
    return { inicio: i.toISOString(), fim: new Date(i.getTime() + minutos * 60_000).toISOString() };
  }, [quando, minutos]);

  const conflitos = useConflitos(corretor || undefined, janela?.inicio, janela?.fim);
  const choque = conflitos.data ?? [];

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!janela) return;
    onConfirmar({
      lead_id: lead.id,
      property_id: imovel || null,
      assigned_to: corretor || null,
      starts_at: janela.inicio,
      minutos,
      notes: obs.trim() || null,
    });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Agendar visita de ${lead.full_name}`}
      className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4"
      onClick={(e) => e.target === e.currentTarget && onCancelar()}
    >
      <form onSubmit={submit} className="w-full max-w-[420px] rounded-[22px] bg-sheet p-6 shadow-sheet">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold">Agendar visita</h2>
            <p className="mt-0.5 text-sm text-tx-2">{lead.full_name}</p>
          </div>
          <button
            type="button"
            onClick={onCancelar}
            aria-label="Cancelar"
            className="grid h-7 w-7 place-items-center rounded-full text-tx-3 hover:bg-card-2 hover:text-tx"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex gap-2.5">
          <label className="flex flex-1 flex-col gap-1.5">
            <span className="text-sm font-semibold text-tx-2">Quando</span>
            <input
              autoFocus
              type="datetime-local"
              value={quando}
              onChange={(e) => setQuando(e.target.value)}
              className="rounded-xl border border-line-2 bg-card px-3 py-2.5 text-base outline-none focus:border-pri"
            />
          </label>

          <label className="flex w-[104px] flex-col gap-1.5">
            <span className="text-sm font-semibold text-tx-2">Duração</span>
            <select
              value={minutos}
              onChange={(e) => setMinutos(Number(e.target.value))}
              className="rounded-xl border border-line-2 bg-card px-3 py-2.5 text-base outline-none focus:border-pri"
            >
              {DURACOES.map((m) => (
                <option key={m} value={m}>
                  {m} min
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="mt-3 flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-tx-2">Corretor</span>
          <select
            value={corretor}
            onChange={(e) => setCorretor(e.target.value)}
            className="rounded-xl border border-line-2 bg-card px-3 py-2.5 text-base outline-none focus:border-pri"
          >
            <option value="">Sem responsável definido</option>
            {equipe.map((m) => (
              <option key={m.id} value={m.id}>
                {m.full_name}
              </option>
            ))}
          </select>
        </label>

        <label className="mt-3 flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-tx-2">Imóvel</span>
          <select
            value={imovel}
            onChange={(e) => setImovel(e.target.value)}
            className="rounded-xl border border-line-2 bg-card px-3 py-2.5 text-base outline-none focus:border-pri"
          >
            {/* Nulo é opção legítima: a primeira conversa presencial costuma
                acontecer antes de existir um imóvel escolhido. */}
            <option value="">A definir</option>
            {(interesses.data ?? []).map((i) => (
              <option key={i.id} value={i.property_id}>
                {i.properties?.title ?? 'Imóvel'}
                {i.properties?.neighborhood ? ` — ${i.properties.neighborhood}` : ''}
              </option>
            ))}
          </select>
        </label>

        <label className="mt-3 flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-tx-2">Combinado (opcional)</span>
          <textarea
            rows={2}
            value={obs}
            onChange={(e) => setObs(e.target.value)}
            placeholder="Levar documento, avisar a portaria…"
            className="resize-none rounded-xl border border-line-2 bg-card px-3.5 py-2.5 text-base outline-none focus:border-pri"
          />
        </label>

        {choque.length > 0 && (
          <p className="mt-3 flex items-start gap-2 rounded-xl bg-warn-soft p-2.5 text-sm leading-snug text-warn">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Já existe visita nesse horário
              {choque[0] ? ` — ${hora(choque[0].o_starts_at)} com ${choque[0].o_lead_name}` : ''}.
              {choque.length > 1 ? ` E mais ${choque.length - 1}.` : ''} O banco vai recusar se você insistir.
            </span>
          </p>
        )}

        {erro && (
          <p className="mt-3 flex items-start gap-2 rounded-xl bg-dng-soft p-2.5 text-sm leading-snug text-dng">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {erro}
          </p>
        )}

        <div className="mt-5 flex gap-2.5">
          <button
            type="button"
            onClick={onCancelar}
            className="flex-1 rounded-xl border border-line-2 bg-card py-2.5 text-md font-semibold text-tx-2 hover:text-tx"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={salvando || !janela}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-pri py-2.5 text-md font-semibold text-pri-fg hover:bg-pri-deep disabled:opacity-60"
          >
            {salvando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Marcar visita
          </button>
        </div>
      </form>
    </div>
  );
}
