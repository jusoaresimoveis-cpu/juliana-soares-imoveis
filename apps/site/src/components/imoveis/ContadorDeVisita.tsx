'use client';

import { useEffect } from 'react';

import { CHAVE_DAS_VISITAS, diaDoAparelho, pareceRobo, registrarNoAparelho } from '@/lib/visitas';

/**
 * Conta a visita a esta página de imóvel (`/api/visita` → `registrar_visita`).
 * Não desenha nada, e não segura a página: a chamada sai depois da primeira
 * pintura e o erro é ignorado.
 */
export function ContadorDeVisita({ codigo }: { codigo: string }) {
  useEffect(() => {
    if (navigator.webdriver || pareceRobo(navigator.userAgent)) return;

    let guardado: string | null = null;
    try {
      guardado = localStorage.getItem(CHAVE_DAS_VISITAS);
    } catch {
      // Sem armazenamento (aba anônima de alguns navegadores): conta sempre.
    }
    const { contar, guardar } = registrarNoAparelho(guardado, codigo, diaDoAparelho());
    if (!contar) return;
    try {
      localStorage.setItem(CHAVE_DAS_VISITAS, guardar);
    } catch {
      // Idem.
    }

    void fetch('/api/visita', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigo }),
      keepalive: true,
    }).catch(() => {});
  }, [codigo]);

  return null;
}
