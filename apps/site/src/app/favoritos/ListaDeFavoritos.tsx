'use client';

import type { ReactNode } from 'react';

import { useFavoritos } from '@/lib/favoritos';

/**
 * Recebe o cartão de cada imóvel já pronto do servidor e mostra só os
 * favoritados neste aparelho. A lista de favoritos existe só no navegador,
 * por isso o filtro acontece aqui.
 */
export function ListaDeFavoritos({ cartoes, vazio }: { cartoes: { codigo: string; cartao: ReactNode }[]; vazio: ReactNode }) {
  const favoritos = useFavoritos();
  const escolhidos = cartoes.filter(({ codigo }) => favoritos.includes(codigo));

  if (escolhidos.length === 0) return <>{vazio}</>;

  return (
    <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
      {escolhidos.map(({ codigo, cartao }) => (
        <li key={codigo}>{cartao}</li>
      ))}
    </ul>
  );
}
