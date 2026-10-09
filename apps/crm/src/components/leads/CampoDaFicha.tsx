import { cn } from '@/lib/utils';

/*
 * O campo e a classe de entrada da ficha do lead. Moram à parte porque a classe
 * serve a três pedaços da ficha: os dados de contato (pages/LeadDetail.tsx), a
 * anotação e a busca de imóveis. O `Campo` de outras telas é outro.
 */

export const inputCls =
  'w-full rounded-xl border border-line-2 bg-card-2 px-3 py-2.5 text-md outline-none transition-colors focus:border-pri';

export function Campo({ rotulo, children, className }: { rotulo: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn('flex flex-col gap-1.5', className)}>
      <span className="text-sm font-semibold text-tx-2">{rotulo}</span>
      {children}
    </label>
  );
}
