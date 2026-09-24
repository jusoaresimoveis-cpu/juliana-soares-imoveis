import { SITE } from '@/config/site';

/**
 * Link direto para o WhatsApp da Juliana.
 *
 * PROVISÓRIO. Pela regra combinada, mensagem sem código de rastreio não vira
 * lead no CRM (o número dela é pessoal também). Quando o rastreio entrar, todo
 * botão do site passa a apontar para `/w/<código>`, que registra o clique e
 * abre o WhatsApp com a mensagem já carimbada com o `Ref.`.
 */
export function linkDoWhatsApp(mensagem?: string): string {
  const base = `https://wa.me/${SITE.whatsapp}`;
  return mensagem ? `${base}?text=${encodeURIComponent(mensagem)}` : base;
}
