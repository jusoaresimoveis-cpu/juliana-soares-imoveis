'use client';

import { ROTULO_DA_UNIDADE } from '@juliana/contracts';
import { useSearchParams } from 'next/navigation';
import { useEffect } from 'react';

/**
 * Leva à unidade do link (`/imovel/…?unidade=804`), a destaca e põe o foco
 * nela.
 *
 * É o link que vai na mensagem do WhatsApp da unidade: a Juliana toca nele e
 * cai na linha do 804, não no topo do prédio. Roda só no navegador, e a página
 * continua estática e com o mesmo canonical: `?unidade=` não vira página nova.
 *
 * A unidade que já foi vendida não tem mais linha; aí a página desce até a
 * lista, que mostra o que ainda está à venda.
 */
export function DestaqueDaUnidade() {
  const rotulo = useSearchParams().get('unidade');

  useEffect(() => {
    if (!rotulo || !ROTULO_DA_UNIDADE.test(rotulo)) return;
    const linha = document.getElementById(`unidade-${rotulo}`);
    const destino = linha ?? document.getElementById('unidades');
    if (!destino) return;

    // Salto, como numa âncora, e não rolagem suave: na página que ainda está
    // carregando, a animação mira uma posição que muda no caminho.
    destino.scrollIntoView({ block: linha ? 'center' : 'start', behavior: 'instant' });
    if (!linha) return;
    // Rolar não move o foco: sem isso, o leitor de tela continuaria lendo do
    // topo e o Tab iria para o primeiro link da página. A linha tem
    // `tabIndex={-1}` para poder receber o foco; `preventScroll` porque a
    // rolagem acima já a centralizou.
    linha.focus({ preventScroll: true });
    linha.setAttribute('data-destaque', 'sim');
    return () => linha.removeAttribute('data-destaque');
  }, [rotulo]);

  return null;
}
