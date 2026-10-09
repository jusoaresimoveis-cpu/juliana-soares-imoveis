// Lint da raiz: o CRM (apps/crm), os contratos (packages/contracts) e os testes
// de RLS (supabase/testes, que rodam pelo vitest do CRM). O site tem a config
// dele (apps/site/eslint.config.mjs, com as regras do Next), que usa as mesmas
// regras quality/*; aqui ele fica de fora.
//
// Camada rápida, sem informação de tipo, para caber num pre-commit. O que
// precisa do verificador de tipos fica em eslint.typed.config.mjs
// (npm run lint:types).
//
// As regras quality/* (eslint-rules/) vêm do vibe-coding-toolkit
// (templates/eslint), copiadas byte a byte: regra de lint escrita na hora erra
// em silêncio. O que é deste projeto mora só nesta config.
//
// Severidade pela contagem medida na instalação (08/10/2026), não por gosto:
// regra sem violação é "error". Com violação, a contagem fica anotada ao lado e
// é a linha de base. Nas regras quality/*, a linha de base é a lista dos
// arquivos que já violavam: eles ficam em "warn" e o resto do código em
// "error", então dívida nova quebra o lint. Arquivo consertado sai da lista;
// lista vazia, bloco apagado.
import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

import quality from "./eslint-rules/index.cjs";

const MAX_LINES = 350;
const EXTENSOES = "{js,jsx,ts,tsx,mjs,cjs}";
const FONTES = [
  `apps/crm/src/**/*.${EXTENSOES}`,
  `packages/contracts/src/**/*.${EXTENSOES}`,
  `supabase/testes/**/*.${EXTENSOES}`,
];
// Teste pelo sufixo ou pela pasta: os mesmos dois critérios do isTestFile das
// regras quality/*.
const TESTES = [
  `**/*.{test,spec}.${EXTENSOES}`,
  `**/{__tests__,__mocks__,fixtures,mocks}/**/*.${EXTENSOES}`,
];

// Acima de MAX_LINES na instalação (linhas ao lado), fora os testes.
const ACIMA_DO_TETO = [
  "apps/crm/src/pages/Unidades.tsx", // 1774
  "apps/crm/src/pages/Anuncios.tsx", // 1384
  "apps/crm/src/components/properties/PropertyFormDialog.tsx", // 1047
  "apps/crm/src/pages/LeadDetail.tsx", // 911
  "supabase/testes/esquema.ts", // 868
  "apps/crm/src/pages/Inteligencia.tsx", // 708
  "apps/crm/src/pages/Dashboard.tsx", // 678
  "apps/crm/src/inteligencia.ts", // 655
  "apps/crm/src/hooks/useProperties.ts", // 640
  "packages/contracts/src/meta.ts", // 635
  "apps/crm/src/lib/unidades.ts", // 623
  "apps/crm/src/hooks/usePainel.ts", // 610
  "apps/crm/src/pages/Conversas.tsx", // 586
  "apps/crm/src/pages/PropertyDetail.tsx", // 586
  "apps/crm/src/pages/Settings.tsx", // 527
  "packages/contracts/src/qualificacao.ts", // 513
  "packages/contracts/src/caracteristicas.ts", // 480
  "apps/crm/src/components/properties/MediaManager.tsx", // 470
  "apps/crm/src/components/settings/Equipe.tsx", // 447
  "apps/crm/src/pages/Documentos.tsx", // 446
  "apps/crm/src/hooks/useMeta.ts", // 414
  "apps/crm/src/pages/Auth.tsx", // 387
  "apps/crm/src/components/settings/WhatsApp.tsx", // 374
  "apps/crm/src/pages/Agenda.tsx", // 363
];

