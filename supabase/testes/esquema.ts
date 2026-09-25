import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * O esquema do banco, lido do TEXTO das migrations.
 *
 * Os testes estáticos do CRM e dos contratos conferem o SQL sem subir um
 * Postgres: "a função vigente ainda tem a guarda", "o CHECK aceita exatamente o
 * que o dicionário lista", "o segredo não está no GRANT". Cada arquivo de teste
 * tinha o próprio leitor, e todos supunham a mesma coisa: uma migration por
 * mudança, escrita à mão, em minúscula. A base consolidada quebrou as duas
 * suposições de uma vez — as 152 migrations da origem viraram um arquivo só, e
 * tudo o que não é função está como o pg_dump escreve (maiúscula, `= ANY
 * (ARRAY[...])`, `BETWEEN` desmontado, um GRANT por coluna).
 *
 * Por isso a leitura mora aqui, num lugar só, e entende as duas formas: a da
 * base e a das migrations que vierem depois dela, escritas à mão. E responde
 * sempre pelo estado FINAL — a última definição, depois de aplicar os arquivos
 * na ordem do nome —, que é o único que existe no banco. Um teste que lê a
 * primeira definição passa verde sobre código que já foi substituído.
 *
 * Nada aqui executa SQL. É um leitor: separa instruções respeitando texto entre
 * aspas, comentário e corpo entre dólares, e reconhece as instruções que os
 * testes perguntam. O que ele não reconhece (SQL dinâmico dentro de `execute`,
 * por exemplo) ele não enxerga — e aí o teste falha pedindo atenção, em vez de
 * passar sem ter olhado.
 */

const PASTA_DAS_MIGRACOES = join(__dirname, '..', 'migrations');

// -----------------------------------------------------------------------------
// Os arquivos
// -----------------------------------------------------------------------------

export interface Migracao {
  arquivo: string;
  texto: string;
}

let migracoes: Migracao[] | undefined;

/** Todas as migrations, na ordem em que o Postgres as aplica: a do nome. */
export function todasAsMigracoes(): Migracao[] {
  migracoes ??= readdirSync(PASTA_DAS_MIGRACOES)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((arquivo) => ({
      arquivo,
      // LF sempre: um checkout com CRLF não pode mudar o que o teste enxerga.
      texto: readFileSync(join(PASTA_DAS_MIGRACOES, arquivo), 'utf8').replace(/\r\n?/g, '\n'),
    }));
  return migracoes;
}

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
function pedacos(sql: string): Pedaco[] {
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

    if (c === '-' && sql[i + 1] === '-') {
      const fim = sql.indexOf('\n', i);
      empurra('comentario', fim < 0 ? sql.length : fim);
    } else if (c === '/' && sql[i + 1] === '*') {
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
      empurra('comentario', j);
    } else if (c === "'") {
      // `E'...'` aceita barra invertida como escape; o texto comum, não.
      const comEscape = /[eE]/.test(anterior) && !CONTINUA_IDENTIFICADOR.test(sql[i - 2] ?? '');
      let j = i + 1;
      while (j < sql.length) {
        if (comEscape && sql[j] === '\\') j += 2;
        else if (sql[j] === "'" && sql[j + 1] === "'") j += 2;
        else if (sql[j] === "'") {
          j += 1;
          break;
        } else j += 1;
      }
      empurra('texto', Math.min(j, sql.length));
    } else if (c === '"') {
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === '"' && sql[j + 1] === '"') j += 2;
        else if (sql[j] === '"') {
          j += 1;
          break;
        } else j += 1;
      }
      empurra('identificador', Math.min(j, sql.length));
    } else if (c === '$' && !CONTINUA_IDENTIFICADOR.test(anterior)) {
      // O corpo termina no PRIMEIRO fecho com a mesma etiqueta, sem olhar o que
      // tem dentro — é assim que o próprio Postgres lê.
      const etiqueta = ABRE_DOLAR.exec(sql.slice(i, i + 80))?.[0];
      if (etiqueta) {
        const fecha = sql.indexOf(etiqueta, i + etiqueta.length);
        empurra('dolar', fecha < 0 ? sql.length : fecha + etiqueta.length);
      } else {
        i += 1;
      }
    } else if (c === ';') {
      empurra('fim', i + 1);
    } else {
      i += 1;
    }
  }
  if (inicioDoCodigo < sql.length) saida.push({ tipo: 'codigo', texto: sql.slice(inicioDoCodigo) });
  return saida;
}

