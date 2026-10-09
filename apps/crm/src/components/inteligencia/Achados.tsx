import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { Achado } from '@/inteligencia';
import { cn } from '@/lib/utils';

const GRAVIDADE: Record<Achado['gravidade'], { cor: string; rotulo: string }> = {
  alta: { cor: 'bg-dng-soft text-dng', rotulo: 'Resolver' },
  media: { cor: 'bg-warn-soft text-warn', rotulo: 'Atenção' },
  baixa: { cor: 'bg-card-2 text-tx-3', rotulo: 'Nota' },
};

export function Achados({ lista }: { lista: Achado[] }) {
  const [abertos, setAbertos] = useState<Set<string>>(() => new Set(lista.slice(0, 1).map((a) => a.chave)));
  if (lista.length === 0) return null;

  return (
    <section className="rounded-md bg-card shadow-card">
      <h2 className="px-4 pt-4 text-md font-bold">O que a conta está dizendo</h2>
      <p className="px-4 pb-1 text-sm text-tx-2">
        Estes achados olham a conta inteira, não campanha por campanha — é por isso que eles
        sustentam decisão mesmo quando nenhuma linha da tabela tem volume para um veredito.
      </p>
      <ul className="mt-2 divide-y divide-line">
        {lista.map((a) => {
          const aberto = abertos.has(a.chave);
          const g = GRAVIDADE[a.gravidade];
          return (
            <li key={a.chave}>
              <button
                type="button"
                onClick={() =>
                  setAbertos((s) => {
                    const n = new Set(s);
                    if (n.has(a.chave)) n.delete(a.chave);
                    else n.add(a.chave);
                    return n;
                  })
                }
                className="flex w-full items-start gap-2.5 px-4 py-3 text-left hover:bg-card-2"
              >
                {aberto ? (
                  <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-tx-3" />
                ) : (
                  <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-tx-3" />
                )}
                <span
                  className={cn(
                    'mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-2xs font-semibold uppercase',
                    g.cor,
                  )}
                >
                  {g.rotulo}
                </span>
                <span className="min-w-0 flex-1 text-md font-semibold">{a.titulo}</span>
              </button>
              {aberto ? (
                <div className="px-4 pb-4 pl-[70px]">
                  <p className="max-w-[76ch] text-sm text-tx-2">{a.detalhe}</p>
                  {a.quais && a.quais.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {a.quais.map((q) => (
                        <span
                          key={q}
                          className="rounded-full bg-card-2 px-2 py-0.5 text-2xs text-tx-2"
                        >
                          {q}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
