import path from 'node:path';

import { defineConfig } from 'vitest/config';

// O mesmo `@/` do tsconfig: sem ele, o teste de um módulo que importa
// `@/lib/...` não carrega, e o Next resolve o atalho sozinho só no build.
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
