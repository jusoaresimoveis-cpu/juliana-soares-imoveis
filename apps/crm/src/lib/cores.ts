/**
 * A cor do sistema.
 *
 * Seis paletas — e a parte difícil não é ter seis cores, é fazer as seis
 * continuarem legíveis.
 *
 * A tentação é trocar só o matiz: pegar o roxo `251 90% 60%` e escrever
 * `160 90% 60%` para ter verde. O resultado é um verde-limão com texto branco
 * por cima, contraste 1,9 — ilegível. O mesmo par saturação/luminosidade
 * produz contrastes muito diferentes conforme o matiz, porque o olho humano é
 * muito mais sensível ao verde do que ao azul.
 *
 * Então a regra aqui tem duas partes:
 *
 * 1. NO TEMA CLARO o acento é ESCURO. Ele precisa funcionar como texto sobre
 *    fundo branco (`text-pri` em etiqueta, link e destaque), e isso obriga
 *    luminosidade baixa em verde e laranja.
 *
 * 2. NO TEMA ESCURO o acento é CLARO, para se ver contra o fundo quase preto.
 *    E aí o texto POR CIMA dele não pode ser branco — vira escuro. É o que
 *    `--pri-fg` resolve.
 *
 * O `cores.test.ts` mede cada par de cada paleta nos dois temas. Escolher uma
 * cor no olho quebra o teste antes de chegar na tela do corretor.
 */

export interface Tokens {
  pri: string;
  pri2: string;
  pri3: string;
  priSoft: string;
  /** O que se lê POR CIMA do acento: botão primário, trilho, cartão do funil. */
  priFg: string;
  /** Matiz dos neutros — o cinza acompanha a marca. */
  matizNeutro: number;
}

export interface Paleta {
  key: string;
  nome: string;
  /** A bolinha do seletor. */
  amostra: string;
  claro: Tokens;
  escuro: Tokens;
}

const BRANCO_FG = '0 0% 100%';
const ESCURO_FG = '250 45% 10%';

export const PALETAS: [Paleta, ...Paleta[]] = [
  {
    /*
     * A cor da marca da Juliana: o bronze do site (`--color-bronze`, #8b6a40),
     * que dá 4,9:1 com branco. No escuro ele clareia, como as outras.
     */
    key: 'bronze',
    nome: 'Bronze',
    amostra: 'hsl(34 37% 40%)',
    claro: {
      pri: '34 37% 40%',
      pri2: '35 39% 32%',
      pri3: '34 42% 47%',
      // 96,5% e não 94%: no 94 o bronze como texto sobre o suave dava 4,36:1.
      priSoft: '36 55% 96.5%',
      priFg: BRANCO_FG,
      matizNeutro: 34,
    },
    escuro: {
      pri: '36 58% 66%',
      pri2: '36 62% 74%',
      pri3: '38 66% 76%',
      priSoft: '34 32% 18%',
      priFg: ESCURO_FG,
      matizNeutro: 34,
    },
  },
  {
    key: 'roxo',
    nome: 'Roxo',
    amostra: 'hsl(251 90% 60%)',
    claro: {
      // Idêntico ao original: é a cor com que o CRM de origem nasceu.
      pri: '251 90% 60%',
      pri2: '253 78% 51%',
      pri3: '251 100% 69%',
      priSoft: '251 100% 95%',
      priFg: BRANCO_FG,
      matizNeutro: 250,
    },
    escuro: {
      pri: '254 100% 72%',
      pri2: '253 100% 79%',
      pri3: '252 100% 80%',
      priSoft: '252 46% 17%',
      priFg: ESCURO_FG,
      matizNeutro: 248,
    },
  },
  {
    key: 'azul',
    nome: 'Azul',
    amostra: 'hsl(214 90% 44%)',
    claro: {
      pri: '214 90% 44%',
      pri2: '216 88% 37%',
      pri3: '210 100% 54%',
      priSoft: '212 100% 95%',
      priFg: BRANCO_FG,
      matizNeutro: 216,
    },
    escuro: {
      pri: '207 100% 68%',
      pri2: '209 100% 75%',
      pri3: '203 100% 80%',
      priSoft: '214 46% 20%',
      priFg: ESCURO_FG,
      matizNeutro: 215,
    },
  },
  {
    key: 'verde',
    nome: 'Verde',
    amostra: 'hsl(160 86% 26%)',
    claro: {
      pri: '160 86% 26%',
      pri2: '162 88% 21%',
      pri3: '156 72% 34%',
      priSoft: '158 62% 93%',
      priFg: BRANCO_FG,
      matizNeutro: 166,
    },
    escuro: {
      pri: '156 72% 58%',
      pri2: '158 76% 66%',
      pri3: '152 70% 68%',
      priSoft: '160 40% 18%',
      priFg: ESCURO_FG,
      matizNeutro: 164,
    },
  },
  {
    key: 'vermelho',
    nome: 'Vermelho',
    amostra: 'hsl(352 78% 43%)',
    claro: {
      pri: '352 78% 43%',
      pri2: '354 78% 36%',
      pri3: '350 90% 52%',
      priSoft: '352 100% 95%',
      priFg: BRANCO_FG,
      matizNeutro: 348,
    },
    escuro: {
      pri: '352 94% 68%',
      pri2: '354 92% 76%',
      pri3: '348 100% 78%',
      priSoft: '352 42% 20%',
      priFg: ESCURO_FG,
      matizNeutro: 346,
    },
  },
  {
    key: 'laranja',
    nome: 'Laranja',
    amostra: 'hsl(24 92% 35%)',
    claro: {
      pri: '24 92% 35%',
      pri2: '22 94% 29%',
      pri3: '28 94% 44%',
      priSoft: '28 100% 93%',
      priFg: BRANCO_FG,
      matizNeutro: 28,
    },
    escuro: {
      pri: '28 96% 60%',
      pri2: '24 96% 68%',
      pri3: '32 100% 70%',
      priSoft: '24 44% 18%',
      priFg: ESCURO_FG,
      matizNeutro: 26,
    },
  },
];

