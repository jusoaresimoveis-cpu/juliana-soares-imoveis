import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import config from '../tailwind.config';

/**
 * A tela nasceu com 31 tamanhos de fonte avulsos em 156 usos, cada um com o
 * espaçamento entre letras escolhido a olho. O resultado foi `tracking-tight`
 * (-0.025em) aplicado igualmente ao título de 32px e à etiqueta de 10px — e,
 * pior, etiquetas pequenas dentro de pais `tracking-tight` herdando o
 * espaçamento JÁ RESOLVIDO EM PIXEL do pai, o que as deixava proporcionalmente
 * mais apertadas que ele (-0.032em medido numa etiqueta de 10.5px).
 *
 * Estes testes não guardam os valores da escala — guardam as regras que
 * impedem a deriva de voltar.
 */

// `pathname` traz a barra inicial e o espaço como %20 no Windows; só o
// conversor oficial devolve um caminho que o `fs` aceita.
const SRC = dirname(fileURLToPath(import.meta.url));

function arquivosDeTela(dir: string): string[] {
  const saida: string[] = [];
  for (const nome of readdirSync(dir)) {
    const p = join(dir, nome);
    if (statSync(p).isDirectory()) saida.push(...arquivosDeTela(p));
    else if (/\.tsx$/.test(nome)) saida.push(p);
  }
  return saida;
}

const telas = arquivosDeTela(SRC).map((p) => ({ p, txt: readFileSync(p, 'utf8') }));

const degraus = Object.entries(config.theme?.extend?.fontSize ?? {}) as Array<
  [string, [string, { lineHeight: string; letterSpacing: string }]]
>;

describe('escala tipográfica', () => {
  it('nenhuma tela usa tamanho de fonte avulso', () => {
    const infratores = telas
      .flatMap(({ p, txt }) => (txt.match(/\btext-\[[0-9.]+rem\]/g) ?? []).map((m) => `${p}: ${m}`))
      .map((s) => s.replace(SRC, ''));
    expect(infratores, 'use um degrau da escala em vez de um tamanho solto').toEqual([]);
  });

  it('nenhuma tela ajusta o espaçamento por conta própria', () => {
    // A escala é a única fonte de verdade. `tracking-*` reintroduz o bug de
    // herança em pixel: o valor vira px no elemento que declara e desce para os
    // filhos menores já resolvido.
    const infratores = telas
      .flatMap(({ p, txt }) => (txt.match(/\btracking-(tight|wide|wider|tighter|normal)\b/g) ?? []).map((m) => `${p}: ${m}`))
      .map((s) => s.replace(SRC, ''));
    expect(infratores, 'o espaçamento vem do degrau, não de uma classe avulsa').toEqual([]);
  });

  it('todo degrau declara o próprio espaçamento', () => {
    // Um degrau sem `letterSpacing` não quebra a cadeia de herança: filhos
    // menores continuariam recebendo o pixel do pai.
    const semEspacamento = degraus.filter(([, v]) => !v[1]?.letterSpacing).map(([k]) => k);
    expect(semEspacamento).toEqual([]);
  });

  it('o espaçamento afrouxa conforme o texto diminui', () => {
    // A regra óptica: tracking negativo serve a texto grande, onde as letras já
    // se tocam. No miúdo ele come o branco que separa as formas. Logo a curva
    // precisa ser monotônica — nunca mais apertada num tamanho menor.
    const curva = degraus
      .map(([nome, [tam, meta]]) => ({
        nome,
        px: parseFloat(tam) * 16,
        em: parseFloat(meta.letterSpacing),
      }))
      .sort((a, b) => a.px - b.px);

    curva.forEach((degrau, i) => {
      const anterior = curva[i - 1];
      if (!anterior) return;
      expect(
        degrau.em,
        `${degrau.nome} (${degrau.px}px) está mais solto que ${anterior.nome} (${anterior.px}px)`,
      ).toBeLessThanOrEqual(anterior.em);
    });

    // E as pontas: o miúdo precisa de ar, o display precisa fechar.
    const menor = curva[0];
    const maior = curva[curva.length - 1];
    expect(menor && menor.em, 'o menor degrau precisa de espaçamento positivo').toBeGreaterThan(0);
    expect(maior && maior.em, 'o maior degrau precisa de espaçamento negativo').toBeLessThan(0);
  });
});

describe('sem sombra em letra', () => {
  it('nenhuma tela aplica sombra a texto ou a ícone', () => {
    /*
     * Regra da casa, dada por quem assina o material: sombra em letra não
     * entra. Ela é o atalho de quem põe texto branco sobre foto clara — e o
     * atalho suja a borda da tipografia em vez de resolver o contraste.
     *
     * A técnica correta é escurecer a FOTO: um véu por baixo do texto. Faz o
     * mesmo trabalho e não toca no desenho da letra.
     *
     * `shadow-*` de caixa continua valendo. O que não entra é sombra em texto
     * e o `drop-shadow`, que é o mesmo problema aplicado a ícone.
     */
    const infratores = telas
      .filter(({ txt }) => /textShadow|text-shadow|drop-shadow/.test(txt))
      .map(({ p }) => p.slice(p.indexOf('src')));

    expect(infratores, 'sombra em letra: use véu sobre a imagem').toEqual([]);
  });
});
