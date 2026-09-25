import { createClient } from '@supabase/supabase-js';
import { env } from './env';
import type { Database } from './database.types';

/**
 * O tipo Database é GERADO do schema real, com:
 *
 *   npm run db:types
 *
 * Não edite database.types.ts à mão. Ele é a fonte de verdade sobre o que o
 * banco tem de fato — se alguém aplicar uma migration e esquecer de regerar,
 * a divergência aparece como erro de compilação aqui, não como bug em
 * produção com o corretor na frente do cliente.
 */
/*
 * "Lembrar de mim" precisa mexer em ONDE a sessão é guardada.
 *
 * O `persistSession: true` do Supabase já salva em `localStorage` e não tem
 * meio-termo — ou lembra sempre, ou nunca. Uma caixa de seleção por cima disso
 * seria enfeite: a pessoa desmarca num computador de recepção achando que está
 * protegendo a conta, fecha o navegador, e a sessão continua lá.
 *
 * O adaptador abaixo decide a cada escrita. Marcado (o padrão), a sessão vai
 * para o `localStorage` e sobrevive ao fechamento. Desmarcado, vai para o
 * `sessionStorage` e morre com a aba — que é o que a frase promete.
 *
 * A LEITURA olha a aba primeiro. Sem isso, uma sessão efêmera recém-criada
 * seria ignorada em favor da antiga que ficou no `localStorage`, e a pessoa
 * entraria como quem usou o computador antes dela.
 */
const CHAVE_LEMBRAR = 'sc-lembrar';

/** Chame ANTES de entrar: a escolha decide onde a sessão nova será escrita. */
export function definirLembrar(lembrar: boolean) {
  try {
    if (lembrar) localStorage.removeItem(CHAVE_LEMBRAR);
    else localStorage.setItem(CHAVE_LEMBRAR, '0');
  } catch {
    /* navegação privada bloqueia o armazenamento; segue com o padrão */
  }
}

const armazenamento = {
  getItem(chave: string): string | null {
    try {
      return sessionStorage.getItem(chave) ?? localStorage.getItem(chave);
    } catch {
      return null;
    }
  },
  setItem(chave: string, valor: string): void {
    try {
      const efemera = localStorage.getItem(CHAVE_LEMBRAR) === '0';
      if (efemera) {
        sessionStorage.setItem(chave, valor);
        // E apaga o rastro da sessão anterior: quem pediu para não ser
        // lembrado não pode deixar credencial no disco da máquina.
        localStorage.removeItem(chave);
      } else {
        localStorage.setItem(chave, valor);
      }
    } catch {
      /* idem */
    }
  },
  removeItem(chave: string): void {
    try {
      sessionStorage.removeItem(chave);
      localStorage.removeItem(chave);
    } catch {
      /* idem */
    }
  },
};

export const supabase = createClient<Database>(env.supabaseUrl, env.supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'sc-auth',
    storage: armazenamento,
  },
});