export const COR_PADRAO = 'bronze';
export const CHAVES_DE_COR = PALETAS.map((p) => p.key);

export function paletaDe(key: string | null | undefined): Paleta {
  return PALETAS.find((p) => p.key === key) ?? PALETAS[0];
}

/**
 * Os neutros, girados para o matiz da paleta.
 *
 * Saturação e luminosidade ficam como foram desenhadas — só o matiz muda. É o
 * que faz o cinza do fundo combinar com a cor escolhida: no tema verde, um
 * fundo lavanda pareceria defeito.
 */
const NEUTROS_CLARO = [
  ['--bg', '45% 94%'],
  ['--sheet', '40% 96.5%'],
  // O card do tema claro é branco puro: sem saturação, girar o matiz não muda
  // nada. Fica na lista para a lista ser COMPLETA — o esquecimento de um token
  // aqui foi exatamente o que deixou o tema escuro roxo em todas as cores.
  ['--card', '0% 100%'],
  ['--card-2', '45% 97.5%'],
  ['--line', '41% 93%'],
  ['--line-2', '35% 90%'],
  ['--tx', '35% 15%'],
  ['--tx-2', '12% 41%'],
  ['--tx-3', '14% 65%'],
] as const;

const NEUTROS_ESCURO = [
  ['--bg', '40% 7%'],
  ['--sheet', '34% 11%'],
  /*
   * O CARD, que é a maior área pintada da tela escura.
   *
   * Ele ficou de fora da primeira versão e por isso o tema escuro continuava
   * roxo com qualquer cor escolhida: o acento virava verde, e os oito cards,
   * o painel de leads e o fundo do funil seguiam no matiz 249. A cor "não
   * pegava" — e não pegava mesmo, porque o que domina a tela escura é o card,
   * não o botão.
   *
   * A saturação subiu de 32% para 40%: no escuro, matiz com pouca saturação
   * vira cinza e a cor escolhida some.
   */
  ['--card', '40% 16.5%'],
  ['--card-2', '40% 21%'],
  ['--line', '36% 21%'],
  ['--line-2', '36% 26%'],
  // O texto também: branco puro sobre fundo colorido parece recortado de outro
  // lugar. Uma pitada do matiz assenta.
  ['--tx', '71% 95%'],
  ['--tx-2', '25% 72%'],
  ['--tx-3', '18% 53%'],
] as const;

/**
 * Aplica a paleta na raiz do documento.
 *
 * Escreve em `style` do `<html>`: vence a folha de estilo por especificidade,
 * sem `!important`, e é o mesmo caminho que o script do `index.html` usa antes
 * da primeira pintura — por isso a tela nunca pisca roxo antes de ficar verde.
 */
export function aplicarCor(key: string, escuro: boolean): void {
  const t = escuro ? paletaDe(key).escuro : paletaDe(key).claro;
  const raiz = document.documentElement;

  raiz.style.setProperty('--pri', t.pri);
  raiz.style.setProperty('--pri-2', t.pri2);
  raiz.style.setProperty('--pri-3', t.pri3);
  raiz.style.setProperty('--pri-soft', t.priSoft);
  raiz.style.setProperty('--pri-fg', t.priFg);

  for (const [nome, resto] of escuro ? NEUTROS_ESCURO : NEUTROS_CLARO) {
    raiz.style.setProperty(nome, `${t.matizNeutro} ${resto}`);
  }

  // A barra do sistema no celular acompanha. Sem isto, o topo do aparelho
  // continua roxo enquanto o app inteiro ficou verde.
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', hslParaHex(t.pri));
}

/** `251 90% 60%` → `#5b3fd9`. A meta tag não aceita a forma do CSS. */
export function hslParaHex(hsl: string): string {
  const [h = 0, s = 0, l = 0] = hsl.replace(/%/g, '').split(/\s+/).map(Number);
  const sa = s / 100;
  const la = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sa * Math.min(la, 1 - la);
  const f = (n: number) => la - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const par = (n: number) =>
    Math.round(f(n) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${par(0)}${par(8)}${par(4)}`;
}

/* -------------------------------------------------------------------------- */
/* Contraste — é o que sustenta cada número escolhido acima                    */
/* -------------------------------------------------------------------------- */

function luminancia(hsl: string): number {
  const hex = hslParaHex(hsl);
  const canais = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * canais[0] + 0.7152 * canais[1] + 0.0722 * canais[2];
}

/** Razão de contraste entre duas cores em HSL, na fórmula da WCAG. */
export function contraste(a: string, b: string): number {
  const la = luminancia(a);
  const lb = luminancia(b);
  const [claro, escuro] = la > lb ? [la, lb] : [lb, la];
  return (claro + 0.05) / (escuro + 0.05);
}

export const FUNDO_CLARO = '0 0% 100%';
export const FUNDO_ESCURO = '246 34% 11%';
