import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { exigir } from '@/lib/exigir';
import type { Json } from '@/lib/database.types';
import type { UnitStatus } from '@contracts';

/**
 * As plantas e as unidades de um empreendimento (migration 20261009000000).
 *
 * O empreendimento continua sendo UM imóvel: o preço dele é o "a partir de" e
 * a situação vem das unidades, e quem calcula é o gatilho do banco. Por isso
 * toda gravação aqui invalida também a ficha e a lista de imóveis.
 */

export interface Planta {
  id: string;
  name: string;
  finals: string[];
  /** Os quartos SEM as suítes, como no imóvel. */
  bedrooms: number | null;
  suites: number | null;
  bathrooms: number | null;
  parking_spots: number | null;
  area_built: number | null;
  position: number;
}

export interface Unidade {
  id: string;
  label: string;
  floor: number | null;
  floorplan_id: string;
  /** Só quando difere da planta (sala comercial). */
  area_built: number | null;
  price_cents: number | null;
  status: UnitStatus;
  /** Interno: nunca sai para o site. */
  notes: string | null;
}

const COLUNAS_DA_PLANTA = 'id, name, finals, bedrooms, suites, bathrooms, parking_spots, area_built, position';
const COLUNAS_DA_UNIDADE = 'id, label, floor, floorplan_id, area_built, price_cents, status, notes';

export function useUnidades(propertyId: string | null | undefined, ligado = true) {
  return useQuery({
    queryKey: ['unidades', propertyId],
    enabled: !!propertyId && ligado,
    staleTime: 15_000,
    queryFn: async (): Promise<{ plantas: Planta[]; unidades: Unidade[] }> => {
      const [plantas, unidades] = await Promise.all([
        supabase
          .from('property_floorplans')
          .select(COLUNAS_DA_PLANTA)
          .eq('property_id', exigir(propertyId, 'o imóvel'))
          .order('position')
          .order('name'),
        supabase.from('property_units').select(COLUNAS_DA_UNIDADE).eq('property_id', exigir(propertyId, 'o imóvel')),
      ]);
      if (plantas.error) throw plantas.error;
      if (unidades.error) throw unidades.error;
      return {
        plantas: (plantas.data ?? []) as Planta[],
        unidades: (unidades.data ?? []) as Unidade[],
      };
    },
  });
}

/**
 * A frase do erro do banco que a Juliana entende. As restrições têm nome, e o
 * nome diz o que aconteceu; o resto passa como veio (as mensagens das funções
 * do banco já são em português).
 */
export function mensagemDoErro(erro: unknown): string {
  const m = (erro as { message?: string })?.message ?? String(erro);
  if (/property_floorplans_name_uk/.test(m)) return 'Já existe uma planta com esse nome neste imóvel.';
  if (/property_units_label_uk/.test(m)) return 'Já existe uma unidade com esse número neste imóvel.';
  // A mesma chave falha dos dois lados, e só a frase do Postgres diz qual: o
  // "update" aparece nas duas, então quem separa é a tabela da operação.
  if (/update or delete on table "property_floorplans"/.test(m))
    return 'A planta tem unidades. Mude a planta delas no seletor de planta de “Situação de cada unidade” (aba Unidades) antes de apagar esta.';
  if (/insert or update on table "property_units"/.test(m) && /property_units_floorplan_fk/.test(m))
    return 'Essa planta não existe mais (foi apagada em outro aparelho). Recarregue a página e escolha a planta de novo.';
  if (/property_units_preco_ck/.test(m)) return 'Unidade disponível precisa de preço.';
  if (/property_floorplans_finals_check/.test(m)) return 'Final inválido: use até 4 letras ou números, como 01.';
  if (/property_units_label_check/.test(m)) return 'Número da unidade inválido: até 8 letras ou números, como 804.';
  if (/properties_unidades_ck/.test(m)) return 'Empreendimento com unidades é só venda, sem aluguel nem preço de tabela.';
  return m;
}

/** O empreendimento mudou: a ficha, a lista (o "a partir de") e as unidades. */
function useInvalidar(propertyId: string | null | undefined) {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['unidades', propertyId] });
    void qc.invalidateQueries({ queryKey: ['imovel', propertyId] });
    void qc.invalidateQueries({ queryKey: ['properties'] });
  };
}

export type DadosDaPlanta = Pick<
  Planta,
  'name' | 'finals' | 'bedrooms' | 'suites' | 'bathrooms' | 'parking_spots' | 'area_built'
>;

