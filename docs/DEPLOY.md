# Deploy

O site publica pela **integração Git da Vercel**, na conta da Juliana (plano
Hobby, gratuito). Projeto `juliana-soares-site`, Root Directory `apps/site`.
Todo push na `main` vai para produção:
https://julianasoaresimoveis.com.br

O GitHub Actions (`.github/workflows/verificar.yml`) roda testes, tipos e lint
em cada push. Ele **não** segura o deploy, só mostra o X vermelho no commit
quando algo quebrou.

## O CRM

Um segundo projeto na mesma conta Vercel da Juliana (o Hobby aceita vários),
ligado ao mesmo repositório:

| Campo | Valor |
|---|---|
| Root Directory | `apps/crm` |
| Framework | Vite (o `apps/crm/vercel.json` já diz build e saída) |
| Variáveis | as de `apps/crm/.env.example` |

A mesma regra do autor do commit vale para ele. O CRM é todo atrás de login e
não indexa (`noindex` no HTML, no cabeçalho e no `robots.txt`).

## Os endereços

| Endereço | Projeto na Vercel |
|---|---|
| `julianasoaresimoveis.com.br` | `juliana-soares-site` |
| `www.julianasoaresimoveis.com.br` | `juliana-soares-site`, redireciona para o de cima |
| `app.julianasoaresimoveis.com.br` | `juliana-soares-crm` |

O DNS é do Cloudflare, com os três registros em **DNS only** (nuvem cinza). O
proxy do Cloudflare (nuvem laranja) a Vercel desaconselha: o certificado dela
pode deixar de renovar e tudo passa por duas CDNs. **Não apagar** o TXT
`google-site-verification`: é ele que mantém o domínio no Search Console.

Os `.vercel.app` de produção redirecionam (308) para o domínio: o do site em
`apps/site/next.config.ts`, menos `/api/`, por onde o banco avisa a revalidação;
o do CRM em `apps/crm/vercel.json`. Sessão, app instalado e inscrição de push
são guardados por endereço no navegador: com o CRM num endereço só, cada coisa
existe uma vez.

O que depende do endereço do CRM, fora do código:

- `APP_ORIGIN`, nos segredos das edge functions: o domínio primeiro (é o que
  responde a quem não está na lista), depois o `.vercel.app` e o localhost;
- Supabase, Authentication → URL Configuration: Site URL
  `https://app.julianasoaresimoveis.com.br`; Redirect URLs
  `https://app.julianasoaresimoveis.com.br/**` e `http://localhost:5173/**`
  (o link de redefinir senha volta para `/redefinir`);
- `VITE_PUBLIC_SITE_URL` do projeto do CRM, que aponta para o site. É lida no
  build: trocar pede um deploy novo.

## As variáveis do site

As de `apps/site/.env.example`, em Settings → Environment Variables do projeto
`juliana-soares-site`. Sem elas o site continua no ar, só sem imóvel.

## A regra que trava o deploy: quem assina o commit

O repositório é privado e tem duas contas no GitHub:

| Conta | Papel no repo | Na Vercel |
|---|---|---|
| `jusoaresimoveis-cpu` | dona | dona do projeto |
| `gutobuyno` | colaborador | não é membro |

O Hobby não aceita colaborador em repositório privado. A Vercel não olha quem
fez o `push`, olha o **autor do commit**, e bloqueia quando ele não é a conta
dona:

> Git author gutobuyno must have access to the project on Vercel to create deployments.

Publicar pelo GitHub Actions com o token da Juliana também não resolve: a CLI
leva o autor do commit junto, e a Vercel bloqueia do mesmo jeito (testado em
24/09/2026).

Por isso os commits deste repositório saem com a identidade da conta dona. A
configuração vale só para este repositório e **não vem com o clone**: em máquina
nova, repita.

```bash
git config --local user.name  "jusoaresimoveis-cpu"
git config --local user.email "332525480+jusoaresimoveis-cpu@users.noreply.github.com"
```

É o endereço "noreply" do GitHub da conta dela: o GitHub sempre liga esse
endereço à conta, e o Gmail dela não aparece no histórico. É o mesmo arranjo do
CRM do Igor.

### Se um commit sair bloqueado

A Vercel avalia só o autor do commit do topo, e o deploy publica a árvore
inteira. Não precisa reescrever histórico: um commit novo com o autor certo
publica tudo o que está atrás dele.

## Conferir se um deploy subiu

O `/versao` responde o commit que está no ar:

```bash
curl -s https://julianasoaresimoveis.com.br/versao
# {"commit":"abc1234","ambiente":"production"}
```

E o status que a Vercel registra no GitHub, com o motivo quando ela bloqueia:

```bash
gh api repos/jusoaresimoveis-cpu/juliana-soares-imoveis/commits/<sha>/statuses \
  --jq '.[] | "\(.state) \(.description)"'
```

## As funções e o banco do Supabase

A Vercel não publica nada do Supabase: migration e função de borda sobem daqui.

- **Migration:** `npx supabase db push`, com a senha do banco
  (`SUPABASE_DB_PASSWORD` em `.secrets/supabase.env`).
- **Função de borda, tipos do banco, segredos:** passam pela API de gestão do
  Supabase e precisam de um token da conta dona do projeto. Ele fica em
  `.secrets/supabase.env` como `SUPABASE_ACCESS_TOKEN`, e vale só para o
  comando, sem trocar o login da CLI desta máquina:

```bash
set -a; . ./.secrets/supabase.env; set +a
npx supabase functions deploy meta-trabalhador --project-ref qwwsvyofjpoqpaniikke
```

O token se gera e se revoga em supabase.com → Account preferences → Access
Tokens.

## Antes de faturar

Este arranjo existe para ficar no plano gratuito, e tem limites:

- **Vercel Hobby** é, pelos termos da Vercel, para uso pessoal e não comercial.
  A Vercel pode suspender projeto comercial no Hobby. O Pro elimina esse risco e
  este arranjo de autor.
- **Supabase gratuito** pausa o projeto depois de 7 dias sem uso e não tem
  backup automático. Com o CRM em uso diário ele não pausa, mas o backup
  precisa de uma rotina nossa.
