# Juliana Soares Corretora de Imóveis

Site público e CRM da corretora Juliana Soares (CRECI/SC 53396-F), que atende
**venda e aluguel anual em Itapema e Porto Belo (SC)**.

- **Site** — vitrine de imóveis focada em SEO e celular: páginas por imóvel,
  por finalidade, tipo, cidade e bairro, com botão de WhatsApp rastreado.
- **CRM** — clone adaptado do SelectusConnect, com funil de aluguel,
  atribuição de origem (Meta, Google, Marketplace, OLX/ZAP/VivaReal) e WhatsApp.

Os dois leem o **mesmo banco** (Supabase).

## Estrutura

```
apps/
  site/        Next.js 16 — o site público (julianasoaresimoveis.com.br)
  crm/         o CRM (entra aqui quando o clone for feito)
packages/
  contracts/   nomes compartilhados: tipos de imóvel, finalidades, cidades, slugs
supabase/      migrations e funções do banco (entra com o clone do CRM)
docs/          decisões e o porquê delas
```

## Rodando

Node 20.9 ou mais novo.

```bash
npm install
npm run dev:site      # http://localhost:3000, com imóveis de exemplo
npm test              # testes de todos os pacotes
npm run typecheck
npm run lint
npm run build:site
```

No `next dev` o site mostra imóveis **de exemplo** (marcados com `[EXEMPLO]`).
Em build de produção eles nunca aparecem: sem banco, o site sai sem imóveis.

## Deploy

Vercel, na conta da Juliana: projeto `juliana-soares-site`, Root Directory
`apps/site`. Todo push na `main` publica em produção:
https://juliana-soares-site.vercel.app (fora do Google até o lançamento; veja
`SITE_NO_AR` em `docs/DECISOES.md`).

Para saber qual commit está no ar: `/versao`.

## Onde mexer

| Quero mudar... | Arquivo |
|---|---|
| Nome, telefone, endereço, CRECI, redes | `apps/site/src/config/site.ts` |
| Cores e fonte | `apps/site/src/app/globals.css` (tokens) e `layout.tsx` |
| Tipos de imóvel, finalidades, cidades | `packages/contracts/src/` |
| Formato das URLs de listagem | `apps/site/src/lib/imoveis/listagem.ts` |
| Dados estruturados (schema.org) | `apps/site/src/lib/seo/schema.ts` |

Decisões de arquitetura e pendências: [docs/DECISOES.md](docs/DECISOES.md).
