import { chave, fechamento, literais, NOME, porVirgula, todasAsInstrucoes } from './instrucoes';
import type { Instrucao } from './instrucoes';
import { nasceTabela, PAPEIS_DO_SUPABASE, privilegios } from './privilegios';
import { abrirDolar, semComentarios } from './sql-texto';
import type { Esquema, Tabela } from './tipos-do-esquema';

// Parte do leitor das migrations. Os testes importam por `esquema.ts`, que
// explica o leitor inteiro e reexporta o que daqui é público.

let esquema: Esquema | undefined;

export function oEsquema(): Esquema {
  esquema ??= montar(todasAsInstrucoes());
  return esquema;
}

function someTabela(e: Esquema, nome: string) {
  e.tabelas.delete(nome);
  e.views.delete(nome);
  e.rls.delete(nome);
  e.acessos.delete(nome);
  for (const [k, r] of e.restricoes) if (r.tabela === nome) e.restricoes.delete(k);
  for (const [k, g] of e.gatilhos) if (g.tabela === nome) e.gatilhos.delete(k);
  for (const [k, p] of e.policies) if (p.tabela === nome) e.policies.delete(k);
}

/** A tabela que um `create table` ou `alter table` mexe, e a instrução que mexe. */
interface NaTabela {
  e: Esquema;
  i: Instrucao;
  tabela: string;
}

function restricao({ e, i, tabela }: NaTabela, nome: string, definicao: string) {
  e.restricoes.set(chave(nome), { arquivo: i.arquivo, tabela, definicao: definicao.trim() });
}

