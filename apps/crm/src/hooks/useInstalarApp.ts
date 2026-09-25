import { useCallback, useEffect, useState } from 'react';
import { MODO_APP, ehIOS, rodandoComoApp } from '@/lib/plataforma';

/**
 * O evento do Chromium que cede o diálogo nativo de instalação.
 *
 * Não está na lib do TypeScript porque não é padrão: só Chrome, Edge, Opera e
 * derivados disparam. Safari e Firefox nunca — daí o passo a passo manual não
 * ser um plano B, e sim o caminho normal de metade dos usuários.
 */
interface EventoDeInstalacao extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function useInstalarApp() {
  const [evento, setEvento] = useState<EventoDeInstalacao | null>(null);
  const [instalado, setInstalado] = useState(rodandoComoApp);
  const [ocupado, setOcupado] = useState(false);
  const [passoAPasso, setPassoAPasso] = useState(false);

  useEffect(() => {
    const aoOferecer = (e: Event) => {
      // Sem o preventDefault, o Chrome desenha a própria faixa de instalação no
      // rodapé, na hora que ele escolher. Seguramos o evento para disparar no
      // clique, quando a pessoa já sabe o que está aceitando.
      e.preventDefault();
      setEvento(e as EventoDeInstalacao);
    };

    const aoInstalar = () => {
      setInstalado(true);
      setEvento(null);
      setPassoAPasso(false);
    };

    window.addEventListener('beforeinstallprompt', aoOferecer);
    window.addEventListener('appinstalled', aoInstalar);

    /*
     * Segundo sinal, porque o primeiro tem buraco.
     *
     * Instalar pelo menu do navegador (⋮ → Instalar app) nem sempre dispara
     * `appinstalled` na aba que está aberta, e no iPhone esse evento não existe
     * de forma alguma. O modo de exibição virando "standalone" é o que sobra —
     * e é o que faz o botão sumir sozinho quando a pessoa segue o passo a passo
     * manual em vez de clicar.
     */
    const modo = window.matchMedia(MODO_APP);
    const aoMudarModo = (e: MediaQueryListEvent) => e.matches && aoInstalar();
    modo.addEventListener('change', aoMudarModo);

    return () => {
      window.removeEventListener('beforeinstallprompt', aoOferecer);
      window.removeEventListener('appinstalled', aoInstalar);
      modo.removeEventListener('change', aoMudarModo);
    };
  }, []);

  const instalar = useCallback(async () => {
    if (!evento) {
      setPassoAPasso(true);
      return;
    }

    setOcupado(true);
    try {
      /*
       * `prompt()` PRECISA sair de dentro do clique.
       *
       * Fora de um gesto do usuário o navegador simplesmente ignora, e o botão
       * vira decoração. Por isso nada de await antes desta linha.
       */
      await evento.prompt();
      const { outcome } = await evento.userChoice;

      // O evento é de uso único: depois do prompt ele não vale mais e chamar de
      // novo lança. Descartamos — o navegador manda outro quando quiser.
      setEvento(null);
      if (outcome === 'accepted') setInstalado(true);
    } catch {
      // Acontece quando o diálogo já foi consumido nesta visita. Cair no passo
      // a passo é melhor do que um botão que não faz nada — que é exatamente o
      // sintoma que o arquivo de referência avisa para não deixar acontecer.
      setEvento(null);
      setPassoAPasso(true);
    } finally {
      setOcupado(false);
    }
  }, [evento]);

  return {
    /** Já roda em janela própria: não há o que oferecer. */
    instalado,
    /** O navegador cedeu o diálogo nativo — instala em um clique. */
    umClique: evento !== null,
    ocupado,
    passoAPasso,
    instalar,
    fecharPassoAPasso: useCallback(() => setPassoAPasso(false), []),
    ehIOS: ehIOS(),
  };
}
