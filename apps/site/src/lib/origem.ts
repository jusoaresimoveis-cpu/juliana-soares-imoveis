import { ehCanal, type Canal } from '@juliana/contracts';

/**
 * De onde o visitante chegou ao site, para o CRM saber a origem do lead.
 *
 * O site anota no navegador o PRIMEIRO canal que reconhece (Google, Instagram,
 * anúncio, Marketplace) e, quando a pessoa toca num botão de WhatsApp, o canal
 * entra no código da mensagem: `Ref. 1004-A` vira `Ref. 1004-GO-A`. O banco lê
 * esse código e grava a origem do lead (`origem_do_canal`). Nada identifica a
 * pessoa: é só o canal, e só no aparelho dela (está na política de privacidade).
 *
 * O primeiro, e não o último: é o que o CRM chama de primeiro toque. Quem achou
 * a Juliana no Google e voltou depois digitando o endereço veio do Google.
 */

export const CHAVE_DA_ORIGEM = 'origem-da-visita';

/** Depois disso a anotação vence: quem volta meses depois por outro caminho é outra chegada. */
export const VALIDADE_DA_ORIGEM_DIAS = 90;

const PAGO = new Set(['cpc', 'ppc', 'paid', 'ads', 'paid_social', 'paidsocial', 'anuncio']);

/**
 * O canal da chegada, pelo endereço e pela página de onde a pessoa veio.
 *
 * A ordem é a da força da prova. O id de clique do Google só existe em anúncio.
 * As UTMs são as que a Juliana põe nos links dela (Perfil da Empresa, bio). A
 * página anterior é o que sobra quando o link veio sem marca nenhuma. Chegada
 * direta, ou de dentro do próprio site, não tem canal, e não apaga o anotado.
 */
export function canalDaChegada(endereco: URL, paginaAnterior: string): Canal | null {
  const p = endereco.searchParams;
  if (p.get('gclid') || p.get('gbraid') || p.get('wbraid')) return 'ga';

  const fonte = (p.get('utm_source') ?? '').toLowerCase();
  const meio = (p.get('utm_medium') ?? '').toLowerCase();
  const pago = PAGO.has(meio);
  if (fonte === 'google') return pago ? 'ga' : 'go';
  if (fonte === 'instagram' || fonte === 'ig') return pago ? 'ma' : meio === 'bio' ? 'bi' : 'ig';
  if (fonte === 'facebook' || fonte === 'fb') return pago ? 'ma' : meio === 'marketplace' ? 'mk' : 'fb';
  if (fonte === 'marketplace') return 'mk';
  if (fonte === 'bio') return 'bi';

  // O aplicativo do Google, do Instagram e do Facebook no Android se anuncia assim.
  if (paginaAnterior.startsWith('android-app://com.google.')) return 'go';
  if (paginaAnterior.startsWith('android-app://com.instagram.')) return 'ig';
  if (paginaAnterior.startsWith('android-app://com.facebook.')) return 'fb';

  let host = '';
  try {
    host = new URL(paginaAnterior).hostname.toLowerCase();
  } catch {
    return null;
  }
  if (/(^|\.)google\.[a-z.]+$/.test(host)) return 'go';
  if (host === 'instagram.com' || host.endsWith('.instagram.com')) return 'ig';
  if (host === 'facebook.com' || host.endsWith('.facebook.com') || host === 'fb.me') return 'fb';
  return null;
}

interface Anotacao {
  canal: Canal;
  em: string;
}

function lerAnotacao(guardado: string | null): Anotacao | null {
  if (!guardado) return null;
  try {
    const a = JSON.parse(guardado) as Partial<Anotacao>;
    return ehCanal(a.canal) && typeof a.em === 'string' ? { canal: a.canal, em: a.em } : null;
  } catch {
    return null;
  }
}

function venceu(a: Anotacao, agora: Date): boolean {
  const em = Date.parse(a.em);
  return Number.isNaN(em) || agora.getTime() - em > VALIDADE_DA_ORIGEM_DIAS * 86_400_000;
}

/** O canal anotado, se ainda vale. */
export function canalAnotado(guardado: string | null, agora: Date): Canal | null {
  const a = lerAnotacao(guardado);
  return a && !venceu(a, agora) ? a.canal : null;
}

/**
 * O que gravar depois desta chegada, ou `null` se nada muda: a anotação que
 * ainda vale fica, e chegada sem canal não escreve nada.
 */
export function novaAnotacao(guardado: string | null, canal: Canal | null, agora: Date): string | null {
  if (!canal || canalAnotado(guardado, agora)) return null;
  return JSON.stringify({ canal, em: agora.toISOString() } satisfies Anotacao);
}

/**
 * O link do WhatsApp com o canal no código: `Ref. 1004-A` vira `Ref. 1004-GO-A`.
 *
 * Código que já traz canal fica como está. A mensagem é reescrita com
 * `encodeURIComponent`, e não com `URLSearchParams`: esse troca o espaço por
 * "+", e o "+" chegaria escrito na mensagem.
 */
export function comCanal(href: string, canal: Canal): string {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return href;
  }
  const texto = url.searchParams.get('text');
  if (!texto) return href;

  const novo = texto.replace(
    /\bRef\.\s*([A-Za-z0-9]{4})-([ABCabc])\b/,
    (_codigo, imovel: string, variante: string) => `Ref. ${imovel}-${canal.toUpperCase()}-${variante}`,
  );
  if (novo === texto) return href;

  const resto = [...url.searchParams].filter(([k]) => k !== 'text');
  const query = [['text', novo], ...resto].map(([k, v]) => `${encodeURIComponent(k!)}=${encodeURIComponent(v!)}`);
  return `${url.origin}${url.pathname}?${query.join('&')}`;
}
