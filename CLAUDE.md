# Contexto para o Claude

Site e CRM da Juliana Soares, corretora de imóveis (CRECI/SC 53396-F): venda e
aluguel anual em Itapema e Porto Belo (SC). Leia `README.md` e
`docs/DECISOES.md` antes de mudar arquitetura, URL ou regra de lead.

## Regras

- **Next.js 16 mudou APIs.** Antes de escrever código do site, leia o guia em
  `node_modules/next/dist/docs/` (veja `apps/site/AGENTS.md`).
- **Nome que atravessa camadas mora em `packages/contracts`.** Os valores de
  tipo, finalidade e situação são os mesmos do CRM de origem (TEXT + CHECK no
  banco). Nada de string solta repetida no site e no CRM.
- **Português no domínio**, como no CRM de origem: `carregarImoveisPublicados`,
  `urlDaListagem`. Colunas espelhadas do banco mantêm o nome em inglês
  (`price_cents`). Comentário explica o PORQUÊ, não o quê.
- **Dinheiro em centavos** (inteiro), nunca float.
- **URL pública é contrato:** mudar formato de URL indexada exige 301.
- **Nada inventado no site:** imóvel, depoimento, bio, promessa. Imóveis de
  exemplo existem só no `next dev`.
- **Nome, endereço e telefone** vêm de `apps/site/src/config/site.ts` e têm que
  bater com o Perfil da Empresa no Google.
- **O CRM do Igor (`F:\Projetos Claude\SelectusConnect2.0\crm`) é só leitura.**
- **Commit sai com a identidade da conta dona** (`git config --local`, ver
  `docs/DEPLOY.md`), senão a Vercel Hobby bloqueia o deploy. Confira com
  `git config --local user.email` antes de commitar.
- **Tabela nova precisa de GRANT explícito**, inclusive para o `service_role`: o
  projeto do Supabase nasceu com a exposição automática desligada, e tabela nova
  chega à API só com `Dxtm`. A RLS liga sozinha (dois gatilhos de evento).
- **A base do banco (`20260924000000_base.sql`) não se edita.** Mudança de schema é
  migration nova; teste que precisa ler SQL usa `supabase/testes/esquema.ts`.
- **O CRM é React 18 e o site React 19.** Não suba o React do CRM sem tirar o
  `dedupe` e os `paths` (ver `apps/crm/README.md`).
- **Dado de cliente não entra em migration.**

## Comandos

```bash
npm run dev:site
npm run dev:crm
npm test
npm run test:rls   # RLS; precisa de Postgres com as migrations (CI: Supabase local)
# aqui, sem Docker: ferramentas/banco (ver o README de lá; no Windows, de pasta sem acento)
npm run typecheck
npm run lint
npm run build:site
npm run build:crm
```
