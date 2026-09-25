// Monta a migration base do clone a partir do banco com as 152 migrations do
// CRM de origem aplicadas (PGlite em disco).
//   node montar-base.mjs <pasta-do-banco> <arquivo-de-saída> <pasta-das-migrations-da-origem>
import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { unaccent } from '@electric-sql/pglite/contrib/unaccent';
import { pgDump } from '@electric-sql/pglite-tools/pg_dump';

const [dir, saida, pastaDaOrigem] = process.argv.slice(2);
const lf = (t) => t.split('\r\n').join('\n');
const pg = await PGlite.create({ dataDir: dir, extensions: { pgcrypto, pg_trgm, unaccent, btree_gist } });

let esquema = lf(await (await pgDump({ pg, args: ['--schema-only', '--schema=public', '--no-owner'] })).text());

// ---------------------------------------------------------------------------
// Funções no texto ORIGINAL da migration que as definiu por último, e não na
// forma que o pg_dump reescreve. O corpo é o mesmo byte a byte (é ele que
// localiza o original); muda o cabeçalho, que volta a ser o de quem escreveu.
// ---------------------------------------------------------------------------
const migracoes = fs
  .readdirSync(pastaDaOrigem)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => lf(fs.readFileSync(path.join(pastaDaOrigem, f), 'utf8')));

const { rows: funcoes } = await pg.query(`
  select p.proname as nome, p.prosrc as corpo
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
   order by 1`);

function textoOriginal(nome, corpo) {
  const cabecalhoDaFuncao = new RegExp(`function\\s+(public\\.)?"?${nome}"?\\s*\\(`, 'i');
  for (let i = migracoes.length - 1; i >= 0; i--) {
    const t = migracoes[i];
    for (let pos = t.lastIndexOf(corpo); pos >= 0; pos = pos > 0 ? t.lastIndexOf(corpo, pos - 1) : -1) {
      const fechaTag = pos - 1;
      if (t[fechaTag] !== '$') continue;
      const abreTag = t.lastIndexOf('$', fechaTag - 1);
      const tag = t.slice(abreTag, fechaTag + 1);
      if (t.slice(pos + corpo.length, pos + corpo.length + tag.length) !== tag) continue;
      const antes = t.slice(0, abreTag).toLowerCase();
      const ini = Math.max(antes.lastIndexOf('create or replace function'), antes.lastIndexOf('create function'));
      if (ini < 0 || !cabecalhoDaFuncao.test(t.slice(ini, abreTag))) continue;
      return t.slice(ini, t.indexOf(';', pos + corpo.length + tag.length) + 1);
    }
  }
  return null;
}

const semOriginal = [];
for (const { nome, corpo: bruto } of funcoes) {
  const corpo = lf(bruto);
  const inicioDump = esquema.indexOf(`CREATE FUNCTION public.${nome}(`);
  if (inicioDump < 0) throw new Error(`função fora do dump: ${nome}`);
  const corpoDump = esquema.indexOf(corpo, inicioDump);
  const fechaTagDump = corpoDump - 1;
  const tagDump = esquema.slice(esquema.lastIndexOf('$', fechaTagDump - 1), fechaTagDump + 1);
  if (esquema.slice(corpoDump + corpo.length, corpoDump + corpo.length + tagDump.length) !== tagDump) {
    throw new Error(`corpo do dump não bate: ${nome}`);
  }
  const fimDump = esquema.indexOf(';', corpoDump + corpo.length + tagDump.length) + 1;
  const original = textoOriginal(nome, corpo);
  if (original) esquema = esquema.slice(0, inicioDump) + original + esquema.slice(fimDump);
  else semOriginal.push(nome);
}
console.log(`funções no texto original: ${funcoes.length - semOriginal.length}/${funcoes.length}`, semOriginal);

// ---------------------------------------------------------------------------
// Limpeza do dump
// ---------------------------------------------------------------------------
const trocar = (de, para) => {
  if (!esquema.includes(de)) throw new Error(`trecho não encontrado: ${de.slice(0, 60)}`);
  esquema = esquema.split(de).join(para);
};

// O public já existe no Supabase, com os privilégios padrão dele.
trocar('CREATE SCHEMA public;\n', '');
trocar("COMMENT ON SCHEMA public IS 'standard public schema';\n", '');
esquema = esquema.replace(
  /\n--\n-- Name: DEFAULT PRIVILEGES FOR [A-Z]+; Type: DEFAULT ACL;[^\n]*\n--\n\n(ALTER DEFAULT PRIVILEGES[^\n]*\n)+/g,
  () => '\n',
);
esquema = esquema.replace(/-- Dumped (from|by)[^\n]*\n/g, () => '');