/** Devolve o id da planta: a nova precisa dele para receber as unidades dos finais dela. */
export function useSalvarPlanta(orgId: string | undefined, propertyId: string | undefined) {
  const invalidar = useInvalidar(propertyId);
  return useMutation({
    mutationFn: async ({ id, dados, posicao }: { id: string | null; dados: DadosDaPlanta; posicao: number }): Promise<string> => {
      if (id) {
        const { error } = await supabase.from('property_floorplans').update(dados).eq('id', id);
        if (error) throw new Error(mensagemDoErro(error));
        return id;
      }
      if (!orgId || !propertyId) throw new Error('Organização não resolvida. Recarregue e tente de novo.');
      const { data, error } = await supabase
        .from('property_floorplans')
        .insert({ ...dados, organization_id: orgId, property_id: propertyId, position: posicao })
        .select('id')
        .single();
      if (error) throw new Error(mensagemDoErro(error));
      return data.id;
    },
    onSuccess: invalidar,
  });
}

/**
 * Passa várias unidades para uma planta num update só: as dos finais que a
 * planta ganhou (`unidadesQueSeguemOsFinais`). O site agrupa as unidades pela
 * planta gravada nelas, e não pelo final, então mudar os finais não basta.
 */
export function useMoverParaAPlanta(propertyId: string | undefined) {
  const invalidar = useInvalidar(propertyId);
  return useMutation({
    mutationFn: async ({ floorplan_id, ids }: { floorplan_id: string; ids: string[] }) => {
      if (!ids.length) return 0;
      const { error } = await supabase.from('property_units').update({ floorplan_id }).in('id', ids);
      if (error) throw new Error(mensagemDoErro(error));
      return ids.length;
    },
    onSuccess: invalidar,
  });
}

export function useApagarPlanta(propertyId: string | undefined) {
  const invalidar = useInvalidar(propertyId);
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('property_floorplans').delete().eq('id', id);
      if (error) throw new Error(mensagemDoErro(error));
    },
    onSuccess: invalidar,
  });
}

export interface UnidadeNova {
  label: string;
  floor: number | null;
  floorplan_id: string;
  area_built?: number | null;
}

/**
 * Cria unidades num insert só (as 90 do prédio, ou uma sala). Nascem vendidas
 * (o padrão do banco): só aparecem no site quando a tabela do mês as dá como
 * disponíveis, e nada vira disponível por omissão.
 */
export function useCriarUnidades(orgId: string | undefined, propertyId: string | undefined) {
  const invalidar = useInvalidar(propertyId);
  return useMutation({
    mutationFn: async (novas: UnidadeNova[]) => {
      if (!orgId || !propertyId) throw new Error('Organização não resolvida. Recarregue e tente de novo.');
      if (!novas.length) return 0;
      const { error } = await supabase
        .from('property_units')
        .insert(novas.map((u) => ({ ...u, organization_id: orgId, property_id: propertyId })));
      if (error) throw new Error(mensagemDoErro(error));
      return novas.length;
    },
    onSuccess: invalidar,
  });
}

/**
 * A venda (ou a reserva) no meio do mês: muda a situação de uma unidade sem
 * aplicar tabela. Pela tabela, gravar mudaria o mês dela no imóvel, e o site
 * voltaria a mostrar preço de uma tabela vencida. Também troca a planta de
 * uma unidade (o seletor de planta de "Situação de cada unidade").
 */
export function useMudarUnidade(propertyId: string | undefined) {
  const invalidar = useInvalidar(propertyId);
  return useMutation({
    mutationFn: async ({ id, ...dados }: { id: string; status?: UnitStatus; floorplan_id?: string }) => {
      const { error } = await supabase.from('property_units').update(dados).eq('id', id);
      if (error) throw new Error(mensagemDoErro(error));
    },
    onSuccess: invalidar,
  });
}

export function useApagarUnidade(propertyId: string | undefined) {
  const invalidar = useInvalidar(propertyId);
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('property_units').delete().eq('id', id);
      if (error) throw new Error(mensagemDoErro(error));
    },
    onSuccess: invalidar,
  });
}

/**
 * Aplica a tabela da construtora: uma chamada, tudo ou nada, e o mês da tabela
 * no imóvel (é ele que tira o "Consulte" do site). Devolve quantas unidades
 * mudaram.
 *
 * `linhas` leva só as unidades que a Juliana mudou (`conferirTabela`): mandar
 * a grade inteira regravaria, com o estado de quando a página abriu, o que
 * outro aparelho mudou depois. Lista vazia também grava o mês.
 */
export function useAplicarTabela(propertyId: string | undefined) {
  const invalidar = useInvalidar(propertyId);
  return useMutation({
    mutationFn: async ({
      mes,
      linhas,
    }: {
      /** "2026-10-01" */
      mes: string;
      linhas: { label: string; price_cents: number | null; status: UnitStatus }[];
    }) => {
      if (!propertyId) throw new Error('Imóvel não encontrado.');
      const { data, error } = await supabase.rpc('aplicar_tabela_de_unidades', {
        _imovel: propertyId,
        _mes: mes,
        _linhas: linhas as unknown as Json,
      });
      if (error) throw new Error(mensagemDoErro(error));
      return data ?? 0;
    },
    onSuccess: invalidar,
  });
}
