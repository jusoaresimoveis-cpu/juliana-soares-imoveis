'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * As avaliações do Google, pelo widget da Trustindex.
 *
 * O script deles só é baixado quando a seção chega perto da tela: ele pesa, e a
 * página inicial é a que abre no celular vinda do anúncio. O título só aparece
 * quando o widget aparece de fato. Se não aparecer (fim do período de teste do
 * layout, bloqueador de anúncio, Trustindex fora do ar), a seção fica vazia e
 * sem altura, em vez de um título com um buraco embaixo.
 */
export function AvaliacoesDoGoogle({ widget }: { widget: string }) {
  const caixa = useRef<HTMLDivElement>(null);
  const [apareceu, setApareceu] = useState(false);

  useEffect(() => {
    const el = caixa.current;
    if (!el) return;

    /*
     * "Apareceu" é a caixa ter altura, e não ganhar um filho: o carregador da
     * Trustindex insere e tira elementos mesmo quando o widget vem vazio, e um
     * título por cima de nada é pior do que a seção não existir.
     */
    const aoAparecer = new ResizeObserver(([entrada]) => {
      setApareceu((entrada?.contentRect.height ?? 0) > 40);
    });
    aoAparecer.observe(el);

    const aoChegar = new IntersectionObserver(
      (entradas) => {
        if (!entradas.some((entrada) => entrada.isIntersecting)) return;
        aoChegar.disconnect();
        const script = document.createElement('script');
        script.src = `https://cdn.trustindex.io/loader.js?${encodeURIComponent(widget)}`;
        script.defer = true;
        script.async = true;
        el.appendChild(script);
      },
      { rootMargin: '800px 0px' },
    );
    aoChegar.observe(el);

    return () => {
      aoChegar.disconnect();
      aoAparecer.disconnect();
    };
  }, [widget]);

  return (
    <section
      aria-labelledby={apareceu ? 'titulo-depoimentos' : undefined}
      className={apareceu ? 'mx-auto max-w-7xl px-4 py-16 lg:px-8' : 'mx-auto max-w-7xl px-4 lg:px-8'}
    >
      {apareceu && (
        <h2 id="titulo-depoimentos" className="mb-8 font-serif text-3xl">
          Depoimentos
        </h2>
      )}
      <div ref={caixa} data-avaliacoes="" />
    </section>
  );
}
