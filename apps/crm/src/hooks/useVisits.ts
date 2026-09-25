import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Database } from '@/lib/database.types';
import { DEFAULT_VISIT_MINUTES, type VisitStatus } from '@contracts';

type VisitUpdate = Database['public']['Tables']['visits']['Update'];

export interface Visita {
  id: string;
  lead_id: string;
  property_id: string | null;
  assigned_to: string | null;
  starts_at: string;
  ends_at: string;
  status: VisitStatus;
  notes: string | null;
  outcome_notes: string | null;
  cancel_reason: string | null;
  leads: { full_name: string; phone_e164: string | null } | null;
  properties: { title: string; neighborhood: string | null; public_code: string } | null;
}

const CAMPOS =
  'id, lead_id, property_id, assigned_to, starts_at, ends_at, status, notes, outcome_notes, cancel_reason, ' +
  'leads(full_name, phone_e164), properties(title, neighborhood, public_code)';

/**
 * Visitas de um intervalo.
 *
 * O recorte vai no servidor, não num `filter` depois de baixar tudo. A agenda
 * de um ano inteiro não cabe — e não precisa caber, porque ninguém olha para
 * ela de uma vez.
 */
export function useAgenda(de: string, ate: string, corretor?: string) {
  return useQuery({
    queryKey: ['agenda', de, ate, corretor ?? 'todos'],
    staleTime: 30_000,
    queryFn: async (): Promise<Visita[]> => {
      let q = supabase
        .from('visits')
        .select(CAMPOS)
        .gte('starts_at', de)
        .lt('starts_at', ate)
        .order('starts_at');
      if (corretor) q = q.eq('assigned_to', corretor);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as Visita[];
    },
  });
}

export function useVisitasDoLead(leadId: string | undefined) {
  return useQuery({
    queryKey: ['visitas-lead', leadId],
    enabled: !!leadId,
    queryFn: async (): Promise<Visita[]> => {
      const { data, error } = await supabase
        .from('visits')
        .select(CAMPOS)
        .eq('lead_id', leadId!)
        .order('starts_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Visita[];
    },
  });
}

export interface Conflito {
  o_visit_id: string;
  o_starts_at: string;
  o_ends_at: string;
  o_lead_name: string;
}

/**
 * Pergunta ao banco se o corretor já tem compromisso na janela.
 *
 * A restrição de exclusão continua sendo a autoridade — isto aqui existe só
 * para a tela conseguir dizer "Rachel já tem visita às 14h com Camila" em vez
 * de deixar o usuário descobrir no erro depois de preencher o formulário.
 */
export function useConflitos(
  corretor: string | undefined,
  inicio: string | undefined,
  fim: string | undefined,
  ignorar?: string,
) {
  return useQuery({
    queryKey: ['conflitos', corretor, inicio, fim, ignorar ?? ''],
    enabled: !!corretor && !!inicio && !!fim,
    staleTime: 0,
    queryFn: async (): Promise<Conflito[]> => {
      const { data, error } = await supabase.rpc('visit_conflicts', {
        _assigned_to: corretor!,
        _starts_at: inicio!,
        _ends_at: fim!,
        _ignore_id: ignorar ?? undefined,
      });
      if (error) throw error;
      return (data ?? []) as Conflito[];
    },
  });
}

/**
 * O banco recusa sobreposição com o código 23P01, que é correto e ilegível.
 * Aqui ele vira frase.
 */
function traduzirErro(e: { code?: string; message?: string }): Error {
  if (e.code === '23P01') {
    return new Error('Esse corretor já tem visita marcada nesse horário. Escolha outro horário ou outro corretor.');
  }
  if (e.code === '23514') {
    return new Error('Horário inválido: o fim precisa vir depois do início.');
  }
  return new Error(e.message ?? 'Não foi possível salvar a visita.');
}

export interface NovaVisita {
  lead_id: string;
  property_id?: string | null;
  assigned_to?: string | null;
  starts_at: string;
  minutos?: number;
  notes?: string | null;
}

export function useAgendarVisita(orgId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: NovaVisita) => {
      if (!orgId) throw new Error('Organização não resolvida.');
      const inicio = new Date(v.starts_at);
      const fim = new Date(inicio.getTime() + (v.minutos ?? DEFAULT_VISIT_MINUTES) * 60_000);

      const { data, error } = await supabase
        .from('visits')
        .insert({
          organization_id: orgId,
          lead_id: v.lead_id,
          property_id: v.property_id ?? null,
          assigned_to: v.assigned_to ?? null,
          starts_at: inicio.toISOString(),
          ends_at: fim.toISOString(),
          notes: v.notes ?? null,
        })
        .select('id')
        .single();
      if (error) throw traduzirErro(error);
      return data.id;
    },
    onSuccess: (_id, v) => {
      void qc.invalidateQueries({ queryKey: ['agenda'] });
      void qc.invalidateQueries({ queryKey: ['visitas-lead', v.lead_id] });
      void qc.invalidateQueries({ queryKey: ['lead-timeline', v.lead_id] });
    },
  });
}

export function useMudarStatusVisita() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: {
      id: string;
      leadId: string;
      status: VisitStatus;
      outcome_notes?: string;
      cancel_reason?: string;
    }) => {
      const patch: VisitUpdate = { status: p.status };
      if (p.outcome_notes !== undefined) patch.outcome_notes = p.outcome_notes;
      if (p.cancel_reason !== undefined) patch.cancel_reason = p.cancel_reason;
      const { error } = await supabase.from('visits').update(patch).eq('id', p.id);
      if (error) throw traduzirErro(error);
    },
    onSuccess: (_r, p) => {
      void qc.invalidateQueries({ queryKey: ['agenda'] });
      void qc.invalidateQueries({ queryKey: ['visitas-lead', p.leadId] });
      void qc.invalidateQueries({ queryKey: ['lead-timeline', p.leadId] });
    },
  });
}

export function useRemarcarVisita() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { id: string; leadId: string; starts_at: string; minutos?: number }) => {
      const inicio = new Date(p.starts_at);
      const fim = new Date(inicio.getTime() + (p.minutos ?? DEFAULT_VISIT_MINUTES) * 60_000);
      const { error } = await supabase
        .from('visits')
        .update({ starts_at: inicio.toISOString(), ends_at: fim.toISOString() })
        .eq('id', p.id);
      if (error) throw traduzirErro(error);
    },
    onSuccess: (_r, p) => {
      void qc.invalidateQueries({ queryKey: ['agenda'] });
      void qc.invalidateQueries({ queryKey: ['visitas-lead', p.leadId] });
      void qc.invalidateQueries({ queryKey: ['lead-timeline', p.leadId] });
    },
  });
}
