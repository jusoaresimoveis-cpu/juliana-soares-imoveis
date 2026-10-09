// Parte do leitor das migrations. Os testes importam por `esquema.ts`, que
// explica o leitor inteiro e reexporta o que daqui é público.

// -----------------------------------------------------------------------------
// O léxico
// -----------------------------------------------------------------------------

type TipoDePedaco = 'codigo' | 'texto' | 'identificador' | 'comentario' | 'dolar' | 'fim';

interface Pedaco {
  tipo: TipoDePedaco;
  texto: string;
}

/** Letra que continua um identificador — e que portanto não abre `$tag$`. */
const CONTINUA_IDENTIFICADOR = /[A-Za-z0-9_$\u0080-￿]/;
const ABRE_DOLAR = /^\$(?:[A-Za-z_\u0080-￿][A-Za-z0-9_\u0080-￿]*)?\$/;

/**
 * O SQL em pedaços: código, texto entre aspas, identificador entre aspas
 * duplas, comentário, corpo entre dólares e o `;` que fecha a instrução.
 *
 * Regex não separa isso. O corpo de uma função tem `;` no meio, comentário tem
 * apóstrofo ("it's"), e texto tem `--` dentro — cada um deles já fez um leitor
 * ingênuo cortar a instrução no lugar errado e comparar a coisa errada.
 */
export function pedacos(sql: string): Pedaco[] {
  const saida: Pedaco[] = [];
  let inicioDoCodigo = 0;
  let i = 0;

  const empurra = (tipo: TipoDePedaco, fim: number) => {
    if (inicioDoCodigo < i) saida.push({ tipo: 'codigo', texto: sql.slice(inicioDoCodigo, i) });
    saida.push({ tipo, texto: sql.slice(i, fim) });
    i = fim;
    inicioDoCodigo = fim;
  };

  while (i < sql.length) {
    const c = sql[i];
    const anterior = sql[i - 1] ?? '';

    if (par(sql, i, '-', '-')) {
      empurra('comentario', fimDaLinha(sql, i));
    } else if (par(sql, i, '/', '*')) {
      empurra('comentario', fimDoComentarioDeBloco(sql, i));
    } else if (c === "'") {
      empurra('texto', fimDoTexto(sql, i, anterior));
    } else if (c === '"') {
      empurra('identificador', fimDoIdentificador(sql, i));
    } else if (c === '$' && !CONTINUA_IDENTIFICADOR.test(anterior)) {
      const fim = fimDoDolar(sql, i);
      if (fim !== null) empurra('dolar', fim);
      else i += 1;
    } else if (c === ';') {
      empurra('fim', i + 1);
    } else {
      i += 1;
    }
  }
  if (inicioDoCodigo < sql.length) saida.push({ tipo: 'codigo', texto: sql.slice(inicioDoCodigo) });
  return saida;
}

function par(sql: string, i: number, a: string, b: string): boolean {
  return sql[i] === a && sql[i + 1] === b;
}

function fimDaLinha(sql: string, i: number): number {
  const fim = sql.indexOf('\n', i);
  return fim < 0 ? sql.length : fim;
}

function fimDoComentarioDeBloco(sql: string, i: number): number {
  // Aninha, como no Postgres: `/* a /* b */ c */` é um comentário só.
  let profundidade = 0;
  let j = i;
  do {
    if (sql.startsWith('/*', j)) {
      profundidade += 1;
      j += 2;
    } else if (sql.startsWith('*/', j)) {
      profundidade -= 1;
      j += 2;
    } else {
      j += 1;
    }
  } while (profundidade > 0 && j < sql.length);
  return j;
}

