// Camada de lint com tipos do site, de propósito FORA de eslint.config.mjs: com
// o projectService ligado o ESLint monta o programa TypeScript inteiro, lento
// demais para um pre-commit. Roda por `npm run lint:types`.
//
// Severidade pela contagem medida na instalação (08/10/2026): zero violação
// nasce em "error"; com violação, "warn" e a contagem ao lado.
import defaultConfig from "./eslint.config.mjs";

const eslintTypedConfig = [
  ...defaultConfig,
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/no-unsafe-assignment": "error",
      "@typescript-eslint/no-unsafe-member-access": "error",
      "@typescript-eslint/no-unsafe-call": "error",
      "@typescript-eslint/no-unsafe-return": "error",
      "@typescript-eslint/no-unsafe-argument": "error",
      "@typescript-eslint/only-throw-error": "error",
      "@typescript-eslint/return-await": ["error", "in-try-catch"],
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/unbound-method": "error",
      "@typescript-eslint/restrict-template-expressions": "error",
      "@typescript-eslint/restrict-plus-operands": "error",
      "@typescript-eslint/require-await": "warn", // 2
    },
  },
];

export default eslintTypedConfig;
