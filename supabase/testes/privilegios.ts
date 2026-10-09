import { chave, porVirgula } from './instrucoes';
import type { Instrucao } from './instrucoes';
import type { Acesso, Esquema } from './tipos-do-esquema';

// Parte do leitor das migrations. Os testes importam por `esquema.ts`, que
// explica o leitor inteiro e reexporta o que daqui é público.

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
export const PAPEIS_DO_SUPABASE = ['anon', 'authenticated', 'service_role'];

function papel(nome: string): string {
  const limpo = nome.replace(/"/g, '').replace(/^group /, '').trim();
  return limpo === 'public' ? 'PUBLIC' : limpo;
}

function acessoDe(e: Esquema, tabela: string, quem: string): Acesso {
  let porPapel = e.acessos.get(tabela);
  if (!porPapel) e.acessos.set(tabela, (porPapel = new Map()));
  let a = porPapel.get(quem);
  if (!a) porPapel.set(quem, (a = { tabela: new Set(), colunas: new Map() }));
  return a;
}

export function nasceTabela(e: Esquema, nome: string) {
  for (const quem of PAPEIS_DO_SUPABASE) {
    for (const p of PRIVILEGIOS_DE_TABELA) acessoDe(e, nome, quem).tabela.add(p);
  }
}

interface ItemDePrivilegio {
  nome: string;
  colunas: string[] | null;
}

/** Um GRANT (`concede`) ou um REVOKE já lido: para quem, e o quê. */
interface Concessao {
  concede: boolean;
  papeis: string[];
  itens: ItemDePrivilegio[];
}

/** As funções e as tabelas que o alvo de um GRANT ou REVOKE nomeia. */
function alvosDoPrivilegio(e: Esquema, alvo: string): { funcoes: string[]; tabelas: string[] } {
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
  return { funcoes, tabelas };
}

function aplicarExecucao(e: Esquema, funcoes: string[], { concede, papeis }: Concessao) {
  for (const f of funcoes) {
    let quem = e.execucao.get(f);
    if (!quem) e.execucao.set(f, (quem = new Set()));
    for (const p of papeis) {
      if (concede) quem.add(p);
      else quem.delete(p);
    }
  }
}

/** Um item (`select`, `update (a, b)`, `all`) no acesso de um papel a uma tabela. */
function aplicarItem(a: Acesso, it: ItemDePrivilegio, concede: boolean) {
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

function aplicarAcesso(e: Esquema, tabelas: string[], { concede, papeis, itens }: Concessao) {
  for (const t of tabelas) {
    for (const p of papeis) {
      const a = acessoDe(e, t, p);
      for (const it of itens) aplicarItem(a, it, concede);
    }
  }
}

/** GRANT e REVOKE, nas duas formas: a do pg_dump e a escrita à mão. */
export function privilegios(e: Esquema, _m: RegExpExecArray, i: Instrucao) {
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

  const { funcoes, tabelas } = alvosDoPrivilegio(e, alvo);
  const concessao: Concessao = { concede, papeis, itens };
  if (itens.some((it) => it.nome === 'execute' || it.nome === 'all')) aplicarExecucao(e, funcoes, concessao);
  aplicarAcesso(e, tabelas, concessao);
}
