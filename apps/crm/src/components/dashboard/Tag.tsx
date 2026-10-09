import { cn } from '@/lib/utils';

export function Tag({ tom, children, titulo }: { tom: string; children: string; titulo?: string }) {
  const cores: Record<string, string> = {
    pri: 'bg-pri-soft text-pri',
    ok: 'bg-ok-soft text-ok',
    warn: 'bg-warn-soft text-warn',
    // Discreta de propósito: ela acompanha o canal, não disputa com ele.
    neutro: 'bg-card-2 text-tx-2',
  };
  return (
    <span
      title={titulo}
      className={cn(
        'max-w-[18ch] truncate whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-bold',
        cores[tom] ?? cores['pri'],
      )}
    >
      {children}
    </span>
  );
}
