import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { NOTIFICATION_META, isNotificationType, type NotificationType } from '@contracts';
import { tocar } from '@/lib/notificationSounds';

export interface Notificacao {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  link_path: string | null;
  event_count: number;
  is_read: boolean;
  created_at: string;
  last_event_at: string;
}

const PAGINA = 30;

/**
 * O contador vem do SERVIDOR, não da contagem da lista.
 *
 * No CRM auditado o badge era `notifications.filter(n => !n.is_read).length`
 * sobre as 50 linhas baixadas, e ainda era incrementado a cada evento de
 * Realtime sem teto. Com mais de 50 não lidas, o número da bolinha e o da lista
 * divergiam — e ninguém sabia qual estava certo.
 */
export function useNaoLidas(profileId: string | undefined) {
  return useQuery({
    queryKey: ['notificacoes-nao-lidas', profileId],
    enabled: !!profileId,
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('recipient_id', profileId!)
        .eq('is_read', false);
      if (error) throw error;
      return count ?? 0;
    },
  });
}

export function useNotificacoes(profileId: string | undefined, aberto: boolean) {
  return useQuery({
    queryKey: ['notificacoes', profileId],
    // Só busca a lista quando o sino abre. O contador já basta para a barra.
    enabled: !!profileId && aberto,
    staleTime: 10_000,
    queryFn: async (): Promise<Notificacao[]> => {
      const { data, error } = await supabase
        .from('notifications')
        .select('id, type, title, body, link_path, event_count, is_read, created_at, last_event_at')
        .eq('recipient_id', profileId!)
        .order('last_event_at', { ascending: false })
        .limit(PAGINA);
      if (error) throw error;
      return (data ?? []) as Notificacao[];
    },
  });
}

export function useMarcarLida(profileId: string | undefined) {
  const qc = useQueryClient();
  const invalidar = () => {
    void qc.invalidateQueries({ queryKey: ['notificacoes', profileId] });
    void qc.invalidateQueries({ queryKey: ['notificacoes-nao-lidas', profileId] });
  };

  const uma = useMutation({
    mutationFn: async (id: string) => {
      // Só is_read e read_at passam: o GRANT por coluna na 005 recusa o resto.
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidar,
  });

  const todas = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('recipient_id', profileId!)
        .eq('is_read', false);
      if (error) throw error;
    },
    onSuccess: invalidar,
  });

  return { uma, todas };
}

/**
 * Assina a chegada de notificação em tempo real.
 *
 * O filtro vai no SERVIDOR (`recipient_id=eq.…`). No CRM auditado o canal era
 * filtrado por clínica e o descarte do que não era seu acontecia no navegador —
 * ou seja, o aparelho de cada pessoa recebia a notificação de todo mundo.
 *
 * Quem toca o som é AQUI, e só aqui. Quando o push existir, o service worker
 * mostra o banner do sistema mas não toca nada: no CRM auditado os dois
 * tocavam, e o resultado era som dobrado quando a aba estava aberta.
 */
export function useNotificacoesAoVivo(profileId: string | undefined) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!profileId) return;

    const canal = supabase
      .channel(`notificacoes:${profileId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `recipient_id=eq.${profileId}`,
        },
        (payload) => {
          const novo = payload.new as { type?: string; is_read?: boolean } | null;

          // Toca em INSERT e também no UPDATE que agrupa (a segunda mensagem do
          // mesmo lead não cria linha nova, incrementa a existente). Marcar como
          // lida também é UPDATE, e essa não pode tocar.
          const virouLida = novo?.is_read === true;
          if (!virouLida && novo?.type && isNotificationType(novo.type)) {
            tocar(NOTIFICATION_META[novo.type].som);
          }

          void qc.invalidateQueries({ queryKey: ['notificacoes', profileId] });
          void qc.invalidateQueries({ queryKey: ['notificacoes-nao-lidas', profileId] });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(canal);
    };
  }, [profileId, qc]);
}
