import { DEFAULT_STAGES } from '@contracts';
import { FunilVisual } from '@/components/dashboard/FunilVisual';
import { dinheiro, custoPorLeadMeta, type usePainel } from '@/hooks/usePainel';
import { formatarJanela } from '@/lib/formatosDoPainel';

export function CartaoDoFunil({
  painel,
  janela,
}: {
  painel: ReturnType<typeof usePainel>;
  janela: { de: string; ate: string };
}) {
  return (
    <section className="col-span-12 flex flex-col rounded-lg bg-gradient-to-br from-pri-light via-pri to-pri-deep p-5 text-pri-fg shadow-[0_18px_36px_-18px_var(--brilho-2)] lg:col-span-4">
      <h2 className="text-lg font-bold">Funil</h2>
      <p className="mb-4 mt-0.5 text-xs opacity-70">Etapas cumulativas · {formatarJanela(janela)}</p>

      <FunilVisual
        etapas={(painel.data?.funil ?? []).map((e) => ({
          key: e.key,
          label: e.label,
          total: e.total,
          ganho: DEFAULT_STAGES.find((s) => s.key === e.key)?.isWon,
        }))}
      />

      <div className="mt-auto flex items-center justify-between gap-3 border-t border-white/20 pt-3.5 text-xs opacity-80">
        <span>
          Conversão total
          <b className="block text-lg font-extrabold opacity-100">{conversao(painel.data)}</b>
        </span>
        <span className="text-right">
          Custo por lead
          <b className="block text-lg font-extrabold opacity-100">
            {painel.data ? dinheiro(custoPorLeadMeta(painel.data.atual)) : '—'}
          </b>
        </span>
      </div>
    </section>
  );
}

/**
 * Conversão de ponta a ponta: quantos dos leads do período fecharam.
 *
 * Devolve '—' sem lead nenhum. Zero por cento com zero lead não é desempenho
 * ruim, é ausência de dado — e o painel auditado exibia 0% nos dois casos, o
 * que faz o começo de mês parecer fracasso.
 */
function conversao(p: { atual: { leads: number; vendas: number } } | null | undefined): string {
  if (!p || p.atual.leads === 0) return '—';
  return `${((p.atual.vendas / p.atual.leads) * 100).toFixed(1).replace('.', ',')}%`;
}
