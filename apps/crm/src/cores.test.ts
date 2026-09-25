import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  PALETAS,
  contraste,
  paletaDe,
  hslParaHex,
  FUNDO_CLARO,
  FUNDO_ESCURO,
  CHAVES_DE_COR,
  COR_PADRAO,
} from '@/lib/cores';
import { perfilDeveMandar } from '@/hooks/useCorDoSistema';

/**
 * Estes testes existem porque "deixar escolher a cor" parece trivial e não é.
 *
 * O mesmo par saturação/luminosidade produz contrastes muito diferentes
 * conforme o matiz: `251 90% 60%` é um roxo com 6,0 de contraste contra o
 * branco; `160 90% 60%` é um verde com 1,9 — texto branco por cima some.
 *
 * Se alguém acrescentar uma paleta escolhendo a cor no olho, o CI para aqui,
 * em vez de o corretor descobrir que não consegue ler o botão.
 */

/** WCAG AA para texto normal. O rótulo do botão primário é texto normal. */
const AA = 4.5;
/** AA para elemento de interface: ícone, borda, traço de gráfico. */
const AA_GRAFICO = 3;

describe('paletas', () => {
  it('o padrão é o bronze do site, e o roxo da origem segue intacto', () => {
    // Trocar a cor padrão sem querer é o tipo de mudança que passa despercebida
    // na revisão e reescreve a identidade do produto.
    expect(COR_PADRAO).toBe('bronze');
    // O mesmo #8b6a40 de `--color-bronze` no site (a conversão arredonda 1).
    expect(hslParaHex(paletaDe('bronze').claro.pri)).toBe('#8c6b40');
    const roxo = paletaDe('roxo');
    expect(roxo.claro.pri).toBe('251 90% 60%');
    expect(roxo.claro.pri2).toBe('253 78% 51%');
  });

  it('as chaves e os nomes são únicos', () => {
    expect(new Set(CHAVES_DE_COR).size).toBe(PALETAS.length);
    expect(new Set(PALETAS.map((p) => p.nome)).size).toBe(PALETAS.length);
  });

  for (const p of PALETAS) {
    describe(p.nome, () => {
      for (const [tema, t, fundo] of [
        ['claro', p.claro, FUNDO_CLARO],
        ['escuro', p.escuro, FUNDO_ESCURO],
      ] as const) {
        it(`${tema}: o texto do botão primário é legível sobre o acento`, () => {
          // `bg-pri` com `text-pri-fg`. É por isso que `priFg` existe em vez de
          // um `text-white` fixo: no tema escuro o acento é claro, e branco
          // sobre ele não se lê.
          expect(contraste(t.pri, t.priFg)).toBeGreaterThanOrEqual(AA);
        });

        it(`${tema}: o estado de passar o mouse não piora a leitura`, () => {
          expect(contraste(t.pri2, t.priFg)).toBeGreaterThanOrEqual(AA);
        });

        it(`${tema}: o acento é legível como TEXTO sobre o fundo da tela`, () => {
          // `text-pri` sobre card branco (claro) ou painel escuro. Aparece em
          // link, etiqueta e número em destaque.
          expect(contraste(t.pri, fundo)).toBeGreaterThanOrEqual(AA);
        });

        it(`${tema}: o acento é legível sobre o próprio fundo suave`, () => {
          // `text-pri` sobre `bg-pri-soft` — etiqueta, aviso, item ativo. É o
          // par que mais costuma ser esquecido.
          expect(contraste(t.pri, t.priSoft)).toBeGreaterThanOrEqual(AA);
        });

        it(`${tema}: a variação clara serve para ícone e borda`, () => {
          // `pri-3` não desenha corpo de texto: o piso é o de elemento gráfico.
          expect(contraste(t.pri3, fundo)).toBeGreaterThanOrEqual(AA_GRAFICO);
        });

        it(`${tema}: o neutro leva o matiz da cor`, () => {
          const dist = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));
          const matiz = Number(t.pri.split(' ')[0]);
          // Perto o bastante para combinar, longe o bastante para o fundo não
          // competir com o acento.
          expect(dist(t.matizNeutro, matiz)).toBeLessThanOrEqual(30);
        });
      }
    });
  }
});

