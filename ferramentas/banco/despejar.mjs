// pg_dump (WASM) do banco salvo.
//   node despejar.mjs <pasta-do-banco> <arquivo-de-saída> [args do pg_dump...]
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { unaccent } from '@electric-sql/pglite/contrib/unaccent';
import { pgDump } from '@electric-sql/pglite-tools/pg_dump';

const [dir, saida, ...args] = process.argv.slice(2);
const pg = await PGlite.create({ dataDir: dir, extensions: { pgcrypto, pg_trgm, unaccent, btree_gist } });
const arquivo = await pgDump({ pg, args });
fs.writeFileSync(saida, await arquivo.text());
await pg.close();
console.log(saida, fs.statSync(saida).size, 'bytes');
