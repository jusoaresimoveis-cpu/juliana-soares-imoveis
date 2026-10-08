import { caracteristicasParaMostrar } from '@juliana/contracts';
import { Check } from 'lucide-react';

import type { Imovel } from '@/lib/imoveis/tipos';

/**
 * "Sobre o imóvel": a descrição e, abaixo, o que a unidade, o empreendimento e
 * a área de lazer têm, cada um com o seu título ("Apartamento", "Empreendimento",
 * "Área de lazer", "Informações adicionais"). Sem descrição e sem item marcado,
 * a seção não aparece.
 */
export function SobreOImovel({ imovel }: { imovel: Imovel }) {
  const categorias = caracteristicasParaMostrar(imovel.caracteristicas, imovel.tipo);
  if (!imovel.descricao && categorias.length === 0) return null;

  return (
    <section className="space-y-4">
      <h2 className="font-serif text-2xl">Sobre o imóvel</h2>
      {imovel.descricao && <p className="whitespace-pre-line leading-relaxed">{imovel.descricao}</p>}

      {categorias.map(({ categoria, titulo, itens }) => (
        <div key={categoria} className="border-t border-linha pt-4">
          <h3 className="text-xs font-semibold tracking-wider text-suave uppercase">{titulo}</h3>
          <ul className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {itens.map((item) => (
              <li key={item} className="flex items-start gap-2">
                <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-bronze" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
