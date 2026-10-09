import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { exigir } from '@/lib/exigir';
import type { Database } from '@/lib/database.types';
import type {
  AttributionMethod,
  EncaixeFinanceiro,
  Finalidade,
  LeadSource,
  LossReason,
  PrazoDeCompra,
  Temperatura,
  Variant,
} from '@contracts';

type LeadUpdate = Database['public']['Tables']['leads']['Update'];

export interface LeadFull {
  id: string;
  organization_id: string;
  stage_id: string;
  full_name: string;
  phone: string | null;
  phone_country: string;
  phone_e164: string | null;
  email: string | null;
  /** Cidade INFORMADA. Nunca deduzida do DDD — a região mora noutro lugar. */
  city: string | null;
  source: LeadSource;
  entry_point: string | null;
  assigned_to: string | null;
  notes: string | null;
  tags: string[];
  deal_value_cents: number | null;
  commission_pct: number | null;
  loss_reason: LossReason | null;
  loss_reason_text: string | null;
  /** O que a pessoa disse — as três respostas da qualificação. */
  finalidade: Finalidade | null;
  prazo_compra: PrazoDeCompra | null;
  encaixe_financeiro: EncaixeFinanceiro | null;
  /** Marcação do corretor. Ganha da regra. */
  temperatura_manual: Temperatura | null;
  /** Colunas GERADAS no banco: a tela lê, nunca escreve. */
  temperatura_regra: Temperatura | null;
  temperatura: Temperatura | null;
  created_at: string;
  first_contact_at: string | null;
  stage_changed_at: string;
  ft_variant: Variant | null;
  ft_locale: string | null;
  ft_utm_source: string | null;
  ft_utm_campaign: string | null;
  ft_meta_ad_id: string | null;
  ft_occurred_at: string | null;
  lt_variant: Variant | null;
  lt_occurred_at: string | null;
  attribution_method: AttributionMethod;
  ab_contaminated: boolean;
  variants_seen: string[];
  gclid: string | null;
  fbclid: string | null;
  landing_page_url: string | null;
  referrer: string | null;
}

export interface TimelineEvent {
  id: string;
  category: string;
  event_type: string;
  title: string;
  description: string | null;
  actor_label: string | null;
  occurred_at: string;
}

/**
 * O imóvel como a ficha do lead o mostra. O valor sai por `valoresDoImovel`,
 * que precisa do regime e, no empreendimento, das disponíveis: o preço solto
 * de um empreendimento é o "a partir de", e lido sozinho parece o preço dele.
 */
export interface ImovelDoLead {
  title: string;
  public_code: string;
  neighborhood: string | null;
  for_sale: boolean;
  for_rent: boolean;
  price_cents: number | null;
  rent_cents: number | null;
  has_units: boolean;
  units_available: number;
}

const COLUNAS_DO_IMOVEL_DO_LEAD =
  'title, public_code, neighborhood, for_sale, for_rent, price_cents, rent_cents, has_units, units_available';

export interface Interesse {
  id: string;
  property_id: string;
  is_primary: boolean;
  properties: ImovelDoLead | null;
}

export function useLead(id: string | undefined) {
  return useQuery({
    queryKey: ['lead', id],
    enabled: !!id,
    staleTime: 15_000,
    queryFn: async (): Promise<LeadFull> => {
      const { data, error } = await supabase.from('leads').select('*').eq('id', exigir(id, 'o lead')).single();
      if (error) throw error;
      return data as unknown as LeadFull;
    },
  });
}

export function useTimeline(leadId: string | undefined) {
  return useQuery({
    queryKey: ['lead-timeline', leadId],
    enabled: !!leadId,
    queryFn: async (): Promise<TimelineEvent[]> => {
      const { data, error } = await supabase
        .from('lead_timeline_events')
        .select('id, category, event_type, title, description, actor_label, occurred_at')
        .eq('lead_id', exigir(leadId, 'o lead'))
        .order('occurred_at', { ascending: false })
        .limit(80);
      if (error) throw error;
      return (data ?? []) as TimelineEvent[];
    },
  });
}

