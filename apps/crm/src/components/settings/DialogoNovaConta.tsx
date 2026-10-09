import { useState, type FormEvent } from 'react';
import { Loader2, AlertCircle, X } from 'lucide-react';
import { useCriarConta, type ContaCriada } from '@/hooks/useEquipe';
import { APP_ROLES, ROLE_LABEL, type AppRole } from '@contracts';
import { cn } from '@/lib/utils';

// O diálogo "Adicionar à equipe" de Equipe.tsx. O Campo daqui não é o de
// PecasDasConfiguracoes.tsx: este não tem `dica`.

export function DialogoNovaConta({
  souAdmin,
  orgId,
  onFechar,
  onCriada,
}: {
  souAdmin: boolean;
  orgId: string | undefined;
  onFechar: () => void;
  onCriada: (c: ContaCriada) => void;
}) {
  const criar = useCriarConta(orgId);
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [creci, setCreci] = useState('');
  const [papel, setPapel] = useState<AppRole>('corretor');

  function submit(e: FormEvent) {
    e.preventDefault();
    criar.mutate({ nome: nome.trim(), email: email.trim(), papel, creci: creci.trim() }, { onSuccess: onCriada });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Adicionar pessoa à equipe"
      className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4"
      onClick={(e) => e.target === e.currentTarget && onFechar()}
    >
      <form onSubmit={submit} className="w-full max-w-[400px] rounded-[22px] bg-sheet p-6 shadow-sheet">
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 className="text-xl font-bold">Adicionar à equipe</h2>
          <button
            type="button"
            onClick={onFechar}
            aria-label="Cancelar"
            className="grid h-7 w-7 place-items-center rounded-full text-tx-3 hover:bg-card-2 hover:text-tx"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <Campo rotulo="Nome completo">
          <input autoFocus required value={nome} onChange={(e) => setNome(e.target.value)} className={INPUT} />
        </Campo>

        <Campo rotulo="E-mail de acesso">
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={INPUT}
          />
        </Campo>

        <div className="flex gap-3">
          <Campo rotulo="CRECI (opcional)" className="flex-1">
            <input value={creci} onChange={(e) => setCreci(e.target.value)} className={INPUT} />
          </Campo>
          <Campo rotulo="Papel" className="flex-1">
            <select value={papel} onChange={(e) => setPapel(e.target.value as AppRole)} className={INPUT}>
              {APP_ROLES.filter((r) => r !== 'admin' || souAdmin).map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
          </Campo>
        </div>

        <p className="mb-3 text-sm text-tx-3">
          A senha é gerada aqui e aparece uma única vez. Passe para a pessoa — ela troca depois em
          Configurações.
        </p>

        {criar.isError && (
          <p className="mb-3 flex items-start gap-2 rounded-xl bg-dng-soft p-2.5 text-sm text-dng">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {(criar.error as Error).message}
          </p>
        )}

        <div className="flex gap-2.5">
          <button
            type="button"
            onClick={onFechar}
            className="flex-1 rounded-xl border border-line-2 bg-card py-2.5 text-md font-semibold text-tx-2 hover:text-tx"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={criar.isPending || !nome.trim() || !email.trim()}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-pri py-2.5 text-md font-semibold text-pri-fg hover:bg-pri-deep disabled:opacity-60"
          >
            {criar.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Criar conta
          </button>
        </div>
      </form>
    </div>
  );
}

const INPUT =
  'w-full rounded-xl border border-line-2 bg-card px-3.5 py-2.5 text-base outline-none focus:border-pri';

function Campo({
  rotulo,
  className,
  children,
}: {
  rotulo: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={cn('mb-3 flex flex-col gap-1.5', className)}>
      <span className="text-sm font-semibold text-tx-2">{rotulo}</span>
      {children}
    </label>
  );
}
