import { UNIT_STATUSES, UNIT_STATUS_LABEL, type UnitStatus } from '@contracts';
import type { Unidade } from '@/hooks/useUnidades';
import { COR_DA_SITUACAO } from '@/components/properties/Empreendimento';
import { legendaDaCelula, type Vista } from '@/lib/legendaDaCelula';
import { celulaDasPartes, formatarPreco, lerCelula, partesDaCelula } from '@/lib/unidades';
import { cn } from '@/lib/utils';
import { inputCls } from './Formulario';

/** A tabela em lista: situação num seletor e preço num campo, que escrevem a mesma célula da grade. */
export function ListaDaTabela({
  unidades,
  texto,
  vista,
  editar,
  rotulo,
  nomeDaPlanta,
  titulo,
  className,
}: {
  unidades: Unidade[];
  texto: (u: Unidade) => string;
  vista: (u: Unidade) => Vista;
  editar: (u: Unidade, valor: string) => void;
  rotulo: (u: Unidade) => string;
  nomeDaPlanta: Map<string, string>;
  titulo?: string;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {titulo && <h2 className="text-sm font-bold uppercase text-tx-3">{titulo}</h2>}
      <ul className="flex flex-col gap-2">
        {unidades.map((u) => {
          const t = texto(u);
          const base = vista(u);
          const partes = partesDaCelula(t, base.price_cents);
          const leg = legendaDaCelula(base, t);
          const erro = lerCelula(t, base.price_cents);
          return (
            <li
              key={u.id}
              className={cn(
                'rounded-lg border bg-card p-3 shadow-card',
                !leg.ok ? 'border-dng' : leg.mudou ? 'border-pri' : 'border-transparent',
              )}
            >
              <div className="flex flex-wrap items-center gap-2">
                <p className="min-w-[8rem] flex-1">
                  <b className="text-base font-bold">{rotulo(u)}</b>
                  <span className="block text-sm text-tx-3">{nomeDaPlanta.get(u.floorplan_id)}</span>
                </p>
                <select
                  value={partes.status}
                  onChange={(e) => {
                    const s = e.target.value as UnitStatus;
                    const preco = partes.preco || (base.price_cents != null ? formatarPreco(base.price_cents) : '');
                    editar(u, celulaDasPartes(s, s === 'vendido' ? '' : preco));
                  }}
                  aria-label={`Situação de ${rotulo(u)}`}
                  className={cn('rounded-xl border px-2.5 py-2 text-sm font-semibold outline-none', COR_DA_SITUACAO[partes.status])}
                >
                  {UNIT_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {UNIT_STATUS_LABEL[s]}
                    </option>
                  ))}
                </select>
                <input
                  inputMode="decimal"
                  value={partes.preco}
                  disabled={partes.status === 'vendido'}
                  onChange={(e) => editar(u, celulaDasPartes(partes.status, e.target.value))}
                  onFocus={(e) => e.currentTarget.select()}
                  placeholder={partes.status === 'vendido' ? '—' : '840.569,40'}
                  aria-label={`Preço de ${rotulo(u)}`}
                  aria-invalid={!erro.ok || undefined}
                  className={cn(inputCls, 'w-36 py-2 tabular-nums disabled:opacity-50', !erro.ok && 'border-dng')}
                />
              </div>
              {!erro.ok ? (
                <p className="mt-1 text-sm font-semibold text-dng">{erro.erro}</p>
              ) : leg.mudou ? (
                <p className="mt-1 text-sm text-pri">Mudou: {leg.texto}</p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
