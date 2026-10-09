import type { Conversa } from '@/hooks/useConversas';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/Avatar';
import { hora } from '@/components/conversas/hora';

export function ItemDaCaixa({
  conversa,
  ativa,
  onAbrir,
}: {
  conversa: Conversa;
  ativa: boolean;
  onAbrir: () => void;
}) {
  return (
    <button
      onClick={onAbrir}
      className={cn(
        'flex w-full gap-2.5 border-b border-line px-4 py-3 text-left transition-colors hover:bg-card-2',
        ativa && 'bg-pri-soft/40',
      )}
    >
      <Avatar
        nome={conversa.contact_name ?? conversa.contact_e164 ?? '?'}
        foto={conversa.foto_url}
        className="h-9 w-9 text-xs"
      />

      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <b className="truncate text-base font-bold">
            {conversa.contact_name ?? conversa.contact_e164 ?? 'Contato'}
          </b>
          {conversa.last_message_at && (
            <time className="ml-auto shrink-0 text-2xs text-tx-3">
              {hora(conversa.last_message_at)}
            </time>
          )}
        </span>

        <span className="mt-0.5 flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-sm text-tx-3">
            {conversa.last_message_body ?? '—'}
          </span>
          {conversa.unread_count > 0 && (
            <span className="grid h-[18px] min-w-[18px] shrink-0 place-items-center rounded-full bg-pri px-1 text-2xs font-bold text-pri-fg">
              {conversa.unread_count}
            </span>
          )}
        </span>

        {conversa.ref_code && (
          <span className="mt-1 inline-block rounded bg-pri-soft px-1.5 py-0.5 text-2xs font-bold text-pri">
            {conversa.ref_code}
          </span>
        )}
      </span>
    </button>
  );
}
