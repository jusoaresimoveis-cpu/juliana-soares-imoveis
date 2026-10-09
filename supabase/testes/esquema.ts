import { fechamento, literais } from './instrucoes';
import type { Instrucao } from './instrucoes';
import { oEsquema } from './montagem';
import type { Gatilho, Policy, Privilegios, Restricao, Tabela, TarefaAgendada } from './tipos-do-esquema';

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

// O leitor mora nos módulos ao lado; quem testa importa daqui, como sempre.
export { literais, todasAsInstrucoes } from './instrucoes';
export type { Instrucao } from './instrucoes';
export { todasAsMigracoes } from './migracoes';
export type { Migracao } from './migracoes';
export { colapsado, normalizado, semComentarios } from './sql-texto';
export type { Gatilho, Policy, Privilegios, Restricao, Tabela, TarefaAgendada } from './tipos-do-esquema';

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
