import { CANAIS, canalDoSlug, parseRefCode, refDoSite } from '@juliana/contracts';

import { SITE } from '@/config/site';

/*
 * Todo link de WhatsApp do site sai com o `Ref.`.
 *
 * O número da Juliana também é pessoal, e o CRM só aceita a conversa que chega
 * com prova de origem: sem o código, quem chama pelo site cai como conversa
 * pessoal e não vira lead (ver `refDoSite`). O canal de onde o visitante veio
 * entra no código na hora do clique (`OrigemDaVisita`), e fora do site o link
 * `/w/<canal>` já sai com ele (`linkDoCanal`).
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

/**
 * O link com canal, para fora do site: `/w/bio`, `/w/google`,
 * `/w/marketplace/1004`.
 *
 * É o que vai na bio do Instagram, no Perfil da Empresa no Google e na descrição
 * do Marketplace. Abre o WhatsApp com a mensagem pronta e o canal no código, e o
 * contato entra no CRM com a origem certa. Canal que não existe abre o WhatsApp
 * do mesmo jeito, como site: link de cliente não pode dar em página de erro.
 */
export function linkDoCanal(rota: readonly string[]): string {
  const [slug = '', codigo] = rota;
  const canal = canalDoSlug(slug) ?? undefined;
  const imovel = codigo && /^[A-Za-z0-9]{4}$/.test(codigo) ? codigo.toUpperCase() : undefined;
  const pedido = imovel ? `Tenho interesse no imóvel ${imovel}. ` : '';
  const veio = canal ? `Vim pelo ${CANAIS[canal].nome}.` : 'Vim pelo site.';
  return linkDoWhatsApp(`Olá, Juliana! ${pedido}${veio} (${refDoSite(imovel, canal)})`);
}
