import { useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { UNIT_STATUS_LABEL, reaisComCentavos, rotuloDaUnidade, type PropertyType, type UnitStatus } from '@contracts';
import { useApagarUnidade, useMudarUnidade, type Planta, type Unidade } from '@/hooks/useUnidades';
import { COR_DA_SITUACAO } from '@/components/properties/Empreendimento';
import { ordenarUnidades, situacoesNoMeioDoMes } from '@/lib/unidades';
import { cn } from '@/lib/utils';
import { Erro } from './Formulario';

/**
 * A venda no meio do mês: troca a situação direto na unidade, sem aplicar
 * tabela (aplicar mudaria o mês da tabela, e o site voltaria a mostrar preço
 * de tabela vencida).
 *
 * Só para a frente: disponível reserva ou vende, reservada vende. Reservada e
 * vendida não voltam à venda por aqui, porque voltariam com o preço de uma
 * tabela antiga e sem conferência; quem as devolve é a tabela do mês.
 *
 * A planta também se troca aqui, uma unidade por vez: o site agrupa as
 * unidades pela planta gravada nelas, e não pelo final.
 */
export function SituacaoDasUnidades({
  propertyId,
  tipo,
  plantas,
  unidades,
  irParaTabela,
}: {
  propertyId: string;
  tipo: PropertyType;
  plantas: Planta[];
  unidades: Unidade[];
  irParaTabela: () => void;
}) {
  const mudar = useMudarUnidade(propertyId);
  const apagar = useApagarUnidade(propertyId);
  const planta = new Map(plantas.map((p) => [p.id, p]));
  const aVenda = unidades.filter((u) => u.status !== 'vendido');
  // Num prédio quase vendido, a venda do meio do mês é de uma das poucas à
  // venda: a lista abre só com elas, e as vendidas ficam a um toque.
  const [soAVenda, setSoAVenda] = useState(aVenda.length > 0);
  const [aviso, setAviso] = useState<string | null>(null);
  const lista = ordenarUnidades(soAVenda ? aVenda : unidades);

  return (
    <div className="rounded-lg bg-card p-5 shadow-card">
      <h2 className="text-lg font-bold">Situação de cada unidade</h2>
      <p className="mt-0.5 max-w-[75ch] text-sm text-tx-3">
        Vendeu ou reservou no meio do mês? Troque aqui: o preço e o mês da tabela ficam como estão, e o “a partir de”
        do site se ajusta sozinho. A planta de cada unidade também se troca aqui.
      </p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {(
          [
            [true, `À venda (${aVenda.length})`],
            [false, `Todas (${unidades.length})`],
          ] as const
        ).map(([valor, rotulo]) => (
          <button
            key={rotulo}
            type="button"
            onClick={() => setSoAVenda(valor)}
            aria-pressed={soAVenda === valor}
            className={cn(
              'rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors',
              soAVenda === valor ? 'border-pri bg-pri text-pri-fg' : 'border-line-2 bg-card text-tx-2 hover:text-tx',
            )}
          >
            {rotulo}
          </button>
        ))}
      </div>

      {aviso && !mudar.isPending && <p className="mt-3 text-sm font-semibold text-ok">{aviso}</p>}
      {(mudar.isError || apagar.isError) && <Erro>{((mudar.error ?? apagar.error) as Error).message}</Erro>}
      {lista.length === 0 && <p className="mt-3 text-base text-tx-3">Nenhuma unidade à venda.</p>}
      {lista.some((u) => u.status !== 'disponivel') && (
        <p className="mt-3 text-sm text-tx-3">
          Reservada e vendida não voltam à venda por aqui: o preço guardado nelas pode ser de uma tabela antiga. Para
          voltar à venda, use a{' '}
          <button type="button" onClick={irParaTabela} className="font-semibold text-pri hover:underline">
            Tabela do mês
          </button>
          .
        </p>
      )}

      <ul className="mt-3 divide-y divide-line">
        {lista.map((u) => {
          const pl = planta.get(u.floorplan_id);
          const area = u.area_built ?? pl?.area_built;
          const ocupada = (mudar.isPending && mudar.variables?.id === u.id) || (apagar.isPending && apagar.variables === u.id);
          const possiveis = situacoesNoMeioDoMes(u.status);
          const voltaPelaTabela = u.status !== 'disponivel' ? 'Para voltar à venda, use a Tabela do mês' : undefined;
          return (
            <li key={u.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2">
              <div className="min-w-[10rem] flex-1">
                <b className="text-base font-bold">{rotuloDaUnidade(tipo, u.label)}</b>
                <span className="ml-2 text-sm text-tx-3">
                  {[plantas.length > 1 ? null : pl?.name, area ? `${area.toLocaleString('pt-BR')} m²` : null]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </div>
              {plantas.length > 1 && (
                <select
                  value={u.floorplan_id}
                  disabled={ocupada}
                  onChange={(e) => {
                    const destino = planta.get(e.target.value);
                    mudar.mutate(
                      { id: u.id, floorplan_id: e.target.value },
                      {
                        onSuccess: () =>
                          setAviso(`${rotuloDaUnidade(tipo, u.label)}: planta “${destino?.name ?? ''}”.`),
                      },
                    );
                  }}
                  aria-label={`Planta de ${rotuloDaUnidade(tipo, u.label)}`}
                  className="w-44 truncate rounded-xl border border-line-2 bg-card px-2.5 py-1.5 text-sm text-tx-2 outline-none focus:border-pri"
                >
                  {plantas.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              )}
              <span className="w-32 text-right text-sm tabular-nums text-tx-2">
                {u.price_cents != null ? reaisComCentavos(u.price_cents) : 'sem preço'}
              </span>
              {possiveis.length === 1 ? (
                <span
                  title={voltaPelaTabela}
                  className={cn('rounded-xl border px-2.5 py-1.5 text-sm font-semibold', COR_DA_SITUACAO[u.status])}
                >
                  {UNIT_STATUS_LABEL[u.status]}
                </span>
              ) : (
                <select
                  value={u.status}
                  disabled={ocupada}
                  title={voltaPelaTabela}
                  onChange={(e) => {
                    const status = e.target.value as UnitStatus;
                    // A vendida sai da lista "À venda": o aviso diz para onde ela foi.
                    mudar.mutate(
                      { id: u.id, status },
                      { onSuccess: () => setAviso(`${rotuloDaUnidade(tipo, u.label)}: ${UNIT_STATUS_LABEL[status]}.`) },
                    );
                  }}
                  aria-label={`Situação de ${rotuloDaUnidade(tipo, u.label)}`}
                  className={cn('rounded-xl border px-2.5 py-1.5 text-sm font-semibold outline-none', COR_DA_SITUACAO[u.status])}
                >
                  {possiveis.map((s) => (
                    <option key={s} value={s}>
                      {UNIT_STATUS_LABEL[s]}
                    </option>
                  ))}
                </select>
              )}
              <span className="grid w-8 place-items-center">
                {ocupada ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-pri" />
                ) : (
                  <button
                    type="button"
                    onClick={() =>
                      window.confirm(`Apagar ${rotuloDaUnidade(tipo, u.label)}? Ela sai do CRM e do site.`) &&
                      apagar.mutate(u.id)
                    }
                    aria-label={`Apagar ${rotuloDaUnidade(tipo, u.label)}`}
                    className="grid h-8 w-8 place-items-center rounded-full text-tx-3 hover:bg-dng-soft hover:text-dng"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
