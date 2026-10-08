# CRM

O CRM da Juliana: leads, funil, imóveis (venda e aluguel anual), agenda de
visitas, conversas do WhatsApp (uazapi), documentos e a leitura das campanhas
da Meta. React 18 + Vite + Tailwind 3 + TanStack Query, sobre o mesmo Supabase
do site.

É um clone do CRM do Igor (`SelectusConnect2.0/crm`, que para este projeto é só
leitura), com as diferenças abaixo. A arquitetura de origem, que continua
valendo, está em [docs/ARQUITETURA.md](docs/ARQUITETURA.md); a leitura das
campanhas em [docs/INTELIGENCIA.md](docs/INTELIGENCIA.md); a qualificação do
lead em [docs/QUALIFICACAO.md](docs/QUALIFICACAO.md).

## O que mudou em relação à origem

- **Sem landing pages.** A origem gerava páginas de imóvel para anúncio (três
  modelos, teste A/B/C, vários idiomas e mercados). Aqui a página pública é o
  site (`apps/site`), que é feito para o Google. O código das páginas, a rota
  `/landing-pages` e o `api/lp.js` não vieram; as tabelas continuam no banco,
  vazias.
- **Aluguel anual.** O imóvel pode estar à venda, para alugar, ou os dois, cada
  um com o seu valor, e guarda as garantias aceitas na locação
  (`supabase/migrations/20260924000100_aluguel.sql`).
- **Marca da Juliana.** Nome e ícone em `src/config/marca.ts` e `public/`; a
  tela de entrada usa a areia e o bronze do site.
- **O dicionário** (`@contracts`) é o `packages/contracts` da raiz,
  compartilhado com o site.
- **Empreendimento com unidades** (`supabase/migrations/20261009000000_unidades.sql`):
  o imóvel com "Empreendimento com várias unidades" ligado continua um imóvel
  só (uma página, um código, os leads), com plantas e unidades embaixo. Preço
  ("a partir de") e situação vêm das unidades, calculados pelo banco a partir
  da primeira tabela aplicada (antes dela, as unidades nascem vendidas e o
  imóvel fica com a situação que tinha, sem preço). A página
  `/imoveis/:id/unidades` (`pages/Unidades.tsx`) cadastra as plantas, gera as
  unidades do prédio de uma vez e aplica a tabela da construtora do mês, com a
  conferência antes de gravar (`lib/unidades.ts`). Sem a tabela do mês, o site
  mostra "Consulte"; a construtora nunca sai no site.

## Rodando

```bash
cp apps/crm/.env.example apps/crm/.env.local   # e preencha
npm run dev:crm
```

```bash
npm test -w apps/crm        # em memória, segundos
npm run test:rls            # RLS contra um Postgres com as migrations (ver supabase/README.md)
npm run build:crm
```

## Um React diferente do site

O site usa React 19 (Next 16) e o CRM React 18. O npm deixa o 19 na raiz do
monorepo e o 18 em `apps/crm/node_modules`. Duas coisas seguram isso, e as duas
são necessárias:

- `resolve.dedupe` no `vite.config.ts`: todo `import 'react'` sai do 18, inclusive
  o das bibliotecas que ficaram na raiz;
- `paths` de `react` e `react-dom` no `tsconfig.json`: os tipos também são os do 18.
