import type { BedDouble } from 'lucide-react';

export function Numero({
  icone: Icone,
  valor,
  rotulo,
  extra,
}: {
  icone: typeof BedDouble;
  valor: number | null;
  rotulo: string;
  extra?: string | null;
}) {
  return (
    <div>
      <p className="flex items-baseline gap-1.5">
        <Icone className="h-3.5 w-3.5 shrink-0 self-center text-tx-3" />
        <b className="text-lg font-bold tabular-nums">{valor ?? '—'}</b>
        <span className="text-sm text-tx-3">{rotulo}</span>
      </p>
      {extra && <p className="ml-5 text-sm text-tx-3">{extra}</p>}
    </div>
  );
}
