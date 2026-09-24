import { CircleUserRound, Star } from 'lucide-react';

import { Carrossel } from '@/components/ui/Carrossel';
import { carregarDepoimentos } from '@/lib/depoimentos';

/** Sem depoimento real carregado, a seção não aparece. */
export async function Depoimentos() {
  const depoimentos = await carregarDepoimentos();
  if (depoimentos.length === 0) return null;

  return (
    <section aria-labelledby="titulo-depoimentos" className="mx-auto max-w-7xl px-4 py-16 lg:px-8">
      <h2 id="titulo-depoimentos" className="mb-8 font-serif text-3xl">
        Depoimentos
      </h2>
      <Carrossel rotulo="Depoimentos de clientes">
        {depoimentos.map((depoimento) => (
          <figure key={depoimento.nome} className="flex h-full flex-col gap-4 rounded-lg bg-white p-6 ring-1 ring-linha">
            <div className="flex gap-0.5" role="img" aria-label={`Nota ${depoimento.nota} de 5`}>
              {Array.from({ length: 5 }, (_, indice) => (
                <Star
                  key={indice}
                  aria-hidden
                  className={`size-4 ${indice < depoimento.nota ? 'fill-caramelo text-caramelo' : 'text-linha'}`}
                />
              ))}
            </div>
            <blockquote className="flex-1 text-sm leading-relaxed">“{depoimento.texto}”</blockquote>
            <figcaption className="flex items-center gap-3">
              <CircleUserRound aria-hidden className="size-9 text-suave" strokeWidth={1.25} />
              <span>
                <span className="block text-sm font-semibold">{depoimento.nome}</span>
                <span className="block text-xs text-suave">
                  {[depoimento.cidade, 'Avaliação no Google'].filter(Boolean).join(' · ')}
                </span>
              </span>
            </figcaption>
          </figure>
        ))}
      </Carrossel>
    </section>
  );
}