/** A etiqueta e o interior de um corpo `$tag$ ... $tag$`. */
function abrirDolar(texto: string): { etiqueta: string; interior: string } | null {
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
function fechamento(texto: string, inicio: number): number {
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

/** Divide nas vírgulas de fora de parêntese, colchete e aspas. */
function porVirgula(texto: string): string[] {
  const partes: string[] = [];
  let profundidade = 0;
  let atual = '';
  let i = 0;
  while (i < texto.length) {
    const c = texto[i] ?? '';
    if (c === "'" || c === '"') {
      const fim = texto.indexOf(c, i + 1);
      const ate = fim < 0 ? texto.length : fim + 1;
      atual += texto.slice(i, ate);
      i = ate;
      continue;
    }
    if (c === '(' || c === '[') profundidade += 1;
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
function chave(nome: string): string {
  const limpo = nome.replace(/"/g, '').replace(/^only /, '').trim();
  return limpo.startsWith('public.') ? limpo.slice('public.'.length) : limpo;
}

/** Um nome, com ou sem schema, com ou sem aspas duplas. */
const NOME = String.raw`((?:"[^"]+"|[a-z0-9_$]+)(?:\.(?:"[^"]+"|[a-z0-9_$]+))?)`;

// -----------------------------------------------------------------------------
// O estado final
// -----------------------------------------------------------------------------

export interface Gatilho extends Instrucao {
  /** A tabela do gatilho, como os testes a chamam (`leads`). */
  tabela: string;
  /** A função que ele executa (`tg_lead_espera`). */
  funcao: string;
}

export interface Tabela extends Instrucao {
  /** Coluna → definição normalizada (`timestamp with time zone default now()`). */
  colunas: Map<string, string>;
}

export interface Restricao {
  arquivo: string;
  tabela: string;
  /** A definição normalizada, do tipo em diante: `check ((x = any (array[...])))`. */
  definicao: string;
}

export interface Policy extends Instrucao {
  tabela: string;
}

export interface TarefaAgendada {
  arquivo: string;
  nome: string;
  agenda: string;
  comando: string;
}

/** Os privilégios de UM papel em UMA tabela. */
export interface Privilegios {
  /** Os da tabela inteira, em minúscula e em ordem: `['delete', 'select']`. */
  tabela: string[];
  /** Os de coluna: privilégio → colunas, em ordem. */
  colunas: Record<string, string[]>;
}

interface Acesso {
  tabela: Set<string>;
  colunas: Map<string, Set<string>>;
}

interface Esquema {
  funcoes: Map<string, Instrucao>;
  gatilhos: Map<string, Gatilho>;
  tabelas: Map<string, Tabela>;
  views: Map<string, Instrucao>;
  indices: Map<string, Instrucao>;
  enums: Map<string, string[]>;
  restricoes: Map<string, Restricao>;
  policies: Map<string, Policy>;
  rls: Map<string, boolean>;
  acessos: Map<string, Map<string, Acesso>>;
  execucao: Map<string, Set<string>>;
  agenda: Map<string, TarefaAgendada>;
  publicacoes: Map<string, Map<string, string[] | null>>;
}

const PRIVILEGIOS_DE_TABELA = [
  'select',
  'insert',
  'update',
  'delete',
  'truncate',
  'references',
  'trigger',
  'maintain',
];
const PRIVILEGIOS_DE_COLUNA = ['select', 'insert', 'update', 'references'];

/*
 * O que o Supabase concede sozinho a todo objeto novo do schema `public`
 * (`alter default privileges`, feito pela plataforma e não por migration).
 *
 * É a lição da 011: `revoke ... from public` não fecha nada no Supabase, porque
 * anon e authenticated têm concessão nominal. Sem modelar isso, uma migration
 * nova que esquecesse o `revoke` pareceria fechada para este leitor — e estaria
 * aberta no banco.
 *
 * `alter default privileges` escrito numa migration não é lido. Se um dia
 * alguém mudar o padrão, este leitor continua supondo o do Supabase — e erra
 * para o lado de acusar um acesso que não existe, nunca de esconder um que existe.
 */
const PAPEIS_DO_SUPABASE = ['anon', 'authenticated', 'service_role'];

function papel(nome: string): string {
  const limpo = nome.replace(/"/g, '').replace(/^group /, '').trim();
  return limpo === 'public' ? 'PUBLIC' : limpo;
}

let esquema: Esquema | undefined;

function oEsquema(): Esquema {
  esquema ??= montar(todasAsInstrucoes());
  return esquema;
}

function montar(todas: Instrucao[]): Esquema {
  const e: Esquema = {
    funcoes: new Map(),
    gatilhos: new Map(),
    tabelas: new Map(),
    views: new Map(),
    indices: new Map(),
    enums: new Map(),
    restricoes: new Map(),
    policies: new Map(),
    rls: new Map(),
    acessos: new Map(),
    execucao: new Map(),
    agenda: new Map(),
    publicacoes: new Map(),
  };

  const acessoDe = (tabela: string, quem: string): Acesso => {
    let porPapel = e.acessos.get(tabela);
    if (!porPapel) e.acessos.set(tabela, (porPapel = new Map()));
    let a = porPapel.get(quem);
    if (!a) porPapel.set(quem, (a = { tabela: new Set(), colunas: new Map() }));
    return a;
  };

  const nasceTabela = (nome: string) => {
    for (const quem of PAPEIS_DO_SUPABASE) {
      for (const p of PRIVILEGIOS_DE_TABELA) acessoDe(nome, quem).tabela.add(p);
    }
  };

  const someTabela = (nome: string) => {
    e.tabelas.delete(nome);
    e.views.delete(nome);
    e.rls.delete(nome);
    e.acessos.delete(nome);
    for (const [k, r] of e.restricoes) if (r.tabela === nome) e.restricoes.delete(k);
    for (const [k, g] of e.gatilhos) if (g.tabela === nome) e.gatilhos.delete(k);
    for (const [k, p] of e.policies) if (p.tabela === nome) e.policies.delete(k);
  };

  const restricao = (i: Instrucao, tabela: string, nome: string, definicao: string) => {
    e.restricoes.set(chave(nome), { arquivo: i.arquivo, tabela, definicao: definicao.trim() });
  };

  /** Uma coluna, e o CHECK nomeado que alguém tenha escrito junto dela. */
  const coluna = (i: Instrucao, tabela: string, colunas: Map<string, string>, elemento: string) => {
    const m = /^("[^"]+"|\S+) (.+)$/.exec(elemento);
    if (!m) return;
    const definicao = m[2] ?? '';
    colunas.set(chave(m[1] ?? ''), definicao);
    for (const r of definicao.matchAll(/constraint (\S+) check \(/g)) {
      const abre = (r.index ?? 0) + r[0].length - 1;
      restricao(i, tabela, r[1] ?? '', definicao.slice(abre - 'check '.length, fechamento(definicao, abre)));
    }
  };

  /** Um elemento de `create table (...)`: coluna ou restrição. */
  const elementoDeTabela = (i: Instrucao, tabela: string, colunas: Map<string, string>, elemento: string) => {
    const r = /^constraint (\S+) (.+)$/.exec(elemento);
    if (r) {
      restricao(i, tabela, r[1] ?? '', r[2] ?? '');
      return;
    }
    // Restrição sem nome não é endereçável por teste nenhum; `like` copia de outra.
    if (/^(primary key|unique|check|foreign key|exclude|like)\b/.test(elemento)) return;
    coluna(i, tabela, colunas, elemento);
  };

  const alterarTabela = (i: Instrucao, tabela: string, acoes: string) => {
    const t = e.tabelas.get(tabela);
    for (const acao of porVirgula(acoes)) {
      let m: RegExpExecArray | null;
      if ((m = /^add constraint (\S+) (.+)$/.exec(acao))) {
        restricao(i, tabela, m[1] ?? '', m[2] ?? '');
      } else if ((m = /^drop constraint (?:if exists )?(\S+)/.exec(acao))) {
        e.restricoes.delete(chave(m[1] ?? ''));
      } else if ((m = /^add (?:column )?(if not exists )?(.+)$/.exec(acao))) {
        const resto = m[2] ?? '';
        if (/^(primary key|unique|check|foreign key|exclude)\b/.test(resto)) continue;
        const nome = chave(/^("[^"]+"|\S+)/.exec(resto)?.[1] ?? '');
        if (m[1] && t?.colunas.has(nome)) continue;
        if (t) coluna(i, tabela, t.colunas, resto);
      } else if ((m = /^drop (?:column )?(?:if exists )?("[^"]+"|\S+)/.exec(acao))) {
        t?.colunas.delete(chave(m[1] ?? ''));
      } else if ((m = /^(enable|disable) row level security/.exec(acao))) {
        e.rls.set(tabela, m[1] === 'enable');
      }
    }
  };

  /** GRANT e REVOKE, nas duas formas: a do pg_dump e a escrita à mão. */
  const privilegios = (i: Instrucao) => {
    const m =
      /^(grant|revoke) (?:grant option for )?(.+?) on (.+?) (?:to|from) (.+?)(?: with grant option| granted by \S+| cascade| restrict)*;?$/.exec(
        i.normal,
      );
    if (!m) return;
    const concede = m[1] === 'grant';
    const papeis = porVirgula(m[4] ?? '').map(papel);
    const alvo = m[3] ?? '';
    const itens = porVirgula(m[2] ?? '').map((item) => {
      // `select(id)` do pg_dump e `select (a, b)` de quem escreve à mão.
      const partes = /^([a-z ]+?) ?(?:\((.*)\))?$/.exec(item);
      return {
        nome: (partes?.[1] ?? item).replace(/ privileges$/, ''),
        colunas: partes?.[2] ? porVirgula(partes[2]).map(chave) : null,
      };
    });

    let funcoes: string[] = [];
    let tabelas: string[] = [];
    if (/^all (functions|routines|procedures) in schema public$/.test(alvo)) {
      funcoes = [...e.funcoes.keys()];
    } else if (/^all tables in schema public$/.test(alvo)) {
      tabelas = [...e.tabelas.keys(), ...e.views.keys()];
    } else if (/^(function|routine|procedure) /.test(alvo)) {
      funcoes = porVirgula(alvo.replace(/^(function|routine|procedure) /, '')).map((f) =>
        chave(f.replace(/ ?\(.*$/, '')),
      );
    } else if (!/^(all |schema |sequence |database |domain |type |language |large object |foreign |tablespace )/.test(alvo)) {
      tabelas = porVirgula(alvo.replace(/^table /, '')).map(chave);
    }

    if (itens.some((it) => it.nome === 'execute' || it.nome === 'all')) {
      for (const f of funcoes) {
        let quem = e.execucao.get(f);
        if (!quem) e.execucao.set(f, (quem = new Set()));
        for (const p of papeis) {
          if (concede) quem.add(p);
          else quem.delete(p);
        }
      }
    }

    for (const t of tabelas) {
      for (const p of papeis) {
        const a = acessoDe(t, p);
        for (const it of itens) {
          const nomes = it.nome === 'all' ? (it.colunas ? PRIVILEGIOS_DE_COLUNA : PRIVILEGIOS_DE_TABELA) : [it.nome];
          for (const priv of nomes) {
            if (it.colunas) {
              let cols = a.colunas.get(priv);
              if (!cols) a.colunas.set(priv, (cols = new Set()));
              for (const c of it.colunas) {
                if (concede) cols.add(c);
                else cols.delete(c);
              }
            } else if (concede) {
              a.tabela.add(priv);
            } else {
              // Revogar da tabela revoga também o mesmo privilégio em cada coluna.
              a.tabela.delete(priv);
              a.colunas.delete(priv);
            }
          }
        }
      }
    }
  };

  /** `cron.schedule` e `cron.unschedule` feitos na hora de aplicar a migration. */
  const agenda = (i: Instrucao) => {
    const chamada =
      /cron\.(schedule|unschedule)\(\s*('(?:[^']|'')*')(?:\s*,\s*('(?:[^']|'')*')\s*,\s*(\$([A-Za-z_]*)\$[\s\S]*?\$\5\$|'(?:[^']|'')*'))?\s*\)/gi;
    for (const c of semComentarios(i.texto).matchAll(chamada)) {
      const nome = literais(c[2] ?? '')[0] ?? '';
      if ((c[1] ?? '').toLowerCase() === 'unschedule') {
        e.agenda.delete(nome);
      } else if (c[3] && c[4]) {
        const comando = abrirDolar(c[4])?.interior ?? literais(c[4])[0] ?? '';
        e.agenda.set(nome, {
          arquivo: i.arquivo,
          nome,
          agenda: literais(c[3])[0] ?? '',
          comando: comando.trim(),
        });
      }
    }
  };

  /** A publicação do Realtime: quem entra, e com quais colunas. */
  const publicacao = (i: Instrucao) => {
    const ops =
      /(?:alter publication ([a-z0-9_"]+) (add|drop|set) table|create publication ([a-z0-9_"]+) for table) (.+?)(?:;|$)/g;
    for (const op of i.normal.matchAll(ops)) {
      const nome = chave(op[1] ?? op[3] ?? '');
      let tabelas = e.publicacoes.get(nome);
      if (!tabelas) e.publicacoes.set(nome, (tabelas = new Map()));
      const acao = op[2] ?? 'set';
      if (acao === 'set') tabelas.clear();
      for (const item of porVirgula(op[4] ?? '')) {
        const t = /^(?:only )?("[^"]+"|[a-z0-9_.$]+)(?: \*)?(?: ?\((.*?)\))?/.exec(item);
        if (!t) continue;
        const tabela = chave(t[1] ?? '');
        if (acao === 'drop') tabelas.delete(tabela);
        else tabelas.set(tabela, t[2] ? porVirgula(t[2]).map(chave) : null);
      }
    }
  };

  for (const i of todas) {
    const n = i.normal;
    let m: RegExpExecArray | null;

    if ((m = new RegExp(`^create (?:or replace )?function ${NOME} ?\\(`).exec(n))) {
      const nome = chave(m[1] ?? '');
      // Função nova nasce executável por PUBLIC e pelos papéis do Supabase;
      // `create or replace` de uma que já existe mantém a ACL que ela tinha.
      if (!e.funcoes.has(nome)) e.execucao.set(nome, new Set(['PUBLIC', ...PAPEIS_DO_SUPABASE]));
      e.funcoes.set(nome, i);
    } else if ((m = /^drop function (?:if exists )?(.+?)(?: cascade| restrict)?;$/.exec(n))) {
      for (const f of porVirgula(m[1] ?? '')) {
        const nome = chave(f.replace(/ ?\(.*$/, ''));
        e.funcoes.delete(nome);
        e.execucao.delete(nome);
      }
    } else if (
      (m = new RegExp(`^create (?:or replace )?(?:constraint )?trigger ${NOME} (?:before|after|instead of) .+? on ${NOME}`).exec(n))
    ) {
      const funcao = new RegExp(`execute (?:function|procedure) ${NOME} ?\\(`).exec(n)?.[1] ?? '';
      e.gatilhos.set(chave(m[1] ?? ''), { ...i, tabela: chave(m[2] ?? ''), funcao: chave(funcao) });
    } else if ((m = new RegExp(`^drop trigger (?:if exists )?${NOME} on `).exec(n))) {
      e.gatilhos.delete(chave(m[1] ?? ''));
    } else if (
      (m = new RegExp(`^create (?:(?:global |local )?(?:temporary |temp |unlogged ))?table (if not exists )?${NOME} ?\\(`).exec(n))
    ) {
      const nome = chave(m[2] ?? '');
      if (m[1] && e.tabelas.has(nome)) continue;
      const abre = m[0].length - 1;
      const colunas = new Map<string, string>();
      e.tabelas.set(nome, { ...i, colunas });
      nasceTabela(nome);
      for (const elemento of porVirgula(n.slice(abre + 1, fechamento(n, abre) - 1))) {
        elementoDeTabela(i, nome, colunas, elemento);
      }
    } else if ((m = new RegExp(`^alter table (?:if exists )?(?:only )?${NOME} (.+);$`).exec(n))) {
      alterarTabela(i, chave(m[1] ?? ''), m[2] ?? '');
    } else if ((m = /^drop (?:table|view|materialized view) (?:if exists )?(.+?)(?: cascade| restrict)?;$/.exec(n))) {
      for (const t of porVirgula(m[1] ?? '')) someTabela(chave(t));
    } else if ((m = new RegExp(`^create (?:or replace )?(?:materialized )?view ${NOME}`).exec(n))) {
      const nome = chave(m[1] ?? '');
      if (!e.views.has(nome)) nasceTabela(nome);
      e.views.set(nome, i);
    } else if ((m = new RegExp(`^create (?:unique )?index (?:concurrently )?(if not exists )?${NOME} on `).exec(n))) {
      const nome = chave(m[2] ?? '');
      if (!(m[1] && e.indices.has(nome))) e.indices.set(nome, i);
    } else if ((m = /^drop index (?:concurrently )?(?:if exists )?(.+?)(?: cascade| restrict)?;$/.exec(n))) {
      for (const x of porVirgula(m[1] ?? '')) e.indices.delete(chave(x));
    } else if ((m = new RegExp(`^create type ${NOME} as enum \\((.*)\\);$`).exec(n))) {
      e.enums.set(chave(m[1] ?? ''), literais(m[2] ?? ''));
    } else if ((m = new RegExp(`^alter type ${NOME} add value (?:if not exists )?('(?:[^']|'')*')`).exec(n))) {
      const valor = literais(m[2] ?? '')[0] ?? '';
      const valores = e.enums.get(chave(m[1] ?? ''));
      if (valores && !valores.includes(valor)) valores.push(valor);
    } else if ((m = /^drop type (?:if exists )?(.+?)(?: cascade| restrict)?;$/.exec(n))) {
      for (const x of porVirgula(m[1] ?? '')) e.enums.delete(chave(x));
    } else if ((m = new RegExp(`^create policy ${NOME} on ${NOME}`).exec(n))) {
      const tabela = chave(m[2] ?? '');
      e.policies.set(`${tabela}.${chave(m[1] ?? '')}`, { ...i, tabela });
    } else if ((m = new RegExp(`^drop policy (?:if exists )?${NOME} on ${NOME}`).exec(n))) {
      e.policies.delete(`${chave(m[2] ?? '')}.${chave(m[1] ?? '')}`);
    } else if (/^(grant|revoke) /.test(n)) {
      privilegios(i);
    } else if (/^(do|select|alter publication|create publication) /.test(n)) {
      // Corpo de função não entra aqui: lá dentro está o que ela faz quando
      // RODA, e não o que a migration fez ao ser aplicada. `comment on` também
      // não — a prosa pode citar `cron.schedule(...)` sem agendar nada.
      agenda(i);
      publicacao(i);
    }
  }
  return e;
}

// -----------------------------------------------------------------------------
// As perguntas
// -----------------------------------------------------------------------------

function exige<T>(valor: T | undefined, mensagem: string): T {
  if (valor === undefined) throw new Error(mensagem);
  return valor;
}

/**
 * A ÚLTIMA definição de `public.<nome>`: do `create` ao `;` depois do fecho do
 * corpo. É a única que vale no banco.
 */
export function definicaoDaFuncao(nome: string): Instrucao {
  return exige(oEsquema().funcoes.get(nome), `nenhuma migração define a função public.${nome}`);
}

/** Todas as funções que existem hoje, cada uma na sua última definição. */
export function funcoesVigentes(): (Instrucao & { nome: string })[] {
  return [...oEsquema().funcoes].map(([nome, i]) => ({ nome, ...i }));
}

/** A última definição do gatilho, com a tabela e a função que ele chama. */
export function definicaoDoGatilho(nome: string): Gatilho {
  return exige(oEsquema().gatilhos.get(nome), `nenhuma migração cria o gatilho ${nome}`);
}

/** Os gatilhos que existem hoje numa tabela. */
export function gatilhosDaTabela(tabela: string): Gatilho[] {
  return [...oEsquema().gatilhos.values()].filter((g) => g.tabela === tabela);
}

/** O `create table` vigente, com as colunas somadas às de `alter table ... add column`. */
export function definicaoDaTabela(nome: string): Tabela {
  return exige(oEsquema().tabelas.get(nome), `nenhuma migração cria a tabela public.${nome}`);
}

/** Coluna → definição normalizada, do jeito que a tabela está hoje. */
export function colunasDaTabela(nome: string): Map<string, string> {
  return definicaoDaTabela(nome).colunas;
}

/** O nome de toda tabela que existe hoje. */
export function tabelasVigentes(): string[] {
  return [...oEsquema().tabelas.keys()].sort();
}

export function definicaoDaView(nome: string): Instrucao {
  return exige(oEsquema().views.get(nome), `nenhuma migração cria a view public.${nome}`);
}

export function definicaoDoIndice(nome: string): Instrucao {
  return exige(oEsquema().indices.get(nome), `nenhuma migração cria o índice ${nome}`);
}

/** Os valores de um `enum`, na ordem em que o banco os conhece. */
export function valoresDoEnum(nome: string): string[] {
  return exige(oEsquema().enums.get(nome), `nenhuma migração cria o tipo public.${nome}`);
}

/**
 * A restrição como está hoje: a última `add constraint` (ou a de dentro do
 * `create table`) que não foi derrubada depois. A definição vem normalizada,
 * do tipo em diante — `check (...)`, `unique (...)`, `exclude using ...`.
 */
export function definicaoDaRestricao(nome: string): Restricao {
  return exige(oEsquema().restricoes.get(nome), `nenhuma migração define a restrição ${nome}`);
}

/**
 * As restrições que valem hoje numa tabela, com o nome. Para perguntar pela
 * REGRA sem depender do nome que o pg_dump (ou o autor) deu a ela.
 */
export function restricoesDaTabela(tabela: string): (Restricao & { nome: string })[] {
  return [...oEsquema().restricoes]
    .filter(([, r]) => r.tabela === tabela)
    .map(([nome, r]) => ({ nome, ...r }));
}

/**
 * Os valores que um CHECK aceita, em ordem.
 *
 * Entende as três formas em uso: `col in ('a','b')`, a do pg_dump — `col = ANY
 * (ARRAY['a'::text, 'b'::text])` — e `col <@ array['a','b']`. Lê só o que está
 * DENTRO da lista: em `angulo is null or (level = 'ad' and angulo in (...))`, o
 * `'ad'` é outra condição, não um valor aceito.
 */
export function valoresDoCheck(nome: string): string[] {
  const def = definicaoDaRestricao(nome).definicao;
  const valores: string[] = [];
  for (const m of def.matchAll(/\bin \(|\barray\[/g)) {
    const abre = (m.index ?? 0) + m[0].length - 1;
    valores.push(...literais(def.slice(abre, fechamento(def, abre))));
  }
  if (!valores.length) throw new Error(`o CHECK ${nome} não tem lista de valores: ${def}`);
  return valores.sort();
}

/** As policies que valem hoje numa tabela. */
export function policiesDaTabela(tabela: string): Policy[] {
  return [...oEsquema().policies.values()].filter((p) => p.tabela === tabela);
}

/** Se a RLS está ligada na tabela. */
export function rlsLigada(tabela: string): boolean {
  return oEsquema().rls.get(tabela) ?? false;
}

/**
 * O que um papel pode fazer numa tabela, depois de aplicar todo GRANT e REVOKE
 * na ordem — os padrões do Supabase incluídos.
 *
 * `quem` é o nome do papel (`anon`, `authenticated`) ou `PUBLIC`. O que vem por
 * PUBLIC não aparece no de cada papel: pergunte pelos dois quando importar.
 */
export function privilegiosNaTabela(tabela: string, quem: string): Privilegios {
  const e = oEsquema();
  if (!e.tabelas.has(tabela) && !e.views.has(tabela)) {
    throw new Error(`nenhuma migração cria a tabela public.${tabela}`);
  }
  const a = e.acessos.get(tabela)?.get(quem);
  const colunas: Record<string, string[]> = {};
  for (const [priv, cols] of a?.colunas ?? []) if (cols.size) colunas[priv] = [...cols].sort();
  return { tabela: [...(a?.tabela ?? [])].sort(), colunas };
}

/**
 * Quem pode executar a função: os papéis com EXECUTE, e `PUBLIC` enquanto ele
 * não for revogado. A função é identificada pelo nome — nenhuma deste banco tem
 * sobrecarga.
 */
export function executoresDaFuncao(nome: string): string[] {
  definicaoDaFuncao(nome);
  return [...(oEsquema().execucao.get(nome) ?? [])].sort();
}

/** A tarefa do pg_cron com esse nome, como ficou depois de todas as migrations. */
export function tarefaAgendada(nome: string): TarefaAgendada | undefined {
  return oEsquema().agenda.get(nome);
}

/** Todas as tarefas que as migrations deixaram agendadas. */
export function tarefasAgendadas(): TarefaAgendada[] {
  return [...oEsquema().agenda.values()];
}

/**
 * As tabelas de uma publicação e as colunas publicadas de cada uma — `null`
 * quando a tabela entrou inteira, sem lista de colunas.
 */
export function tabelasPublicadas(publicacao: string): Map<string, string[] | null> {
  return oEsquema().publicacoes.get(publicacao) ?? new Map();
}
