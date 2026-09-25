import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { ReminderStatus } from '@contracts';

export interface Lembrete {
  id: string;
  lead_id: string;
  assigned_to: string;
  visit_id: string | null;
  title: string;
  body: string | null;
  remind_at: string;
  status: ReminderStatus;
  snooze_count: number;
  created_at: string;
}

export function useLembretes(leadId: string | undefined) {
  return useQuery({
    queryKey: ['lembretes', leadId],
    enabled: !!leadId,
    queryFn: async (): Promise<Lembrete[]> => {
      const { data, error } = await supabase
        .from('lead_reminders')
        .select('id, lead_id, assigned_to, visit_id, title, body, remind_at, status, snooze_count, created_at')
        .eq('lead_id', leadId!)
        .order('remind_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Lembrete[];
    },
  });
}

export function useCriarLembrete(leadId: string, orgId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (l: { title: string; body?: string | null; remindAt: Date; para: string }) => {
      if (!orgId) throw new Error('Organização não resolvida.');
      if (l.remindAt <= new Date()) throw new Error('Escolha um horário no futuro.');

      const { error } = await supabase.from('lead_reminders').insert({
        organization_id: orgId,
        lead_id: leadId,
        assigned_to: l.para,
        title: l.title.trim(),
        body: l.body?.trim() || null,
        remind_at: l.remindAt.toISOString(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['lembretes', leadId] });
    },
  });
}

export function useAcoesLembrete(leadId: string) {
  const qc = useQueryClient();
  const invalidar = () => {
    void qc.invalidateQueries({ queryKey: ['lembretes', leadId] });
    void qc.invalidateQueries({ queryKey: ['notificacoes-nao-lidas'] });
  };

  const concluir = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('lead_reminders')
        .update({ status: 'concluido', completed_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidar,
  });

  const cancelar = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('lead_reminders')
        .update({ status: 'cancelado' })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidar,
  });

  /** Adiar devolve o lembrete para a fila, somando ao contador de adiamentos. */
  const adiar = useMutation({
    mutationFn: async (p: { id: string; minutos: number }) => {
      const { error } = await supabase.rpc('snooze_reminder', {
        _id: p.id,
        _minutos: p.minutos,
      });
      if (error) throw error;
    },
    onSuccess: invalidar,
  });

  return { concluir, cancelar, adiar };
}