function fimDoTexto(sql: string, i: number, anterior: string): number {
  // `E'...'` aceita barra invertida como escape; o texto comum, não.
  const comEscape = /[eE]/.test(anterior) && !CONTINUA_IDENTIFICADOR.test(sql[i - 2] ?? '');
  let j = i + 1;
  while (j < sql.length) {
    if (comEscape && sql[j] === '\\') j += 2;
    else if (par(sql, j, "'", "'")) j += 2;
    else if (sql[j] === "'") {
      j += 1;
      break;
    } else j += 1;
  }
  return Math.min(j, sql.length);
}

function fimDoIdentificador(sql: string, i: number): number {
  let j = i + 1;
  while (j < sql.length) {
    if (par(sql, j, '"', '"')) j += 2;
    else if (sql[j] === '"') {
      j += 1;
      break;
    } else j += 1;
  }
  return Math.min(j, sql.length);
}

function fimDoDolar(sql: string, i: number): number | null {
  // O corpo termina no PRIMEIRO fecho com a mesma etiqueta, sem olhar o que
  // tem dentro — é assim que o próprio Postgres lê.
  const etiqueta = ABRE_DOLAR.exec(sql.slice(i, i + 80))?.[0];
  if (etiqueta) {
    const fecha = sql.indexOf(etiqueta, i + etiqueta.length);
    return fecha < 0 ? sql.length : fecha + etiqueta.length;
  }
  return null;
}

/** A etiqueta e o interior de um corpo `$tag$ ... $tag$`. */
export function abrirDolar(texto: string): { etiqueta: string; interior: string } | null {
  const etiqueta = /^\$[^$]*\$/.exec(texto)?.[0] ?? '';
  if (!etiqueta || texto.length < etiqueta.length * 2 || !texto.endsWith(etiqueta)) return null;
  return { etiqueta, interior: texto.slice(etiqueta.length, texto.length - etiqueta.length) };
}

/**
 * O SQL sem comentário nenhum — inclusive os de dentro do corpo das funções.
 *
 * As migrations deste projeto explicam em prosa o que o código deixou de fazer.
 * Um teste que procura no texto cru acha a proibição na frase que a proíbe.
 * Texto entre aspas fica intacto: `'--'` dentro de uma string não é comentário.
 */
export function semComentarios(sql: string): string {
  let saida = '';
  for (const p of pedacos(sql)) {
    if (p.tipo === 'comentario') {
      saida += p.texto.startsWith('--') ? '' : ' ';
    } else if (p.tipo === 'dolar') {
      const d = abrirDolar(p.texto);
      saida += d ? d.etiqueta + semComentarios(d.interior) + d.etiqueta : p.texto;
    } else {
      saida += p.texto;
    }
  }
  return saida;
}

/** Espaços colapsados: a mesma expressão com outra indentação é a mesma. */
export function colapsado(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim();
}

/**
 * O SQL sem comentário, com as palavras em minúscula e os espaços colapsados.
 *
 * É a forma de comparar o SIGNIFICADO do que o pg_dump escreveu com o que uma
 * pessoa escreveria: `CREATE TRIGGER x AFTER INSERT ON public.t` e `create
 * trigger x after insert on public.t` são a mesma instrução. Texto entre aspas
 * e identificador entre aspas duplas ficam como estão — `'ZZ'` não vira `'zz'`.
 */
export function normalizado(sql: string): string {
  let saida = '';
  const junta = (s: string) => {
    saida += s.startsWith(' ') && (saida === '' || saida.endsWith(' ')) ? s.slice(1) : s;
  };
  for (const p of pedacos(sql)) {
    if (p.tipo === 'comentario') {
      junta(' ');
    } else if (p.tipo === 'codigo') {
      junta(p.texto.toLowerCase().replace(/\s+/g, ' '));
    } else if (p.tipo === 'dolar') {
      const d = abrirDolar(p.texto);
      const interior = d ? normalizado(d.interior) : '';
      junta(d ? `${d.etiqueta}${interior ? ` ${interior} ` : ''}${d.etiqueta}` : p.texto);
    } else {
      junta(p.texto);
    }
  }
  return saida.trim();
}
