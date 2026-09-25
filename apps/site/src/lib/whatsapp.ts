import { parseRefCode, refDoSite } from '@juliana/contracts';

import { SITE } from '@/config/site';

/*
 * Todo link de WhatsApp do site sai com o `Ref.`.
 *
 * O número da Juliana também é pessoal, e o CRM só aceita a conversa que chega
 * com prova de origem: sem o código, quem chama pelo site cai como conversa
 * pessoal e não vira lead (ver `refDoSite`). O link rastreado `/w/<código>`,
 * quando entrar, vai registrar o clique e as UTMs antes de abrir o WhatsApp,
 * com este mesmo código na mensagem.
 */

/** A saudação do botão de um imóvel: o link dele e o código que liga o contato a ele no CRM. */
export function mensagemDoImovel(imovel: { codigo: string; slug: string }): string {
  return `Olá, Juliana! Tenho interesse neste imóvel: ${SITE.url}/imovel/${imovel.slug} (${refDoSite(imovel.codigo)})`;
}

/**
 * Link direto para o WhatsApp da Juliana.
 *
 * A garantia do código mora aqui, por onde todo botão passa: a mensagem que já
 * traz um (a de um imóvel) sai como está, e as outras, escritas em cada
 * página, ganham o do site no fim.
 */
export function linkDoWhatsApp(mensagem = 'Olá, Juliana! Vim pelo site.'): string {
  const texto = parseRefCode(mensagem) ? mensagem : `${mensagem} (${refDoSite()})`;
  return `https://wa.me/${SITE.whatsapp}?text=${encodeURIComponent(texto)}`;
}
