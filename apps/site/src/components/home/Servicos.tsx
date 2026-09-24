import { ArrowRight, FileText, House, KeyRound } from 'lucide-react';
import Link from 'next/link';

import { urlDaListagem } from '@/lib/imoveis/listagem';

const SERVICOS = [
  {
    Icone: House,
    titulo: 'Compra',
    texto: 'Ajuda para encontrar o imóvel ideal.',
    href: urlDaListagem({ finalidade: 'venda' }),
  },
  {
    Icone: KeyRound,
    titulo: 'Venda',
    texto: 'Estratégias para vender mais rápido.',
    href: '/cadastrar-imovel',
  },
  {
    Icone: FileText,
    titulo: 'Locação',
    texto: 'Gestão e intermediação de aluguel.',
    href: urlDaListagem({ finalidade: 'aluguel' }),
  },
] as const;

/** "Meus serviços": no celular vira lista compacta, como no modelo. */
export function Servicos() {
  return (
    <section aria-labelledby="titulo-servicos" className="mx-auto max-w-7xl px-4 py-16 lg:px-8">
      <h2 id="titulo-servicos" className="font-serif text-3xl">
        Meus serviços
      </h2>
      <ul className="mt-8 grid gap-4 md:grid-cols-3 md:gap-6">
        {SERVICOS.map(({ Icone, titulo, texto, href }) => (
          <li key={titulo}>
            <Link
              href={href}
              className="group flex h-full items-center gap-4 rounded-lg bg-white p-5 ring-1 ring-linha transition hover:shadow-md md:flex-col md:items-start md:p-7"
            >
              <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-creme text-caramelo">
                <Icone aria-hidden className="size-6" strokeWidth={1.5} />
              </span>
              <span className="flex flex-1 flex-col gap-1.5 md:gap-3">
                <span className="font-serif text-xl md:text-2xl">{titulo}</span>
                <span className="text-sm text-suave">{texto}</span>
                <span className="inline-flex items-center gap-1 text-xs font-medium text-bronze">
                  Saiba mais <ArrowRight aria-hidden className="size-3.5 transition group-hover:translate-x-0.5" />
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
