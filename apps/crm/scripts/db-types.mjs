#!/usr/bin/env node
/**
 * Regera src/lib/database.types.ts a partir do banco ligado.
 *
 * Existe como script em vez de um redirecionamento no package.json porque o
 * shell abre (e portanto ESVAZIA) o arquivo de destino ANTES de rodar o
 * comando. Quando o `supabase gen types` falha — token ausente, projeto
 * pausado, rede fora — o resultado é o arquivo de tipos do projeto inteiro
 * substituído pela mensagem de erro. Aconteceu.
 *
 * Aqui a saída só toca o arquivo depois de o comando terminar bem E o conteúdo
 * se parecer com o que deveria ser.
 *
 * O token sai de .secrets/supabase.env, fora do repositório, se não estiver no
 * ambiente.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const destino = join(raiz, 'src/lib/database.types.ts');
const segredos = join(raiz, '../.secrets/supabase.env');

const env = { ...process.env };
if (!env.SUPABASE_ACCESS_TOKEN && existsSync(segredos)) {
  for (const linha of readFileSync(segredos, 'utf8').split(/\r?\n/)) {
    const corte = linha.indexOf('=');
    if (corte < 1 || linha.trim().startsWith('#')) continue;
    const chave = linha.slice(0, corte).trim();
    if (!env[chave]) env[chave] = linha.slice(corte + 1).trim().replace(/^["']|["']$/g, '');
  }
}

if (!env.SUPABASE_ACCESS_TOKEN) {
  console.error('SUPABASE_ACCESS_TOKEN ausente. Defina no ambiente ou em .secrets/supabase.env');
  process.exit(1);
}

let saida;
try {
  // `shell: true` é obrigatório no Windows: `npx` é um `.cmd`, e o Node se
  // recusa a executá-lo sem shell (EINVAL) desde a correção de segurança do
  // spawn. Isso faz o Node avisar do DEP0190 — argumentos concatenados sem
  // escape —, o que aqui não abre superfície: os cinco argumentos são
  // literais fixos e nada vem de fora.
  saida = execFileSync('npx', ['supabase', 'gen', 'types', 'typescript', '--linked'], {
    cwd: raiz,
    env,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    shell: true,
  });
} catch (erro) {
  console.error('Falhou ao gerar os tipos. O arquivo atual foi preservado.');
  console.error(String(erro.stderr || erro.message).slice(0, 800));
  process.exit(1);
}

// Rede de segurança: o CLI já devolveu JSON de erro com código de saída zero.
if (!saida.includes('export type Database') || saida.length < 2000) {
  console.error('Saída não parece um arquivo de tipos. O arquivo atual foi preservado.');
  console.error(saida.slice(0, 400));
  process.exit(1);
}

writeFileSync(destino, saida);
console.log(`tipos gerados: ${saida.length} bytes`);
