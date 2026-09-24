import type { StaticImageData } from 'next/image';

import fundoHero from '@/assets/fotos/fundo-hero.webp';
import julianaSentada from '@/assets/fotos/juliana-sentada.webp';
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
  /**
   * Ponto da foto que nunca pode sair do quadro quando a caixa corta a imagem
   * (`object-position`). A mesma foto aparece em caixas de proporções
   * diferentes (4:3 no celular, 5:4 e 4:5 no desktop), e o corte central
   * cortaria o rosto numa delas.
   */
  enquadramento?: string;
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
   * Retrato da seção "Sobre Juliana" na home e da página /sobre. Precisa ser
   * uma foto DIFERENTE da do topo: a mesma foto duas vezes na mesma rolagem
   * fica repetitivo. Sem ela, a home mostra o monograma e a /sobre usa a do topo.
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
  julianaRetrato: {
    src: julianaSentada,
    alt: 'Juliana Soares sentada num sofá, sorrindo',
    // O rosto fica a 45% da largura e 23% da altura da foto: o corte sobe um
    // pouco para ele nunca sair do quadro, mesmo nas caixas mais baixas.
    enquadramento: '45% 30%',
  },
  fundoHero: { src: fundoHero, alt: '' },
  fundoRegioes: null,
  fundoCaptacao: null,
};
