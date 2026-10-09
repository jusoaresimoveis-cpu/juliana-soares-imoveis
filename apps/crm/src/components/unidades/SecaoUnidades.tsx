import type { PropertyType } from '@contracts';
import type { Planta, Unidade } from '@/hooks/useUnidades';
import { AdicionarUnidade } from './AdicionarUnidade';
import { GerarUnidades } from './GerarUnidades';
import { SituacaoDasUnidades } from './SituacaoDasUnidades';

export function SecaoUnidades({
  orgId,
  propertyId,
  tipo,
  plantas,
  unidades,
  semTabela,
  irParaTabela,
}: {
  orgId: string | undefined;
  propertyId: string;
  tipo: PropertyType;
  plantas: Planta[];
  unidades: Unidade[];
  /** Nenhuma tabela aplicada ainda: o imóvel fica com a situação que tinha, e o site mostra "Consulte". */
  semTabela: boolean;
  irParaTabela: () => void;
}) {
  return (
    <section className="flex flex-col gap-4">
      <GerarUnidades
        orgId={orgId}
        propertyId={propertyId}
        tipo={tipo}
        plantas={plantas}
        unidades={unidades}
        semTabela={semTabela}
      />
      <AdicionarUnidade orgId={orgId} propertyId={propertyId} tipo={tipo} plantas={plantas} unidades={unidades} />
      {unidades.length > 0 && (
        <SituacaoDasUnidades
          propertyId={propertyId}
          tipo={tipo}
          plantas={plantas}
          unidades={unidades}
          irParaTabela={irParaTabela}
        />
      )}
    </section>
  );
}
