import { MessageCircle } from 'lucide-react';

import { linkDoWhatsApp } from '@/lib/whatsapp';

import { Botao } from './ui/Botao';

interface Props {
  mensagem?: string;
  rotulo?: string;
  className?: string;
}

export function BotaoWhatsApp({ mensagem, rotulo = 'Falar no WhatsApp', className }: Props) {
  return (
    <Botao
      href={linkDoWhatsApp(mensagem)}
      estilo="whatsapp"
      target="_blank"
      rel="noopener"
      icone={<MessageCircle aria-hidden className="size-4" />}
      className={className}
    >
      {rotulo}
    </Botao>
  );
}
