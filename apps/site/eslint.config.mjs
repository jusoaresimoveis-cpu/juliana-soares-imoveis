import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// As regras quality/* do monorepo (eslint-rules/, na raiz), as mesmas do CRM.
// Os globs abaixo são relativos a esta pasta: o site se lint por
// `npm run lint -w apps/site` (ou de dentro dela), nunca com -c a partir da raiz.
import quality from "../../eslint-rules/index.cjs";

const MAX_LINES = 350;
const EXTENSOES = "{js,jsx,ts,tsx,mjs,cjs}";
const TESTES = [
  `**/*.{test,spec}.${EXTENSOES}`,
  `**/{__tests__,__mocks__,fixtures,mocks}/**/*.${EXTENSOES}`,
];

// Severidade pela contagem medida na instalação (08/10/2026): regra sem
// violação é "error"; com violação, "warn" com a contagem ao lado, até zerar.
const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: [`src/**/*.${EXTENSOES}`],
    plugins: { quality },
    rules: {
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-var": "error",
      "prefer-const": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // Orçamento de tamanho e complexidade: começo de conversa sobre
      // fatoração, não portão.
      complexity: ["warn", 12], // 9
      "max-depth": ["error", 4],
      "max-statements": ["warn", 20], // 2
      "max-params": ["error", 4],
      "max-lines-per-function": [
        "warn", // 2
        { max: 150, skipBlankLines: true, skipComments: true },
      ],
      "max-nested-callbacks": ["error", 3],
      "quality/max-lines": ["error", { max: MAX_LINES }],
      "quality/no-direct-console": "error",
      // O site não tem cliente de banco: lê a função site_imoveis por fetch.
      // O que dá acesso ao banco é a configuração (URL e chave) de
      // src/lib/imoveis/banco.ts, e quem a usa são os repositórios
      // (lib/imoveis/dados.ts) e as rotas de API. Página e componente pedem os
      // dados a eles.
      "quality/no-direct-data-access": [
        "error",
        {
          modules: ["@/lib/imoveis/banco"],
          bindings: ["configuracaoDoBanco"],
          layers: ["/src/components/"],
          extensions: [".tsx"],
        },
      ],
    },
  },
  {
    // O mesmo teto para teste, em "warn". Depois do bloco do "error": no flat
    // config o bloco de baixo vence.
    files: TESTES,
    plugins: { quality },
    rules: {
      "quality/max-lines": ["warn", { max: MAX_LINES, includeTests: true }], // 1
    },
  },
  {
    files: TESTES,
    rules: {
      "max-statements": "off",
      "max-lines-per-function": "off",
      "max-nested-callbacks": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
