import type { StaticImageData } from 'next/image';

/**
 * As fotos fixas do site (não as de imóvel, que vêm do banco).
 *
 * Todas começam vazias: as fotos da Juliana e as de fundo ainda não chegaram
 * (vão em conteudo/fotos-juliana). Cada seção sabe se desenhar SEM a foto, sem
 * espaço vazio nem imagem genérica de banco de imagens. Quando a foto chegar:
 * otimizar, pôr em `apps/site/public/fotos` ou importar estaticamente, e
 * preencher aqui.
 */
export interface Foto {
  src: StaticImageData | string;
  alt: string;
}

export const MIDIA: {
  /** Juliana em destaque no topo da home (recortada ou em fundo neutro). */
  julianaHero: Foto | null;
  /** Retrato da seção "Sobre Juliana" e da página Sobre. */
  julianaRetrato: Foto | null;
  /** Fundo escurecido do topo da home (interior ou vista do mar). */
  fundoHero: Foto | null;
  /** Fundo da faixa "Regiões atendidas" (orla de Itapema / Porto Belo). */
  fundoRegioes: Foto | null;
  /** Fundo da chamada "Quer vender ou alugar seu imóvel?". */
  fundoCaptacao: Foto | null;
} = {
  julianaHero: null,
  julianaRetrato: null,
  fundoHero: null,
  fundoRegioes: null,
  fundoCaptacao: null,
};
