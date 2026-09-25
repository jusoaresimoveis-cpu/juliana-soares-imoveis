/**
 * Variáveis de ambiente, validadas no boot.
 *
 * O CRM de referência passa `undefined` direto para o createClient quando a
 * variável falta — o app quebra em runtime com um erro que não diz nada.
 * Aqui falha alto e cedo, com o nome da variável e onde configurá-la.
 */

function required(name: string, value: string | undefined): string {
  if (!value || value.trim() === '') {
    throw new Error(
      `Variável de ambiente ausente: ${name}\n\n` +
        `Local: copie .env.example para .env e preencha.\n` +
        `Vercel: Project Settings → Environment Variables.`,
    );
  }
  return value.trim();
}

export const env = {
  supabaseUrl: required('VITE_SUPABASE_URL', import.meta.env.VITE_SUPABASE_URL),
  supabaseKey: required('VITE_SUPABASE_PUBLISHABLE_KEY', import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY),
  /** O site público (apps/site): o "Ver no site" da ficha do imóvel. Opcional. */
  publicSiteUrl: import.meta.env.VITE_PUBLIC_SITE_URL?.trim() || '',

  /**
   * Chave pública VAPID.
   *
   * Pública de propósito — o `PushManager` do navegador exige ela no cliente. A
   * privada NUNCA aparece aqui: vive como secret da edge function. Sem valor,
   * a tela mostra "push não configurado" em vez de falhar na inscrição.
   */
  vapidPublicKey: import.meta.env.VITE_VAPID_PUBLIC_KEY?.trim() || '',
} as const;
