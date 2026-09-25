/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';

declare const self: ServiceWorkerGlobalScope;

/**
 * Service worker do CRM.
 *
 * Escrito à mão (`injectManifest`) e não gerado: `generateSW` não aceita
 * handler de `push`, que é o motivo de este arquivo existir.
 */

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// Assume o controle assim que instala. Sem isto, a versão nova só passa a valer
// quando o corretor fecha TODAS as abas — e ele não fecha, deixa aberto o dia
// inteiro.
self.addEventListener('install', () => void self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

interface Aviso {
  title: string;
  body?: string;
  url?: string;
  type?: string;
  group_key?: string;
  notification_id?: string;
}

self.addEventListener('push', (evento: PushEvent) => {
  let dados: Aviso = { title: 'CRM Juliana Soares' };
  try {
    if (evento.data) dados = { ...dados, ...(evento.data.json() as Aviso) };
  } catch {
    if (evento.data) dados.body = evento.data.text();
  }

  /*
   * SEMPRE mostra o banner, mesmo com a aba aberta.
   *
   * O CRM auditado suprimia a notificação quando havia aba visível. Parece
   * educado e não é: a inscrição foi feita com `userVisibleOnly`, e receber um
   * push sem mostrar nada gasta o orçamento de silêncio do navegador — o Chrome
   * passa a exibir "este site foi atualizado em segundo plano" no lugar da sua
   * mensagem, e em excesso revoga a permissão.
   *
   * Quem resolve a duplicidade é a PÁGINA: quando ela está visível, fecha o
   * banner pela tag. E o som toca só no Realtime, nunca aqui — lá os dois
   * tocavam, e com a aba aberta saía som dobrado.
   */
  const tag = dados.group_key ?? dados.notification_id ?? 'sc';

  evento.waitUntil(
    self.registration.showNotification(dados.title, {
      body: dados.body,
      tag,
      icon: '/icone-192.png',
      badge: '/icone-192.png',
      data: { url: dados.url ?? '/', notification_id: dados.notification_id },
      // `renotify: false` de propósito — reagrupar não deve chacoalhar o
      // aparelho de novo. A propriedade existe na especificação mas ainda não
      // no tipo do TypeScript, daí o alargamento.
      renotify: false,
    } as NotificationOptions & { renotify: boolean }),
  );
});

/**
 * Clicar leva ao lugar certo, reaproveitando a aba aberta.
 *
 * Abrir uma segunda aba do CRM a cada aviso é como o corretor termina o dia com
 * onze abas iguais e perde a que tinha o rascunho.
 */
self.addEventListener('notificationclick', (evento: NotificationEvent) => {
  evento.notification.close();
  const destino = (evento.notification.data?.url as string) ?? '/';

  evento.waitUntil(
    (async () => {
      const abas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const aba of abas) {
        if ('focus' in aba) {
          await (aba as WindowClient).navigate(destino).catch(() => {});
          return (aba as WindowClient).focus();
        }
      }
      return self.clients.openWindow(destino);
    })(),
  );
});

/**
 * O navegador rotaciona a inscrição sem avisar o usuário.
 *
 * Sem este handler o aparelho emudece e ninguém descobre até alguém reclamar
 * que não recebe mais nada. O CRM auditado não tinha isto.
 */
self.addEventListener('pushsubscriptionchange', (evento: Event) => {
  const e = evento as unknown as PushSubscriptionChangeEvent;
  e.waitUntil(
    (async () => {
      const nova =
        e.newSubscription ??
        (await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: e.oldSubscription?.options.applicationServerKey ?? undefined,
        }));

      // O endpoint novo precisa chegar ao servidor. Sem sessão aqui, avisamos a
      // página, que reenvia autenticada assim que abrir.
      const abas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const aba of abas) {
        aba.postMessage({ tipo: 'push-renovado', inscricao: nova.toJSON() });
      }
    })(),
  );
});

interface PushSubscriptionChangeEvent extends ExtendableEvent {
  readonly newSubscription?: PushSubscription;
  readonly oldSubscription?: PushSubscription;
}