// Nome de gente e telefone de verdade em comentário de função.
trocar(
  'bastava o Igor\n       * responder para a conversa passar a se chamar "Igor Amaral". Cinco\n       * telefones diferentes, cinco pessoas diferentes, todas com o nome dele',
  'bastava o corretor\n       * responder para a conversa passar a se chamar com o nome dele. Cinco\n       * telefones diferentes, cinco pessoas diferentes, todas com o mesmo nome',
);
trocar('(554791165644)', '(554788887777)');
trocar('(5547991165644)', '(5547988887777)');

// Privilégios: o Supabase dá tudo aos três papéis da API na criação de cada
// objeto. As linhas do dump são os privilégios FINAIS da origem; sem zerar os
// padrões antes, uma função que a origem fechou para o `anon` voltaria aberta.
const PRIMEIRA_ACL = '--\n-- Name: SCHEMA public; Type: ACL;';
trocar(
  PRIMEIRA_ACL,
  [
    '--',
    '-- Privilégios: zera o que os padrões do Supabase deram na criação e aplica',
    '-- só os finais da origem, logo abaixo.',
    '--',
    '',
    'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated, service_role;',
    'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated, service_role;',
    'REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated, service_role;',
    '',
    '',
    PRIMEIRA_ACL,
  ].join('\n'),
);

// ---------------------------------------------------------------------------
// Os modelos de documento do sistema (organization_id nulo, is_system): são
// do produto, não de cliente. Sem eles a tela de documentos nasce vazia.
// ---------------------------------------------------------------------------
const dadosDosModelos = lf(
  await (await pgDump({ pg, args: ['--data-only', '--table=public.document_templates', '--column-inserts'] })).text(),
);
const modelos = dadosDosModelos.slice(dadosDosModelos.indexOf('INSERT INTO'), dadosDosModelos.lastIndexOf(');') + 2);
if (!modelos.startsWith('INSERT INTO public.document_templates')) throw new Error('modelos não encontrados');

// ---------------------------------------------------------------------------
// Fora do public: storage (buckets e policies), realtime e cron.
// ---------------------------------------------------------------------------
await pg.exec("set search_path = ''");
const literal = (v) => (v === null ? 'NULL' : `'${String(v).replaceAll("'", "''")}'`);

const { rows: buckets } = await pg.query(
  `select id, name, public, file_size_limit, allowed_mime_types from storage.buckets order by id`,
);
const { rows: politicas } = await pg.query(`
  select policyname, permissive, roles, cmd, qual, with_check
    from pg_policies
   where schemaname = 'storage' and tablename = 'objects'
     -- Sobras da 009: a 021 quis trocá-las pelas versões por lead, mas apagou
     -- pelo nome errado (_select/_insert). Como policies permissivas se somam
     -- (OR), as duas deixavam qualquer corretor da organização ler e gravar
     -- documento de lead que não é dele.
     and policyname not in ('documentos_read', 'documentos_write')
   order by policyname`);
const { rows: realtime } = await pg.query(
  // Com a LISTA DE COLUNAS e o filtro de linha: a origem publica só seis colunas
  // de whatsapp_messages (a 132), para o corpo e o `raw` da mensagem não irem
  // a toda aba aberta. Publicar sem a lista mandaria tudo.
  `select schemaname, tablename, attnames, rowfilter from pg_publication_tables where pubname = 'supabase_realtime' order by 2`,
);
const { rows: tarefas } = await pg.query(`select jobname, schedule, command from cron.job order by jobid`);
// Objeto do banco inteiro, e por isso fora do dump do public: o que liga a RLS
// sozinho em toda tabela nova (a 001 da origem).
const { rows: gatilhosDeEvento } = await pg.query(`
  select evtname, evtevent, evtfoid::regprocedure::text as funcao, evttags
    from pg_event_trigger
   order by evtname`);
await pg.close();

const sqlDeBucket = buckets
  .map((b) => {
    const tipos = b.allowed_mime_types ? `ARRAY[${b.allowed_mime_types.map(literal).join(', ')}]` : 'NULL';
    return [
      'INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)',
      `VALUES (${literal(b.id)}, ${literal(b.name)}, ${b.public}, ${b.file_size_limit}, ${tipos})`,
      'ON CONFLICT (id) DO UPDATE SET public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;',
    ].join('\n');
  })
  .join('\n\n');

const sqlDePolitica = politicas
  .map((p) => {
    const papeis = p.roles.map((r) => (r === 'public' ? 'PUBLIC' : r)).join(', ');
    let s = `CREATE POLICY ${p.policyname} ON storage.objects AS ${p.permissive} FOR ${p.cmd} TO ${papeis}`;
    if (p.qual) s += `\n  USING (${p.qual})`;
    if (p.with_check) s += `\n  WITH CHECK (${p.with_check})`;
    return `DROP POLICY IF EXISTS ${p.policyname} ON storage.objects;\n${s};`;
  })
  .join('\n\n');

