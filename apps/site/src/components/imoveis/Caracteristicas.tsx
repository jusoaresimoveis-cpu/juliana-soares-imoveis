import { Bath, BedDouble, Car, Maximize2, type LucideIcon } from 'lucide-react';

import { plural } from '@/lib/formato';
import type { Imovel } from '@/lib/imoveis/tipos';

interface Item {
  Icone: LucideIcon;
  valor: string;
  rotulo: string;
  /** A segunda linha, menor: as suítes embaixo dos quartos, a área total embaixo da área. */
  extra: string | null;
}

const m2 = (area: number) => area.toLocaleString('pt-BR');

/**
 * A linha de números do imóvel, com os mesmos ícones dos cartões da listagem.
 *
 * Só o que foi preenchido: um "—" no site parece imóvel com defeito, e não
 * cadastro incompleto.
 */
export function Caracteristicas({ imovel }: { imovel: Imovel }) {
  const itens: Item[] = [];

  if (imovel.areaM2) {
    const total = imovel.areaTotalM2 && imovel.areaTotalM2 !== imovel.areaM2 ? imovel.areaTotalM2 : null;
    itens.push({ Icone: Maximize2, valor: m2(imovel.areaM2), rotulo: 'm²', extra: total ? `${m2(total)} m² total` : null });
  }
  if (imovel.quartos) {
    itens.push({
      Icone: BedDouble,
      valor: String(imovel.quartos),
      rotulo: imovel.quartos === 1 ? 'quarto' : 'quartos',
      extra: imovel.suites ? plural(imovel.suites, 'suíte', 'suítes') : null,
    });
  }
  if (imovel.banheiros) {
    itens.push({ Icone: Bath, valor: String(imovel.banheiros), rotulo: imovel.banheiros === 1 ? 'banheiro' : 'banheiros', extra: null });
  }
  if (imovel.vagas) {
    itens.push({ Icone: Car, valor: String(imovel.vagas), rotulo: imovel.vagas === 1 ? 'vaga' : 'vagas', extra: null });
  }
  if (itens.length === 0) return null;

  return (
    <ul className="flex flex-wrap gap-x-8 gap-y-3 pt-2">
      {itens.map(({ Icone, valor, rotulo, extra }) => (
        <li key={rotulo} className="flex items-start gap-2">
          <Icone aria-hidden className="mt-1 size-5 shrink-0 text-bronze" />
          <div className="leading-tight">
            <p>
              <strong className="text-lg font-semibold text-tinta">{valor}</strong>{' '}
              <span className="text-sm text-suave">{rotulo}</span>
            </p>
            {extra && <p className="text-xs text-suave">{extra}</p>}
          </div>
        </li>
      ))}
    </ul>
  );
}
