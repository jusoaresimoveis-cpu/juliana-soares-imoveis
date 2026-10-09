import { desenharMarcaDagua } from './marcaDagua';

/**
 * A foto do imóvel reduzida no navegador, antes de subir.
 *
 * Foto de celular tem de 3 a 5 MB, e o armazenamento do Supabase gratuito é de
 * 1 GB: subindo o original, cabem uns 16 imóveis com 15 fotos cada. Reduzida,
 * cada uma fica perto de 400 KB. O site nunca serve o original (ele reduz de
 * novo para cada tela), então 2048 px no lado maior bastam até para a foto em
 * destaque num monitor grande.
 */

export const LADO_MAIOR = 2048;
export const QUALIDADE = 0.82;

/**
 * Até este peso, e já dentro do tamanho, a foto sobe como veio: comprimir de
 * novo um JPEG que já está leve só perde qualidade.
 */
export const JA_LEVE_BYTES = 600 * 1024;

export function dimensoesReduzidas(largura: number, altura: number, max = LADO_MAIOR) {
  const escala = Math.min(1, max / Math.max(largura, altura));
  return { largura: Math.round(largura * escala), altura: Math.round(altura * escala) };
}

export function precisaReduzir(arquivo: { type: string; size: number }, largura: number, altura: number): boolean {
  // PNG e AVIF viram JPEG: foto de imóvel não tem transparência, e o JPEG é o
  // que qualquer navegador e o otimizador do site leem.
  if (arquivo.type !== 'image/jpeg' && arquivo.type !== 'image/webp') return true;
  return arquivo.size > JA_LEVE_BYTES || Math.max(largura, altura) > LADO_MAIOR;
}

/**
 * A foto passa pelo canvas quando precisa encolher, trocar de formato ou
 * ganhar a marca d'água. Com a marca ligada, até o JPEG já leve é redesenhado:
 * subir como veio seria subir sem marca.
 */
export function precisaRedesenhar(
  arquivo: { type: string; size: number },
  largura: number,
  altura: number,
  marcaDagua: boolean,
): boolean {
  return marcaDagua || precisaReduzir(arquivo, largura, altura);
}

export interface FotoPronta {
  arquivo: Blob;
  tipo: string;
  extensao: string;
  largura: number;
  altura: number;
}

function desenharReduzida(
  bitmap: ImageBitmap,
  largura: number,
  altura: number,
  marcaDagua: boolean,
): HTMLCanvasElement {
  const tela = document.createElement('canvas');
  tela.width = largura;
  tela.height = altura;
  const ctx = tela.getContext('2d');
  if (!ctx) throw new Error('Este navegador não conseguiu preparar a foto.');
  // Fundo branco: um PNG com transparência viraria fundo preto no JPEG.
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, largura, altura);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, largura, altura);
  if (marcaDagua) desenharMarcaDagua(ctx, largura, altura);
  return tela;
}

/**
 * Abre, gira conforme o celular gravou, reduz, põe a marca d'água se pedida e
 * devolve em JPEG, com as dimensões.
 */
export async function prepararFoto(arquivo: File, { marcaDagua = false } = {}): Promise<FotoPronta> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(arquivo, { imageOrientation: 'from-image' });
  } catch {
    throw new Error(`Não deu para abrir "${arquivo.name}". Envie a foto em JPEG ou PNG.`);
  }

  try {
    if (!precisaRedesenhar(arquivo, bitmap.width, bitmap.height, marcaDagua)) {
      return {
        arquivo,
        tipo: arquivo.type,
        extensao: arquivo.type === 'image/webp' ? 'webp' : 'jpg',
        largura: bitmap.width,
        altura: bitmap.height,
      };
    }

    const { largura, altura } = dimensoesReduzidas(bitmap.width, bitmap.height);
    const tela = desenharReduzida(bitmap, largura, altura, marcaDagua);

    const reduzida = await new Promise<Blob | null>((pronto) => tela.toBlob(pronto, 'image/jpeg', QUALIDADE));
    if (!reduzida) throw new Error(`Não deu para reduzir "${arquivo.name}".`);
    return { arquivo: reduzida, tipo: 'image/jpeg', extensao: 'jpg', largura, altura };
  } finally {
    bitmap.close();
  }
}
