import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { aplicarCor, COR_PADRAO, paletaDe } from '@/lib/cores';
import { useAuth } from '@/hooks/useAuth';

const CHAVE = 'sc-cor';

/* -------------------------------------------------------------------------- */
/* A cor mora FORA do React                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Um valor só, para quantos componentes o usarem.
 *
 * A versão anterior guardava a cor num `useState` dentro do hook — e hook não
 * compartilha estado: cada chamada cria a própria cópia. Com o hook montado no
 * AppShell E na tela de configurações, existiam DUAS cores.
 *
 * O sintoma era exatamente o relatado: escolher verde mudava a cópia da tela de
 * configurações, enquanto a do AppShell seguia em roxo. Na primeira vez que ela
 * reexecutava — trocar claro/escuro, navegar entre telas — repintava tudo com o
 * valor velho, e a cor "voltava sozinha".
 *
 * Fora do React o valor é um só por construção. É a mesma doença do `useTheme`,
 * e por isso o tema aqui é lido da classe do elemento raiz, que também é única.
 */
let corAtual: string = lerGuardada();
const ouvintes = new Set<() => void>();

/**
 * O que o PERFIL dizia da última vez que olhamos.
 *
 * Não é "a última cor aplicada" — essa distinção é o bug inteiro.
 *
 * O `useAuth` não usa react-query: invalidar a consulta depois de salvar não
 * recarrega nada, e o objeto `profile` em memória guarda a cor ANTIGA pelo
 * resto da sessão. O efeito que sincroniza depende de `[profile, escuro]`, e
 * trocar o tema o faz reexecutar.
 *
 * A primeira tentativa guardava aqui a cor APLICADA e, ao escolher verde,
 * escrevia 'verde'. Aí o perfil (ainda em 'roxo') passava a DIVERGIR — e o
 * efeito, que age na divergência, repintava de roxo. O guarda causava
 * exatamente o que devia impedir.
 *
 * Guardando o que foi OBSERVADO no perfil, o efeito só age quando o banco muda
 * de fato: primeiro carregamento, ou a pessoa trocando a cor em outro aparelho.
 */
let ultimoObservado: string | null = null;

/**
 * O perfil deve mandar agora?
 *
 * Função pura para poder ser testada: é uma decisão de três linhas que já foi
 * escrita errada duas vezes, e o sintoma só aparecia clicando na tela.
 */
export function perfilDeveMandar(
  doBanco: string | null | undefined,
  observado: string | null,
): boolean {
  if (!doBanco) return false;
  // Igual ao que já vimos: o objeto `profile` não mudou — só o tema mudou, e o
  // efeito reexecutou por causa disso. Agir aqui desfaria a escolha da pessoa.
  return doBanco !== observado;
}

function lerGuardada(): string {
  try {
    return localStorage.getItem(CHAVE) ?? COR_PADRAO;
  } catch {
    // Armazenamento bloqueado — navegação privada, política do navegador.
    return COR_PADRAO;
  }
}

function definirCor(nova: string, escuro: boolean): void {
  if (nova === corAtual) return;
  corAtual = nova;
  try {
    localStorage.setItem(CHAVE, nova);
  } catch {
    /* sem memória local: a cor vale só nesta sessão */
  }
  aplicarCor(nova, escuro);
  for (const avisar of ouvintes) avisar();
}

function assinar(avisar: () => void): () => void {
  ouvintes.add(avisar);
  return () => {
    ouvintes.delete(avisar);
  };
}

/* -------------------------------------------------------------------------- */

/**
 * O tema, lido de onde ele realmente está.
 *
 * `useTheme` guarda o estado com `useState` DENTRO de cada chamada — não é
 * contexto. Dois componentes que o chamam têm duas cópias independentes, e o
 * botão do topo só atualiza a sua.
 *
 * A classe no elemento raiz é a única fonte que todos compartilham, e observá-la
 * funciona não importa quantas cópias existam.
 */
export function useTemaEscuro(): boolean {
  return useSyncExternalStore(
    (avisar) => {
      const obs = new MutationObserver(avisar);
      obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
      return () => obs.disconnect();
    },
    () => document.documentElement.classList.contains('dark'),
    () => false,
  );
}

/**
 * A cor do sistema.
 *
 * Vive em dois lugares, e não é redundância:
 *
 *   - no perfil, porque cor é gosto e gosto acompanha a pessoa do computador
 *     para o celular;
 *   - no armazenamento local, porque o perfil só chega depois do login e da
 *     consulta ao banco. Sem a cópia local, o app abriria roxo e viraria verde
 *     meio segundo depois, toda vez.
 */
export function useCorDoSistema() {
  const { profile } = useAuth();
  const escuro = useTemaEscuro();
  const qc = useQueryClient();

  const cor = useSyncExternalStore(
    assinar,
    () => corAtual,
    () => COR_PADRAO,
  );

  /*
   * O perfil só manda quando o valor DELE muda.
   *
   * Na versão anterior essa memória era um `useRef` — ou seja, uma por cópia do
   * hook, e a cópia do AppShell nunca sabia da escolha feita na tela de
   * configurações. Agora é uma só, ao lado da própria cor.
   */
  useEffect(() => {
    const doBanco = (profile as { theme_color?: string } | null)?.theme_color;
    if (!doBanco || !perfilDeveMandar(doBanco, ultimoObservado)) return;
    ultimoObservado = doBanco;
    definirCor(doBanco, escuro);
  }, [profile, escuro]);

  // Reaplica quando o tema muda: as duas paletas de uma cor são diferentes, e
  // passar para o escuro exige reescrever todos os tokens.
  useEffect(() => {
    aplicarCor(cor, escuro);
  }, [cor, escuro]);

  const salvar = useMutation({
    mutationFn: async (nova: string) => {
      if (!profile?.id) return;
      const { error } = await supabase
        .from('profiles')
        .update({ theme_color: nova })
        .eq('id', profile.id);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['perfil'] });
    },
  });

  const escolher = useCallback(
    (nova: string) => {
      /*
       * A tela muda ANTES de o banco responder.
       *
       * Escolher cor é uma decisão visual: a pessoa precisa VER para decidir se
       * gostou. Esperar a ida ao servidor faria o clique parecer travado, e ela
       * clicaria de novo.
       */
      // `ultimoObservado` NÃO é tocado aqui de propósito: o perfil em memória
      // não mudou, e fingir que mudou é o que fazia o efeito repintar de volta.
      definirCor(nova, escuro);
      salvar.mutate(nova);
    },
    [salvar, escuro],
  );

  return {
    cor,
    paleta: paletaDe(cor),
    escolher,
    salvando: salvar.isPending,
    // Se o banco recusar, a tela já mudou. Dizer é melhor do que reverter a cor
    // debaixo do dedo da pessoa.
    erro: salvar.error ? 'A cor foi aplicada aqui, mas não salvou no seu perfil.' : null,
  };
}