export default defineConfig([
  {
    languageOptions: {
      parserOptions: { tsconfigRootDir: import.meta.dirname },
      // O no-undef do js.configs.recommended não conhece o runtime. Nos .ts o
      // typescript-eslint já o desliga (quem confere é o tsc); isto vale para
      // os poucos .js/.mjs/.cjs da raiz e do CRM, que rodam no Node.
      globals: {
        console: "readonly",
        process: "readonly",
        fetch: "readonly",
        URL: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
      },
    },
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    // Linha de base dos presets acima: regras com violação no código que já
    // existia. Depois dos presets, senão eles voltariam a ser "error".
    rules: {
      "@typescript-eslint/no-non-null-assertion": "warn", // 140
      "no-irregular-whitespace": "warn", // 4
      "no-control-regex": "warn", // 2
      "no-regex-spaces": "warn", // 1
    },
  },

  {
    // Só as duas regras de hook, não o preset inteiro (o recommended da v7 traz
    // as do React Compiler, que este CRM em React 18 não usa). O código já tem
    // `eslint-disable` para a exhaustive-deps; sem o plugin carregado, cada um
    // vira erro de "regra não encontrada".
    files: ["apps/crm/src/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
    },
  },
  {
    files: FONTES,
    plugins: { quality },
    rules: {
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-var": "error",
      "prefer-const": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // Orçamento de tamanho e complexidade. Começo de conversa sobre
      // fatoração, não portão: o que tem violação fica em "warn" e sobe para
      // "error" quando a contagem chegar a zero.
      complexity: ["warn", 12], // 60
      "max-depth": ["error", 4],
      "max-statements": ["warn", 20], // 18
      "max-params": ["warn", 4], // 3
      "max-lines-per-function": [
        "warn", // 26
        { max: 150, skipBlankLines: true, skipComments: true },
      ],
      "max-nested-callbacks": ["error", 3],
      "quality/max-lines": ["error", { max: MAX_LINES }],
      "quality/no-direct-console": [
        "error",
        { logger: "anotar() do rastro (apps/crm/src/lib/rastro.ts)" },
      ],
      // A tela fala com o banco pelos hooks (src/hooks/use*.ts), nunca pelo
      // cliente do Supabase direto. O .tsx entra porque componente é
      // componente em qualquer pasta. A regra compara o caminho do import ao
      // pé da letra: por isso as grafias relativas e o createClient.
      "quality/no-direct-data-access": [
        "error",
        {
          modules: [
            "@/lib/supabase",
            "../lib/supabase",
            "../../lib/supabase",
            "../../../lib/supabase",
            "@supabase/supabase-js",
          ],
          bindings: ["supabase", "createClient"],
          layers: ["/apps/crm/src/pages/", "/apps/crm/src/components/"],
          extensions: [".tsx"],
        },
      ],
    },
  },

  // Linhas de base por arquivo. Estes blocos TÊM que vir depois do que liga as
  // regras: no flat config o bloco de baixo vence, e um "warn" ou "off" posto
  // antes seria desfeito em silêncio pelo "error". Só a severidade muda; as
  // opções do bloco de cima continuam valendo.
  {
    files: ACIMA_DO_TETO,
    rules: { "quality/max-lines": "warn" }, // 24
  },
  {
    files: ["apps/crm/src/components/Erro.tsx"],
    rules: { "quality/no-direct-console": "warn" }, // 1
  },
  {
    // A troca de senha chama o supabase.auth direto, sem passar pelo useAuth.
    files: ["apps/crm/src/pages/Senha.tsx"],
    rules: { "quality/no-direct-data-access": "warn" }, // 1
  },

  // Exceções de verdade, não dívida.
  {
    // O próprio adaptador de log: o rastro embrulha o console.error para cada
    // chamada virar passo do relato de erro.
    files: ["apps/crm/src/lib/rastro.ts"],
    rules: { "quality/no-direct-console": "off" },
  },
  {
    // O hook de login É a camada que fala com o banco; só é .tsx porque também
    // tem o AuthProvider.
    files: ["apps/crm/src/hooks/useAuth.tsx"],
    rules: { "quality/no-direct-data-access": "off" },
  },
  {
    // O laboratório dos testes de RLS (banco, fixtura, esquema) é apoio de
    // teste fora do app: o console dele é a saída do próprio vitest.
    files: ["supabase/testes/**"],
    rules: { "quality/no-direct-console": "off" },
  },

  {
    // O mesmo teto para teste, em "warn". Também depois do bloco do "error".
    files: TESTES,
    plugins: { quality },
    rules: {
      "quality/max-lines": ["warn", { max: MAX_LINES, includeTests: true }], // 6
    },
  },
  {
    files: TESTES,
    rules: {
      // Disparam no aninhamento de describe/it e no "arrange" comprido sem
      // apontar problema de verdade.
      "max-statements": "off",
      "max-lines-per-function": "off",
      "max-nested-callbacks": "off",
    },
  },
  {
    files: ["eslint-rules/**/*.cjs"],
    languageOptions: {
      sourceType: "commonjs",
      globals: { module: "readonly", require: "readonly" },
    },
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  globalIgnores([
    ".claude/**",
    "**/node_modules/**",
    "**/dist/**",
    "**/build/**",
    "**/coverage/**",
    "**/*.tsbuildinfo",
    // O site tem a config dele, com as regras do Next.
    "apps/site/**",
    // Gerado por `npm run db:types -w apps/crm` a partir do banco.
    "apps/crm/src/lib/database.types.ts",
    // Edge functions em Deno: outro runtime, e nelas o console É o log (vai
    // para o painel do Supabase). Ficam sem lint, de propósito: nenhum outro
    // lint roda nelas hoje.
    "supabase/functions/**",
    // Ferramentas avulsas (banco local, marca), fora do app.
    "ferramentas/**",
    "conteudo/**",
  ]),
]);
