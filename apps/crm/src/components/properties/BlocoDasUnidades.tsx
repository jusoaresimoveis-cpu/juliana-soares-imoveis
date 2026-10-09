import { Link } from 'react-router-dom';
import { Loader2, Layers } from 'lucide-react';
import type { Planta, Unidade } from '@/hooks/useUnidades';
import { aPartirDe, reaisComCentavos, resumoDoEmpreendimento, type PropertyType } from '@contracts';
import { resumoDaPlanta } from '@/lib/unidades';
import { AvisoDaTabela, EspelhoDasUnidades } from './Empreendimento';

/**
 * O empreendimento na ficha: o "a partir de", as disponíveis por planta, o
 * espelho do prédio e o aviso do mês da tabela (o site mostra "Consulte" desde
 * o dia 1 até a Juliana aplicar a tabela nova).
 */
export function BlocoDasUnidades({
  imovelId,
  tipo,
  mesDaTabela,
  plantas,
  unidades,
}: {
  imovelId: string;
  tipo: PropertyType;
  mesDaTabela: string | null;
  plantas: Planta[] | undefined;
  unidades: Unidade[] | undefined;
}) {
  const resumo = unidades ? resumoDoEmpreendimento(unidades) : null;
  const aPartir = resumo ? aPartirDe(resumo) : null;
  const quantas = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

  return (
    <div className="rounded-lg bg-card p-5 shadow-card">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-1.5 text-lg font-bold">
          <Layers className="h-4 w-4 text-pri" />
          Unidades
        </h2>
        <Link
          to={`/imoveis/${imovelId}/unidades`}
          className="inline-flex items-center gap-1.5 rounded-full bg-pri px-4 py-2 text-base font-semibold text-pri-fg hover:bg-pri-deep"
        >
          {unidades?.length ? 'Tabela do mês e unidades' : 'Cadastrar plantas e unidades'}
        </Link>
      </div>

      <AvisoDaTabela mesAplicado={mesDaTabela} temUnidades={!!unidades?.length} className="mb-3" />

      {!unidades || !plantas ? (
        <Loader2 className="h-4 w-4 animate-spin text-pri" />
      ) : unidades.length === 0 || !resumo ? (
        <p className="text-base text-tx-3">
          Nenhuma unidade cadastrada. Cadastre as plantas (quartos, suítes, área) e gere as unidades do prédio de uma
          vez; depois, a tabela do mês dá o preço e a situação de cada uma.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-base text-tx-2">
            {aPartir !== null && (
              <>
                A partir de <b className="text-pri">{reaisComCentavos(aPartir)}</b> ·{' '}
              </>
            )}
            {quantas(resumo.disponiveis, 'disponível', 'disponíveis')} ·{' '}
            {quantas(resumo.reservadas, 'reservada', 'reservadas')} · {quantas(resumo.total, 'unidade', 'unidades')}
          </p>

          <ul className="flex flex-col gap-1.5">
            {plantas.map((p) => {
              const daPlanta = unidades.filter((u) => u.floorplan_id === p.id);
              const r = resumoDoEmpreendimento(daPlanta);
              return (
                <li key={p.id} className="rounded-lg bg-card-2 px-3 py-2">
                  <p className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <b className="text-base font-bold">{p.name}</b>
                    <span className="text-sm font-semibold text-tx-2">
                      {r.disponiveis
                        ? `${quantas(r.disponiveis, 'disponível', 'disponíveis')}${
                            r.menorCents !== null ? `, a partir de ${reaisComCentavos(r.menorCents)}` : ''
                          }`
                        : r.reservadas
                          ? quantas(r.reservadas, 'reservada', 'reservadas')
                          : daPlanta.length
                            ? 'Esgotada'
                            : 'Sem unidades'}
                    </span>
                  </p>
                  {resumoDaPlanta(p) && <p className="text-sm text-tx-3">{resumoDaPlanta(p)}</p>}
                </li>
              );
            })}
          </ul>

          <EspelhoDasUnidades unidades={unidades} tipo={tipo} />
        </div>
      )}
    </div>
  );
}
