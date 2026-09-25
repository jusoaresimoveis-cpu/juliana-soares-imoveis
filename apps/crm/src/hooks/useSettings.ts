import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { LeadScope, NotificationType } from '@contracts';

export interface Preferencias {
  profile_id: string;
  organization_id: string;
  lead_scope: LeadScope;
  push_enabled: boolean;
  muted_types: NotificationType[];
}

export function usePreferencias(profileId: string | undefined, orgId: string | undefined) {
  return useQuery({
    queryKey: ['preferencias', profileId],
    enabled: !!profileId && !!orgId,
    staleTime: 60_000,
    queryFn: async (): Promise<Preferencias> => {
      const { data, error } = await supabase
        .from('notification_preferences')
        .select('*')
        .eq('profile_id', profileId!)
        .maybeSingle();
      if (error) throw error;

      // A migration semeia uma linha por perfil existente, mas quem entrar
      // depois não tem. O padrão da tela espelha o do banco.
      return (
        (data as unknown as Preferencias) ?? {
          profile_id: profileId!,
          organization_id: orgId!,
          lead_scope: 'meus',
          push_enabled: true,
          muted_types: [],
        }
      );
    },
  });
}

export function useSalvarPreferencias(profileId: string, orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<Preferencias>) => {
      const { error } = await supabase.from('notification_preferences').upsert(
        {
          profile_id: profileId,
          organization_id: orgId,
          ...patch,
        },
        { onConflict: 'profile_id' },
      );
      // O banco recusa corretor pedindo alcance 'todos'. A tela nem oferece a
      // opção, mas se alguém chamar a API direto a resposta precisa ser legível.
      if (error) {
        throw new Error(
          error.message.includes('todos os leads')
            ? 'Seu perfil não permite receber aviso de todos os leads.'
            : error.message,
        );
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['preferencias', profileId] });
    },
  });
}

export function useSalvarPerfil(profileId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: {
      full_name?: string;
      phone?: string | null;
      creci?: string | null;
      title?: string | null;
    }) => {
      const { error } = await supabase.from('profiles').update(patch).eq('id', profileId);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['team-map'] });
    },
  });
}

/**
 * Troca de senha.
 *
 * `updateUser({ password })` do Supabase NÃO confere a senha atual — basta ter
 * a sessão. Numa imobiliária, onde o notebook fica no balcão e a sessão dura
 * dias, isso é o bastante para alguém trocar a senha do corretor e trancá-lo
 * para fora da própria carteira.
 *
 * Por isso reautenticamos primeiro, com a senha atual. Se ela estiver errada, a
 * troca nem é tentada.
 */
export function useTrocarSenha(email: string | undefined) {
  return useMutation({
    mutationFn: async (p: { atual: string; nova: string }) => {
      if (!email) throw new Error('Sessão sem e-mail. Entre novamente.');
      if (p.nova.length < 8) throw new Error('A nova senha precisa de pelo menos 8 caracteres.');
      if (p.nova === p.atual) throw new Error('A nova senha é igual à atual.');

      const { error: erroLogin } = await supabase.auth.signInWithPassword({
        email,
        password: p.atual,
      });
      if (erroLogin) throw new Error('Senha atual incorreta.');

      const { error } = await supabase.auth.updateUser({ password: p.nova });
      if (error) throw new Error(error.message);
    },
  });
}

// -----------------------------------------------------------------------------
// Cobrança de resposta (a 128)
// -----------------------------------------------------------------------------

/**
 * Depois de quantas horas sem resposta o CRM cobra a casa.
 *
 * Mora na IMOBILIÁRIA e não na pessoa: é combinação de equipe, não preferência
 * de quem está olhando a tela. A RLS de `organizations` já só deixa gerente e
 * admin gravarem — a tela esconde o cartão pelo mesmo motivo, mas quem segura
 * é o banco.
 */
export function useCobrancaDeResposta(orgId: string | undefined) {
  return useQuery({
    queryKey: ['cobranca-de-resposta', orgId],
    enabled: !!orgId,
    staleTime: 60_000,
    queryFn: async (): Promise<number | null> => {
      const { data, error } = await supabase
        .from('organizations')
        .select('aviso_espera_horas')
        .eq('id', orgId!)
        .single();
      if (error) throw error;
      return (data?.aviso_espera_horas as number | null) ?? null;
    },
  });
}

export function useSalvarCobrancaDeResposta(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (horas: number | null) => {
      const { error } = await supabase
        .from('organizations')
        .update({ aviso_espera_horas: horas })
        .eq('id', orgId);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['cobranca-de-resposta', orgId] });
    },
  });
}
