import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';

/**
 * Os botões do modelo. São sempre links: todo botão do site leva a algum
 * lugar (uma página, o WhatsApp, uma âncora).
 */
const ESTILOS = {
  bronze: 'bg-bronze text-white hover:bg-bronze-escuro',
  escuro: 'bg-grafite text-white hover:bg-grafite-claro',
  whatsapp: 'bg-whatsapp text-white hover:bg-whatsapp-escuro',
  contorno: 'border border-tinta/80 text-tinta hover:bg-tinta hover:text-white',
  'contorno-claro': 'border border-white/70 text-white hover:bg-white hover:text-tinta',
} as const;

export type EstiloDeBotao = keyof typeof ESTILOS;

const BASE =
  'inline-flex min-h-12 items-center justify-center gap-2 rounded-md px-5 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-caramelo';

interface Props extends Omit<ComponentProps<'a'>, 'href'> {
  href: string;
  estilo?: EstiloDeBotao;
  icone?: ReactNode;
  children: ReactNode;
}

export function Botao({ href, estilo = 'bronze', icone, children, className = '', ...resto }: Props) {
  const classes = `${BASE} ${ESTILOS[estilo]} ${className}`;
  const conteudo = (
    <>
      {icone}
      <span className="inline-flex items-center gap-2">{children}</span>
    </>
  );

  // Link externo (WhatsApp) é <a> comum; o resto usa o Link do Next, que
  // pré-carrega a página e navega sem recarregar.
  if (/^https?:\/\//.test(href)) {
    return (
      <a href={href} className={classes} {...resto}>
        {conteudo}
      </a>
    );
  }
  return (
    <Link href={href} className={classes} {...resto}>
      {conteudo}
    </Link>
  );
}
