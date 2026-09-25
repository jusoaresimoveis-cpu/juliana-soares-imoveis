import { useCallback, useEffect, useState } from 'react';

/*
 * `sc-tema`, e não mais `sc-theme`. O CRM seguia o tema do aparelho, e o
 * efeito abaixo gravava o tema de quem só abriu o app: num celular escuro, a
 * chave antiga guardou 'dark' sem ninguém escolher, e o CRM continuaria abrindo
 * escuro. Agora ele abre no claro e o escuro vem só do botão (ver index.html).
 */
export const CHAVE_DO_TEMA = 'sc-tema';
export type Theme = 'light' | 'dark';

function current(): Theme {
  if (typeof document === 'undefined') return 'light';
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

/** O tema já foi aplicado pelo script no index.html; aqui só sincronizamos. */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(current);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    try {
      localStorage.setItem(CHAVE_DO_TEMA, theme);
    } catch {
      /* storage bloqueado: o tema vale só nesta aba */
    }
  }, [theme]);

  const toggle = useCallback(() => setTheme((t) => (t === 'dark' ? 'light' : 'dark')), []);

  return { theme, setTheme, toggle };
}
