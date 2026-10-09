import type { BedDouble } from 'lucide-react';

// As peças da ficha do imóvel, à parte porque a página e a lateral usam as
// mesmas. A ficha do lead tem uma Linha própria, com outra assinatura: não é esta.

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

export function Contador({ valor, rotulo, dica }: { valor: number; rotulo: string; dica?: string | null }) {
  return (
    <div className="rounded-lg bg-card-2 px-3 py-2.5">
      <b className="block text-2xl font-bold tabular-nums">{valor.toLocaleString('pt-BR')}</b>
      <span className="text-sm text-tx-3">{rotulo}</span>
      {dica && <span className="block text-2xs text-tx-3">{dica}</span>}
    </div>
  );
}

export function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <p className="flex items-baseline justify-between gap-3 border-b border-line py-1.5 last:border-0">
      <span className="text-sm text-tx-3">{rotulo}</span>
      <span className="text-base font-semibold">{valor}</span>
    </p>
  );
}
