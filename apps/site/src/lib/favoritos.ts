'use client';

import { useSyncExternalStore } from 'react';

/**
 * Favoritos guardados no próprio aparelho (localStorage), sem login.
 *
 * Pedir cadastro para salvar um imóvel espanta mais do que ajuda. O preço é
 * que o favorito não passa de um aparelho para outro, e some se a pessoa limpar
 * o navegador.
 *
 * O "retrato" é o texto cru do localStorage, e não a lista: texto compara por
 * valor, e o React só redesenha quando o conteúdo mudou de fato.
 */

const CHAVE = 'juliana-soares:favoritos';
const ouvintes = new Set<() => void>();

function lerTexto(): string {
  try {
    return localStorage.getItem(CHAVE) ?? '[]';
  } catch {
    // Navegador em modo privado, ou armazenamento bloqueado: fica sem favoritos.
    return '[]';
  }
}

function paraLista(texto: string): string[] {
  try {
    const valor: unknown = JSON.parse(texto);
    return Array.isArray(valor) ? valor.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function avisar() {
  for (const ouvinte of ouvintes) ouvinte();
}

function assinar(ouvinte: () => void) {
  ouvintes.add(ouvinte);
  // Outra aba mexeu nos favoritos.
  window.addEventListener('storage', ouvinte);
  return () => {
    ouvintes.delete(ouvinte);
    window.removeEventListener('storage', ouvinte);
  };
}

export function alternarFavorito(codigo: string) {
  const atuais = paraLista(lerTexto());
  const novos = atuais.includes(codigo) ? atuais.filter((c) => c !== codigo) : [...atuais, codigo];
  try {
    localStorage.setItem(CHAVE, JSON.stringify(novos));
  } catch {
    return;
  }
  avisar();
}

/** Os códigos favoritados. No servidor (e antes de hidratar) é sempre lista vazia. */
export function useFavoritos(): string[] {
  const texto = useSyncExternalStore(assinar, lerTexto, () => '[]');
  return paraLista(texto);
}
