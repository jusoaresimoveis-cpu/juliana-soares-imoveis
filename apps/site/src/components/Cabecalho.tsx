import Link from 'next/link';

import { MENU } from '@/config/navegacao';

import { BotaoWhatsApp } from './BotaoWhatsApp';
import { Marca } from './marca/Marca';
import { MenuMobile } from './MenuMobile';

export function Cabecalho() {
  return (
    // Fundo opaco, sem `backdrop-blur`: o desfoque do que passa por baixo custa
    // desenho a cada rolagem no celular, e a 95% de opacidade nem aparecia.
    <header className="sticky top-0 z-40 border-b border-linha bg-creme">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-4 py-3 lg:px-8">
        <Marca />

        <nav aria-label="Principal" className="hidden lg:block">
          <ul className="flex items-center gap-7 text-sm">
            {MENU.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="py-2 transition-colors hover:text-bronze">
                  {item.rotulo}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {/* No celular o WhatsApp fica na barra inferior; aqui ele só espremeria o logo. */}
        <div className="hidden lg:block">
          <BotaoWhatsApp mensagem="Olá, Juliana! Vim pelo site." />
        </div>
        <MenuMobile />
      </div>
    </header>
  );
}
