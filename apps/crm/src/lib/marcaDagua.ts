import simboloSvg from '../../../../ferramentas/marca/simbolo.svg?raw';

/**
 * A marca d'água: o símbolo da marca no meio da foto, em branco translúcido.
 *
 * Desenhada NA foto, antes de subir, e não por cima dela na tela: por cima,
 * bastaria abrir o endereço da imagem para ter a foto limpa. O desenho vem do
 * arquivo da marca (`ferramentas/marca/simbolo.svg`, lido na build) e vira um
 * caminho do canvas: sem imagem para carregar, nada a esperar e nada que
 * "suje" o canvas e impeça de gerar o JPEG.
 *
 * Tamanho e transparência saíram de teste com fotos reais dos imóveis (26/09):
 * 35% do lado menor, branco a 50%, e uma sombra leve que separa a marca de
 * parede e cortina brancas.
 */

const caixa = /viewBox="([^"]+)"/.exec(simboloSvg)?.[1]?.split(/[\s,]+/).map(Number) ?? [];
if (caixa.length !== 4) throw new Error('O símbolo da marca não tem viewBox.');
const [VX, VY, VW, VH] = caixa as [number, number, number, number];

/**
 * As três peças do símbolo (o S, o J e o telhado) num caminho só: pintadas de
 * uma vez, a tinta não dobra onde uma peça encosta na outra.
 */
export const TRACOS_DO_SIMBOLO =
  [...simboloSvg.matchAll(/\sd="([^"]+)"/g)].map((m) => m[1]).join('') +
  [...simboloSvg.matchAll(/\spoints="([^"]+)"/g)].map((m) => `M${m[1]}Z`).join('');

export const FRACAO_DO_LADO_MENOR = 0.35;
export const OPACIDADE = 0.5;

export interface PosicaoDaMarca {
  x: number;
  y: number;
  largura: number;
  altura: number;
  /** De unidades do desenho para pixels da foto. */
  escala: number;
}

/**
 * Onde o símbolo cai numa foto: centrado, com 35% do lado menor.
 *
 * Pelo lado MENOR, e não pela largura: numa foto em pé, a marca medida pela
 * largura sairia pequena, e numa panorâmica ela passaria da altura da foto.
 */
export function posicaoDaMarca(largura: number, altura: number): PosicaoDaMarca {
  const alturaDaMarca = FRACAO_DO_LADO_MENOR * Math.min(largura, altura);
  const escala = alturaDaMarca / VH;
  const larguraDaMarca = VW * escala;
  return {
    x: (largura - larguraDaMarca) / 2,
    y: (altura - alturaDaMarca) / 2,
    largura: larguraDaMarca,
    altura: alturaDaMarca,
    escala,
  };
}

/** Pinta a marca no canvas onde a foto já foi desenhada. */
export function desenharMarcaDagua(ctx: CanvasRenderingContext2D, largura: number, altura: number): void {
  const p = posicaoDaMarca(largura, altura);
  ctx.save();
  ctx.globalAlpha = OPACIDADE;
  // A sombra não acompanha a escala do contexto: o desfoque é em pixels da foto.
  ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
  ctx.shadowBlur = p.altura * 0.04;
  ctx.translate(p.x, p.y);
  ctx.scale(p.escala, p.escala);
  ctx.translate(-VX, -VY);
  ctx.fillStyle = '#fff';
  ctx.fill(new Path2D(TRACOS_DO_SIMBOLO));
  ctx.restore();
}
