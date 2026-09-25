import { useState, type FormEvent } from 'react';
import { X } from 'lucide-react';
import type { PipelineStage } from '@/types/db';
import { LOSS_REASONS, LOSS_REASON_LABEL, type LossReason } from '@contracts';

interface Props {
  lead: { full_name: string };
  destino: PipelineStage;
  onCancelar: () => void;
  onConfirmar: (dados: { valorCents?: number; motivo?: LossReason; motivoTexto?: string }) => void;
}

/**
 * Algumas transições exigem contexto antes de acontecer.
 *
 * Regra vem do banco (`pipeline_stages.requires_value` / `requires_reason`),
 * não de um `if` na tela — assim mudar o funil de um cliente não exige mexer
 * no código.
 *
 * O motivo da perda vai para COLUNA dedicada. O sistema atual concatena o
 * motivo dentro do campo de observações como "[Motivo da perda] ..." e depois
 * extrai por expressão regular, o que torna impossível qualquer relatório de
 * perda por motivo — que é justamente o que fecha o ciclo do teste A/B/C.
 */
export function StageChangeDialog({ lead, destino, onCancelar, onConfirmar }: Props) {
  const [valor, setValor] = useState('');
  const [motivo, setMotivo] = useState<LossReason>('sem_resposta');
  const [detalhe, setDetalhe] = useState('');

  function submit(e: FormEvent) {
    e.preventDefault();
    const dados: { valorCents?: number; motivo?: LossReason; motivoTexto?: string } = {};

    if (destino.requires_value) {
      const digitos = valor.replace(/\D/g, '');
      if (!digitos) return;
      dados.valorCents = Number(digitos) * 100;
    }
    if (destino.requires_reason) {
      dados.motivo = motivo;
      if (detalhe.trim()) dados.motivoTexto = detalhe.trim();
    }
    onConfirmar(dados);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Mover ${lead.full_name} para ${destino.label}`}
      className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4"
      onClick={(e) => e.target === e.currentTarget && onCancelar()}
    >
      <form
        onSubmit={submit}
        className="w-full max-w-[380px] rounded-[22px] bg-sheet p-6 shadow-sheet"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold">{destino.label}</h2>
            <p className="mt-0.5 text-base text-tx-2">{lead.full_name}</p>
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

        {destino.requires_value && (
          <label className="mb-3 flex flex-col gap-1.5">
            <span className="text-base font-semibold text-tx-2">Valor do negócio</span>
            <div className="flex items-center gap-2 rounded-xl border border-line-2 bg-card px-3.5 py-2.5 focus-within:border-pri">
              <span className="text-md font-semibold text-tx-3">R$</span>
              <input
                autoFocus
                inputMode="numeric"
                value={valor}
                onChange={(e) =>
                  setValor(
                    e.target.value.replace(/\D/g, '').replace(/\B(?=(\d{3})+(?!\d))/g, '.'),
                  )
                }
                placeholder="850.000"
                className="w-full bg-transparent text-md outline-none"
              />
            </div>
          </label>
        )}

        {destino.requires_reason && (
          <>
            <label className="mb-3 flex flex-col gap-1.5">
              <span className="text-base font-semibold text-tx-2">Motivo da perda</span>
              <select
                autoFocus
                value={motivo}
                onChange={(e) => setMotivo(e.target.value as LossReason)}
                className="rounded-xl border border-line-2 bg-card px-3 py-2.5 text-md outline-none focus:border-pri"
              >
                {LOSS_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {LOSS_REASON_LABEL[r]}
                  </option>
                ))}
              </select>
            </label>

            <label className="mb-3 flex flex-col gap-1.5">
              <span className="text-base font-semibold text-tx-2">Detalhe (opcional)</span>
              <textarea
                rows={2}
                value={detalhe}
                onChange={(e) => setDetalhe(e.target.value)}
                className="resize-none rounded-xl border border-line-2 bg-card px-3.5 py-2.5 text-md outline-none focus:border-pri"
              />
            </label>
          </>
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
            className="flex-1 rounded-xl bg-pri py-2.5 text-md font-semibold text-pri-fg hover:bg-pri-deep"
          >
            Confirmar
          </button>
        </div>
      </form>
    </div>
  );
}
