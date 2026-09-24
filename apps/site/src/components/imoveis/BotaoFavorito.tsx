'use client';

import { Heart } from 'lucide-react';

import { alternarFavorito, useFavoritos } from '@/lib/favoritos';

export function BotaoFavorito({ codigo, titulo }: { codigo: string; titulo: string }) {
  const favorito = useFavoritos().includes(codigo);

  return (
    <button
      type="button"
      onClick={() => alternarFavorito(codigo)}
      aria-pressed={favorito}
      aria-label={favorito ? `Tirar dos favoritos: ${titulo}` : `Salvar nos favoritos: ${titulo}`}
      className="flex size-10 items-center justify-center rounded-full bg-white/90 text-tinta shadow-sm transition hover:bg-white"
    >
      <Heart aria-hidden className={`size-5 ${favorito ? 'fill-bronze text-bronze' : ''}`} />
    </button>
  );
}
