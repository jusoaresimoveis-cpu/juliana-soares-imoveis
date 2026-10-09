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
      // Orçamento de tamanho e complexidade. Começou em "warn", com a contagem
      // ao lado; a queima de avisos (09/10/2026) zerou o que tinha violação
      // FORA dos .tsx, e tudo vale como "error". Nos .tsx, complexity,
      // max-statements e max-lines-per-function estão desligadas (bloco
      // abaixo): lá as violações não foram zeradas, saíram da conta.
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
