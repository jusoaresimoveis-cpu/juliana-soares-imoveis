import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { chamarFuncao } from '@/lib/funcoes';
import { papelPrincipal, type AppRole } from '@contracts';

export interface Integrante {
  id: string;
  full_name: string;
  email: string | null;
  creci: string | null;
  title: string | null;
  is_active: boolean;
  role: AppRole | null;
  created_at: string;
}

export function useEquipe(orgId: string | undefined) {
  return useQuery({
    queryKey: ['equipe', orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<Integrante[]> => {
      const [perfis, papeis] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, full_name, email, creci, title, is_active, created_at')
          .order('full_name'),
        supabase.from('user_roles').select('user_id, role').eq('organization_id', orgId!),
      ]);
      if (perfis.error) throw perfis.error;
      if (papeis.error) throw papeis.error;

      const porPessoa = new Map<string, string[]>();
      for (const p of papeis.data ?? []) {
        const l = porPessoa.get(p.user_id) ?? [];
        l.push(p.role as string);
        porPessoa.set(p.user_id, l);
      }

      return (perfis.data ?? []).map((p) => ({
        ...p,
        role: papelPrincipal(porPessoa.get(p.id) ?? []),
      })) as Integrante[];
    },
  });
}


export interface ContaCriada {
  id: string;
  email: string;
  senhaTemporaria: string;
}

export interface SenhaRedefinida {
  nome: string | null;
  senhaTemporaria: string;
}

/**
 * Redefine a senha de OUTRA pessoa da equipe.
 *
 * O token da sessão vai EXPLÍCITO, e o motivo é a armadilha que custou uma
 * noite no módulo de WhatsApp: o `supabase-js` resolve o `Authorization`
 * sozinho e cai para a chave publicável quando não acha a sessão. A chave nova
 * (`sb_publishable_…`) não é um JWT, e o portão desta função exige um — então
 * a recusa vem do portão, antes da função rodar, sem cabeçalho de origem. O
 * navegador descarta a resposta e sobra "Failed to send a request", que não
 * diz nada sobre sessão.
 */
export function useRedefinirSenha() {
  return useMutation({
    mutationFn: async (userId: string): Promise<SenhaRedefinida> => {
      const { data: sessao } = await supabase.auth.getSession();
      if (!sessao.session) {
        throw new Error('Sua sessão expirou. Recarregue a página e entre novamente.');
      }

      return chamarFuncao<SenhaRedefinida>(
        'redefinir-senha',
        { userId },
        'Não foi possível redefinir a senha.',
      );
    },
  });
}

/**
 * Criar conta passa pela edge function, porque exige a chave de serviço.
 *
 * Todo o resto da gestão de equipe vai direto pelo cliente: o RLS e os gatilhos
 * da migration 007 já decidem quem pode o quê, e duplicar essa regra numa função
 * seria criar dois lugares para ela divergir.
 */
export function useCriarConta(orgId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (dados: {
      nome: string;
      email: string;
      papel: AppRole;
      creci?: string;
    }): Promise<ContaCriada> => {
      // Passa por `chamarFuncao`: ele manda o token da sessão EXPLÍCITO. Sem
      // isso o supabase-js pode cair para a chave publicável, que não é um JWT,
      // e o portão recusa com 401 sem cabeçalho de origem — o navegador
      // descarta a resposta e a tela mostra "Failed to send a request to the
      // Edge Function". Foi o que aconteceu ao criar a segunda corretora.
      return chamarFuncao<ContaCriada>('criar-corretor', dados, 'Não foi possível criar a conta.');
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['equipe', orgId] });
      void qc.invalidateQueries({ queryKey: ['team-map'] });
    },
  });
}

function traduzir(e: { message?: string }): Error {
  const m = e.message ?? '';
  if (/administrador pode conceder/i.test(m)) {
    return new Error('Só um administrador pode conceder ou remover o papel de administrador.');
  }
  if (/desativar a própria conta/i.test(m)) return new Error('Você não pode desativar a própria conta.');
  if (/última conta de administrador/i.test(m)) {
    return new Error('Esta é a última conta de administrador ativa. Promova outra antes.');
  }
  return new Error(m || 'Não foi possível salvar.');
}

export function useAcoesEquipe(orgId: string | undefined) {
  const qc = useQueryClient();
  const invalidar = () => {
    void qc.invalidateQueries({ queryKey: ['equipe', orgId] });
    void qc.invalidateQueries({ queryKey: ['team-map'] });
  };

  const trocarPapel = useMutation({
    mutationFn: async (p: { userId: string; papel: AppRole }) => {
      if (!orgId) throw new Error('Organização não resolvida.');
      const { error } = await supabase
        .from('user_roles')
        .update({ role: p.papel })
        .eq('user_id', p.userId)
        .eq('organization_id', orgId);
      if (error) throw traduzir(error);
    },
    onSuccess: invalidar,
  });

  /**
   * Desativa em vez de apagar.
   *
   * O corretor que sai continua sendo o autor de anotações, o responsável por
   * visitas realizadas e o primeiro contato de leads fechados. Apagar o perfil
   * transformaria todo esse histórico em "usuário desconhecido" — e é
   * justamente esse histórico que responde "quem trouxe esse cliente".
   */
  const alternarAtivo = useMutation({
    mutationFn: async (p: { userId: string; ativo: boolean }) => {
      const { error } = await supabase
        .from('profiles')
        .update({ is_active: p.ativo })
        .eq('id', p.userId);
      if (error) throw traduzir(error);
    },
    onSuccess: invalidar,
  });

  return { trocarPapel, alternarAtivo };
}
