import { useCallback, useEffect, useState } from 'react';
import { chamarFuncao } from '@/lib/funcoes';
import { env } from '@/lib/env';
import { ehIOS, rodandoComoApp } from '@/lib/plataforma';

/**
 * Estado do push neste aparelho.
 *
 * Cinco estados, e cada um pede uma frase diferente do usuário. Tratar todos
 * como "não suporta" — que é o que o CRM auditado faz — manda o corretor de
 * iPhone embora achando que o recurso não existe, quando falta um toque.
 */
export type EstadoPush =
  | 'carregando'
  | 'precisa_instalar' // iOS fora da tela de início: a API nem existe
  | 'sem_suporte' // navegador realmente não tem push
  | 'bloqueado' // o usuário negou; só as configurações do navegador revertem
  | 'desligado' // pode ligar
  | 'ligado';

/**
 * base64url → bytes, no formato que o `PushManager` exige.
 *
 * O buffer é criado explicitamente porque `Uint8Array.from` produz um tipo
 * respaldado por `ArrayBufferLike`, que pode ser memória compartilhada — e o
 * `subscribe()` só aceita `ArrayBuffer` comum.
 */
function chaveParaBytes(base64: string): Uint8Array<ArrayBuffer> {
  const preenchido = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
  const bruto = atob(preenchido.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(new ArrayBuffer(bruto.length));
  for (let i = 0; i < bruto.length; i++) bytes[i] = bruto.charCodeAt(i);
  return bytes;
}

export function usePush() {
  const [estado, setEstado] = useState<EstadoPush>('carregando');
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const avaliar = useCallback(async () => {
    if (ehIOS() && !rodandoComoApp()) return setEstado('precisa_instalar');
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return setEstado('sem_suporte');
    if (Notification.permission === 'denied') return setEstado('bloqueado');

    const reg = await navigator.serviceWorker.getRegistration();
    const inscricao = await reg?.pushManager.getSubscription();

    if (!inscricao) return setEstado('desligado');

    /*
     * Confere se a inscrição foi feita com a chave ATUAL.
     *
     * No dia em que a VAPID for rotacionada, uma inscrição antiga continua
     * existindo e o `getSubscription()` a devolve — o CRM auditado a
     * reaproveitava e dizia "inscrito" enquanto o aparelho estava mudo para
     * sempre. Divergiu, refaz.
     */
    const atual = chaveParaBytes(env.vapidPublicKey);
    const usada = new Uint8Array(inscricao.options.applicationServerKey ?? new ArrayBuffer(0));
    const igual = usada.length === atual.length && usada.every((b, i) => b === atual[i]);

    if (!igual) {
      await inscricao.unsubscribe().catch(() => {});
      return setEstado('desligado');
    }

    setEstado('ligado');
  }, []);

  useEffect(() => {
    void avaliar();
  }, [avaliar]);

  const ligar = useCallback(async () => {
    setOcupado(true);
    setErro(null);
    try {
      /*
       * A permissão é pedida DENTRO do clique, como primeiro await.
       *
       * Pedir na abertura da tela queima o direito de pedir: "negado" no Chrome
       * é permanente, e depois só as configurações do navegador revertem. O
       * usuário precisa entender o que está aceitando antes de a caixa aparecer.
       */
      const permissao = await Notification.requestPermission();
      if (permissao !== 'granted') {
        setEstado(permissao === 'denied' ? 'bloqueado' : 'desligado');
        return;
      }

      const reg = await navigator.serviceWorker.ready;
      const inscricao = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: chaveParaBytes(env.vapidPublicKey),
      });

      await chamarFuncao('push-inscrever', {
        acao: 'inscrever',
        inscricao: inscricao.toJSON(),
        userAgent: navigator.userAgent,
      }, 'Não foi possível registrar o aparelho.');

      setEstado('ligado');
    } catch (e) {
      setErro((e as Error).message);
      await avaliar();
    } finally {
      setOcupado(false);
    }
  }, [avaliar]);

  const desligar = useCallback(async () => {
    setOcupado(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const inscricao = await reg?.pushManager.getSubscription();
      if (inscricao) {
        /*
         * Desligar não pode falhar na cara da pessoa.
         *
         * Se o servidor recusar, a inscrição local sai do mesmo jeito logo
         * abaixo e o aparelho para de receber — que é o que ela pediu. O
         * registro órfão do lado de lá some sozinho: o envio marca falha e o
         * trabalhador descarta.
         */
        await chamarFuncao('push-inscrever', {
          acao: 'remover',
          endpoint: inscricao.endpoint,
        }).catch(() => undefined);
        await inscricao.unsubscribe();
      }
      setEstado('desligado');
    } finally {
      setOcupado(false);
    }
  }, []);

  return { estado, ocupado, erro, ligar, desligar, ehIOS: ehIOS() };
}
