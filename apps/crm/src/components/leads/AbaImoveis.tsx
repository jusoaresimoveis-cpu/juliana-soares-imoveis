import { useEffect, useMemo, useState } from 'react';
import { Home, Plus, Trash2 } from 'lucide-react';
import { useInteresses, useInteresseActions, useBuscaImoveis } from '@/hooks/useLead';
import { valoresDoImovel } from '@/lib/utils';
import { inputCls } from '@/components/leads/CampoDaFicha';

export function AbaImoveis({ leadId, orgId }: { leadId: string; orgId: string | undefined }) {
  const { data: interesses } = useInteresses(leadId);
  const { adicionar, remover } = useInteresseActions(leadId, orgId);
  const [termo, setTermo] = useState('');
  const [busca, setBusca] = useState('');
  const { data: achados } = useBuscaImoveis(busca);

  useEffect(() => {
    const t = setTimeout(() => setBusca(termo), 300);
    return () => clearTimeout(t);
  }, [termo]);

  const jaVinculados = useMemo(
    () => new Set((interesses ?? []).map((i) => i.property_id)),
    [interesses],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg bg-card p-5 shadow-card">
        <h2 className="mb-3 text-lg font-bold">Imóveis de interesse</h2>

        {!interesses?.length && (
          <p className="text-base text-tx-3">Nenhum imóvel vinculado.</p>
        )}

        <ul className="flex flex-col gap-2">
          {interesses?.map((i) => (
            <li key={i.id} className="flex items-center gap-3 rounded-xl bg-card-2 px-3.5 py-2.5">
              <Home className="h-4 w-4 shrink-0 text-tx-3" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-md font-semibold">{i.properties?.title ?? '—'}</p>
                <p className="text-sm text-tx-3">
                  {i.properties?.neighborhood}
                  {i.properties?.public_code && ` · ${i.properties.public_code}`}
                </p>
              </div>
              {/* Pelo regime e, no empreendimento, com as disponíveis: "A partir de R$ X · N disponíveis". */}
              {i.properties && valoresDoImovel(i.properties).length > 0 && (
                <span className="shrink-0 text-right text-base font-bold text-ok">
                  {valoresDoImovel(i.properties).join(' · ')}
                </span>
              )}
              <button
                onClick={() => remover.mutate(i.id)}
                aria-label="Remover interesse"
                className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-tx-3 transition-colors hover:bg-dng-soft hover:text-dng"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-lg bg-card p-5 shadow-card">
        <h2 className="mb-3 text-lg font-bold">Vincular imóvel</h2>
        <input
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          placeholder="Buscar por título, bairro ou código"
          className={inputCls}
        />

        {achados && achados.length > 0 && (
          <ul className="mt-3 flex flex-col gap-1.5">
            {achados.map((p) => (
              <li key={p.id}>
                <button
                  disabled={jaVinculados.has(p.id)}
                  onClick={() => adicionar.mutate({ id: p.id, title: p.title })}
                  className="flex w-full items-center gap-3 rounded-xl border border-line px-3.5 py-2.5 text-left transition-colors hover:border-pri disabled:opacity-40"
                >
                  <Plus className="h-3.5 w-3.5 shrink-0 text-pri" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-md font-semibold">{p.title}</span>
                    <span className="block text-sm text-tx-3">
                      {p.neighborhood} · {p.public_code}
                    </span>
                  </span>
                  {valoresDoImovel(p).length > 0 && (
                    <span className="shrink-0 text-right text-base font-bold text-tx-2">
                      {valoresDoImovel(p).join(' · ')}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
