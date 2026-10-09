import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Parte do leitor das migrations. Os testes importam por `esquema.ts`, que
// explica o leitor inteiro e reexporta o que daqui é público.

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
