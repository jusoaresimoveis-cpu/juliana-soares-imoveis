import type { Instrucao } from './instrucoes';

// Parte do leitor das migrations. Os testes importam por `esquema.ts`, que
// explica o leitor inteiro e reexporta o que daqui é público.

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

export interface Acesso {
  tabela: Set<string>;
  colunas: Map<string, Set<string>>;
}

export interface Esquema {
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
