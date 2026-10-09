import { useState, type FormEvent } from 'react';
import { Loader2, Check } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useTrocarSenha } from '@/hooks/useSettings';
import { cn } from '@/lib/utils';
import { Cartao, Campo, Erro, INPUT } from './PecasDasConfiguracoes';

// A aba Senha de pages/Settings.tsx: trocar a senha de quem já entrou. O
// arquivo não se chama Senha.tsx porque pages/Senha.tsx é a senha esquecida,
// antes do login.

export function Senha() {
  const { user } = useAuth();
  const trocar = useTrocarSenha(user?.email ?? undefined);
  const [atual, setAtual] = useState('');
  const [nova, setNova] = useState('');
  const [repete, setRepete] = useState('');

  const naoConfere = repete.length > 0 && nova !== repete;

  return (
    <Cartao>
      <form
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          if (naoConfere) return;
          trocar.mutate(
            { atual, nova },
            {
              onSuccess: () => {
                setAtual('');
                setNova('');
                setRepete('');
              },
            },
          );
        }}
      >
        <h2 className="text-lg font-bold">Trocar senha</h2>
        <p className="mt-0.5 text-base text-tx-2">
          Pedimos a senha atual de propósito: sem isso, quem sentar no seu computador com a sessão
          aberta troca a senha e te deixa de fora da própria carteira.
        </p>

        <div className="mt-4">
          <Campo rotulo="Senha atual">
            <input
              type="password"
              autoComplete="current-password"
              value={atual}
              onChange={(e) => setAtual(e.target.value)}
              className={INPUT}
            />
          </Campo>

          <Campo rotulo="Nova senha" dica="Pelo menos 8 caracteres.">
            <input
              type="password"
              autoComplete="new-password"
              value={nova}
              onChange={(e) => setNova(e.target.value)}
              className={INPUT}
            />
          </Campo>

          <Campo rotulo="Repita a nova senha">
            <input
              type="password"
              autoComplete="new-password"
              value={repete}
              onChange={(e) => setRepete(e.target.value)}
              className={cn(INPUT, naoConfere && 'border-dng')}
            />
          </Campo>

          {naoConfere && <p className="-mt-1 mb-2 text-sm text-dng">As duas não são iguais.</p>}
        </div>

        {trocar.isError && <Erro texto={(trocar.error as Error).message} />}
        {trocar.isSuccess && (
          <p className="mb-3 flex items-center gap-1.5 text-base font-semibold text-ok">
            <Check className="h-4 w-4" />
            Senha trocada.
          </p>
        )}

        <button
          type="submit"
          disabled={trocar.isPending || !atual || !nova || naoConfere}
          className="flex items-center gap-2 rounded-xl bg-pri px-5 py-2.5 text-md font-semibold text-pri-fg hover:bg-pri-deep disabled:opacity-50"
        >
          {trocar.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Trocar senha
        </button>
      </form>
    </Cartao>
  );
}