export function useInteresses(leadId: string | undefined) {
  return useQuery({
    queryKey: ['lead-interesses', leadId],
    enabled: !!leadId,
    queryFn: async (): Promise<Interesse[]> => {
      const { data, error } = await supabase
        .from('lead_property_interests')
        .select(`id, property_id, is_primary, properties(${COLUNAS_DO_IMOVEL_DO_LEAD})`)
        .eq('lead_id', exigir(leadId, 'o lead'));
      if (error) throw error;
      return (data ?? []) as unknown as Interesse[];
    },
  });
}

export function useSalvarLead(leadId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: LeadUpdate) => {
      const { error } = await supabase.from('leads').update(patch).eq('id', leadId);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['lead', leadId] });
      void qc.invalidateQueries({ queryKey: ['leads-board'] });
      void qc.invalidateQueries({ queryKey: ['lead-preview', leadId] });
      // Etapa e qualificação viram linha no histórico por gatilho, no banco.
      void qc.invalidateQueries({ queryKey: ['lead-timeline', leadId] });
    },
  });
}

/**
 * Anotação vira evento na linha do tempo, não um campo que sobrescreve o
 * anterior. O sistema atual guarda tudo num campo único de observações —
 * o que faz cada anotação apagar o contexto da anterior e torna impossível
 * saber quem escreveu o quê, e quando.
 */
export function useAnotar(leadId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (texto: string) => {
      const { error } = await supabase.rpc('log_timeline_event', {
        _lead_id: leadId,
        _category: 'lead',
        _event_type: 'nota',
        _title: 'Anotação',
        _description: texto,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['lead-timeline', leadId] });
    },
  });
}

export function useInteresseActions(leadId: string, orgId: string | undefined) {
  const qc = useQueryClient();
  const invalidar = () => {
    void qc.invalidateQueries({ queryKey: ['lead-interesses', leadId] });
    void qc.invalidateQueries({ queryKey: ['lead-timeline', leadId] });
  };

  const adicionar = useMutation({
    mutationFn: async (p: { id: string; title: string }) => {
      if (!orgId) throw new Error('Organização não resolvida.');
      const { error } = await supabase
        .from('lead_property_interests')
        .insert({ organization_id: orgId, lead_id: leadId, property_id: p.id });
      if (error) throw error;
      await supabase.rpc('log_timeline_event', {
        _lead_id: leadId,
        _category: 'imovel',
        _event_type: 'interesse_adicionado',
        _title: `Interesse: ${p.title}`,
      });
    },
    onSuccess: invalidar,
  });

  const remover = useMutation({
    mutationFn: async (interesseId: string) => {
      const { error } = await supabase.from('lead_property_interests').delete().eq('id', interesseId);
      if (error) throw error;
    },
    onSuccess: invalidar,
  });

  return { adicionar, remover };
}

