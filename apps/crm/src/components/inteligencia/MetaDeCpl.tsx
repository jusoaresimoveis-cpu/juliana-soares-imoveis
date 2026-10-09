import { useState } from 'react';
import { Loader2, Target, Check } from 'lucide-react';
import { formatarGasto } from '@contracts';
import { useAuth } from '@/hooks/useAuth';
import { useSalvarMetaCpl } from '@/hooks/useInteligencia';
import { cn } from '@/lib/utils';

// Por nome: rótulo, ajuda, valor e cor são todos string; trocados de lugar, o tsc não veria.
interface CampoDaMeta {
  rotulo: string;
  ajuda: string;
  valor: string;
  setValor: (v: string) => void;
  cor: string;
}

/**
 * As duas linhas, editadas juntas.
 *
 * Juntas porque elas só fazem sentido em relação uma à outra — e porque o banco
 * recusa alvo acima do teto. Dois campos separados em dois lugares deixariam a
 * pessoa salvar um estado inválido e descobrir pelo erro.
 *
 * O teto é o obrigatório: sem ele não há semáforo. O alvo é opcional e a
 * legenda diz o que se perde sem ele, em vez de exigir um número que ninguém
 * escolheu.
 */
export function MetaDeCpl({
  alvo,
  teto,
  moeda,
  compacto,
}: {
  alvo: number | null;
  teto: number | null;
  moeda: string;
  compacto?: boolean;
}) {
  const { profile } = useAuth();
  const salvar = useSalvarMetaCpl();
  const [txtAlvo, setTxtAlvo] = useState(alvo == null ? '' : String(alvo / 100));
  const [txtTeto, setTxtTeto] = useState(teto == null ? '' : String(teto / 100));
  const [aberto, setAberto] = useState(false);

  const org = profile?.organization_id;
  const num = (t: string) => {
    const n = Number(t.replace(',', '.'));
    return t.trim() !== '' && Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
  };
  const nAlvo = num(txtAlvo);
  const nTeto = num(txtTeto);
  // O teto é obrigatório; o alvo, quando existe, não pode passar dele.
  const valido = nTeto != null && (nAlvo == null || nAlvo <= nTeto);

  if (compacto && !aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="flex items-center gap-1.5 rounded-full border border-line-2 px-3 py-1.5 text-xs font-medium text-tx-2 hover:text-tx"
      >
        <Target className="h-3.5 w-3.5" />
        {alvo != null ? (
          <>
            alvo <span className="text-ok">{formatarGasto(alvo, moeda)}</span> · teto{' '}
            <span className="text-dng">{formatarGasto(teto, moeda)}</span>
          </>
        ) : (
          <>
            teto <span className="text-dng">{formatarGasto(teto, moeda)}</span> · sem alvo
          </>
        )}
      </button>
    );
  }

  const campo = ({ rotulo, ajuda, valor, setValor, cor }: CampoDaMeta) => (
    <label className="flex flex-col gap-1">
      <span className={cn('text-2xs font-semibold uppercase', cor)}>{rotulo}</span>
      <span className="flex items-center gap-1.5 rounded-sm border border-line-2 bg-card px-3 py-2">
        <span className="text-sm text-tx-3">R$</span>
        <input
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          inputMode="decimal"
          placeholder="—"
          className="w-16 bg-transparent text-md font-semibold outline-none"
        />
      </span>
      <span className="text-2xs text-tx-3">{ajuda}</span>
    </label>
  );

  return (
    <div className="rounded-md border border-pri/30 bg-pri-soft/40 p-4">
      <div className="flex items-start gap-2">
        <Target className="mt-0.5 h-4 w-4 shrink-0 text-pri" />
        <div className="min-w-0 flex-1">
          <div className="text-md font-semibold">As duas linhas do custo por lead</div>
          <p className="mt-1 max-w-[64ch] text-sm text-tx-2">
            São perguntas diferentes. O <b>teto</b> é o máximo que dá para pagar — cruzou, para. O{' '}
            <b>alvo</b> é onde a operação começa a render de verdade. Entre os dois existe uma faixa
            larga de "aceitável, mas quero melhor", e é ela que o amarelo ocupa.
          </p>

          <div className="mt-3 flex flex-wrap items-start gap-4">
            {campo({
              rotulo: 'Alvo',
              ajuda: 'abaixo dele, verde',
              valor: txtAlvo,
              setValor: setTxtAlvo,
              cor: 'text-ok',
            })}
            {campo({
              rotulo: 'Teto',
              ajuda: 'acima dele, vermelho',
              valor: txtTeto,
              setValor: setTxtTeto,
              cor: 'text-dng',
            })}
            <button
              type="button"
              disabled={!valido || !org || salvar.isPending}
              onClick={() => {
                if (!org || !valido) return;
                salvar.mutate(
                  { org, alvo: nAlvo, teto: nTeto },
                  { onSuccess: () => setAberto(false) },
                );
              }}
              className="mt-[18px] flex items-center gap-1.5 rounded-sm bg-pri px-4 py-2 text-sm font-semibold text-pri-fg disabled:opacity-40"
            >
              {salvar.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="h-3.5 w-3.5" />
              )}
              Salvar
            </button>
            {compacto ? (
              <button
                type="button"
                onClick={() => setAberto(false)}
                className="mt-[18px] px-2 py-2 text-sm text-tx-3 hover:text-tx"
              >
                Cancelar
              </button>
            ) : null}
          </div>

          {nTeto == null ? (
            <p className="mt-2 text-sm text-tx-3">
              O teto é obrigatório — é ele que produz o vermelho. Sem ele o semáforo fica desligado.
            </p>
          ) : nAlvo == null ? (
            <p className="mt-2 text-sm text-tx-3">
              Sem alvo o vermelho e o amarelo funcionam, mas o verde nunca acende: não existe contra
              o que dizer que uma campanha está rendendo, só que ela é aceitável.
            </p>
          ) : null}
          {nAlvo != null && nTeto != null && nAlvo > nTeto ? (
            <p className="mt-2 text-sm text-dng">
              O alvo não pode ficar acima do teto — seria querer chegar num lugar onde você já teria
              parado.
            </p>
          ) : null}
          {salvar.isError ? (
            <p className="mt-2 text-sm text-dng">Não deu para salvar. Tente de novo.</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
