// Aplica, em ordem, os .sql de uma pasta num PGlite novo (com o calço do
// Supabase) e salva o banco em disco.
//   node aplicar.mjs <pasta-das-migrations> <pasta-do-banco>
import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { unaccent } from '@electric-sql/pglite/contrib/unaccent';
import { AJUSTES } from './ajustes.mjs';

const [origem, destino] = process.argv.slice(2);
fs.rmSync(destino, { recursive: true, force: true });

const pg = await PGlite.create({ dataDir: destino, extensions: { pgcrypto, pg_trgm, unaccent, btree_gist } });
await pg.exec(fs.readFileSync(new URL('./calco-supabase.sql', import.meta.url), 'utf8'));

const arquivos = fs.readdirSync(origem).filter((f) => f.endsWith('.sql')).sort();
for (const f of arquivos) {
  const original = fs.readFileSync(path.join(origem, f), 'utf8');
  const sql = (AJUSTES[f] ? AJUSTES[f](original) : original)
    // Extensões que só existem no Supabase: o calço já criou o que elas criam.
    .replace(/create extension if not exists (pg_cron|pg_net|supabase_vault)\b[^;]*;/gi, 'select 1;');
  try {
    await pg.exec(sql);
  } catch (e) {
    console.error(`ERRO em ${f}: ${e.message}`);
    if (e.position) console.error(`perto de: ${sql.slice(Math.max(0, e.position - 200), Number(e.position) + 100)}`);
    if (e.where) console.error(`onde: ${e.where}`);
    await pg.close();
    process.exit(1);
  }
}
console.log(`${arquivos.length} arquivos aplicados`);
await pg.close();
