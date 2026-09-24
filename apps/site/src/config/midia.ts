import type { StaticImageData } from 'next/image';

import fundoHero from '@/assets/fotos/fundo-hero.webp';
import juliana from '@/assets/fotos/juliana.webp';

/**
 * As fotos fixas do site (não as de imóvel, que vêm do banco).
 *
 * Os originais ficam em `conteudo/` (fora do Git). Aqui entram as versões
 * otimizadas, em `src/assets/fotos`, importadas estaticamente: o Next lê
 * largura e altura no build (sem salto de layout) e gera as versões AVIF/WebP
 * para cada tamanho de tela.
 *
 * Foto que ainda não chegou fica `null`, e a seção se desenha sem ela.
 */
export interface Foto {
  src: StaticImageData;
  alt: string;
  /** Recortada com fundo transparente: vai inteira, apoiada embaixo, sem corte. */
  recortada?: boolean;
}

const JULIANA: Foto = {
  src: juliana,
  alt: 'Juliana Soares, corretora de imóveis em Itapema e Porto Belo',
  recortada: true,
};

export const MIDIA: {
  /** Juliana em destaque no topo da home. */
  julianaHero: Foto | null;
  /**
   * Retrato da seção "Sobre Juliana" na home. Fica vazio (monograma) enquanto
   * só existe UMA foto dela: a mesma foto duas vezes na mesma rolagem fica
   * repetitivo. A página /sobre usa a do topo quando esta falta.
   */
  julianaRetrato: Foto | null;
  /** Fundo escurecido do topo da home. */
  fundoHero: Foto | null;
  /** Fundo da faixa "Regiões atendidas" (orla de Itapema / Porto Belo). */
  fundoRegioes: Foto | null;
  /** Fundo da chamada "Quer vender ou alugar seu imóvel?". */
  fundoCaptacao: Foto | null;
} = {
  julianaHero: JULIANA,
  julianaRetrato: null,
  fundoHero: { src: fundoHero, alt: '' },
  fundoRegioes: null,
  fundoCaptacao: null,
};
