import { Loader2, Check, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

// As peças das abas de pages/Settings.tsx. A aba Equipe tem as dela, com os
// mesmos nomes e medidas diferentes (o Cartao de 680px em Equipe.tsx, o Campo
// sem `dica` em DialogoNovaConta.tsx): não são estas.

export const INPUT =
  'w-full rounded-xl border border-line-2 bg-card px-3.5 py-2.5 text-base outline-none focus:border-pri';

export function Cartao({ children }: { children: React.ReactNode }) {
  return <section className="max-w-[620px] rounded-lg bg-card p-5 shadow-card">{children}</section>;
}

export function Campo({
  rotulo,
  dica,
  className,
  children,
}: {
  rotulo: string;
  dica?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={cn('mb-3 flex flex-col gap-1.5', className)}>
      <span className="text-sm font-semibold text-tx-2">{rotulo}</span>
      {children}
      {dica && <span className="text-sm text-tx-3">{dica}</span>}
    </label>
  );
}

export function Rodape({ mutacao, rotulo }: { mutacao: { isPending: boolean; isSuccess: boolean; isError: boolean; error: unknown }; rotulo: string }) {
  return (
    <div className="mt-4 flex items-center gap-3">
      <button
        type="submit"
        disabled={mutacao.isPending}
        className="flex items-center gap-2 rounded-xl bg-pri px-5 py-2.5 text-md font-semibold text-pri-fg hover:bg-pri-deep disabled:opacity-60"
      >
        {mutacao.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        {rotulo}
      </button>
      {mutacao.isSuccess && !mutacao.isPending && (
        <span className="flex items-center gap-1.5 text-sm font-semibold text-ok">
          <Check className="h-3.5 w-3.5" />
          Salvo
        </span>
      )}
      {mutacao.isError && <span className="text-sm text-dng">{(mutacao.error as Error).message}</span>}
    </div>
  );
}

export function Carregando() {
  return (
    <p className="flex items-center gap-2 py-10 text-base text-tx-3">
      <Loader2 className="h-4 w-4 animate-spin" />
      Carregando…
    </p>
  );
}

export function Erro({ texto }: { texto: string }) {
  return (
    <p className="mb-3 flex items-start gap-2 rounded-xl bg-dng-soft p-3 text-base text-dng">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      {texto}
    </p>
  );
}
