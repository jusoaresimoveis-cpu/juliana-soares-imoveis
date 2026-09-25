import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { atendeLead, papelPrincipal, type FiltroDeTemperatura } from '@contracts';
import type { Database } from '@/lib/database.types';
import { BOARD_COLUMNS, type BoardLead, type PipelineStage, type TeamMember } from '@/types/db';

type LeadUpdate = Database['public']['Tables']['leads']['Update'];

/** Quantos cards cada coluna traz antes do "carregar mais". */
export const PAGE = 30;

export interface Periodo {
  de: string; // ISO
  ate: string; // ISO
}

export interface ColunaDoQuadro {
  stage: PipelineStage;
  leads: BoardLead[];
  total: number;
}

export function usePipelineStages(orgId: string | undefined) {
  return useQuery({
    queryKey: ['pipeline-stages', orgId],
    enabled: !!orgId,
    staleTime: 5 * 60_000, // etapas quase nunca mudam
    queryFn: async (): Promise<PipelineStage[]> => {
      const { data, error } = await supabase
        .from('pipeline_stages')
        .select(
          'id, key, label, position, color, requires_value, requires_reason, requires_schedule, is_won, is_lost',
        )
        .eq('is_active', true)
        .order('position');
      if (error) throw error;
      return (data ?? []) as PipelineStage[];
    },
  });
}

/**
 * Todo mundo da organização, para EXIBIR nome e iniciais.
 *
 * Traz inclusive quem não atende lead: se um registro antigo aponta para o
 * admin, o card precisa continuar mostrando o nome dele em vez de um vazio.
 * Quem pode ser ESCOLHIDO é outra pergunta — `useCorretores` abaixo.
 *
 * O papel vem numa segunda consulta porque `user_roles.user_id` referencia
 * `auth.users`, não `profiles`: sem chave estrangeira entre as duas, o
 * PostgREST não sabe embutir uma na outra.
 */
export function useTeamMap(orgId: string | undefined) {
  return useQuery({
    queryKey: ['team-map', orgId],
    enabled: !!orgId,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Record<string, TeamMember>> => {
      const [perfis, papeis] = await Promise.all([
        supabase.from('profiles').select('id, full_name, avatar_url').eq('is_active', true),
        supabase.from('user_roles').select('user_id, role').eq('organization_id', orgId!),
      ]);
      if (perfis.error) throw perfis.error;
      if (papeis.error) throw papeis.error;

      const porPessoa = new Map<string, string[]>();
      for (const p of papeis.data ?? []) {
        const lista = porPessoa.get(p.user_id) ?? [];
        lista.push(p.role as string);
        porPessoa.set(p.user_id, lista);
      }

      const mapa: Record<string, TeamMember> = {};
      for (const m of (perfis.data ?? []) as Array<Omit<TeamMember, 'role'>>) {
        mapa[m.id] = { ...m, role: papelPrincipal(porPessoa.get(m.id) ?? []) };
      }
      return mapa;
    },
  });
}

/**
 * Só quem atende lead — é a lista que os seletores devem oferecer.
 *
 * O admin cuida de desenvolvimento e de mídia. Enquanto a consulta trazia todo
 * perfil ativo, ele aparecia no seletor de corretor da agenda e do lembrete, e
 * dava para marcar visita no nome de quem nunca vai abrir a porta do imóvel.
 */
export function useCorretores(orgId: string | undefined) {
  const equipe = useTeamMap(orgId);
  return {
    ...equipe,
    data: Object.values(equipe.data ?? {}).filter((m) => m.role && atendeLead(m.role)),
  };
}

/**
 * Carrega o quadro: uma consulta por etapa, em paralelo, cada uma limitada e
 * com a contagem total da coluna.
 *
 * As duas decisões que fazem diferença de verdade estão aqui:
 *
 * 1. O recorte de período vai no SERVIDOR (`gte`/`lte`). O sistema atual baixa
 *    todos os leads da organização, sem filtro de data, e recorta no navegador
 *    — o que estoura o teto de linhas do PostgREST em silêncio e trunca o
 *    quadro sem ninguém perceber.
 * 2. A paginação é POR COLUNA. Uma etapa com 800 leads não impede a coluna do
 *    lado de carregar, e o card que ninguém vai rolar não é baixado.
 *
 * Quando o volume justificar, isso vira uma função no banco devolvendo o
 * quadro inteiro numa chamada. Enquanto forem sete consultas indexadas em
 * paralelo, o ganho não paga a complexidade.
 */
/**
 * A chave do quadro, num lugar só.
 *
 * A tela monta a mesma chave para as atualizações otimistas de mover e de
 * atribuir. Enquanto eram dois arrays escritos à mão, um filtro novo que
 * entrasse só num deles faria o cartão mover na tela e o cache certo nunca
 * saber disso.
 */
export function chaveDoQuadro(p: {
  orgId: string | undefined;
  periodo: Periodo;
  busca: string;
  responsavel: string | null;
  temperatura: FiltroDeTemperatura;
}) {
  return ['leads-board', p.orgId, p.periodo.de, p.periodo.ate, p.busca, p.responsavel, p.temperatura] as const;
}

