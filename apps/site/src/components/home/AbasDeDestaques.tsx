'use client';

import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';

export interface Aba {
  chave: string;
  rotulo: string;
  verTodos: string;
  conteudo: ReactNode;
}

/**
 * As abas "Destaques / Venda / Aluguel" do modelo.
 *
 * Os três painéis chegam prontos do servidor e ficam todos no HTML, só
 * escondidos: o Google vê os links de todos os imóveis, e trocar de aba não
 * espera nada.
 */
export function AbasDeDestaques({ titulo, abas }: { titulo: string; abas: Aba[] }) {
  const [ativa, setAtiva] = useState(abas[0]?.chave);
  const atual = abas.find((aba) => aba.chave === ativa) ?? abas[0];

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div className="flex flex-1 items-baseline justify-between gap-4 sm:flex-none">
          <h2 className="font-serif text-3xl">{titulo}</h2>
          <Link href={atual.verTodos} className="inline-flex items-center gap-1 text-sm whitespace-nowrap text-bronze hover:underline sm:hidden">
            Ver todos <ArrowRight aria-hidden className="size-4" />
          </Link>
        </div>
        <div className="flex w-full flex-col gap-3 sm:w-auto sm:items-end">
          <Link
            href={atual.verTodos}
            className="hidden items-center gap-1 text-sm text-bronze hover:underline sm:inline-flex"
          >
            Ver todos os imóveis <ArrowRight aria-hidden className="size-4" />
          </Link>
          {abas.length > 1 && (
            <div role="tablist" aria-label="Filtrar destaques" className="flex gap-2">
              {abas.map((aba) => (
                <button
                  key={aba.chave}
                  type="button"
                  role="tab"
                  id={`aba-${aba.chave}`}
                  aria-selected={aba.chave === atual.chave}
                  aria-controls={`painel-${aba.chave}`}
                  onClick={() => setAtiva(aba.chave)}
                  className="rounded-md border border-linha px-4 py-2 text-sm transition aria-selected:border-bronze aria-selected:bg-bronze aria-selected:text-white"
                >
                  {aba.rotulo}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {abas.map((aba) => (
        <div
          key={aba.chave}
          id={`painel-${aba.chave}`}
          role="tabpanel"
          aria-labelledby={`aba-${aba.chave}`}
          hidden={aba.chave !== atual.chave}
          className="mt-6"
        >
          {aba.conteudo}
        </div>
      ))}
    </>
  );
}
