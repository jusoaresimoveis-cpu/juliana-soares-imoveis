import { Bath, BedDouble, Car, Maximize2, type LucideIcon } from 'lucide-react';

import { numerosDoImovel, type TipoDeNumero } from '@/lib/imoveis/numeros';
import type { Imovel } from '@/lib/imoveis/tipos';

/** Os mesmos ícones dos cartões da listagem. */
const ICONE: Record<TipoDeNumero, LucideIcon> = {
  area: Maximize2,
  quartos: BedDouble,
  banheiros: Bath,
  vagas: Car,
};

/** A linha de números do imóvel: ícone, valor em negrito, rótulo e uma segunda linha menor. */
export function Caracteristicas({ imovel }: { imovel: Imovel }) {
  const numeros = numerosDoImovel(imovel);
  if (numeros.length === 0) return null;

  return (
    <ul className="flex flex-wrap gap-x-8 gap-y-3 pt-2">
      {numeros.map(({ tipo, valor, rotulo, extra }) => {
        const Icone = ICONE[tipo];
        return (
          <li key={tipo} className="flex items-start gap-2">
            <Icone aria-hidden className="mt-1 size-5 shrink-0 text-bronze" />
            <div className="leading-tight">
              <p>
                <strong className="text-lg font-semibold text-tinta">{valor}</strong>{' '}
                <span className="text-sm text-suave">{rotulo}</span>
              </p>
              {extra && <p className="text-xs text-suave">{extra}</p>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
