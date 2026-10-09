import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export const inputCls =
  'w-full rounded-xl border border-line-2 bg-card px-3 py-2.5 text-md outline-none transition-colors focus:border-pri';
export const botaoPrimario =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-pri px-4 py-2.5 text-md font-semibold text-pri-fg hover:bg-pri-deep disabled:opacity-60';
export const botaoSecundario =
  'inline-flex items-center justify-center gap-1.5 rounded-xl border border-line-2 bg-card px-3 py-2.5 text-md font-semibold text-tx-2 hover:text-tx';

export function Campo({ rotulo, children, className }: { rotulo: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn('flex flex-col gap-1.5', className)}>
      <span className="text-sm font-semibold text-tx-2">{rotulo}</span>
      {children}
    </label>
  );
}

export function Erro({ children }: { children: ReactNode }) {
  return <p className="mt-3 rounded-md bg-dng-soft px-3 py-2 text-base text-dng">{children}</p>;
}

/** Campo numérico: vazio é nulo, e zero é zero ("2 suítes + lavabo" tem 0 quartos sem suíte). */
export const inteiroOuNulo = (v: string) => (v.trim() === '' ? null : Number(v));
export const areaOuNula = (v: string) => {
  const n = Number(v.replace(',', '.'));
  return v.trim() === '' || !Number.isFinite(n) || n <= 0 ? null : Math.round(n * 100) / 100;
};
export const soDigitos = (v: string) => v.replace(/\D/g, '');
