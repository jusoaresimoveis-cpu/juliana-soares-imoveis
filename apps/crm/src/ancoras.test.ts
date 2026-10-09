import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Âncora que não leva a lugar nenhum.
 *
 * A barra fixa do celular caía para `href="#contato"` quando não havia WhatsApp
 * conectado — e nenhum elemento com esse id existia na página. O botão mais
 * visível do telefone simplesmente não fazia nada.
 *
 * A falha é MUDA, e é isso que a torna cara: o link é válido, o navegador não
 * reclama, o console fica limpo, e quem toca conclui que a página travou. Numa
 * página de anúncio pago, isso é o clique inteiro perdido no último centímetro.
 *
 * O teste é estático de propósito. Renderizar a árvore inteira para descobrir
 * isso exigiria montar sessão, dados e provedor; ler o texto do arquivo pega o
 * mesmo defeito e roda em milissegundos.
 */

// `pathname` traz a barra inicial e o espaço como %20 no Windows; só o
// conversor oficial devolve um caminho que o `fs` aceita.
const SRC = dirname(fileURLToPath(import.meta.url));

function telas(dir: string): string[] {
  const saida: string[] = [];
  for (const nome of readdirSync(dir)) {
    const p = join(dir, nome);
    if (statSync(p).isDirectory()) saida.push(...telas(p));
    else if (/\.tsx$/.test(nome)) saida.push(p);
  }
  return saida;
}

const arquivos = telas(SRC).map((p) => ({ p: p.slice(p.indexOf('src')), txt: readFileSync(p, 'utf8') }));
const tudo = arquivos.map((a) => a.txt).join('\n');

describe('âncoras internas', () => {
  it('todo href="#alvo" tem um id="alvo" em algum lugar', () => {
    const orfas: string[] = [];

    for (const { p, txt } of arquivos) {
      // `href="#"` sozinho é âncora de posição, não de destino — fica de fora.
      for (const m of txt.matchAll(/href="#([A-Za-z][\w-]*)"/g)) {
        const alvo = m[1];
        if (!new RegExp(`id="${alvo}"`).test(tudo)) orfas.push(`${p}: #${alvo}`);
      }
    }

    expect(orfas, 'âncora sem destino: o toque não faz nada e nada avisa').toEqual([]);
  });
});
