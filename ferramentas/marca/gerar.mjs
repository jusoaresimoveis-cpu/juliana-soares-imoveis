/**
 * Gera os favicons e os ícones do site e do CRM a partir do símbolo da marca.
 *
 * O símbolo (o "JS" sob o telhado) mora em `simbolo.svg`, ao lado deste
 * arquivo, com a caixa justa em volta do desenho. Todo ícone é DERIVADO dele:
 * trocou o símbolo, roda de novo e commita o que mudou.
 *
 *   node ferramentas/marca/gerar.mjs
 *
 * Usa o `sharp` que já vem instalado com o Next, na pasta node_modules da raiz.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..', '..');
const SITE = join(RAIZ, 'apps/site/src/app');
const CRM = join(RAIZ, 'apps/crm/public');

// O marrom é o do arquivo do logo; os outros são os do site (globals.css).
const MARROM = '#72573a';
const CARAMELO = '#c29b66';
const BRONZE = '#8b6a40';
const CREME = '#f8f5f0';

const fonte = readFileSync(join(AQUI, 'simbolo.svg'), 'utf8');
const [vx, vy, vw, vh] = /viewBox="([^"]+)"/.exec(fonte)[1].split(/[\s,]+/).map(Number);
const formas = fonte.match(/<(path|polygon)\b[^>]*\/>/g).join('');
const cx = vx + vw / 2;
const cy = vy + vh / 2;

const n = (v) => +v.toFixed(2);

/**
 * Um quadrado com o símbolo centrado, ocupando `ocupa` (de 0 a 1) do lado.
 * `cantos` é o raio do arredondamento, também em fração do lado.
 */
function quadrado({ ocupa, cor, fundo, cantos = 0, estilo = '' }) {
  const lado = Math.max(vw, vh) / ocupa;
  const x = n(cx - lado / 2);
  const y = n(cy - lado / 2);
  const L = n(lado);
  const caixa = fundo ? `<rect x="${x}" y="${y}" width="${L}" height="${L}" rx="${n(cantos * lado)}" fill="${fundo}"/>` : '';
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${L} ${L}">` +
    estilo +
    caixa +
    `<g fill="${cor}">${formas}</g></svg>`
  );
}

/**
 * `opaco` achata o fundo e tira o canal alfa. O iPhone pinta de preto todo
 * pixel transparente do ícone da tela de início, e a borda do quadrado, com
 * a escala quebrada, pode sair meio transparente.
 */
function png(svg, lado, { opaco = null } = {}) {
  // O SVG não diz o tamanho em pixels: a densidade leva o viewBox a `lado`.
  const L = +/viewBox="\S+ \S+ (\S+)/.exec(svg)[1];
  const imagem = sharp(Buffer.from(svg), { density: (72 * lado) / L }).resize(lado, lado);
  return (opaco ? imagem.flatten({ background: opaco }).removeAlpha() : imagem)
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/**
 * Um .ico com PNG dentro, que todo navegador e o Windows desde o Vista leem.
 * Cabeçalho de 6 bytes, uma entrada de 16 por imagem, e as imagens em seguida.
 */
function ico(imagens) {
  const cabecalho = Buffer.alloc(6);
  cabecalho.writeUInt16LE(1, 2);
  cabecalho.writeUInt16LE(imagens.length, 4);
  let deslocamento = 6 + 16 * imagens.length;
  const entradas = imagens.map(({ lado, dados }) => {
    const e = Buffer.alloc(16);
    e.writeUInt8(lado >= 256 ? 0 : lado, 0);
    e.writeUInt8(lado >= 256 ? 0 : lado, 1);
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(dados.length, 8);
    e.writeUInt32LE(deslocamento, 12);
    deslocamento += dados.length;
    return e;
  });
  return Buffer.concat([cabecalho, ...entradas, ...imagens.map((i) => i.dados)]);
}

async function favicon(svg) {
  return ico(await Promise.all([16, 32, 48].map(async (lado) => ({ lado, dados: await png(svg, lado) }))));
}

/**
 * Quanto do lado o símbolo pode ocupar no ícone maskable.
 *
 * O Android recorta o ícone no formato do aparelho (círculo, gota, quadrado
 * arredondado), e só o círculo central de raio 40% do lado é garantido. A conta
 * usa o pixel do desenho mais longe do centro, e não a caixa: o telhado e o
 * gancho do J não chegam aos cantos da caixa, e medir pela caixa deixaria o
 * símbolo menor do que precisa.
 */
async function ocupaNoMaskable() {
  const alto = 1000;
  const largo = Math.round((alto * vw) / vh);
  const { data, info } = await sharp(Buffer.from(fonte), { density: (72 * alto) / vh })
    .resize(largo, alto)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let raio = 0;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * 4 + 3] > 8) {
        raio = Math.max(raio, Math.hypot(x + 0.5 - info.width / 2, y + 0.5 - info.height / 2));
      }
    }
  }
  const raioNoDesenho = (raio / alto) * vh;
  // Folga de 5% dentro da zona segura: borda de pixel e arredondamento.
  return (Math.max(vw, vh) * 0.4 * 0.95) / raioNoDesenho;
}

// O site: o símbolo solto, marrom; no navegador escuro, caramelo (só o SVG
// consegue trocar de cor sozinho). No iPhone, sobre o creme do site.
const escuro = `<style>@media (prefers-color-scheme:dark){g{fill:${CARAMELO}}}</style>`;
const simboloSolto = quadrado({ ocupa: 1, cor: MARROM });

// O CRM: o quadrado bronze de sempre, com o símbolo em creme. Na aba, com os
// cantos arredondados; no aparelho, quadrado, porque o sistema recorta.
const abaDoCrm = quadrado({ ocupa: 0.78, cor: CREME, fundo: BRONZE, cantos: 0.22 });
const iconeDoCrm = quadrado({ ocupa: 0.62, cor: CREME, fundo: BRONZE });
const ocupaMaskable = await ocupaNoMaskable();
const maskableDoCrm = quadrado({ ocupa: ocupaMaskable, cor: CREME, fundo: BRONZE });

const saidas = [
  [join(SITE, 'favicon.ico'), await favicon(simboloSolto)],
  [join(SITE, 'icon.svg'), quadrado({ ocupa: 1, cor: MARROM, estilo: escuro }) + '\n'],
  [join(SITE, 'apple-icon.png'), await png(quadrado({ ocupa: 0.66, cor: MARROM, fundo: CREME }), 180, { opaco: CREME })],
  [join(CRM, 'favicon.ico'), await favicon(abaDoCrm)],
  [join(CRM, 'favicon.svg'), abaDoCrm + '\n'],
  [join(CRM, 'icone-192.png'), await png(iconeDoCrm, 192, { opaco: BRONZE })],
  [join(CRM, 'icone-512.png'), await png(iconeDoCrm, 512, { opaco: BRONZE })],
  [join(CRM, 'icone-maskable-512.png'), await png(maskableDoCrm, 512, { opaco: BRONZE })],
  [join(CRM, 'apple-touch-icon.png'), await png(iconeDoCrm, 180, { opaco: BRONZE })],
];

console.log(`maskable: o símbolo ocupa ${Math.round(ocupaMaskable * 100)}% do lado`);

for (const [arquivo, conteudo] of saidas) {
  writeFileSync(arquivo, conteudo);
  console.log(`${relative(RAIZ, arquivo).replaceAll('\\', '/')}  ${Buffer.byteLength(conteudo)} bytes`);
}
