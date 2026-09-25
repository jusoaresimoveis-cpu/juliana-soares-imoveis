/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react-swc';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';
import { manifesto } from './src/pwa/manifesto';

export default defineConfig({
  plugins: [
    react(),

    /**
     * O app precisa ser INSTALÁVEL antes de qualquer push existir.
     *
     * No iPhone, `PushManager` simplesmente não existe em aba normal do Safari:
     * só depois de Compartilhar → Adicionar à Tela de Início. Corretor é usuário
     * de celular e boa parte é iPhone — sem esse ritual, metade do investimento
     * em push não entrega nada.
     */
    VitePWA({
      // `injectManifest` e não `generateSW`: o gerado não aceita handler de
      // `push`, que é justamente o motivo de existir um service worker aqui.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      injectManifest: { globPatterns: ['**/*.{js,css,html,png,svg,woff2}'] },
      devOptions: { enabled: false },
      // Mora em `src/pwa/manifesto.ts` para ser lido pelo teste. É configuração
      // cuja quebra é silenciosa: nada falha, o app só deixa de ser instalável.
      manifest: manifesto,
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // O dicionário canônico é compartilhado entre o app e as edge functions.
      // Deno importa os mesmos arquivos por caminho relativo.
      '@contracts': path.resolve(__dirname, '../../packages/contracts/src'),
    },
    /*
     * Um React só. O site (Next 16) usa o 19 e o CRM o 18, e o npm deixa o 19
     * na raiz do monorepo: as bibliotecas que ficaram lá (React Query, React
     * Router) achariam o 19 enquanto o app usa o 18, e dois Reacts na mesma
     * página quebram todo hook. `dedupe` faz todo `import 'react'` sair daqui.
     */
    dedupe: ['react', 'react-dom'],
  },
  server: { port: 5173 },

  /*
   * O carimbo da build, para o relato de erro dizer QUAL versão quebrou.
   *
   * Não é o hash do commit de propósito: o deploy da Vercel sai de um
   * `git archive`, sem a pasta `.git`, então `git rev-parse` não existe na hora
   * de compilar. A data e a hora da build identificam o deploy com a mesma
   * precisão prática — e, diferente do hash, ainda dizem de relance se a pessoa
   * está com uma versão velha aberta há três dias.
   */
  define: {
    __VERSAO__: JSON.stringify(new Date().toISOString().slice(0, 16).replace('T', ' ')),
  },

  build: {
    target: 'es2022',
    sourcemap: false,
    rollupOptions: {
      output: {
        // Separado desde o dia 1. Os dois sistemas de referência importam
        // todas as páginas de uma vez, e a página pública acaba baixando o
        // CRM inteiro — inaceitável em rota que recebe tráfego pago.
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          supabase: ['@supabase/supabase-js'],
          query: ['@tanstack/react-query'],
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
