'use client';

import { Heart, House, MessageCircle, Search } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { ANCORA_DA_BUSCA } from '@/config/navegacao';
import { linkDoWhatsApp } from '@/lib/whatsapp';

/**
 * A barra fixa no pé da tela do celular, como no modelo: Home, Buscar,
 * Favoritos e WhatsApp. É onde o polegar alcança; o WhatsApp fica a um toque
 * em qualquer página.
 */
export function BarraInferior() {
  const caminho = usePathname();

  const itens = [
    { href: '/', rotulo: 'Home', Icone: House, ativo: caminho === '/' },
    { href: ANCORA_DA_BUSCA, rotulo: 'Buscar', Icone: Search, ativo: false },
    { href: '/favoritos', rotulo: 'Favoritos', Icone: Heart, ativo: caminho === '/favoritos' },
  ];

  const classe = 'flex flex-1 flex-col items-center justify-center gap-1 py-2 text-[0.6875rem]';

  return (
    <nav
      aria-label="Atalhos"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-linha bg-white pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <ul className="flex">
        {itens.map(({ href, rotulo, Icone, ativo }) => (
          <li key={rotulo} className="flex flex-1">
            <Link
              href={href}
              aria-current={ativo ? 'page' : undefined}
              className={`${classe} ${ativo ? 'text-bronze' : 'text-tinta'}`}
            >
              <Icone aria-hidden className="size-5" />
              {rotulo}
            </Link>
          </li>
        ))}
        <li className="flex flex-1">
          <a
            href={linkDoWhatsApp()}
            target="_blank"
            rel="noopener"
            className={`${classe} text-whatsapp`}
          >
            <MessageCircle aria-hidden className="size-5" />
            WhatsApp
          </a>
        </li>
      </ul>
    </nav>
  );
}
