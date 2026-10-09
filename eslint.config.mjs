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
// é a linha de base. Nas regras quality/*, a linha de base era a lista dos
// arquivos que já violavam, em "warn" com o resto do código em "error"; a
// queima de avisos (09/10/2026) zerou a lista e o bloco saiu.
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
      // Orçamento de tamanho e complexidade. Começou em "warn", com a contagem
      // ao lado; a queima de avisos (09/10/2026) zerou as três que tinham
      // violação FORA dos .tsx, e todas valem como "error". Nos .tsx,
      // complexity, max-statements e max-lines-per-function estão desligadas
      // (bloco abaixo): lá as violações não foram zeradas, saíram da conta.
      complexity: ["error", 12],
      "max-depth": ["error", 4],
      "max-statements": ["error", 20],
      "max-params": ["error", 4],
      "max-lines-per-function": [
        "error",
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
  {
    // MUDANÇA DE CONFIG, não código mais limpo (queima de avisos, 09/10/2026):
    // o ESLint conta cada &&, ?? e ?. do JSX como complexidade, e num componente
    // .tsx esses três números medem sobretudo condicional de tela. O corte é por
    // ARQUIVO: função de lógica que mora num .tsx (um onSubmit que monta o
    // payload, por exemplo) também fica sem orçamento; o remédio é ela ir para
    // um .ts. max-params, max-depth, max-nested-callbacks e o teto de linhas do
    // arquivo continuam valendo nos .tsx. Depois do bloco que liga.
    files: ["**/*.tsx"],
    rules: {
      complexity: "off",
      "max-lines-per-function": "off",
      "max-statements": "off",
    },
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
    // O mesmo teto para teste. Depois do bloco que liga a regra sem
    // includeTests: no flat config o bloco de baixo vence.
    files: TESTES,
    plugins: { quality },
    rules: {
      "quality/max-lines": ["error", { max: MAX_LINES, includeTests: true }],
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