/** Uma coluna, e o CHECK nomeado que alguém tenha escrito junto dela. */
function coluna(alvo: NaTabela, colunas: Map<string, string>, elemento: string) {
  const m = /^("[^"]+"|\S+) (.+)$/.exec(elemento);
  if (!m) return;
  const definicao = m[2] ?? '';
  colunas.set(chave(m[1] ?? ''), definicao);
  for (const r of definicao.matchAll(/constraint (\S+) check \(/g)) {
    const abre = (r.index ?? 0) + r[0].length - 1;
    restricao(alvo, r[1] ?? '', definicao.slice(abre - 'check '.length, fechamento(definicao, abre)));
  }
}

/** Um elemento de `create table (...)`: coluna ou restrição. */
function elementoDeTabela(alvo: NaTabela, colunas: Map<string, string>, elemento: string) {
  const r = /^constraint (\S+) (.+)$/.exec(elemento);
  if (r) {
    restricao(alvo, r[1] ?? '', r[2] ?? '');
    return;
  }
  // Restrição sem nome não é endereçável por teste nenhum; `like` copia de outra.
  if (/^(primary key|unique|check|foreign key|exclude|like)\b/.test(elemento)) return;
  coluna(alvo, colunas, elemento);
}

/** `add column`, com ou sem `if not exists`, numa tabela que pode nem existir. */
function adicionarColuna(alvo: NaTabela, t: Tabela | undefined, m: RegExpExecArray) {
  const resto = m[2] ?? '';
  if (/^(primary key|unique|check|foreign key|exclude)\b/.test(resto)) return;
  const nome = chave(/^("[^"]+"|\S+)/.exec(resto)?.[1] ?? '');
  if (m[1] && t?.colunas.has(nome)) return;
  if (t) coluna(alvo, t.colunas, resto);
}

/** Uma das ações de um `alter table`, separadas por vírgula. */
function alteracao(alvo: NaTabela, t: Tabela | undefined, acao: string) {
  let m: RegExpExecArray | null;
  if ((m = /^add constraint (\S+) (.+)$/.exec(acao))) {
    restricao(alvo, m[1] ?? '', m[2] ?? '');
  } else if ((m = /^drop constraint (?:if exists )?(\S+)/.exec(acao))) {
    alvo.e.restricoes.delete(chave(m[1] ?? ''));
  } else if ((m = /^add (?:column )?(if not exists )?(.+)$/.exec(acao))) {
    adicionarColuna(alvo, t, m);
  } else if ((m = /^drop (?:column )?(?:if exists )?("[^"]+"|\S+)/.exec(acao))) {
    t?.colunas.delete(chave(m[1] ?? ''));
  } else if ((m = /^(enable|disable) row level security/.exec(acao))) {
    alvo.e.rls.set(alvo.tabela, m[1] === 'enable');
  }
}

/** `cron.schedule` e `cron.unschedule` feitos na hora de aplicar a migration. */
function agenda(e: Esquema, i: Instrucao) {
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
}

/** Uma tabela da lista de um `alter publication` ou `create publication`. */
function itemDaPublicacao(tabelas: Map<string, string[] | null>, item: string, acao: string) {
  const t = /^(?:only )?("[^"]+"|[a-z0-9_.$]+)(?: \*)?(?: ?\((.*?)\))?/.exec(item);
  if (!t) return;
  const tabela = chave(t[1] ?? '');
  if (acao === 'drop') tabelas.delete(tabela);
  else tabelas.set(tabela, t[2] ? porVirgula(t[2]).map(chave) : null);
}

/** A publicação do Realtime: quem entra, e com quais colunas. */
function publicacao(e: Esquema, i: Instrucao) {
  const ops =
    /(?:alter publication ([a-z0-9_"]+) (add|drop|set) table|create publication ([a-z0-9_"]+) for table) (.+?)(?:;|$)/g;
  for (const op of i.normal.matchAll(ops)) {
    const nome = chave(op[1] ?? op[3] ?? '');
    let tabelas = e.publicacoes.get(nome);
    if (!tabelas) e.publicacoes.set(nome, (tabelas = new Map()));
    const acao = op[2] ?? 'set';
    if (acao === 'set') tabelas.clear();
    for (const item of porVirgula(op[4] ?? '')) itemDaPublicacao(tabelas, item, acao);
  }
}

// -----------------------------------------------------------------------------
// Os tratadores: um por instrução reconhecida, com o casamento do padrão dela
// -----------------------------------------------------------------------------

function criarFuncao(e: Esquema, m: RegExpExecArray, i: Instrucao) {
  const nome = chave(m[1] ?? '');
  // Função nova nasce executável por PUBLIC e pelos papéis do Supabase;
  // `create or replace` de uma que já existe mantém a ACL que ela tinha.
  if (!e.funcoes.has(nome)) e.execucao.set(nome, new Set(['PUBLIC', ...PAPEIS_DO_SUPABASE]));
  e.funcoes.set(nome, i);
}

function derrubarFuncao(e: Esquema, m: RegExpExecArray) {
  for (const f of porVirgula(m[1] ?? '')) {
    const nome = chave(f.replace(/ ?\(.*$/, ''));
    e.funcoes.delete(nome);
    e.execucao.delete(nome);
  }
}

function criarGatilho(e: Esquema, m: RegExpExecArray, i: Instrucao) {
  const funcao = new RegExp(`execute (?:function|procedure) ${NOME} ?\\(`).exec(i.normal)?.[1] ?? '';
  e.gatilhos.set(chave(m[1] ?? ''), { ...i, tabela: chave(m[2] ?? ''), funcao: chave(funcao) });
}

function derrubarGatilho(e: Esquema, m: RegExpExecArray) {
  e.gatilhos.delete(chave(m[1] ?? ''));
}

function criarTabela(e: Esquema, m: RegExpExecArray, i: Instrucao) {
  const n = i.normal;
  const nome = chave(m[2] ?? '');
  if (m[1] && e.tabelas.has(nome)) return;
  const abre = m[0].length - 1;
  const colunas = new Map<string, string>();
  e.tabelas.set(nome, { ...i, colunas });
  nasceTabela(e, nome);
  const alvo: NaTabela = { e, i, tabela: nome };
  for (const elemento of porVirgula(n.slice(abre + 1, fechamento(n, abre) - 1))) {
    elementoDeTabela(alvo, colunas, elemento);
  }
}

function alterarTabela(e: Esquema, m: RegExpExecArray, i: Instrucao) {
  const alvo: NaTabela = { e, i, tabela: chave(m[1] ?? '') };
  const t = e.tabelas.get(alvo.tabela);
  for (const acao of porVirgula(m[2] ?? '')) alteracao(alvo, t, acao);
}

function derrubarTabela(e: Esquema, m: RegExpExecArray) {
  for (const t of porVirgula(m[1] ?? '')) someTabela(e, chave(t));
}

function criarView(e: Esquema, m: RegExpExecArray, i: Instrucao) {
  const nome = chave(m[1] ?? '');
  if (!e.views.has(nome)) nasceTabela(e, nome);
  e.views.set(nome, i);
}

function criarIndice(e: Esquema, m: RegExpExecArray, i: Instrucao) {
  const nome = chave(m[2] ?? '');
  if (!(m[1] && e.indices.has(nome))) e.indices.set(nome, i);
}

function derrubarIndice(e: Esquema, m: RegExpExecArray) {
  for (const x of porVirgula(m[1] ?? '')) e.indices.delete(chave(x));
}

function criarEnum(e: Esquema, m: RegExpExecArray) {
  e.enums.set(chave(m[1] ?? ''), literais(m[2] ?? ''));
}

function acrescentarAoEnum(e: Esquema, m: RegExpExecArray) {
  const valor = literais(m[2] ?? '')[0] ?? '';
  const valores = e.enums.get(chave(m[1] ?? ''));
  if (valores && !valores.includes(valor)) valores.push(valor);
}

function derrubarTipo(e: Esquema, m: RegExpExecArray) {
  for (const x of porVirgula(m[1] ?? '')) e.enums.delete(chave(x));
}

function criarPolicy(e: Esquema, m: RegExpExecArray, i: Instrucao) {
  const tabela = chave(m[2] ?? '');
  e.policies.set(`${tabela}.${chave(m[1] ?? '')}`, { ...i, tabela });
}

function derrubarPolicy(e: Esquema, m: RegExpExecArray) {
  e.policies.delete(`${chave(m[2] ?? '')}.${chave(m[1] ?? '')}`);
}

function agendaEPublicacao(e: Esquema, _m: RegExpExecArray, i: Instrucao) {
  agenda(e, i);
  publicacao(e, i);
}

type Tratador = (e: Esquema, m: RegExpExecArray, i: Instrucao) => void;

/*
 * Cada instrução vai para o PRIMEIRO padrão da lista que casa com ela, e só
 * para ele. Hoje os padrões não se sobrepõem (cada um começa por palavras-chave
 * próprias), mas a ordem é a do antigo if/else-if e é parte da regra: um padrão
 * novo que se sobreponha a outro passa a depender dela, sem erro nenhum.
 */
const TRATADORES: [RegExp, Tratador][] = [
  [new RegExp(`^create (?:or replace )?function ${NOME} ?\\(`), criarFuncao],
  [/^drop function (?:if exists )?(.+?)(?: cascade| restrict)?;$/, derrubarFuncao],
  [
    new RegExp(`^create (?:or replace )?(?:constraint )?trigger ${NOME} (?:before|after|instead of) .+? on ${NOME}`),
    criarGatilho,
  ],
  [new RegExp(`^drop trigger (?:if exists )?${NOME} on `), derrubarGatilho],
  [
    new RegExp(`^create (?:(?:global |local )?(?:temporary |temp |unlogged ))?table (if not exists )?${NOME} ?\\(`),
    criarTabela,
  ],
  [new RegExp(`^alter table (?:if exists )?(?:only )?${NOME} (.+);$`), alterarTabela],
  [/^drop (?:table|view|materialized view) (?:if exists )?(.+?)(?: cascade| restrict)?;$/, derrubarTabela],
  [new RegExp(`^create (?:or replace )?(?:materialized )?view ${NOME}`), criarView],
  [new RegExp(`^create (?:unique )?index (?:concurrently )?(if not exists )?${NOME} on `), criarIndice],
  [/^drop index (?:concurrently )?(?:if exists )?(.+?)(?: cascade| restrict)?;$/, derrubarIndice],
  [new RegExp(`^create type ${NOME} as enum \\((.*)\\);$`), criarEnum],
  [new RegExp(`^alter type ${NOME} add value (?:if not exists )?('(?:[^']|'')*')`), acrescentarAoEnum],
  [/^drop type (?:if exists )?(.+?)(?: cascade| restrict)?;$/, derrubarTipo],
  [new RegExp(`^create policy ${NOME} on ${NOME}`), criarPolicy],
  [new RegExp(`^drop policy (?:if exists )?${NOME} on ${NOME}`), derrubarPolicy],
  [/^(grant|revoke) /, privilegios],
  // Corpo de função não entra aqui: lá dentro está o que ela faz quando RODA, e
  // não o que a migration fez ao ser aplicada. `comment on` também não — a
  // prosa pode citar `cron.schedule(...)` sem agendar nada.
  [/^(do|select|alter publication|create publication) /, agendaEPublicacao],
];

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
  for (const i of todas) {
    for (const [padrao, tratador] of TRATADORES) {
      const m = padrao.exec(i.normal);
      if (m) {
        tratador(e, m, i);
        break;
      }
    }
  }
  return e;
}
