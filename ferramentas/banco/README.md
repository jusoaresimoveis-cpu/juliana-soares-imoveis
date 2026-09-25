# Banco local, sem Docker

As ferramentas que montaram e conferiram a base do CRM
(`supabase/migrations/20260924000000_base.sql`). Ficam fora dos workspaces do
monorepo de propósito: baixam o Postgres (uns 100 MB) e não servem ao build.

```bash
npm install
node verificar-pg17.mjs <repo>/supabase/migrations            # aplica e conta o que criou
node rls-local.mjs <repo>/supabase/migrations <repo>/apps/crm  # idem, e roda os testes de RLS
```

**No Windows, de uma pasta SEM acento.** O `initdb` do Postgres nativo não roda de
caminho com acento, e o deste projeto tem "Imóveis": copie esta pasta para
`%TEMP%\juliana-banco` (sem o `node_modules`), instale e rode de lá, passando os
caminhos do repositório. Os scripts avisam isso se forem chamados daqui.

O que só o Supabase tem (auth, storage, vault, cron, net e a publicação do
realtime) vem de `calco-supabase.sql`, só com o que as migrations citam. No CI,
o job `rls` faz o mesmo com o Supabase de verdade, em Docker.

## Como a base foi feita

1. `aplicar.mjs` roda as 152 migrations da origem, em ordem, num PGlite em
   disco. `ajustes.mjs` tira os blocos que são DADO da HV e falham num banco
   vazio (hoje, um só).
2. `montar-base.mjs` extrai o schema com o `pg_dump` do PGlite, troca cada
   função pelo texto original da migration que a definiu por último, tira o que
   o Supabase já tem, zera os privilégios padrão antes dos finais e junta
   storage, realtime, cron e os modelos de documento do sistema.
3. A conferência: aplicar a base num banco novo e comparar o `pg_dump` dos dois
   (`despejar.mjs`), e aplicar num Postgres 17 (`verificar-pg17.mjs`).

```bash
node aplicar.mjs "<origem>/supabase/migrations" ./dados-origem
node montar-base.mjs ./dados-origem ./base.dump.sql "<origem>/supabase/migrations"
```

Para trazer uma novidade da origem depois disso, o caminho é uma migration nova
com a diferença, e não refazer a base: ela não se edita.
