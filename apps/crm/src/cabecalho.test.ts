import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * O título não pode ficar com o farelo que os botões deixam.
 *
 * O defeito, achado num print de celular e depois em mais dois lugares:
 *
 *   <header className="flex flex-wrap items-start gap-4">
 *     <button voltar shrink-0 />
 *     <div className="min-w-0 flex-1"> <h1>{nome}</h1> </div>
 *     <div className="flex flex-wrap items-center gap-2"> select, botões </div>
 *   </header>
 *
 * `flex-1` é `flex: 1 1 0%`, e a BASE ZERO é o que mata a quebra de linha. O
 * navegador monta as linhas somando o tamanho hipotético de cada item, e um item
 * de base zero contribui com nada — ele nunca empurra o vizinho para baixo, e
 * depois encolhe para caber no que sobrou. `flex-wrap` não salva.
 *
 * Medido num aparelho de 390px, antes da correção: o bloco do título ficava com
 * 36 pixels e "Rogério Nascimento da Silva" transbordava 98 pixels para a
 * direita, passando POR BAIXO do seletor de etapa e do botão verde. Não é
 * truncar: o `h1` não tem `truncate`, então o nome vira uma coluna de 115px de
 * altura que sai do bloco.
 *
 * A correção é o grupo de ações levar `w-full` no celular: de largura cheia ele
 * não cabe ao lado de ninguém e desce inteiro, deixando a linha de cima para a
 * seta de voltar e o nome. `sm:w-auto` devolve o lado a lado no computador.
 *
 * O outro jeito que o repositório usa — `min-w-0` SEM `flex-1`, com `ml-auto` na
 * ação (`LandingPages.tsx`) — também conserta, e é melhor quando a ação é uma só
 * e pequena. Com três controles, ele deixa a seta de voltar órfã numa linha
 * sozinha: medido, 3 linhas e 165px de altura contra 2 linhas e 142px.
 */

const TELAS = join(__dirname);

function arquivosDeTela(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) return arquivosDeTela(caminho);
    return caminho.endsWith('.tsx') ? [caminho] : [];
  });
}

/** O `className="..."` que começa numa posição, se houver um por perto. */
function classeEm(texto: string, posicao: number): { classe: string; fim: number } | null {
  const i = texto.indexOf('className="', posicao);
  if (i < 0) return null;
  const fim = texto.indexOf('"', i + 11);
  if (fim < 0) return null;
  return { classe: texto.slice(i + 11, fim), fim };
}

/**
 * É um grupo de AÇÕES? Uma fileira de controles: `flex`, alinhada ao centro, com
 * espaço entre os itens. É o formato dos três lugares onde o defeito apareceu.
 */
function ehGrupoDeAcoes(classe: string): boolean {
  const palavras = classe.split(/\s+/);
  return (
    palavras.includes('flex') &&
    palavras.some((p) => p === 'items-center') &&
    palavras.some((p) => p.startsWith('gap-')) &&
    !palavras.includes('flex-col')
  );
}

/** O grupo já sabe descer no celular? */
function desceNoCelular(classe: string): boolean {
  const palavras = classe.split(/\s+/);
  return (
    palavras.includes('w-full') ||
    palavras.includes('basis-full') ||
    palavras.some((p) => p === 'ml-auto') ||
    palavras.includes('shrink-0')
  );
}

/**
 * Acha o defeito num pedaço de JSX.
 *
 * Estrutural, e não por proximidade: acha onde o bloco do título FECHA e olha o
 * IRMÃO seguinte. A primeira versão deste teste olhava as duas mil letras
 * seguintes e acusava nove lugares — oito deles eram a linha do nome DENTRO do
 * próprio título, que também é `flex items-center gap-`. Ler texto como se fosse
 * árvore encontra o que não existe.
 */

/** Tira os comentários de JSX, que podem conter `<` e confundir a leitura. */
function semComentarios(fonte: string): string {
  return fonte.replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ');
}

/**
 * Onde a tag ABERTA termina — o `>` de verdade.
 *
 * Não dá para procurar o primeiro `>`: um `onClick={() => ...}` tem um `>` no
 * meio, e foi assim que a primeira versão deste teste acusou três botões que
 * estavam certos, com `shrink-0` e tudo. Aqui se anda caractere a caractere,
 * contando chaves e respeitando aspas, e só vale o `>` de fora.
 */