export function useLeadsBoard(params: {
  orgId: string | undefined;
  stages: PipelineStage[] | undefined;
  periodo: Periodo;
  busca: string;
  responsavel: string | null;
  temperatura: FiltroDeTemperatura;
}) {
  const { orgId, stages, periodo, busca, responsavel, temperatura } = params;

  return useQuery({
    queryKey: chaveDoQuadro({ orgId, periodo, busca, responsavel, temperatura }),
    enabled: !!orgId && !!stages?.length,
    staleTime: 30_000,
    placeholderData: (anterior) => anterior, // troca de período não pisca zero
    queryFn: async (): Promise<ColunaDoQuadro[]> => {
      const termo = busca.trim().replace(/[%,()]/g, '');

      const colunas = await Promise.all(
        (stages ?? []).map(async (stage) => {
          let q = supabase
            .from('leads')
            .select(BOARD_COLUMNS, { count: 'exact' })
            .eq('stage_id', stage.id)
            .gte('created_at', periodo.de)
            .lte('created_at', periodo.ate)
            .order('stage_changed_at', { ascending: false })
            .range(0, PAGE - 1);

          if (termo) {
            q = q.or(
              `full_name.ilike.%${termo}%,phone.ilike.%${termo}%,email.ilike.%${termo}%,ft_utm_campaign.ilike.%${termo}%`,
            );
          }
          if (responsavel) q = q.eq('assigned_to', responsavel);

          // `temperatura` é coluna gerada no banco (a 120): a marcação do
          // corretor ou, sem ela, a regra. Nula = ninguém qualificou.
          if (temperatura === 'sem') q = q.is('temperatura', null);
          else if (temperatura !== 'todas') q = q.eq('temperatura', temperatura);

          const { data, error, count } = await q;
          if (error) throw error;
          return {
            stage,
            leads: (data ?? []) as unknown as BoardLead[],
            total: count ?? 0,
          };
        }),
      );

      return colunas;
    },
  });
}

interface MoverParams {
  lead: BoardLead;
  paraStageId: string;
  valorCents?: number | null;
  motivo?: string | null;
  motivoTexto?: string | null;
}

/**
 * Move o card entre etapas com atualização otimista.
 *
 * Nenhum dos dois sistemas de referência faz isso: os dois recarregam o quadro
 * inteiro depois de cada arraste, e o board pisca para esqueleto. Aqui o card
 * muda de coluna na hora e volta sozinho se o servidor recusar.
 */
export function useMoverLead(chaveDoQuadro: readonly unknown[]) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ lead, paraStageId, valorCents, motivo, motivoTexto }: MoverParams) => {
      const patch: LeadUpdate = { stage_id: paraStageId };
      if (valorCents !== undefined) patch.deal_value_cents = valorCents;
      if (motivo !== undefined) patch.loss_reason = motivo;
      if (motivoTexto !== undefined) patch.loss_reason_text = motivoTexto;

      const { error } = await supabase.from('leads').update(patch).eq('id', lead.id);
      if (error) throw error;
    },

    onMutate: async ({ lead, paraStageId }) => {
      await qc.cancelQueries({ queryKey: chaveDoQuadro });
      const anterior = qc.getQueryData<ColunaDoQuadro[]>(chaveDoQuadro);

      qc.setQueryData<ColunaDoQuadro[]>(chaveDoQuadro, (atual) => {
        if (!atual) return atual;
        return atual.map((col) => {
          if (col.stage.id === lead.stage_id) {
            return {
              ...col,
              leads: col.leads.filter((l) => l.id !== lead.id),
              total: Math.max(0, col.total - 1),
            };
          }
          if (col.stage.id === paraStageId) {
            const movido: BoardLead = {
              ...lead,
              stage_id: paraStageId,
              stage_changed_at: new Date().toISOString(),
            };
            return { ...col, leads: [movido, ...col.leads], total: col.total + 1 };
          }
          return col;
        });
      });

      return { anterior };
    },

    onError: (_erro, _vars, ctx) => {
      if (ctx?.anterior) qc.setQueryData(chaveDoQuadro, ctx.anterior);
    },

    onSettled: () => {
      void qc.invalidateQueries({ queryKey: chaveDoQuadro });
    },
  });
}

/**
 * Passar o lead para alguém, direto do cartão.
 *
 * Existia só pela ficha: abrir o lead, achar o seletor na lateral, escolher,
 * voltar. Com um corretor isso era um detalhe; com dois passa a ser a operação
 * mais repetida do dia — e quem distribui olha o quadro inteiro, não uma ficha
 * de cada vez.
 *
 * O AVISO ao corretor não sai daqui: sai de um gatilho no banco (migration
 * 074). Escrevendo aqui, a ficha — que atribui pelo mesmo campo — continuaria
 * muda, e a distribuição automática que um dia existir nasceria muda também.
 * O que se esquece de avisar é sempre o caminho acrescentado depois.
 */
export function useAtribuirLead(chaveDoQuadro: readonly unknown[]) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ leadId, para }: { leadId: string; para: string | null }) => {
      const { error } = await supabase.from('leads').update({ assigned_to: para }).eq('id', leadId);
      if (error) throw error;
    },

    // O cartão troca de dono na hora. Uma ida ao servidor para ver o nome mudar
    // faria a pessoa clicar duas vezes achando que não pegou.
    onMutate: async ({ leadId, para }) => {
      await qc.cancelQueries({ queryKey: chaveDoQuadro });
      const anterior = qc.getQueryData<ColunaDoQuadro[]>(chaveDoQuadro);

      qc.setQueryData<ColunaDoQuadro[]>(chaveDoQuadro, (atual) =>
        atual?.map((col) => ({
          ...col,
          leads: col.leads.map((l) => (l.id === leadId ? { ...l, assigned_to: para } : l)),
        })),
      );

      return { anterior };
    },

    onError: (_e, _v, ctx) => {
      if (ctx?.anterior) qc.setQueryData(chaveDoQuadro, ctx.anterior);
    },

    onSettled: () => {
      void qc.invalidateQueries({ queryKey: chaveDoQuadro });
    },
  });
}
