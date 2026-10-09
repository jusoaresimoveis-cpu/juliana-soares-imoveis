import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { exigir } from '@/lib/exigir';
import type { AttributionMethod, LeadSource, RespostasDeQualificacao, Variant } from '@contracts';

export interface InteresseDoLead {
  title: string;
  public_code: string;
  for_sale: boolean;
  for_rent: boolean;
  price_cents: number | null;
  rent_cents: number | null;
  /** Empreendimento: o preço é o "a partir de", e sai com as disponíveis (`valoresDoImovel`). */
  has_units: boolean;
  units_available: number;
}

export interface LeadPreviewData extends RespostasDeQualificacao {
  id: string;
  email: string | null;
  notes: string | null;
  created_at: string;
  first_contact_at: string | null;
  stage_changed_at: string;
  source: LeadSource;
  ft_variant: Variant | null;
  ft_locale: string | null;
  ft_utm_campaign: string | null;
  ft_meta_ad_id: string | null;
  attribution_method: AttributionMethod;
  ab_contaminated: boolean;
  deal_value_cents: number | null;
  interesses: InteresseDoLead[];
  timeline: { category: string; title: string; occurred_at: string }[];
}

/**
 * Dados extras da prévia, buscados só quando o painel abre.
 *
 * Ficam em cache por 2 minutos: passar o mouse de novo no mesmo card é
 * instantâneo. Manter isso fora da consulta do quadro é o que evita
 * arrastar campo grande de 200 cards para desenhar um painel de um.
 */
export function useLeadPreview(leadId: string | null) {
  return useQuery({
    queryKey: ['lead-preview', leadId],
    enabled: !!leadId,
    staleTime: 120_000,
    queryFn: async (): Promise<LeadPreviewData> => {
      const [lead, interesses, timeline] = await Promise.all([
        supabase
          .from('leads')
          .select(
            'id, email, notes, created_at, first_contact_at, stage_changed_at, source, ft_variant, ft_locale, ft_utm_campaign, ft_meta_ad_id, attribution_method, ab_contaminated, deal_value_cents, finalidade, prazo_compra, encaixe_financeiro, temperatura_manual, temperatura_regra, temperatura',
          )
          .eq('id', exigir(leadId, 'o lead'))
          .single(),
        supabase
          .from('lead_property_interests')
          .select('properties(title, public_code, for_sale, for_rent, price_cents, rent_cents, has_units, units_available)')
          .eq('lead_id', exigir(leadId, 'o lead'))
          .limit(3),
        supabase
          .from('lead_timeline_events')
          .select('category, title, occurred_at')
          .eq('lead_id', exigir(leadId, 'o lead'))
          .order('occurred_at', { ascending: false })
          .limit(4),
      ]);

      if (lead.error) throw lead.error;

      const props = (interesses.data ?? [])
        .map((r) => r.properties)
        .filter((p): p is InteresseDoLead => !!p);

      return {
        ...(lead.data as Omit<LeadPreviewData, 'interesses' | 'timeline'>),
        interesses: props,
        timeline: (timeline.data ?? []) as LeadPreviewData['timeline'],
      };
    },
  });
}

export function diasDesde(iso: string | null): number | null {
  if (!iso) return null;
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
}

export function tempoAte(de: string, ate: string | null): string | null {
  if (!ate) return null;
  const min = Math.round((new Date(ate).getTime() - new Date(de).getTime()) / 60_000);
  if (min < 60) return `${min} min`;
  if (min < 1440) return `${Math.round(min / 60)} h`;
  return `${Math.round(min / 1440)} d`;
}
