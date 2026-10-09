import { useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import type { PropertyType } from '@contracts';
import { useApagarPlanta, type Planta, type Unidade } from '@/hooks/useUnidades';
import { contagem } from '@/lib/contagem';
import { resumoDaPlanta } from '@/lib/unidades';
import { Erro } from './Formulario';
import { FormularioDaPlanta } from './FormularioDaPlanta';

export function SecaoPlantas({
  orgId,
  propertyId,
  tipo,
  plantas,
  unidades,
}: {
  orgId: string | undefined;
  propertyId: string;
  tipo: PropertyType;
  plantas: Planta[];
  unidades: Unidade[];
}) {
  const [editando, setEditando] = useState<string | 'nova' | null>(plantas.length === 0 ? 'nova' : null);
  const apagar = useApagarPlanta(propertyId);
  const usadas = (plantaId: string) => unidades.filter((u) => u.floorplan_id === plantaId).length;
  const proximaPosicao = plantas.reduce((m, p) => Math.max(m, p.position), -1) + 1;

  return (
    <section className="flex flex-col gap-3">
      <p className="max-w-[75ch] text-sm text-tx-3">
        A planta é o tipo de unidade: quartos, suítes, banheiros, vagas e área. Os finais dizem quais unidades a seguem
        (o 804 é final 04), e é por eles que “Gerar unidades” acha a planta de cada uma. O site mostra as plantas que
        ainda têm unidade à venda, cada unidade com a planta gravada nela: dar um final novo a uma planta oferece trazer
        as unidades dele, e uma unidade sozinha troca de planta em “Situação de cada unidade”, na aba Unidades.
      </p>

      {plantas.map((planta) =>
        editando === planta.id ? (
          <FormularioDaPlanta
            key={planta.id}
            orgId={orgId}
            propertyId={propertyId}
            tipo={tipo}
            planta={planta}
            outras={plantas.filter((p) => p.id !== planta.id)}
            unidades={unidades}
            posicao={planta.position}
            onFechar={() => setEditando(null)}
          />
        ) : (
          <div key={planta.id} className="flex flex-wrap items-start gap-3 rounded-lg bg-card p-4 shadow-card">
            <div className="min-w-0 flex-1">
              <h2 className="text-md font-bold">{planta.name}</h2>
              <p className="mt-0.5 text-base text-tx-2">{resumoDaPlanta(planta) || 'Sem quartos nem área informados.'}</p>
              <p className="mt-0.5 text-sm text-tx-3">
                {planta.finals.length ? `Finais ${planta.finals.join(', ')}` : 'Sem finais (só unidade avulsa)'} ·{' '}
                {contagem(usadas(planta.id), 'unidade', 'unidades')}
              </p>
            </div>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => setEditando(planta.id)}
                className="inline-flex items-center gap-1 rounded-full border border-line-2 bg-card px-3 py-1.5 text-sm font-semibold text-tx-2 hover:border-pri hover:text-pri"
              >
                <Pencil className="h-3.5 w-3.5" />
                Editar
              </button>
              {/* Planta com unidade não se apaga (o banco também recusa). */}
              {usadas(planta.id) === 0 && (
                <button
                  type="button"
                  disabled={apagar.isPending}
                  onClick={() => window.confirm(`Apagar a planta “${planta.name}”?`) && apagar.mutate(planta.id)}
                  aria-label={`Apagar a planta ${planta.name}`}
                  className="grid h-8 w-8 place-items-center rounded-full text-tx-3 hover:bg-dng-soft hover:text-dng disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        ),
      )}

      {apagar.isError && <Erro>{(apagar.error as Error).message}</Erro>}

      {editando === 'nova' ? (
        <FormularioDaPlanta
          orgId={orgId}
          propertyId={propertyId}
          tipo={tipo}
          planta={null}
          outras={plantas}
          unidades={unidades}
          posicao={proximaPosicao}
          onFechar={() => setEditando(null)}
          podeCancelar={plantas.length > 0}
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditando('nova')}
          className="inline-flex items-center gap-1.5 self-start rounded-full bg-pri px-4 py-2 text-base font-semibold text-pri-fg hover:bg-pri-deep"
        >
          <Plus className="h-3.5 w-3.5" />
          Nova planta
        </button>
      )}
    </section>
  );
}
