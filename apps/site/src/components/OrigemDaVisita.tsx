'use client';

import { useEffect } from 'react';

import { CHAVE_DA_ORIGEM, canalAnotado, canalDaChegada, comCanal, novaAnotacao } from '@/lib/origem';

/**
 * Anota de onde o visitante chegou e põe o canal no código do WhatsApp.
 *
 * O canal entra no CLIQUE, e não no link: os botões são desenhados no servidor,
 * e a página é a mesma para todo mundo (e fica em cache). Um ouvinte só, no
 * documento, alcança todo botão de WhatsApp do site sem mexer em cada um.
 *
 * Sem o armazenamento do navegador (aba anônima, bloqueio), vale o canal desta
 * chegada, enquanto a página estiver aberta.
 */
export function OrigemDaVisita() {
  useEffect(() => {
    const daChegada = canalDaChegada(new URL(window.location.href), document.referrer);
    const ler = () => {
      try {
        return localStorage.getItem(CHAVE_DA_ORIGEM);
      } catch {
        return null;
      }
    };

    const nova = novaAnotacao(ler(), daChegada, new Date());
    if (nova) {
      try {
        localStorage.setItem(CHAVE_DA_ORIGEM, nova);
      } catch {
        // Sem armazenamento: fica valendo `daChegada`, abaixo.
      }
    }

    function aoTocar(evento: Event) {
      const alvo = evento.target instanceof Element ? evento.target : null;
      const link = alvo?.closest('a[href^="https://wa.me/"]');
      if (!link) return;
      const canal = canalAnotado(ler(), new Date()) ?? daChegada;
      if (canal) link.setAttribute('href', comCanal(link.getAttribute('href') ?? '', canal));
    }

    // Na captura, antes de qualquer outro ouvinte e antes de o navegador seguir o link.
    document.addEventListener('click', aoTocar, true);
    document.addEventListener('auxclick', aoTocar, true);
    return () => {
      document.removeEventListener('click', aoTocar, true);
      document.removeEventListener('auxclick', aoTocar, true);
    };
  }, []);

  return null;
}
