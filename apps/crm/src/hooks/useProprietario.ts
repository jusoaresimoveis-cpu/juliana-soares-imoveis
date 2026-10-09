import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { exigir } from '@/lib/exigir';

// O dono do imóvel e os dois números que importam para ele: quem se interessou
// e quantas visitas a página teve no site. São a base do painel do proprietário
// (docs/DECISOES.md); hoje aparecem na ficha do imóvel.

/** Quem demonstrou interesse neste imóvel. */
export function useInteressados(propertyId: string | undefined) {
  return useQuery({
    queryKey: ['imovel-interessados', propertyId],
    enabled: !!propertyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lead_property_interests')
        .select('id, is_primary, created_at, leads(id, full_name, phone_e164, stage_id)')
        .eq('property_id', exigir(propertyId, 'o imóvel'))
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Array<{
        id: string;
        is_primary: boolean;
        created_at: string;
        leads: { id: string; full_name: string; phone_e164: string | null; stage_id: string } | null;
      }>;
    },
  });
}

/** O dono do imóvel, que entregou para a corretora administrar (migration 20260925000100). */
export interface Proprietario {
  id: string;
  full_name: string;
  /** Onde o dono mora, que não é onde fica o imóvel. */
  city: string | null;
  phone_e164: string;
}

export function useProprietario(ownerId: string | null | undefined) {
  return useQuery({
    queryKey: ['proprietario', ownerId],
    enabled: !!ownerId,
    queryFn: async (): Promise<Proprietario> => {
      const { data, error } = await supabase
        .from('property_owners')
        .select('id, full_name, city, phone_e164')
        .eq('id', exigir(ownerId, 'o proprietário'))
        .single();
      if (error) throw error;
      return data;
    },
  });
}

/**
 * Grava o dono pelo formulário. O banco acha o cadastro pelo telefone (o mesmo
 * número em outro imóvel é a mesma pessoa) e devolve a frase do erro quando o
 * telefone não serve.
 */
export function useDefinirProprietario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (dono: { imovel: string; nome: string; cidade: string; telefone: string }) => {
      const { error } = await supabase.rpc('definir_proprietario', {
        _imovel: dono.imovel,
        _nome: dono.nome,
        _cidade: dono.cidade,
        _telefone: dono.telefone,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: (_resposta, dono) => {
      void qc.invalidateQueries({ queryKey: ['imovel', dono.imovel] });
      void qc.invalidateQueries({ queryKey: ['proprietario'] });
    },
  });
}

/**
 * As visitas à página do imóvel no site, somadas. O site conta uma por aparelho
 * e por dia (ver `registrar_visita`); `desde` é o primeiro dia com visita.
 */
export function useVisitasDoImovel(propertyId: string | undefined) {
  return useQuery({
    queryKey: ['imovel-visitas', propertyId],
    enabled: !!propertyId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('property_page_views')
        .select('day, views')
        .eq('property_id', exigir(propertyId, 'o imóvel'));
      if (error) throw error;
      const dias = data ?? [];
      return {
        total: dias.reduce((soma, d) => soma + d.views, 0),
        desde: dias.reduce<string | null>((menor, d) => (!menor || d.day < menor ? d.day : menor), null),
      };
    },
  });
}