const sqlDeRealtime = realtime
  .map((t) => {
    const colunas = t.attnames ? ` (${t.attnames.join(', ')})` : '';
    const filtro = t.rowfilter ? ` WHERE (${t.rowfilter})` : '';
    return `ALTER PUBLICATION supabase_realtime ADD TABLE ${t.schemaname}.${t.tablename}${colunas}${filtro};`;
  })
  .join('\n');

const sqlDeGatilhosDeEvento = [
  'DO $gatilhos_de_evento$',
  'BEGIN',
  ...gatilhosDeEvento.flatMap((g) => [
    `  DROP EVENT TRIGGER IF EXISTS ${g.evtname};`,
    `  CREATE EVENT TRIGGER ${g.evtname} ON ${g.evtevent}` +
      (g.evttags ? ` WHEN TAG IN (${g.evttags.map(literal).join(', ')})` : '') +
      ` EXECUTE FUNCTION ${g.funcao};`,
  ]),
  'EXCEPTION WHEN insufficient_privilege THEN',
  "  RAISE NOTICE 'Sem privilégio para criar event trigger: o resto está aplicado.';",
  'END $gatilhos_de_evento$;',
].join('\n');

const sqlDeCron = [
  'DO $agenda$',
  'BEGIN',
  ...tarefas.map((t) => `  PERFORM cron.schedule(${literal(t.jobname)}, ${literal(t.schedule)}, $cron$${t.command}$cron$);`),
  'EXCEPTION WHEN insufficient_privilege THEN',
  "  RAISE NOTICE 'Sem privilégio para agendar: rode os cron.schedule deste arquivo à mão.';",
  'END $agenda$;',
].join('\n');

const cabecalho = `-- =============================================================================
-- BASE DO CRM
--
-- O schema do CRM de origem (SelectusConnect), consolidado: as 152 migrations
-- dele, até a de 25/09/2026, aplicadas em ordem num banco vazio e extraídas com
-- pg_dump. As funções estão no texto original da migration que as definiu por
-- último (o pg_dump reescreveria o cabeçalho); o resto está como o pg_dump
-- escreve.
--
-- Sem dado de cliente: nem organização, nem etapa de funil. Isso vem do seed de
-- cada cliente (supabase/seeds). Os modelos de documento do sistema entram,
-- porque são do produto.
--
-- Duas diferenças em relação à origem, de propósito:
--  - as policies documentos_read e documentos_write do storage não existem
--    aqui (ver o comentário antes das policies, no fim do arquivo);
--  - os comentários de função não citam nome nem telefone de gente de verdade.
--
-- Mudança de schema daqui em diante é migration nova. Este arquivo não se edita.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;
`;

const rodape = `

-- =============================================================================
-- Modelos de documento do sistema (de todas as organizações)
-- =============================================================================

${modelos}

-- =============================================================================
-- Storage
-- =============================================================================

${sqlDeBucket}

-- As policies documentos_read e documentos_write da origem ficaram de fora: a
-- migration que as trocava pelas versões por lead (documentos_select e
-- documentos_insert) apagou pelo nome errado, e as duas antigas continuaram
-- valendo. Policies permissivas se somam, então qualquer corretor da
-- organização lia e gravava documento de lead que não é dele.

${sqlDePolitica}

-- =============================================================================
-- Realtime
-- =============================================================================

${sqlDeRealtime}

-- =============================================================================
-- Tarefas agendadas (pg_cron)
--
-- As funções chamadas aqui leem do Vault o endereço das edge functions e os
-- segredos dos crons (ver supabase/README.md). Sem eles, rodam e não fazem nada.
-- =============================================================================

${sqlDeCron}

-- =============================================================================
-- Gatilho de evento: liga a RLS sozinho em toda tabela nova do public. Se o
-- papel que aplica a migration não puder criar event trigger, fica só o aviso.
-- =============================================================================

${sqlDeGatilhosDeEvento}

-- =============================================================================
-- Fim: devolve a sessão como estava. O pg_dump liga estes ajustes no começo do
-- arquivo; sem desligar, a migration seguinte (e, num SQL Editor, o resto da
-- sessão) herdaria search_path vazio e RLS desligado.
-- =============================================================================

RESET statement_timeout;
RESET lock_timeout;
RESET idle_in_transaction_session_timeout;
RESET transaction_timeout;
RESET search_path;
RESET check_function_bodies;
RESET xmloption;
RESET client_min_messages;
RESET row_security;
RESET default_tablespace;
RESET default_table_access_method;
`;

fs.writeFileSync(saida, cabecalho + esquema.trim() + '\n' + rodape);
console.log(saida, fs.statSync(saida).size, 'bytes', {
  buckets: buckets.length,
  politicas: politicas.length,
  realtime: realtime.length,
  tarefas: tarefas.length,
  gatilhosDeEvento: gatilhosDeEvento.length,
});
