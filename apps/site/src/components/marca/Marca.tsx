import Link from 'next/link';

/**
 * Logo PROVISÓRIO, em texto, no desenho do modelo: monograma "JS" em serifa,
 * nome em versal espaçada e o subtítulo embaixo.
 *
 * Quando o logo definitivo chegar (conteudo/marca), este componente passa a
 * desenhar o SVG. É o único lugar do site que sabe como o logo é.
 */
export function Marca({ tom = 'escuro' }: { tom?: 'escuro' | 'claro' }) {
  const cor = tom === 'escuro' ? 'text-tinta' : 'text-white';
  const corSuave = tom === 'escuro' ? 'text-suave' : 'text-white/70';

  return (
    <Link href="/" className={`flex items-center gap-2.5 ${cor}`} aria-label="Juliana Soares, Corretora de Imóveis: página inicial">
      <span aria-hidden className="font-serif text-4xl leading-none tracking-tighter">
        J<span className="-ml-2 italic">S</span>
      </span>
      <span aria-hidden className="leading-tight whitespace-nowrap">
        <span className="block font-serif text-lg tracking-[0.12em] uppercase">Juliana Soares</span>
        <span className={`block text-[0.625rem] tracking-[0.3em] uppercase ${corSuave}`}>Corretora de Imóveis</span>
      </span>
    </Link>
  );
}
