import Link from 'next/link';

import { SITE } from '@/config/site';

const MENU = [
  { href: '/aluguel', rotulo: 'Alugar' },
  { href: '/venda', rotulo: 'Comprar' },
  { href: '/anuncie', rotulo: 'Anunciar' },
] as const;

export function Cabecalho() {
  return (
    <header className="sticky top-0 z-30 border-b border-linha bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
        {/* Logo provisório em texto até a marca chegar. */}
        <Link href="/" className="min-w-0 leading-tight">
          <span className="block truncate font-semibold text-marca">{SITE.nomeCurto}</span>
          {/* No celular o CRECI não cabe aqui sem cortar; ele aparece no topo da home e no rodapé. */}
          <span className="block truncate text-xs text-suave">
            Corretora de Imóveis<span className="hidden sm:inline"> · {SITE.creci}</span>
          </span>
        </Link>

        <nav aria-label="Principal">
          <ul className="flex items-center gap-4 text-sm font-medium">
            {MENU.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="py-2 hover:text-marca">
                  {item.rotulo}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}