describe('conversão de cor', () => {
  it('HSL vira o hexadecimal que a meta tag do navegador aceita', () => {
    expect(hslParaHex('0 0% 100%')).toBe('#ffffff');
    expect(hslParaHex('0 0% 0%')).toBe('#000000');
    expect(hslParaHex('251 90% 60%')).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('cor desconhecida cai no padrão em vez de quebrar a tela', () => {
    // O valor vem do banco. Um dia pode chegar algo que este código não conhece
    // — uma paleta removida, um typo numa migration.
    expect(paletaDe('turquesa').key).toBe('bronze');
    expect(paletaDe(null).key).toBe('bronze');
    expect(paletaDe(undefined).key).toBe('bronze');
  });
});


/**
 * O teste que faltava, e a razão de ele existir.
 *
 * A primeira versão girava o matiz de `--bg`, `--sheet`, `--card-2` e das
 * linhas — e ESQUECIA de `--card`. O tema escuro continuava roxo com qualquer
 * cor escolhida, porque quem domina a tela escura é o card, não o botão. A cor
 * "não pegava", e o motivo era um token fora de uma lista.
 *
 * Estes testes leem os arquivos de verdade: se alguém acrescentar um token de
 * superfície no CSS e esquecer da rotação, ou mexer numa lista e não na outra,
 * o CI para.
 */
const RAIZ = join(__dirname, '..');
const css = readFileSync(join(RAIZ, 'src/index.css'), 'utf8');
const fonteCores = readFileSync(join(RAIZ, 'src/lib/cores.ts'), 'utf8');
const html = readFileSync(join(RAIZ, 'index.html'), 'utf8');

/** Os tokens do bloco `.dark` que descrevem SUPERFÍCIE ou TEXTO. */
function tokensDoTemaEscuro(): string[] {
  const bloco = css.slice(css.indexOf('.dark'));
  const achados = [...bloco.matchAll(/(--[a-z0-9-]+):\s*[\d.]+\s/g)].map((m) => m[1] ?? '');
  return [...new Set(achados)].filter((t) =>
    /^--(bg|sheet|card|card-2|line|line-2|tx|tx-2|tx-3)$/.test(t),
  );
}

/**
 * Os tokens de UMA lista, isolada.
 *
 * Ler o arquivo inteiro de uma vez foi a primeira versão, e ela tinha um furo:
 * `--card` aparece nas duas listas, então tirá-lo só da lista do tema ESCURO
 * continuava passando porque a entrada do tema claro casava. Cada lista precisa
 * responder por si.
 */
function tokensDaLista(nome: 'NEUTROS_CLARO' | 'NEUTROS_ESCURO'): Set<string> {
  const inicio = fonteCores.indexOf(nome);
  const bloco = fonteCores.slice(inicio, fonteCores.indexOf('] as const;', inicio));
  return new Set([...bloco.matchAll(/\['(--[a-z0-9-]+)',/g)].map((m) => m[1] ?? ''));
}

describe('rotação de matiz', () => {
  it('todo token de superfície entra na rotação, em CADA tema', () => {
    for (const lista of ['NEUTROS_CLARO', 'NEUTROS_ESCURO'] as const) {
      const naLista = tokensDaLista(lista);
      for (const token of tokensDoTemaEscuro()) {
        expect(naLista.has(token), `${token} fora de ${lista}: fica com o matiz antigo`).toBe(true);
      }
    }
  });

  it('o script do index.html gira exatamente os mesmos tokens', () => {
    // Ele existe para cobrir os milissegundos antes do JavaScript. Cobrindo
    // MENOS, a tela abre metade verde e metade roxa e depois se acerta.
    const noBoot = new Set([...html.matchAll(/\['(--[a-z0-9-]+)',/g)].map((m) => m[1] ?? ''));
    for (const token of tokensDoTemaEscuro()) {
      expect(noBoot.has(token), `${token} não é aplicado antes da primeira pintura`).toBe(true);
    }
  });

  it('no tema escuro o card não é cinza: a cor precisa aparecer', () => {
    // Saturação baixa em luminosidade baixa vira cinza, e a cor escolhida some
    // justamente na maior área pintada da tela.
    const card = /\['--card',\s*'(\d+)%/.exec(
      fonteCores.slice(fonteCores.indexOf('NEUTROS_ESCURO')),
    );
    expect(Number(card?.[1] ?? 0)).toBeGreaterThanOrEqual(35);
  });
});

describe('a cor escolhida não volta sozinha', () => {
  it('o perfil só manda quando o VALOR DELE muda', () => {
    // Primeiro carregamento: nada foi observado ainda.
    expect(perfilDeveMandar('roxo', null)).toBe(true);

    /*
     * O cenário que quebrou, e que só aparecia clicando:
     *
     * A pessoa escolhe verde. O `useAuth` não é react-query, então o objeto
     * `profile` em memória continua dizendo 'roxo' pelo resto da sessão. Ela
     * troca de claro para escuro, o efeito reexecuta por causa do tema — e não
     * pode reaplicar 'roxo'.
     */
    expect(perfilDeveMandar('roxo', 'roxo')).toBe(false);

    // Mas se o banco realmente mudou — a pessoa trocou a cor em outro aparelho
    // — então ele manda.
    expect(perfilDeveMandar('azul', 'roxo')).toBe(true);

    // Perfil ainda carregando não decide nada.
    expect(perfilDeveMandar(null, 'verde')).toBe(false);
    expect(perfilDeveMandar(undefined, null)).toBe(false);
  });

  it('guardar a cor APLICADA em vez da observada reintroduz o bug', () => {
    /*
     * A primeira correção guardava aqui a cor aplicada: ao escolher verde,
     * escrevia 'verde'. O perfil seguia em 'roxo' e passava a DIVERGIR — e o
     * efeito, que age na divergência, repintava de roxo. O guarda causava
     * exatamente o que devia impedir.
     *
     * Este teste fixa a diferença: com 'verde' como observado, um perfil em
     * 'roxo' mandaria. Por isso `escolher` não toca em `ultimoObservado`.
     */
    expect(perfilDeveMandar('roxo', 'verde')).toBe(true);
  });
});

describe('a escolha não se disfarça de leitura do banco', () => {
  it('escolher uma cor não marca o perfil como observado', () => {
    /*
     * Guarda ESTRUTURAL, e ele existe porque o teste de contrato acima não
     * alcança este caso: `perfilDeveMandar` é pura, e o defeito mora em QUEM a
     * chama. Verificado por mutação — reintroduzir a atribuição não fazia
     * nenhum dos outros 178 testes falhar.
     *
     * Marcar `ultimoObservado` ao escolher faz o perfil (que segue com o valor
     * antigo em memória) passar a divergir, e o próximo efeito repinta com a
     * cor velha. É o bug de "escolhi verde e voltou sozinho".
     */
    const fonte = readFileSync(join(RAIZ, 'src/hooks/useCorDoSistema.ts'), 'utf8');
    const inicio = fonte.indexOf('const escolher = useCallback(');
    expect(inicio, 'a função escolher mudou de nome').toBeGreaterThan(0);
    const corpo = fonte.slice(inicio, fonte.indexOf('[salvar, escuro],', inicio));
    expect(corpo).not.toMatch(/ultimoObservado\s*=/);
  });
});
