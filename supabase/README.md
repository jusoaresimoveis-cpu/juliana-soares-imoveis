# Supabase

Um projeto só (região São Paulo, plano gratuito) para o site e o CRM.

```
supabase/
├── config.toml     edge functions: quem exige sessão e quem não
├── migrations/     o schema, em ordem
├── functions/      edge functions (Deno): WhatsApp/uazapi, Meta, push, leads
├── seeds/          o que é da Juliana e não é schema (organização, funil, usuário)
└── testes/         RLS contra um Postgres de verdade (npm run test:rls -w apps/crm)
```

## As migrations

- `20260924000000_base.sql`: o schema do CRM de origem, **consolidado** das 152
  migrations dele e sem dado de cliente. Como foi feito e o que ele NÃO traz está
  no cabeçalho do arquivo. Não se edita: mudança é migration nova.
- `20260924000100_aluguel.sql`: venda e aluguel anual no mesmo imóvel, cada um
  com o seu valor, e as garantias da locação.
- `20260924000200_site.sql`: a leitura do site (`site_imoveis`) e o aviso de
  revalidação quando um imóvel muda.
- `20260924000300_tempo_real_do_sino.sql` e `20260924000400_cor_bronze.sql`: o
  sino em tempo real (com lista de colunas) e a cor padrão da marca.
- `20260925000000_numero_pessoal.sql`: com o número que também é pessoal, só
  entra conversa de cliente; a pessoal não é gravada.
- `20260925000100_proprietario_e_visitas.sql`: o dono do imóvel
  (`property_owners`, gravado por `definir_proprietario`) e as visitas à
  página de cada imóvel no site, por dia (`property_page_views`, contadas por
  `registrar_visita`).

Dado de cliente não entra em migration: fica em `seeds/`, para o mesmo schema
servir a outro cliente sem limpeza.

## O projeto no ar

`qwwsvyofjpoqpaniikke` (sa-east-1), ligado a esta pasta pelo `supabase link`.
Foi criado com a **exposição automática de tabelas desligada** e a **RLS
automática ligada**: tabela nova chega à API sem privilégio de leitura e
escrita, nem para o `service_role`, então toda migration que cria tabela
precisa do GRANT dela. Função nova nasce executável por todos (o padrão do
Postgres); feche com REVOKE quando não for para a API.

## Subir o projeto da Juliana (uma vez)

A senha do banco e os tokens não passam pelo chat nem pelo repositório.

1. **Entrar no Supabase pela CLI**, com a conta da Juliana (abre o navegador):

   ```bash
   npx supabase login
   ```

2. **Ligar a pasta ao projeto** (pede a senha do banco, definida na criação do
   projeto; o `ref` está na URL do painel):

   ```bash
   npx supabase link --project-ref <ref>
   ```

3. **Aplicar as migrations:**

   ```bash
   npx supabase db push
   ```

4. **Criar o usuário da Juliana** em Authentication → Users → Add user, com o
   e-mail `jusoaresimoveis@gmail.com` e uma senha dela. Depois, no SQL Editor,
   colar e rodar `seeds/juliana.sql`. Ele cria a organização, as etapas do funil
   e liga os usuários (a Juliana como gerente, a agência como admin); rodar de
   novo não duplica nada. Em Authentication → URL Configuration vão os endereços
   do CRM (`docs/DEPLOY.md`, "Os endereços").

5. **Segredos das edge functions** (Project Settings → Edge Functions →
   Secrets). `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` o próprio Supabase
   fornece.

   | Segredo | O que é |
   |---|---|
   | `APP_ORIGIN` | endereços do CRM, separados por vírgula, o principal primeiro: `https://app.julianasoaresimoveis.com.br,https://juliana-soares-crm.vercel.app,http://localhost:5173` |
   | `UAZAPI_BASE_URL` / `UAZAPI_ADMIN_TOKEN` | servidor da uazapi e o token de admin dele, que cria a instância |
   | `WHATSAPP_CRON_SECRET` | um segredo longo qualquer; o mesmo vai no Vault |
   | `PUSH_CRON_SECRET` | idem |
   | `META_CRON_SECRET` | idem |
   | `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | chaves do aviso no celular (`npx web-push generate-vapid-keys`); o subject é `mailto:` do dono do app |
   | `META_CAPI_TOKEN` | quando a Meta for ligada |

6. **Segredos do Vault** (SQL Editor). Quem chama os crons e o site é o banco,
   então estes moram lá:

   ```sql
   select vault.create_secret('https://<ref>.supabase.co/functions/v1', 'functions_base_url');
   select vault.create_secret('<o mesmo WHATSAPP_CRON_SECRET>', 'whatsapp_cron_secret');
   select vault.create_secret('<o mesmo PUSH_CRON_SECRET>', 'push_cron_secret');
   select vault.create_secret('<o mesmo META_CRON_SECRET>', 'meta_cron_secret');
   -- O site: o banco avisa quando um imóvel muda. Pelo endereço da Vercel, que
   -- não depende do DNS; o site deixa `/api/` fora do redirecionamento.
   select vault.create_secret('https://juliana-soares-site.vercel.app/api/revalidar', 'site_revalidar_url');
   select vault.create_secret('<o mesmo REVALIDACAO_SEGREDO da Vercel do site>', 'site_revalidar_segredo');
   ```

   Sem eles, os crons rodam e não fazem nada, e o site só se atualiza de hora em
   hora. Nada trava.

7. **Publicar as edge functions:**

   ```bash
   npx supabase functions deploy --use-api
   ```

## Como a base foi conferida

O banco base foi aplicado num Postgres 17.6 (o mesmo major do Supabase) e num
PGlite, com um calço para o que só o Supabase tem (auth, storage, vault, cron,
net). Comparado por `pg_dump` com as 152 migrations originais aplicadas do mesmo
jeito, o schema é idêntico, fora as duas diferenças do cabeçalho. Os 188 testes
de RLS passam contra ele.

As ferramentas estão em `ferramentas/banco`, com o passo a passo. No CI, o job
`rls` sobe o Supabase de verdade (`supabase start`, com Docker) e roda os mesmos
testes.
