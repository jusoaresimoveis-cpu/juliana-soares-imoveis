import { defineConfig } from 'vitest/config';
import path from 'node:path';

/**
 * Configuração separada, e não uma pasta a mais na de sempre.
 *
 * `npm test` roda em memória, em três segundos, e é o que se roda a cada
 * salvamento. Estes aqui precisam de um Postgres de pé — sem ele não falham
 * por estarem errados, falham por não terem com quem conversar, e um teste que
 * falha por motivo errado ensina a ignorar teste vermelho.
 *
 * Ficam atrás de `npm run test:rls`, e no CI num job próprio.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@contracts': path.resolve(__dirname, '../../packages/contracts/src'),
    },
  },
  // Os testes de RLS moram em `supabase/`, na raiz: são do banco, não do app.
  root: path.resolve(__dirname, '../..'),
  test: {
    environment: 'node',
    include: ['supabase/testes/**/*.test.ts'],
    /*
     * Um arquivo por vez: todos compartilham a mesma conexão e o mesmo cenário
     * plantado. Em paralelo, um arquivo replantaria a fixtura no meio da
     * transação do outro, e a falha apareceria em quem não tem culpa.
     */
    fileParallelism: false,
    // O `supabase start` do CI leva um tempo para o Postgres aceitar conexão.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
