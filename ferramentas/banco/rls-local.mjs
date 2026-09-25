// Os testes de RLS do CRM contra um Postgres 17 de verdade (embedded, sem
// Docker), com o calço do Supabase e as migrations do repositório.
//   node rls-local.mjs <pasta-das-migrations> <pasta-do-crm>
//
// No CI quem faz isso é o job `rls`, com o Supabase de verdade. Ver o README
// sobre rodar no Windows (o Postgres nativo não roda de pasta com acento).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
import { AJUSTES } from './ajustes.mjs';
import { exigirCaminhoSemAcento } from './sem-acento.mjs';

const aqui = path.dirname(fileURLToPath(import.meta.url));
exigirCaminhoSemAcento(aqui);
const [origem, crm] = process.argv.slice(2);
if (!origem || !crm) {
  console.error('uso: node rls-local.mjs <pasta-das-migrations> <pasta-do-crm>');
  process.exit(2);
}
const dados = path.join(os.tmpdir(), 'juliana-pg17-rls');
const PORTA = 54330;

fs.rmSync(dados, { recursive: true, force: true });
const servidor = new EmbeddedPostgres({
  databaseDir: dados,
  user: 'postgres',
  password: 'postgres',
  port: PORTA,
  persistent: false,
  // Sem isto o Windows cria o cluster em WIN1252 e o primeiro acento derruba.
  initdbFlags: ['--encoding=UTF8', '--locale=C'],
  onLog: () => {},
});
await servidor.initialise();
await servidor.start();
let codigo = 1;
try {
  const c = new pg.Client({ host: 'localhost', port: PORTA, user: 'postgres', password: 'postgres', database: 'postgres' });
  await c.connect();
  await c.query(fs.readFileSync(path.join(aqui, 'calco-supabase.sql'), 'utf8'));
  for (const f of fs.readdirSync(origem).filter((f) => f.endsWith('.sql')).sort()) {
    const bruto = fs.readFileSync(path.join(origem, f), 'utf8');
    await c.query(
      (AJUSTES[f] ? AJUSTES[f](bruto) : bruto)
        // Extensões que só existem no Supabase: o calço já criou o que elas criam.
        .replace(/create extension if not exists (pg_cron|pg_net|supabase_vault)\b[^;]*;/gi, 'select 1;'),
    );
  }
  await c.end();
  codigo = await new Promise((resolve) => {
    const filho = spawn('npx vitest run --config vitest.rls.config.ts', {
      cwd: crm,
      env: { ...process.env, DATABASE_URL: `postgresql://postgres:postgres@localhost:${PORTA}/postgres` },
      stdio: 'inherit',
      shell: true,
    });
    filho.on('exit', (status) => resolve(status ?? 1));
  });
} finally {
  await servidor.stop();
}
process.exit(codigo);
