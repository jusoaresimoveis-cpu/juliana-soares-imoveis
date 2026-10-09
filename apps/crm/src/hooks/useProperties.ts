import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { exigir } from '@/lib/exigir';
import type { Database } from '@/lib/database.types';
import type { PropertyPurpose, PropertyStatus, PropertyType } from '@contracts';

// A mídia e o dono (com interessados e visitas) moram em arquivos próprios;
// daqui seguem com o mesmo nome, para quem importa de '@/hooks/useProperties'.
export {
  BUCKET,
  urlPublica,
  useCovers,
  useMediaActions,
  usePropertyMedia,
  type OriginalSemMarca,
  type PropertyMedia,
} from './useMidiaDoImovel';
export {
  useDefinirProprietario,
  useInteressados,
  useProprietario,
  useVisitasDoImovel,
  type Proprietario,
} from './useProprietario';

export type PropertyUpdate = Database['public']['Tables']['properties']['Update'];

export const LISTA_COLUNAS = [
  'id',
  'public_code',
  'slug',
  'title',
  'property_type',
  'purpose',
  'for_sale',
  'for_rent',
  'status',
  'price_cents',
  'rent_cents',
  'bedrooms',
  'suites',
  'bathrooms',
  'parking_spots',
  'area_total',
  'neighborhood',
  'city',
  'state',
  'is_published',
  'is_featured',
  'created_at',
  // O empreendimento mostra "A partir de R$ X · N disponíveis" no cartão.
  'has_units',
  'units_available',
].join(', ');

export interface Property {
  id: string;
  public_code: string;
  slug: string | null;
  title: string;
  property_type: PropertyType;
  /** Calculada no banco a partir de `for_sale` e `for_rent`: lê-se, não se grava. */
  purpose: PropertyPurpose;
  for_sale: boolean;
  for_rent: boolean;
  status: PropertyStatus;
  /** Preço de VENDA. */
  price_cents: number | null;
  /** Aluguel MENSAL. */
  rent_cents: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  parking_spots: number | null;
  area_total: number | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  is_published: boolean;
  is_featured: boolean;
  created_at: string;
  /**
   * Empreendimento com várias unidades (migration 20261009000000): o preço é o
   * "a partir de" e a situação vem das unidades, calculados pelo banco.
   */
  has_units: boolean;
  /** Quantas unidades estão disponíveis. Calculado; só leitura. */
  units_available: number;

  /*
   * Plano de pagamento.
   *
   * Opcionais no tipo porque a LISTA não os projeta — ela mostra cartão, não
   * proposta. Quem carrega a linha inteira é a ficha, e é dela que o
   * formulário abre para editar.
   */
  payment_methods?: string[] | null;
  down_payment_cents?: number | null;
  installments_count?: number | null;
  installment_cents?: number | null;
  reinforcement_count?: number | null;
  reinforcement_cents?: number | null;
  reinforcement_period?: 'semestral' | 'anual' | null;
  keys_cents?: number | null;
  payment_notes?: string | null;

  /* Os campos que a ficha carrega e a lista não: o formulário abre dela. */
  /** Preço de TABELA da venda com desconto: o "de" do "de R$ X por R$ Y". */
  original_price_cents?: number | null;
  /** "Sobre o imóvel" (jsonb): passe por `normalizarCaracteristicas` antes de usar. */
  features?: unknown;
  public_title?: string | null;
  suites?: number | null;
  area_built?: number | null;
  condo_fee_cents?: number | null;
  iptu_year_cents?: number | null;
  rental_guarantees?: string[] | null;

  /* O empreendimento. A construtora é só do CRM: nunca sai no site. */
  developer?: string | null;
  /** Previsão de entrega, guardada como 1º de janeiro: só o ano sai no site. */
  delivery_at?: string | null;
  construction_status?: string | null;
  incorporation_registry?: string | null;
  incorporation_registry_office?: string | null;
  /** Mês da tabela de preços aplicada (dia 1). Fora do mês corrente, o site mostra "Consulte". */
  units_table_month?: string | null;
}

