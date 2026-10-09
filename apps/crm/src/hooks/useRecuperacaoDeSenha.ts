import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

/*
 * O lado banco das duas telas de `pages/Senha.tsx`.
 *
 * Mora aqui, e não na tela, porque página não fala com o cliente do Supabase.
 * As duas funções devolvem a própria promessa do `supabase.auth`, sem `async`:
 * a tela continua esperando exatamente o que esperava antes.
 */

export function pedirLinkDeSenha(email: string, redirectTo: string) {
  return supabase.auth.resetPasswordForEmail(email, { redirectTo });
}

export function trocarSenha(password: string) {
  return supabase.auth.updateUser({ password });
}

/**
 * `true` quando a sessão de recuperação existe, `false` quando o prazo venceu
 * sem ela, `null` enquanto espera.
 */
export function useSessaoDeRecuperacao(): boolean | null {
  const [pronta, setPronta] = useState<boolean | null>(null);

  /*
   * Espera a sessão de recuperação existir ANTES de mostrar o formulário.
   *
   * O cliente consome o token do endereço de forma assíncrona. Perguntando
   * cedo demais, `getSession` devolve nulo numa página que vai funcionar em
   * seguida — e a pessoa lê "link inválido" com o link bom na mão.
   */
  useEffect(() => {
    let vivo = true;

    const { data: assinatura } = supabase.auth.onAuthStateChange((evento) => {
      if (evento === 'PASSWORD_RECOVERY' || evento === 'SIGNED_IN') {
        if (vivo) setPronta(true);
      }
    });

    void supabase.auth.getSession().then(({ data }) => {
      if (data.session && vivo) setPronta(true);
    });

    // Se em 4 segundos nada chegou, o link não trouxe token válido.
    const prazo = setTimeout(() => {
      if (vivo) setPronta((p) => (p === null ? false : p));
    }, 4000);

    return () => {
      vivo = false;
      clearTimeout(prazo);
      assinatura.subscription.unsubscribe();
    };
  }, []);

  return pronta;
}
