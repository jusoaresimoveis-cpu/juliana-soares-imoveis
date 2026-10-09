// Camada de lint com tipos, de propósito FORA de eslint.config.mjs: com o
// projectService ligado o ESLint monta o programa TypeScript inteiro, lento
// demais para um pre-commit e pesado para uma máquina pequena de CI.
//
// Dois arquivos e dois scripts (`lint` e `lint:types`) em vez de uma config que
// olha process.env.CI: assim o local e o CI nunca divergem para o mesmo código.
import defaultConfig from "./eslint.config.mjs";

export default [
  ...defaultConfig,
  {
    files: ["apps/crm/src/**/*.{ts,tsx}", "packages/contracts/src/**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Severidade pela contagem medida na instalação (08/10/2026): zero
      // violação nasce em "error"; com violação, "warn" e a contagem ao lado,
      // até ela chegar a zero.
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
      "@typescript-eslint/require-await": "error",
    },
  },
];
