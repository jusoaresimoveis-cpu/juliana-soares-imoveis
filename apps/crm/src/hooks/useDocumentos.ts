import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export interface CampoDeModelo {
  k: string;
  r: string;
  t: 'texto' | 'longo' | 'cpf' | 'telefone' | 'data' | 'hora' | 'dinheiro' | 'numero' | 'opcao';
  obrig?: boolean;
  opcoes?: string[];
}

export interface Modelo {
  id: string;
  organization_id: string | null;
  key: string;
  name: string;
  description: string | null;
  icon: string | null;
  body_html: string;
  fields: CampoDeModelo[];
  is_system: boolean;
  display_order: number;
}

export interface DocumentoEmitido {
  id: string;
  title: string;
  template_key: string | null;
  lead_id: string | null;
  created_at: string;
  created_by_name: string | null;
  rendered_html: string;
}

export function useModelos() {
  return useQuery({
    queryKey: ['doc-modelos'],
    queryFn: async (): Promise<Modelo[]> => {
      const { data, error } = await supabase
        .from('document_templates')
        .select(
          'id, organization_id, key, name, description, icon, body_html, fields, is_system, display_order',
        )
        .eq('is_active', true)
        .order('display_order');
      if (error) throw error;
      return (data ?? []).map((m) => ({
        ...m,
        // O banco guarda jsonb; o contrato da tela é a lista de campos.
        fields: (Array.isArray(m.fields) ? m.fields : []) as unknown as CampoDeModelo[],
      }));
    },
  });
}

/**
 * Os documentos que ESTA pessoa pode ver.
 *
 * Não há filtro por corretor aqui de propósito: quem filtra é a RLS, pela
 * mesma regra da conversa. Filtrar no cliente daria a impressão de proteção
 * enquanto a linha continuaria vindo pela rede.
 */
export function useDocumentos(leadId?: string) {
  return useQuery({
    queryKey: ['documentos', leadId ?? 'todos'],
    queryFn: async (): Promise<DocumentoEmitido[]> => {
      let q = supabase
        .from('documents')
        .select('id, title, template_key, lead_id, created_at, created_by_name, rendered_html')
        .order('created_at', { ascending: false })
        .limit(100);
      if (leadId) q = q.eq('lead_id', leadId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useEmitirDocumento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (d: {
      organizationId: string;
      criadoPor: string;
      criadoPorNome: string;
      modelo: Modelo;
      titulo: string;
      leadId: string | null;
      valores: Record<string, string>;
      html: string;
      comTimbre: boolean;
      comAssinatura: boolean;
    }) => {
      const { data, error } = await supabase
        .from('documents')
        .insert({
          organization_id: d.organizationId,
          lead_id: d.leadId,
          template_id: d.modelo.id,
          template_key: d.modelo.key,
          title: d.titulo,
          variables_used: d.valores,
          // Fotografia, não referência: o modelo pode mudar amanhã; este
          // documento tem de continuar dizendo o que dizia hoje.
          rendered_html: d.html,
          with_letterhead: d.comTimbre,
          with_signature: d.comAssinatura,
          created_by: d.criadoPor,
          created_by_name: d.criadoPorNome,
        })
        .select('id')
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['documentos'] });
    },
  });
}

export function useApagarDocumento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('documents').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['documentos'] });
    },
  });
}

export interface Imobiliaria {
  id: string;
  name: string;
  cnpj: string | null;
  creci: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  brand_color: string | null;
}

/**
 * Os dados que entram no timbre.
 *
 * Ficam fora do contexto de autenticação de propósito: só o documento precisa
 * deles, e carregar endereço e CNPJ em toda tela do CRM é peso que nunca é
 * usado.
 */
export function useImobiliaria() {
  return useQuery({
    queryKey: ['imobiliaria'],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Imobiliaria | null> => {
      const { data, error } = await supabase
        .from('organizations')
        .select('id, name, cnpj, creci, address, city, state, brand_color')
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}
