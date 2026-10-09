import { cn } from '@/lib/utils';

export function Pilula({
  ativa,
  onClick,
  children,
  desabilitada,
  titulo,
}: {
  ativa: boolean;
  onClick: () => void;
  children: React.ReactNode;
  desabilitada?: boolean;
  titulo?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={desabilitada}
      title={titulo}
      className={cn(
        'rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45',
        ativa
          ? 'border-pri bg-pri text-pri-fg'
          : 'border-line-2 bg-card text-tx-2 hover:border-pri-light hover:text-tx',
      )}
    >
      {children}
    </button>
  );
}