/** Busca de imóveis para vincular ao lead. */
export function useBuscaImoveis(termo: string) {
  return useQuery({
    queryKey: ['busca-imoveis', termo],
    enabled: termo.trim().length >= 2,
    staleTime: 30_000,
    queryFn: async () => {
      const t = termo.trim().replace(/[%,()]/g, '');
      const { data, error } = await supabase
        .from('properties')
        .select(`id, ${COLUNAS_DO_IMOVEL_DO_LEAD}`)
        .or(`title.ilike.%${t}%,neighborhood.ilike.%${t}%,public_code.ilike.%${t}%`)
        .limit(8);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export interface OrigemMeta {
  conta: string | null;
  campanha: string | null;
  conjunto: string | null;
  anuncio: string | null;
  situacao: string | null;
  permalink: string | null;
}

/**
 * Conta, campanha, conjunto e anúncio — por NOME.
 *
 * A ficha mostrava o id do anúncio (dezoito dígitos), que é o certo e é ilegível: ninguém
 * decide nada olhando dezoito dígitos. Quem cuida do tráfego quer saber qual
 * peça trouxe a pessoa, e o corretor quer saber o que ela viu antes de escrever.
 *
 * Vai por RPC e não por join na tela porque as três tabelas da Meta são
 * legíveis só por admin e gerente. Um join direto deixaria este bloco vazio
 * justamente para o corretor. A função devolve só os nomes — gasto continua
 * restrito à gestão, na tela de Anúncios.
 */
export function useOrigemMeta(leadId: string | undefined, temAnuncio: boolean) {
  return useQuery({
    queryKey: ['origem-meta', leadId],
    // Sem id de anúncio no lead não há o que resolver, e pedir seria uma ida ao
    // servidor para receber vazio em toda ficha que não veio de campanha.
    enabled: Boolean(leadId) && temAnuncio,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<OrigemMeta | null> => {
      // O `enabled` acima já garante o id; o `!` seria uma promessa a mais para
      // manter, e este `if` custa nada.
      if (!leadId) return null;
      const { data, error } = await supabase.rpc('lead_origem_meta', { _lead: leadId });
      if (error) throw error;
      const linha = (data as OrigemMeta[] | null)?.[0];
      return linha ?? null;
    },
  });
}

export interface PaginaDoLead {
  lead_id: string;
  rotulo: string;
  imovel: string;
  variante: string;
  mercado: string;
  url: string;
}

/**
 * De qual landing page o lead veio — rótulo pronto e a URL pública.
 *
 * Recebe uma LISTA porque o painel mostra cinco leads na primeira dobra, e
 * cinco leads não podem custar cinco idas ao servidor. A ficha passa um só.
 */
/**
 * As etiquetas extras da lista de últimos leads: conta de anúncio e responsável.
 *
 * Em LOTE, no mesmo formato de `usePaginaDoLead`. `lead_origem_meta` já resolvia
 * o nome da conta, mas para um lead por vez — cinco chamadas para desenhar cinco
 * etiquetas é o tipo de coisa que faz a primeira dobra abrir devagar.
 *
 * Com duas BMs na casa, o canal deixou de identificar: dois leads marcados
 * "Meta Ads" podem ter saído de contas diferentes, e é essa diferença que diz de
 * quem é o resultado.
 */
export interface EtiquetasDoLead {
  lead_id: string;
  /** Nome da conta de anúncio. Nulo enquanto o anúncio não tiver gasto importado. */
  conta: string | null;
  responsavel: string | null;
}

export function useEtiquetasDoLead(leadIds: string[]) {
  const chave = [...leadIds].sort().join(',');
  return useQuery({
    queryKey: ['etiquetas-do-lead', chave],
    enabled: leadIds.length > 0,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Record<string, EtiquetasDoLead>> => {
      const { data, error } = await supabase.rpc('leads_etiquetas', { _leads: leadIds });
      if (error) throw error;
      const mapa: Record<string, EtiquetasDoLead> = {};
      for (const l of (data as EtiquetasDoLead[] | null) ?? []) mapa[l.lead_id] = l;
      return mapa;
    },
  });
}

export function usePaginaDoLead(leadIds: string[]) {
  const chave = [...leadIds].sort().join(',');
  return useQuery({
    queryKey: ['pagina-do-lead', chave],
    enabled: leadIds.length > 0,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Record<string, PaginaDoLead>> => {
      const { data, error } = await supabase.rpc('leads_de_qual_pagina', { _leads: leadIds });
      if (error) throw error;
      const mapa: Record<string, PaginaDoLead> = {};
      for (const l of (data as PaginaDoLead[] | null) ?? []) mapa[l.lead_id] = l;
      return mapa;
    },
  });
}
