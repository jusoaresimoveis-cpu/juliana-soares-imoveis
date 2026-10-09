import { todasAsMigracoes } from './migracoes';
import { normalizado, pedacos } from './sql-texto';

// Parte do leitor das migrations. Os testes importam por `esquema.ts`, que
// explica o leitor inteiro e reexporta o que daqui é público.

// -----------------------------------------------------------------------------
// As instruções
// -----------------------------------------------------------------------------

export interface Instrucao {
  /** O arquivo de onde a instrução veio. */
  arquivo: string;
  /** Como está no arquivo, do primeiro caractere de código até o `;`. */
  texto: string;
  /** `normalizado(texto)`: sem comentário, minúscula, espaços colapsados. */
  normal: string;
}

function instrucoesDoTexto(arquivo: string, sql: string): Instrucao[] {
  const saida: Instrucao[] = [];
  let atual = '';
  let temCodigo = false;
  const fecha = () => {
    const texto = atual.trim();
    if (temCodigo && texto) saida.push({ arquivo, texto, normal: normalizado(texto) });
    atual = '';
    temCodigo = false;
  };
  for (const p of pedacos(sql)) {
    if (p.tipo === 'fim') {
      atual += ';';
      fecha();
      continue;
    }
    // O cabeçalho `-- Name: ...` do pg_dump, e a prosa antes de cada instrução,
    // não fazem parte dela.
    if (!temCodigo && (p.tipo === 'comentario' || !p.texto.trim())) continue;
    temCodigo = true;
    atual += p.texto;
  }
  fecha();
  return saida;
}

let instrucoes: Instrucao[] | undefined;

/** Todas as instruções de todas as migrations, na ordem em que são aplicadas. */
export function todasAsInstrucoes(): Instrucao[] {
  instrucoes ??= todasAsMigracoes().flatMap((m) => instrucoesDoTexto(m.arquivo, m.texto));
  return instrucoes;
}

// -----------------------------------------------------------------------------
// Pequenas ferramentas de leitura
// -----------------------------------------------------------------------------

/** A posição logo depois do parêntese (ou colchete) que fecha o de `inicio`. */
export function fechamento(texto: string, inicio: number): number {
  let profundidade = 0;
  let i = inicio;
  while (i < texto.length) {
    const c = texto[i] ?? '';
    if (c === "'" || c === '"') {
      const fim = texto.indexOf(c, i + 1);
      i = fim < 0 ? texto.length : fim + 1;
      continue;
    }
    if (c === '(' || c === '[') profundidade += 1;
    else if (c === ')' || c === ']') {
      profundidade -= 1;
      if (profundidade === 0) return i + 1;
    }
    i += 1;
  }
  return texto.length;
}

/** A posição logo depois da aspa `c` que fecha a de `i`; sem ela, o fim do texto. */
function fimDoLiteral(texto: string, i: number, c: string): number {
  const fim = texto.indexOf(c, i + 1);
  return fim < 0 ? texto.length : fim + 1;
}

function abre(c: string): boolean {
  return c === '(' || c === '[';
}

/** Divide nas vírgulas de fora de parêntese, colchete e aspas. */
export function porVirgula(texto: string): string[] {
  const partes: string[] = [];
  let profundidade = 0;
  let atual = '';
  let i = 0;
  while (i < texto.length) {
    const c = texto[i] ?? '';
    if (c === "'" || c === '"') {
      const ate = fimDoLiteral(texto, i, c);
      atual += texto.slice(i, ate);
      i = ate;
      continue;
    }
    if (abre(c)) profundidade += 1;
    if (c === ')' || c === ']') profundidade -= 1;
    if (c === ',' && profundidade === 0) {
      partes.push(atual.trim());
      atual = '';
    } else {
      atual += c;
    }
    i += 1;
  }
  if (atual.trim()) partes.push(atual.trim());
  return partes;
}

/** Os literais entre aspas simples, já sem o escape `''`. */
export function literais(sql: string): string[] {
  return [...sql.matchAll(/'((?:[^']|'')*)'/g)].map((m) => (m[1] ?? '').replace(/''/g, "'"));
}

/**
 * O nome do objeto como os testes o chamam: sem aspas e, quando é do schema
 * `public`, sem o schema. `public.leads` e `"leads"` são `leads`;
 * `storage.objects` continua `storage.objects`.
 */
export function chave(nome: string): string {
  const limpo = nome.replace(/"/g, '').replace(/^only /, '').trim();
  return limpo.startsWith('public.') ? limpo.slice('public.'.length) : limpo;
}

/** Um nome, com ou sem schema, com ou sem aspas duplas. */
export const NOME = String.raw`((?:"[^"]+"|[a-z0-9_$]+)(?:\.(?:"[^"]+"|[a-z0-9_$]+))?)`;