function fimDaTagAberta(fonte: string, abre: number): number {
  let chaves = 0;
  let aspas: string | null = null;

  for (let i = abre + 1; i < fonte.length; i++) {
    const c = fonte[i]!;
    if (aspas) {
      if (c === aspas) aspas = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { aspas = c; continue; }
    if (c === '{') { chaves += 1; continue; }
    if (c === '}') { chaves -= 1; continue; }
    if (c === '>' && chaves === 0) return i;
  }
  return -1;
}

/** A tag se fecha em si mesma (`<div ... />`)? */
function seFechaSozinha(fonte: string, fimDaAbertura: number): boolean {
  return fonte[fimDaAbertura - 1] === '/';
}

/** O fim do elemento que começa em `abre`, contando os aninhados do mesmo nome. */
function fimDoElemento(fonte: string, abre: number, tag: string): number {
  const abertura = fimDaTagAberta(fonte, abre);
  if (abertura < 0) return -1;
  if (seFechaSozinha(fonte, abertura)) return abertura + 1;

  let profundidade = 1;
  let i = abertura + 1;
  while (i < fonte.length && profundidade > 0) {
    const proximoAbre = fonte.indexOf(`<${tag}`, i);
    const proximoFecha = fonte.indexOf(`</${tag}`, i);
    if (proximoFecha < 0) return -1;
    if (proximoAbre >= 0 && proximoAbre < proximoFecha) {
      const f = fimDaTagAberta(fonte, proximoAbre);
      if (f < 0) return -1;
      if (!seFechaSozinha(fonte, f)) profundidade += 1;
      i = f + 1;
    } else {
      profundidade -= 1;
      i = fonte.indexOf('>', proximoFecha) + 1;
    }
  }
  return i;
}

/** Tags que são um CONTROLE por si só, soltas ao lado do título. */
const CONTROLES = ['select', 'button', 'input', 'textarea', 'a', 'Link'];

/**
 * Acha o defeito num pedaço de JSX.
 *
 * Estrutural, e não por proximidade: acha onde o bloco do título FECHA e olha o
 * IRMÃO seguinte. A primeira versão olhava as duas mil letras seguintes e
 * acusava nove lugares — oito eram a linha do nome DENTRO do próprio título,
 * que também é `flex items-center gap-`.
 */
export function cabecalhosApertados(fonteBruta: string): string[] {
  const fonte = semComentarios(fonteBruta);
  const achados: string[] = [];

  for (const m of fonte.matchAll(/min-w-0 flex-1|flex-1 min-w-0/g)) {
    const abre = fonte.lastIndexOf('<', m.index!);
    if (abre < 0) continue;
    const tag = /^<([A-Za-z][\w.]*)/.exec(fonte.slice(abre))?.[1];
    if (!tag) continue;

    const fim = fimDoElemento(fonte, abre, tag);
    if (fim < 0) continue;

    // O IRMÃO seguinte.
    const proximaTag = fonte.indexOf('<', fim);
    if (proximaTag < 0 || fonte[proximaTag + 1] === '/') continue;
    const tagIrma = /^<([A-Za-z][\w.]*)/.exec(fonte.slice(proximaTag))?.[1];
    if (!tagIrma) continue;

    // A classe tem de estar DENTRO da tag aberta; senão é de um descendente.
    const abertura = fimDaTagAberta(fonte, proximaTag);
    const achada = classeEm(fonte, proximaTag);
    const classe = achada && abertura > 0 && achada.fim < abertura ? achada.classe : '';

    /*
     * Dois formatos do mesmo defeito:
     *
     *   grupo  — um `<div>` de controles (LeadDetail, PropertyDetail);
     *   solto  — um `<select>`/`<button>` sem grupo em volta (Equipe), que foi o
     *            que escapou da primeira versão deste detector.
     */
    if ((ehGrupoDeAcoes(classe) || CONTROLES.includes(tagIrma)) && !desceNoCelular(classe)) {
      achados.push(classe || `<${tagIrma}>`);
    }
  }
  return achados;
}

describe('o detector', () => {
  /*
   * Testar o detector antes de confiar nele. Sem isto, o teste abaixo poderia
   * estar verde por não achar nada NUNCA — que é o modo mais comum de um teste
   * de varredura mentir.
   */
  const DEFEITO = `
    <header className="flex flex-wrap items-start gap-4">
      <button className="mt-1 grid h-9 w-9 shrink-0 place-items-center" />
      <div className="min-w-0 flex-1">
        <h1 className="text-2xl font-bold leading-tight">{lead.full_name}</h1>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Etapa do funil" />
      </div>
    </header>`;

  it('acha o cabeçalho que tinha o defeito', () => {
    expect(cabecalhosApertados(DEFEITO)).toEqual(['flex flex-wrap items-center gap-2']);
  });

  it('e para de achar quando o grupo ganha a largura cheia', () => {
    const corrigido = DEFEITO.replace(
      'flex flex-wrap items-center gap-2',
      'flex w-full flex-wrap items-center gap-2 sm:w-auto',
    );
    expect(cabecalhosApertados(corrigido)).toEqual([]);
  });

  it('não acusa o outro molde da casa: `min-w-0` sem `flex-1`', () => {
    // `LandingPages.tsx` — a base do título continua `auto`, então ele empurra
    // a quebra sozinho e o grupo de ações não precisa de nada.
    const daCasa = DEFEITO.replace('min-w-0 flex-1', 'min-w-0');
    expect(cabecalhosApertados(daCasa)).toEqual([]);
  });

  it('não acusa ícone ao lado de texto, que é `flex-1` bem usado', () => {
    const semAcoes = `
      <p className="flex items-start gap-2">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
        <span className="min-w-0 flex-1">{mensagem}</span>
      </p>`;
    expect(cabecalhosApertados(semAcoes)).toEqual([]);
  });
});

describe('nenhuma tela deixa o título sem largura', () => {
  it('em todo .tsx de src/', () => {
    const problemas = arquivosDeTela(TELAS).flatMap((caminho) =>
      cabecalhosApertados(readFileSync(caminho, 'utf8')).map(
        (classe) => `${caminho.slice(caminho.indexOf('src'))} → "${classe}"`,
      ),
    );

    expect(
      problemas,
      `grupo de ações dividindo a linha com um título de base zero:\n${problemas.join('\n')}\n\n` +
        'Ponha `w-full sm:w-auto` no grupo (ou tire o `flex-1` do título e use `ml-auto` na ação).',
    ).toEqual([]);
  });
});
