'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Children, useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Carrossel leve: rolagem horizontal nativa com encaixe (scroll-snap), setas e
 * pontos. No celular o dedo arrasta como em qualquer app; nada de biblioteca de
 * carrossel pesando no carregamento.
 */
export function Carrossel({ children, rotulo }: { children: ReactNode; rotulo: string }) {
  const trilho = useRef<HTMLUListElement>(null);
  const [pagina, setPagina] = useState(0);
  const [paginas, setPaginas] = useState(1);
  const itens = Children.toArray(children);

  useEffect(() => {
    const elemento = trilho.current;
    if (!elemento) return;
    // O ResizeObserver dispara ao começar a observar: é a primeira medida.
    const observador = new ResizeObserver(() => {
      setPaginas(Math.max(1, Math.round(elemento.scrollWidth / elemento.clientWidth)));
    });
    observador.observe(elemento);
    return () => observador.disconnect();
  }, []);

  function irPara(destino: number) {
    const elemento = trilho.current;
    if (!elemento) return;
    const limitado = Math.max(0, Math.min(paginas - 1, destino));
    const reduzir = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    elemento.scrollTo({ left: limitado * elemento.clientWidth, behavior: reduzir ? 'auto' : 'smooth' });
  }

  const seta =
    'hidden size-10 shrink-0 items-center justify-center rounded-full border border-linha bg-white text-tinta transition hover:border-bronze disabled:opacity-30 md:flex';

  return (
    <div role="region" aria-roledescription="carrossel" aria-label={rotulo}>
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => irPara(pagina - 1)} disabled={pagina === 0} aria-label="Anteriores" className={seta}>
          <ChevronLeft aria-hidden className="size-5" />
        </button>

        <ul
          ref={trilho}
          onScroll={(evento) => {
            const elemento = evento.currentTarget;
            setPagina(Math.round(elemento.scrollLeft / elemento.clientWidth));
          }}
          className="-mx-2 flex flex-1 snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {itens.map((item, indice) => (
            <li key={indice} className="shrink-0 basis-full snap-start px-2 sm:basis-1/2 lg:basis-1/3">
              {item}
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={() => irPara(pagina + 1)}
          disabled={pagina >= paginas - 1}
          aria-label="Próximos"
          className={seta}
        >
          <ChevronRight aria-hidden className="size-5" />
        </button>
      </div>

      {paginas > 1 && (
        <div className="mt-5 flex justify-center gap-2">
          {Array.from({ length: paginas }, (_, indice) => (
            <button
              key={indice}
              type="button"
              onClick={() => irPara(indice)}
              aria-label={`Ir para o grupo ${indice + 1} de ${paginas}`}
              aria-current={indice === pagina}
              className="flex size-6 items-center justify-center"
            >
              <span className={`block size-2 rounded-full transition ${indice === pagina ? 'bg-bronze' : 'bg-linha'}`} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
