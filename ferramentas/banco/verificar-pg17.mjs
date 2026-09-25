// Aplica o calço + os .sql de uma pasta num Postgres 17.6 de verdade (o mesmo
// major do Supabase), para pegar sintaxe que só o 18 do PGlite aceita.
//   npm run pg17                                  (as migrations de supabase/)
//   node verificar-pg17.mjs <pasta-das-migrations>
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
import { AJUSTES } from './ajustes.mjs';
import { exigirCaminhoSemAcento } from './sem-acento.mjs';

const aqui = path.dirname(fileURLToPath(import.meta.url));
exigirCaminhoSemAcento(aqui);
const origem = process.argv[2] ?? path.resolve(aqui, '../../supabase/migrations');
const dados = path.join(os.tmpdir(), 'juliana-pg17');
const PORTA = 54329;

fs.rmSync(dados, { recursive: true, force: true });
const servidor = new EmbeddedPostgres({
  databaseDir: dados,
  user: 'postgres',
  password: 'postgres',
  port: PORTA,
  persistent: false,
  initdbFlags: ['--encoding=UTF8', '--locale=C'],
  onLog: () => {},
});
await servidor.initialise();
await servidor.start();
const cliente = new pg.Client({ host: 'localhost', port: PORTA, user: 'postgres', password: 'postgres', database: 'postgres' });
await cliente.connect();
let codigo = 0;
try {
  const { rows } = await cliente.query('select version()');
  console.log(rows[0].version);
  await cliente.query(fs.readFileSync(path.join(aqui, 'calco-supabase.sql'), 'utf8'));
  for (const f of fs.readdirSync(origem).filter((f) => f.endsWith('.sql')).sort()) {
    const bruto = fs.readFileSync(path.join(origem, f), 'utf8');
    const sql = (AJUSTES[f] ? AJUSTES[f](bruto) : bruto).replace(
      /create extension if not exists (pg_cron|pg_net|supabase_vault)\b[^;]*;/gi,
      'select 1;',
    );
    try {
      await cliente.query(sql);
      console.log('ok', f);
    } catch (e) {
      console.error(`ERRO em ${f}: ${e.message}`);
      if (e.position) console.error(sql.slice(Math.max(0, e.position - 300), Number(e.position) + 100));
      if (e.where) console.error(e.where);
      codigo = 1;
      break;
    }
  }
  const { rows: n } = await cliente.query(`select
    (select count(*) from pg_tables where schemaname = 'public') as tabelas,
    (select count(*) from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public') as funcoes,
    (select count(*) from pg_policies where schemaname in ('public', 'storage')) as politicas,
    (select count(*) from cron.job) as tarefas`);
  console.log(n[0]);
} finally {
  await cliente.end();
  await servidor.stop();
}
process.exit(codigo);
