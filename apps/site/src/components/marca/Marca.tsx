import Link from 'next/link';

import { Simbolo } from './Simbolo';

/**
 * O logo: o símbolo da marca, o nome em versal espaçada e o subtítulo embaixo.
 *
 * O símbolo é o do arquivo do logo; o nome e o subtítulo continuam em texto,
 * na Playfair Display e na Inter do site (decisão de 26/09). É o único lugar do
 * site que sabe como o logo é.
 */
export function Marca({ tom = 'escuro' }: { tom?: 'escuro' | 'claro' }) {
  const cor = tom === 'escuro' ? 'text-tinta' : 'text-white';
  const corSuave = tom === 'escuro' ? 'text-suave' : 'text-white/70';
  // No rodapé escuro, o marrom do símbolo some: lá ele sai em caramelo.
  const corDoSimbolo = tom === 'escuro' ? 'text-marca' : 'text-caramelo';

  return (
    <Link href="/" className={`flex items-center gap-2.5 ${cor}`} aria-label="Juliana Soares, Corretora de Imóveis: página inicial">
      <Simbolo className={`h-11 w-auto shrink-0 ${corDoSimbolo}`} />
      <span aria-hidden className="leading-tight whitespace-nowrap">
        <span className="block font-serif text-lg tracking-[0.12em] uppercase">Juliana Soares</span>
        <span className={`block text-[0.625rem] tracking-[0.3em] uppercase ${corSuave}`}>Corretora de Imóveis</span>
      </span>
    </Link>
  );
}
