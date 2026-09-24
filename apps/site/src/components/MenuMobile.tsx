'use client';

import { Menu, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

import { MENU } from '@/config/navegacao';

/** O menu hambúrguer do celular. Some a partir do desktop, onde o menu fica aberto no cabeçalho. */
export function MenuMobile() {
  const caminho = usePathname();
  // Guarda EM QUE PÁGINA o menu foi aberto. Trocou de página, deixa de estar
  // aberto sozinho: a navegação do Next não recarrega, e sem isso o menu
  // continuaria por cima da página nova.
  const [abertoEm, setAbertoEm] = useState<string | null>(null);
  const aberto = abertoEm === caminho;
  const fechar = () => setAbertoEm(null);

  useEffect(() => {
    if (!aberto) return;
    const fecharComEsc = (evento: KeyboardEvent) => evento.key === 'Escape' && setAbertoEm(null);
    window.addEventListener('keydown', fecharComEsc);
    return () => window.removeEventListener('keydown', fecharComEsc);
  }, [aberto]);

  return (
    <div className="lg:hidden">
      <button
        type="button"
        onClick={() => setAbertoEm(aberto ? null : caminho)}
        aria-expanded={aberto}
        aria-controls="menu-mobile"
        aria-label={aberto ? 'Fechar menu' : 'Abrir menu'}
        className="-mr-2 flex size-11 items-center justify-center rounded-md hover:bg-areia"
      >
        {aberto ? <X aria-hidden className="size-6" /> : <Menu aria-hidden className="size-6" />}
      </button>

      {aberto && (
        <nav id="menu-mobile" aria-label="Principal" className="absolute inset-x-0 top-full border-b border-linha bg-creme shadow-lg">
          <ul className="mx-auto max-w-7xl px-4 py-2">
            {MENU.map((item) => (
              <li key={item.href} className="border-b border-linha last:border-0">
                <Link
                  href={item.href}
                  onClick={fechar}
                  aria-current={caminho === item.href ? 'page' : undefined}
                  className="block py-3.5 text-base aria-[current=page]:text-bronze"
                >
                  {item.rotulo}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </div>
  );
}
