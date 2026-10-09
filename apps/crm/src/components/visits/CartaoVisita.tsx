import { MapPin, Check, X, UserX } from 'lucide-react';
import type { Visita } from '@/hooks/useVisits';
import { VISIT_STATUS_LABEL, blocksAgenda, type VisitStatus } from '@contracts';
import { cn } from '@/lib/utils';

const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

const TOM: Record<VisitStatus, string> = {
  agendada: 'bg-pri-soft text-pri',
  confirmada: 'bg-ok-soft text-ok',
  realizada: 'bg-ok-soft text-ok',
  nao_compareceu: 'bg-dng-soft text-dng',
  cancelada: 'bg-card-2 text-tx-3',
};

export function CartaoVisita({
  visita,
  corretorNome,
  ocupado,
  onAbrirLead,
  onStatus,
}: {
  visita: Visita;
  corretorNome?: string;
  ocupado: boolean;
  onAbrirLead: () => void;
  onStatus: (s: VisitStatus) => void;
}) {
  const passou = new Date(visita.ends_at) < new Date();
  const emAberto = blocksAgenda(visita.status);

  return (
    <article
      className={cn(
        'rounded-md border bg-card p-2 shadow-card transition-colors',
        visita.status === 'cancelada' && 'opacity-60',
      )}
    >
      <button onClick={onAbrirLead} className="block w-full text-left">
        <div className="flex items-baseline gap-1.5">
          <time className="text-sm font-bold tabular-nums text-pri">{hora(visita.starts_at)}</time>
          <span className={cn('rounded px-1.5 py-0.5 text-2xs font-bold', TOM[visita.status])}>
            {VISIT_STATUS_LABEL[visita.status]}
          </span>
        </div>

        <h3 className="mt-1 truncate text-base font-bold">{visita.leads?.full_name ?? 'Lead'}</h3>

        {visita.properties && (
          <p className="mt-0.5 flex items-center gap-1 truncate text-sm text-tx-3">
            <MapPin className="h-3 w-3 shrink-0" />
            {visita.properties.title}
          </p>
        )}

        {corretorNome && <p className="mt-0.5 truncate text-xs text-tx-3">{corretorNome}</p>}
      </button>

      {/* O desfecho só faz sentido depois que a hora passou — antes disso a
          pergunta útil é se o cliente confirmou. */}
      {emAberto && (
        <div className="mt-1.5 flex gap-1 border-t border-line pt-1.5">
          {passou ? (
            <>
              <Acao rotulo="Realizada" tom="ok" icone={Check} ocupado={ocupado} onClick={() => onStatus('realizada')} />
              <Acao
                rotulo="Não veio"
                tom="dng"
                icone={UserX}
                ocupado={ocupado}
                onClick={() => onStatus('nao_compareceu')}
              />
            </>
          ) : (
            <>
              {visita.status === 'agendada' && (
                <Acao
                  rotulo="Confirmar"
                  tom="ok"
                  icone={Check}
                  ocupado={ocupado}
                  onClick={() => onStatus('confirmada')}
                />
              )}
              <Acao rotulo="Cancelar" tom="tx" icone={X} ocupado={ocupado} onClick={() => onStatus('cancelada')} />
            </>
          )}
        </div>
      )}
    </article>
  );
}

function Acao({
  rotulo,
  tom,
  icone: Icone,
  ocupado,
  onClick,
}: {
  rotulo: string;
  tom: 'ok' | 'dng' | 'tx';
  icone: typeof Check;
  ocupado: boolean;
  onClick: () => void;
}) {
  const cores = {
    ok: 'text-ok hover:bg-ok-soft',
    dng: 'text-dng hover:bg-dng-soft',
    tx: 'text-tx-3 hover:bg-card-2 hover:text-tx',
  };
  return (
    <button
      onClick={onClick}
      disabled={ocupado}
      className={cn(
        'flex flex-1 items-center justify-center gap-1 rounded px-1 py-1 text-2xs font-bold disabled:opacity-50',
        cores[tom],
      )}
    >
      <Icone className="h-3 w-3" />
      {rotulo}
    </button>
  );
}
