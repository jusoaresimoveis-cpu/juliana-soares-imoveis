import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { manifesto } from './manifesto';

/**
 * A instalabilidade quebra em silêncio.
 *
 * Trocar `display`, perder o ícone de 192, renomear um arquivo em `public/` —
 * nada disso falha no build nem aparece na tela. O sintoma é o botão "Instalar
 * app" parar de instalar e cair no passo a passo em todo aparelho, e no iPhone
 * o push morrer junto, porque lá ele depende do app na tela de início.
 *
 * Estes testes guardam as REGRAS do navegador, não os valores da marca: nome e
 * cor podem mudar à vontade.
 */

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..', '..');
const PUBLICO = join(RAIZ, 'public');

const icones = manifesto.icons ?? [];

/**
 * `purpose` aceita duas formas — a string `"any maskable"` e o array. Testar só
 * uma delas deixaria a outra passar batida, que é justamente onde o descuido
 * mora.
 */
const propositos = (i: (typeof icones)[number]): string[] =>
  Array.isArray(i.purpose) ? i.purpose : (i.purpose ?? '').split(/\s+/).filter(Boolean);

/** Os `<link rel="icon">` do index.html: o favicon da aba, fora do manifesto. */
const faviconsDoHtml = () =>
  [...readFileSync(join(RAIZ, 'index.html'), 'utf8').matchAll(/<link\s+rel="icon"\s+href="([^"]+)"/gi)].map(
    (m) => m[1]!,
  );

/** Um ícone serve de "any" quando não declara propósito ou o inclui na lista. */
const serveComoPadrao = (i: (typeof icones)[number]) => {
  const p = propositos(i);
  return p.length === 0 || p.includes('any');
};

describe('manifesto do PWA', () => {
  it('abre em janela própria', () => {
    // `browser` ou ausente instala como atalho, COM barra de endereço — que é
    // exatamente o que o botão promete eliminar.
    expect(manifesto.display).toBe('standalone');
  });

  it('tem identidade e escopo fixos', () => {
    expect(manifesto.id).toBeTruthy();
    expect(manifesto.start_url).toBeTruthy();
    expect(manifesto.scope).toBeTruthy();
  });

  it('tem os dois ícones que o Chrome exige para oferecer instalação', () => {
    for (const tamanho of ['192x192', '512x512']) {
      const achado = icones.filter((i) => i.sizes === tamanho).filter(serveComoPadrao);
      expect(achado, `falta um ícone ${tamanho} de propósito padrão`).not.toHaveLength(0);
    }
  });

  it('tem um maskable, e ele não faz as vezes de ícone comum', () => {
    const maskables = icones.filter((i) => propositos(i).includes('maskable'));
    expect(maskables.length, 'sem maskable o Android come as bordas da marca').toBeGreaterThan(0);

    // Um maskable é desenhado com margem de segurança para o recorte do
    // Android. Reaproveitado como `any`, essa margem chega intacta em quem não
    // recorta: no Windows a marca aparece pequena, boiando num quadrado vazio.
    for (const i of maskables) {
      expect(serveComoPadrao(i), `${i.src} acumula 'any' e 'maskable'`).toBe(false);
    }
  });

  it('todo ícone declarado existe em public/', () => {
    for (const i of icones) {
      const arquivo = join(PUBLICO, i.src.replace(/^\//, ''));
      expect(existsSync(arquivo), `${i.src} está no manifesto mas não em public/`).toBe(true);
    }
  });

  it('a cor do tema bate com a do index.html', () => {
    // Divergindo, a barra do sistema fica de uma cor no app instalado e de
    // outra no navegador — parece bug de renderização e ninguém acha a causa.
    const html = readFileSync(join(RAIZ, 'index.html'), 'utf8');
    const meta = /<meta\s+name="theme-color"\s+content="([^"]+)"/i.exec(html)?.[1];
    expect(meta?.toLowerCase()).toBe(manifesto.theme_color?.toLowerCase());
  });

  it('todo favicon do index.html existe em public/', () => {
    // Link para arquivo que não existe não dá erro: a aba só fica sem ícone.
    const favicons = faviconsDoHtml();
    expect(favicons.length, 'o index.html não declara favicon').toBeGreaterThan(0);
    for (const href of favicons) {
      expect(existsSync(join(PUBLICO, href.replace(/^\//, ''))), `${href} não está em public/`).toBe(true);
    }
  });

  it('o iOS tem o ícone que ele lê, que não vem do manifesto', () => {
    // O Safari ignora `icons` para a tela de início: ele lê a tag do HTML.
    const html = readFileSync(join(RAIZ, 'index.html'), 'utf8');
    const href = /<link\s+rel="apple-touch-icon"\s+href="([^"]+)"/i.exec(html)?.[1];
    expect(href, 'sem apple-touch-icon o iPhone salva um print da tela como ícone').toBeTruthy();
    expect(existsSync(join(PUBLICO, (href ?? '').replace(/^\//, '')))).toBe(true);
  });

  it('a reescrita do Vercel não engole nenhum arquivo do PWA', () => {
    /*
     * O `rewrites` manda toda rota desconhecida para o index.html, que é o que
     * faz `/leads` funcionar ao recarregar. Se ele pegar o manifesto junto, o
     * navegador recebe HTML onde esperava JSON e a instalação some — sem erro
     * no build, sem erro na tela, sem nada no console além de um aviso que
     * ninguém lê.
     *
     * O Vercel confere o disco antes de reescrever, então na prática já
     * funcionaria. Este teste existe para o caso não valer: é barato, e o
     * sintoma é caro de descobrir.
     */
    const vercel = JSON.parse(readFileSync(join(RAIZ, 'vercel.json'), 'utf8')) as {
      rewrites?: Array<{ source: string; destination: string }>;
    };
    const regras = vercel.rewrites ?? [];

    /*
     * A regra do app é achada pelo DESTINO, não pela posição.
     *
     * Antes isto lia `rewrites[0]`, e no dia em que uma regra entrou na frente
     * dela o teste passou a medir a regra errada. A posição é detalhe de
     * ordenação; o destino é a identidade.
     */
    const iApp = regras.findIndex((r) => r.destination === '/index.html');
    expect(iApp, 'sem regra de reescrita, recarregar em /leads dá 404').toBeGreaterThanOrEqual(0);
    const re = new RegExp(`^${regras[iApp]!.source}$`);

    const html = readFileSync(join(RAIZ, 'index.html'), 'utf8');
    const appleIcon = /<link\s+rel="apple-touch-icon"\s+href="([^"]+)"/i.exec(html)?.[1];

    const intocaveis = [
      '/manifest.webmanifest',
      '/sw.js',
      // O CRM é todo `Disallow`; servido como HTML, o robô leria "pode tudo".
      '/robots.txt',
      ...icones.map((i) => i.src),
      ...(appleIcon ? [appleIcon] : []),
      ...faviconsDoHtml(),
    ];
    for (const caminho of intocaveis) {
      expect(re.test(caminho), `${caminho} vira index.html em produção`).toBe(false);
    }

    // E o contrário: as rotas do CRM PRECISAM cair no index.html.
    for (const rota of ['/', '/leads', '/imoveis/abc-123', '/configuracoes']) {
      expect(re.test(rota), `${rota} deixou de ser servida pelo app`).toBe(true);
    }
  });
});
