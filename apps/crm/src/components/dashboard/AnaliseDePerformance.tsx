import { SerieDeLeads } from '@/components/dashboard/SerieDeLeads';
import { CanaisDeAquisicao } from '@/components/dashboard/CanaisDeAquisicao';
import type { usePainel } from '@/hooks/usePainel';
import { formatarJanela } from '@/lib/formatosDoPainel';

export function AnaliseDePerformance({
  painel,
  janela,
}: {
  painel: ReturnType<typeof usePainel>;
  janela: { de: string; ate: string };
}) {
  return (
    <>
      <section className="col-span-12 rounded-lg bg-card p-5 shadow-card lg:col-span-8">
        <h2 className="text-lg font-bold">Entrada de leads</h2>
        <p className="mt-0.5 text-sm text-tx-3">
          {painel.data?.serie.passo === 'semana' ? 'Por semana' : 'Por dia'} ·{' '}
          {formatarJanela(janela)}
        </p>

        {painel.isLoading ? (
          <p className="py-16 text-center text-base text-tx-3">Carregando…</p>
        ) : (
          <SerieDeLeads
            pontos={painel.data?.serie.pontos ?? []}
            passo={painel.data?.serie.passo ?? 'dia'}
          />
        )}
      </section>

      <section className="col-span-12 flex flex-col rounded-lg bg-card p-5 shadow-card lg:col-span-4">
        <h2 className="text-lg font-bold">Canais de aquisição</h2>
        <p className="mb-3 mt-0.5 text-sm text-tx-3">Participação por origem</p>

        {painel.isLoading ? (
          <p className="py-16 text-center text-base text-tx-3">Carregando…</p>
        ) : (
          <CanaisDeAquisicao origens={painel.data?.origens ?? []} />
        )}
      </section>
    </>
  );
}
