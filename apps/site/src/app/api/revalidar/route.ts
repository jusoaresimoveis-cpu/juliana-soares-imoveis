import { createHash, timingSafeEqual } from 'node:crypto';

import { revalidateTag } from 'next/cache';

import { ETIQUETA_DOS_IMOVEIS } from '@/lib/imoveis/dados';

/**
 * O banco avisa aqui quando um imóvel muda (gatilho em `properties` e
 * `property_media`, pelo pg_net), e as páginas que usam os imóveis se refazem.
 *
 * `expire: 0` e não `'max'`: com `'max'` a primeira visita depois da mudança
 * ainda recebe a versão velha. A Juliana salva o imóvel e abre o site para
 * conferir, e essa primeira visita é justamente a dela.
 *
 * O segredo vai num cabeçalho e é comparado em tempo constante. Sem ele, a
 * rota não faz nada: qualquer um poderia forçar o site a refazer as páginas.
 */
export function POST(request: Request) {
  const segredo = process.env.REVALIDACAO_SEGREDO;
  if (!segredo || !mesmoSegredo(request.headers.get('x-revalidacao') ?? '', segredo)) {
    return Response.json({ revalidado: false }, { status: 401 });
  }
  revalidateTag(ETIQUETA_DOS_IMOVEIS, { expire: 0 });
  return Response.json({ revalidado: true });
}

// O hash iguala o tamanho: `timingSafeEqual` exige dois buffers do mesmo tamanho,
// e comparar os tamanhos antes vazaria o tamanho do segredo.
function mesmoSegredo(recebido: string, esperado: string): boolean {
  const digest = (texto: string) => createHash('sha256').update(texto).digest();
  return timingSafeEqual(digest(recebido), digest(esperado));
}
