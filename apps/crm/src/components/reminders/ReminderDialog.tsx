import { useMemo, useState, type FormEvent } from 'react';
import { X, Loader2, Wand2 } from 'lucide-react';
import {
  REMINDER_PRESETS,
  resolverPreset,
  paredeNoFuso,
  instanteDaParede,
  type DicaDeLembrete,
} from '@contracts';
import { cn } from '@/lib/utils';

interface Props {
  lead: { id: string; full_name: string; assigned_to: string | null };
  // Só o que o seletor precisa. Pedir `TeamMember` inteiro amarraria o diálogo a
  // campos que ele não usa — mesma razão de o StageChangeDialog receber apenas
  // o nome do lead.
  equipe: Array<{ id: string; full_name: string }>;
  euId: string;
  fuso: string;
  /** Preenchimento vindo do que a pessoa escreveu na anotação. */
  dica?: DicaDeLembrete | null;
  onCancelar: () => void;
  onConfirmar: (l: { title: string; body: string | null; remindAt: Date; para: string }) => void;
  salvando?: boolean;
  erro?: string | null;
}

/** Date → valor de `datetime-local`, na parede do fuso da imobiliária. */
function paraCampo(d: Date, tz: string): string {
  const p = paredeNoFuso(d, tz);
  const z = (n: number) => String(n).padStart(2, '0');
  return `${p.ano}-${z(p.mes)}-${z(p.dia)}T${z(p.hora)}:${z(p.minuto)}`;
}

/** E o caminho de volta, ancorado no mesmo fuso. */
function doCampo(v: string, tz: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(v);
  if (!m) return null;
  return instanteDaParede(Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5]), tz);
}

/**
 * Marcar um retorno.
 *
 * O lembrete é sempre de UMA pessoa — por isso o seletor de responsável não tem
 * opção vazia. "Retornar depois das 18h" sem dono é aviso de plantão, e aviso
 * de plantão é o que faz a equipe parar de olhar o sino.
 */
export function ReminderDialog({
  lead,
  equipe,
  euId,
  fuso,
  dica,
  onCancelar,
  onConfirmar,
  salvando,
  erro,
}: Props) {
  const agora = useMemo(() => new Date(), []);

  const [quando, setQuando] = useState(() =>
    paraCampo(dica?.remindAt ?? resolverPreset(REMINDER_PRESETS[0], agora, fuso), fuso),
  );
  const [titulo, setTitulo] = useState(`Retornar para ${lead.full_name.split(' ')[0]}`);
  const [obs, setObs] = useState(dica?.trecho ? `Cliente disse: ${dica.trecho}` : '');
  const [para, setPara] = useState(lead.assigned_to ?? euId);

  const alvo = doCampo(quando, fuso);
  const passado = !!alvo && alvo <= agora;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!alvo || passado) return;
    onConfirmar({ title: titulo, body: obs.trim() || null, remindAt: alvo, para });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Lembrete sobre ${lead.full_name}`}
      className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4"
      onClick={(e) => e.target === e.currentTarget && onCancelar()}
    >
      <form onSubmit={submit} className="w-full max-w-[420px] rounded-[22px] bg-sheet p-6 shadow-sheet">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold">Lembrar-me</h2>
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

        {dica && (
          <p className="mb-4 flex items-start gap-2 rounded-xl bg-pri-soft p-2.5 text-sm leading-snug text-pri">
            <Wand2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Li <b>“{dica.trecho}”</b> na sua anotação e sugeri o horário abaixo.
              {!dica.horaExplicita && ' A frase não disse a hora, então usei o começo do dia.'}
              {dica.horaExplicita && !dica.diaExplicito && ' A frase não disse o dia, então usei o próximo.'}{' '}
              Confira antes de salvar.
            </span>
          </p>
        )}

        <div className="mb-3 flex flex-wrap gap-1.5">
          {REMINDER_PRESETS.map((p) => {
            const d = resolverPreset(p, agora, fuso);
            const ativo = paraCampo(d, fuso) === quando;
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => setQuando(paraCampo(d, fuso))}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors',
                  ativo
                    ? 'border-pri bg-pri text-pri-fg'
                    : 'border-line-2 bg-card text-tx-2 hover:border-pri hover:text-pri',
                )}
              >
                {p.label}
              </button>
            );
          })}
        </div>

        <label className="mb-3 flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-tx-2">Quando</span>
          <input
            type="datetime-local"
            value={quando}
            onChange={(e) => setQuando(e.target.value)}
            className={cn(
              'rounded-xl border bg-card px-3 py-2.5 text-base outline-none focus:border-pri',
              passado ? 'border-dng' : 'border-line-2',
            )}
          />
          {passado && <span className="text-sm text-dng">Esse horário já passou.</span>}
        </label>

        <label className="mb-3 flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-tx-2">O que fazer</span>
          <input
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            className="rounded-xl border border-line-2 bg-card px-3.5 py-2.5 text-base outline-none focus:border-pri"
          />
        </label>

        <label className="mb-3 flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-tx-2">Detalhe (opcional)</span>
          <textarea
            rows={2}
            value={obs}
            onChange={(e) => setObs(e.target.value)}
            className="resize-none rounded-xl border border-line-2 bg-card px-3.5 py-2.5 text-base outline-none focus:border-pri"
          />
        </label>

        <label className="mb-1 flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-tx-2">Quem vai ser lembrado</span>
          <select
            value={para}
            onChange={(e) => setPara(e.target.value)}
            className="rounded-xl border border-line-2 bg-card px-3 py-2.5 text-base outline-none focus:border-pri"
          >
            {equipe.map((m) => (
              <option key={m.id} value={m.id}>
                {m.full_name}
                {m.id === euId ? ' (você)' : ''}
              </option>
            ))}
          </select>
        </label>

        {erro && (
          <p className="mt-3 rounded-xl bg-dng-soft p-2.5 text-sm leading-snug text-dng">{erro}</p>
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
            disabled={salvando || passado || !alvo || !titulo.trim()}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-pri py-2.5 text-md font-semibold text-pri-fg hover:bg-pri-deep disabled:opacity-60"
          >
            {salvando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Criar lembrete
          </button>
        </div>
      </form>
    </div>
  );
}