const PAGINA = 24;

export function useProperties(params: {
  orgId: string | undefined;
  busca: string;
  apenasPublicados: boolean;
  pagina: number;
}) {
  const { orgId, busca, apenasPublicados, pagina } = params;

  return useQuery({
    queryKey: ['properties', orgId, busca, apenasPublicados, pagina],
    enabled: !!orgId,
    staleTime: 30_000,
    placeholderData: (anterior) => anterior,
    queryFn: async () => {
      const termo = busca.trim().replace(/[%,()]/g, '');
      const de = pagina * PAGINA;

      let q = supabase
        .from('properties')
        .select(LISTA_COLUNAS, { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(de, de + PAGINA - 1);

      if (termo) {
        q = q.or(
          `title.ilike.%${termo}%,neighborhood.ilike.%${termo}%,city.ilike.%${termo}%,public_code.ilike.%${termo}%`,
        );
      }
      if (apenasPublicados) q = q.eq('is_published', true);

      const { data, error, count } = await q;
      if (error) throw error;
      return { itens: (data ?? []) as unknown as Property[], total: count ?? 0, porPagina: PAGINA };
    },
  });
}

export function useSalvarImovel(orgId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, dados }: { id: string | null; dados: PropertyUpdate }) => {
      if (id) {
        const { error } = await supabase.from('properties').update(dados).eq('id', id);
        if (error) throw error;
        return id;
      }

      // Na criação, organização e título são obrigatórios no banco. Falhar
      // aqui com mensagem clara é melhor do que deixar o Postgres recusar
      // com erro de constraint na cara do corretor.
      if (!orgId) throw new Error('Organização não resolvida. Recarregue e tente de novo.');
      if (!dados.title?.trim()) throw new Error('O imóvel precisa de um título.');

      const { data, error } = await supabase
        .from('properties')
        .insert({ ...dados, organization_id: orgId, title: dados.title })
        .select('id')
        .single();
      if (error) throw error;
      return data.id;
    },
    // A ficha também: sem isto ela seguia com a linha de antes, e o formulário
    // aberto de novo dali regravava o valor velho por cima do que acabou de ser salvo.
    onSuccess: (id) => {
      void qc.invalidateQueries({ queryKey: ['properties'] });
      void qc.invalidateQueries({ queryKey: ['imovel', id] });
    },
  });
}

/**
 * A linha inteira, para a ficha do imóvel.
 *
 * Aqui `select('*')` é a escolha certa, e não uma exceção preguiçosa à
 * disciplina de projeção: é UMA linha, e a tela mostra tudo. O que não pode é
 * a LISTA trazer tudo — foi ela que ficou sem `description`, e por isso o
 * formulário de edição abria com a descrição vazia, obrigando o corretor a
 * redigitar um texto que continuava salvo no banco.
 */
export interface PropertyFull extends Property {
  description: string | null;
  /*
   * O nome DESCRITIVO da página pública (migração 041). Nulo é o normal: vazio,
   * o banco monta um da ficha. Nunca o nome do empreendimento — é a coluna que
   * existe justamente para o `title` interno não vazar para superfície pública.
   */
  public_title: string | null;
  condo_fee_cents: number | null;
  iptu_year_cents: number | null;
  area_built: number | null;
  suites: number | null;
  floor: number | null;
  address: string | null;
  address_number: string | null;
  complement: string | null;
  zip_code: string | null;
  show_exact_address: boolean;
  internal_notes: string | null;
  published_at: string | null;
  updated_at: string;
  /** O dono do imóvel (`property_owners`), quando cadastrado. */
  owner_id: string | null;
}

export function useProperty(id: string | undefined) {
  return useQuery({
    queryKey: ['imovel', id],
    enabled: !!id,
    staleTime: 15_000,
    queryFn: async (): Promise<PropertyFull> => {
      const { data, error } = await supabase.from('properties').select('*').eq('id', exigir(id, 'o imóvel')).single();
      if (error) throw error;
      return data as unknown as PropertyFull;
    },
  });
}
