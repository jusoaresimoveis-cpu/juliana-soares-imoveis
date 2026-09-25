import type { AppRole, LeadSource, LossReason, Temperatura, Variant } from '@contracts';

export interface PipelineStage {
  id: string;
  key: string;
  label: string;
  position: number;
  color: string;
  requires_value: boolean;
  requires_reason: boolean;
  requires_schedule: boolean;
  is_won: boolean;
  is_lost: boolean;
}

/**
 * Projeção do lead para o quadro.
 *
 * Colunas nomeadas de propósito. O sistema atual faz `select('*')` de 54
 * colunas mais um join de perfil para desenhar um card que mostra cinco
 * campos — e ainda arrasta o JSON de payload de anúncio junto.
 */
export const BOARD_COLUMNS = [
  'id',
  'full_name',
  'phone',
  'phone_e164',
  'email',
  'stage_id',
  'source',
  'assigned_to',
  'ft_variant',
  'ft_locale',
  'ft_utm_campaign',
  'deal_value_cents',
  'loss_reason',
  'first_contact_at',
  'stage_changed_at',
  'created_at',
  // Só o selo. As três respostas ficam para a prévia e para a ficha: o cartão
  // mostra QUEM atender primeiro, não por quê.
  'temperatura',
].join(', ');

export interface BoardLead {
  id: string;
  full_name: string;
  phone: string | null;
  phone_e164: string | null;
  email: string | null;
  stage_id: string;
  source: LeadSource;
  assigned_to: string | null;
  ft_variant: Variant | null;
  ft_locale: string | null;
  ft_utm_campaign: string | null;
  deal_value_cents: number | null;
  loss_reason: LossReason | null;
  first_contact_at: string | null;
  stage_changed_at: string;
  created_at: string;
  /** Nulo = ninguém qualificou ainda. */
  temperatura: Temperatura | null;
}

export interface TeamMember {
  id: string;
  full_name: string;
  avatar_url: string | null;
  /** Nulo quando a pessoa não tem papel na organização. */
  role: AppRole | null;
}
