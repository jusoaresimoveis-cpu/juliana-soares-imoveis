
/// <reference types="vite-plugin-pwa/client" />

/** Data e hora da build, injetada pelo `define` do Vite. Ver `vite.config.ts`. */
declare const __VERSAO__: string;

/**
 * As `VITE_*` que o CRM lê. Sem isto o `vite/client` as entrega pelo índice
 * `[key: string]: any`. Todas opcionais porque podem faltar no `.env`: quem é
 * obrigatória falha alto em `lib/env.ts`.
 */
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  readonly VITE_PUBLIC_SITE_URL?: string;
  readonly VITE_VAPID_PUBLIC_KEY?: string;
}
