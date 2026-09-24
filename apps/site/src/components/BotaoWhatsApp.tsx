import { linkDoWhatsApp } from '@/lib/whatsapp';

interface Props {
  mensagem?: string;
  rotulo?: string;
  /** Flutuante no canto da tela: é onde o polegar alcança no celular. */
  flutuante?: boolean;
}

export function BotaoWhatsApp({ mensagem, rotulo = 'Falar no WhatsApp', flutuante = false }: Props) {
  const classes = flutuante
    ? 'fixed bottom-4 right-4 z-40 shadow-lg'
    : 'w-full sm:w-auto';

  return (
    <a
      href={linkDoWhatsApp(mensagem)}
      target="_blank"
      rel="noopener"
      className={`${classes} inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-whatsapp px-5 font-semibold text-white hover:brightness-110`}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="size-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
      </svg>
      <span>{rotulo}</span>
    </a>
  );
}
