import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

// As peças das abas do formulário do imóvel. O Campo de
// components/unidades/Formulario.tsx tem a mesma classe e não tem `nota`:
// não é este.

export const inputCls =
  'w-full rounded-xl border border-line-2 bg-card px-3 py-2.5 text-md outline-none transition-colors focus:border-pri';

export function Campo({
  rotulo,
  nota,
  children,
  className,
}: {
  rotulo: string;
  /** Uma linha embaixo do campo, como o "Só no CRM" da construtora. */
  nota?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn('flex flex-col gap-1.5', className)}>
      <span className="text-sm font-semibold text-tx-2">{rotulo}</span>
      {children}
      {nota && <span className="text-sm text-tx-3">{nota}</span>}
    </label>
  );
}
