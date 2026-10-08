import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { prepararFoto } from '@/lib/fotos';
import type { Database, Json } from '@/lib/database.types';
import type { PropertyPurpose, PropertyStatus, PropertyType } from '@contracts';

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

/** O arquivo de antes da marca, guardado para desfazer (migration 20260926000100). */
export interface OriginalSemMarca {
  storage_path: string;
  bytes: number | null;
  width: number | null;
  height: number | null;
  mime_type: string | null;
}

export interface PropertyMedia {
  id: string;
  property_id: string;
  kind: 'image' | 'video' | 'document' | 'tour';
  storage_path: string;
  position: number;
  is_cover: boolean;
  caption: string | null;
  alt_text: string | null;
  bytes: number | null;
  width: number | null;
  height: number | null;
  mime_type: string | null;
  /** A foto no ar tem a marca d'água. */
  marca_dagua: boolean;
  /** Render ou decorado: o site avisa "Imagem ilustrativa" na foto. */
  is_illustrative: boolean;
  original_sem_marca: OriginalSemMarca | null;
}

export const BUCKET = 'property-media';

export function urlPublica(storagePath: string): string {
  return supabase.storage.from(BUCKET).getPublicUrl(storagePath).data.publicUrl;
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

/** Capa de cada imóvel da página, numa consulta só — não uma por card. */
export function useCovers(ids: string[]) {
  const chave = ids.slice().sort().join(',');
  return useQuery({
    queryKey: ['property-covers', chave],
    enabled: ids.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('property_media')
        .select('property_id, storage_path')
        .in('property_id', ids)
        .eq('is_cover', true);
      if (error) throw error;
      const mapa: Record<string, string> = {};
      for (const m of (data ?? []) as { property_id: string; storage_path: string }[]) {
        mapa[m.property_id] = urlPublica(m.storage_path);
      }
      return mapa;
    },
  });
}

export function usePropertyMedia(propertyId: string | null) {
  return useQuery({
    queryKey: ['property-media', propertyId],
    enabled: !!propertyId,
    queryFn: async (): Promise<PropertyMedia[]> => {
      const { data, error } = await supabase
        .from('property_media')
        .select(
          'id, property_id, kind, storage_path, position, is_cover, caption, alt_text, bytes, width, height, mime_type, marca_dagua, original_sem_marca, is_illustrative',
        )
        .eq('property_id', propertyId!)
        // A ordem do site (`site_imoveis`): a capa primeiro, depois a posição.
        // Fotos de antes de `ordenar_midia` podem ter a capa no meio.
        .order('is_cover', { ascending: false })
        .order('position')
        .order('created_at');
      if (error) throw error;
      return (data ?? []) as unknown as PropertyMedia[];
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

export function useMediaActions(orgId: string | undefined, propertyId: string | null) {
  const qc = useQueryClient();
  const invalidar = () => {
    void qc.invalidateQueries({ queryKey: ['property-media', propertyId] });
    void qc.invalidateQueries({ queryKey: ['property-covers'] });
  };

  const enviar = useMutation({
    // `marcaDagua` vem de quem chama, e não de uma consulta aqui dentro: a foto
    // sai com a marca que a tela MOSTRAVA ligada na hora do envio.
    mutationFn: async ({ arquivos, marcaDagua }: { arquivos: File[]; marcaDagua: boolean }) => {
      if (!orgId || !propertyId) throw new Error('Salve o imóvel antes de enviar mídia.');

      const { data: atuais } = await supabase
        .from('property_media')
        .select('id, position, is_cover')
        .eq('property_id', propertyId);

      let posicao = (atuais ?? []).reduce((m, x) => Math.max(m, (x as { position: number }).position), -1) + 1;
      const jaTemCapa = (atuais ?? []).some((x) => (x as { is_cover: boolean }).is_cover);

      for (const arquivo of arquivos) {
        // Foto sobe reduzida e, com a chave ligada, com a marca d'água (ver
        // `lib/fotos.ts`); vídeo sobe como veio.
        const foto = arquivo.type.startsWith('image/') ? await prepararFoto(arquivo, { marcaDagua }) : null;
        const corpo = foto?.arquivo ?? arquivo;
        const ext = foto?.extensao ?? arquivo.name.split('.').pop()?.toLowerCase() ?? 'bin';
        // Pasta por organização: é o primeiro segmento que a política do
        // storage confere. Depois por imóvel, para apagar em bloco.
        const caminho = `${orgId}/${propertyId}/${crypto.randomUUID()}.${ext}`;

        const { error: upErro } = await supabase.storage
          .from(BUCKET)
          .upload(caminho, corpo, {
            cacheControl: '31536000',
            upsert: false,
            contentType: foto?.tipo ?? arquivo.type,
          });
        if (upErro) throw upErro;

        const kind = arquivo.type.startsWith('video/')
          ? 'video'
          : arquivo.type === 'application/pdf'
            ? 'document'
            : 'image';

        const { error: insErro } = await supabase.from('property_media').insert({
          organization_id: orgId,
          property_id: propertyId,
          kind,
          storage_path: caminho,
          position: posicao,
          is_cover: kind === 'image' && !jaTemCapa && posicao === 0,
          mime_type: foto?.tipo ?? arquivo.type,
          bytes: corpo.size,
          // O site usa as dimensões na prévia do link (WhatsApp, Facebook).
          width: foto?.largura ?? null,
          height: foto?.altura ?? null,
          marca_dagua: kind === 'image' && marcaDagua,
        });
        if (insErro) throw insErro;
        posicao += 1;
      }
    },
    onSuccess: invalidar,
  });

  /*
   * A ordem nova, inteira, numa chamada só ao banco (`ordenar_midia`, migration
   * 20261006000100), que também faz da primeira foto a capa.
   *
   * `scope`: uma gravação por vez, na ordem em que a pessoa soltou. Duas
   * arrastadas rápidas não podem chegar trocadas, senão a penúltima vence.
   */
  const ordenar = useMutation({
    scope: { id: `ordenar-midia-${propertyId}` },
    mutationFn: async (ids: string[]) => {
      if (!propertyId) return;
      const { error } = await supabase.rpc('ordenar_midia', { _imovel: propertyId, _ordem: ids });
      if (error) throw error;
    },
    // Recusado: a tela volta a mostrar a ordem que o banco tem.
    onError: invalidar,
    // A capa pode ter mudado, e a lista de imóveis mostra a capa.
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['property-covers'] }),
  });

  /**
   * Põe as mídias nesta ordem. A tela muda NA HORA, sem esperar o banco: a foto
   * fica onde a pessoa soltou, em vez de voltar ao lugar antigo até a resposta.
   */
  function reordenar(lista: PropertyMedia[]) {
    const chave = ['property-media', propertyId];
    // Uma leitura em andamento traria a ordem antiga por cima desta. Cancelar
    // é síncrono (devolve o estado de antes da leitura), então o que vale é o
    // que se grava logo abaixo.
    void qc.cancelQueries({ queryKey: chave });
    const capa = lista.find((m) => m.kind === 'image')?.id;
    qc.setQueryData<PropertyMedia[]>(
      chave,
      lista.map((m, i) => ({ ...m, position: i, is_cover: m.id === capa })),
    );
    ordenar.mutate(lista.map((m) => m.id));
  }

  const remover = useMutation({
    mutationFn: async (media: PropertyMedia) => {
      const { error } = await supabase.from('property_media').delete().eq('id', media.id);
      if (error) throw error;
      // O arquivo sai junto. O sistema atual só apaga a linha e deixa o
      // arquivo órfão no bucket para sempre.
      await supabase.storage.from(BUCKET).remove([media.storage_path]);
      // Sem a capa, a primeira foto que sobrou vira a capa (lista vazia: o
      // banco só arruma a ordem que já existe). Se falhar, a foto já saiu, e a
      // capa se acerta na próxima vez que alguém mexer na ordem.
      if (media.is_cover && propertyId) {
        await supabase.rpc('ordenar_midia', { _imovel: propertyId, _ordem: [] });
      }
    },
    onSuccess: invalidar,
  });

  /*
   * Põe a marca nas fotos que subiram antes dela.
   *
   * Cada foto é baixada, redesenhada com a marca e sobe num arquivo NOVO. No
   * mesmo arquivo, o site e o navegador continuariam mostrando a versão sem
   * marca que guardaram (o cache das fotos é de um ano). A linha passa a
   * apontar para o arquivo novo, e o antigo fica no Storage, anotado em
   * `original_sem_marca`, para desfazer.
   *
   * Uma foto por vez, e cada uma inteira ou nada: se a gravação da linha
   * falhar, o arquivo novo sai do Storage. O `eq('marca_dagua', false)` impede
   * a marca dupla quando o botão roda em duas abas ao mesmo tempo.
   */
  const porMarca = useMutation({
    mutationFn: async ({
      fotos,
      aoAvancar,
    }: {
      fotos: PropertyMedia[];
      aoAvancar?: (feitas: number, total: number) => void;
    }) => {
      if (!orgId || !propertyId) throw new Error('Salve o imóvel antes.');
      const alvo = fotos.filter((f) => f.kind === 'image' && !f.marca_dagua);

      for (const [i, foto] of alvo.entries()) {
        const resposta = await fetch(urlPublica(foto.storage_path));
        if (!resposta.ok) throw new Error(`Não deu para baixar a foto ${i + 1} de ${alvo.length}.`);
        const corpo = await resposta.blob();
        const pronta = await prepararFoto(
          new File([corpo], foto.storage_path.split('/').pop() ?? 'foto.jpg', { type: corpo.type || 'image/jpeg' }),
          { marcaDagua: true },
        );

        const caminho = `${orgId}/${propertyId}/${crypto.randomUUID()}.${pronta.extensao}`;
        const { error: upErro } = await supabase.storage.from(BUCKET).upload(caminho, pronta.arquivo, {
          cacheControl: '31536000',
          upsert: false,
          contentType: pronta.tipo,
        });
        if (upErro) throw upErro;

        const original: OriginalSemMarca = {
          storage_path: foto.storage_path,
          bytes: foto.bytes,
          width: foto.width,
          height: foto.height,
          mime_type: foto.mime_type,
        };
        const { data, error } = await supabase
          .from('property_media')
          .update({
            storage_path: caminho,
            bytes: pronta.arquivo.size,
            width: pronta.largura,
            height: pronta.altura,
            mime_type: pronta.tipo,
            marca_dagua: true,
            original_sem_marca: original as unknown as Json,
          })
          .eq('id', foto.id)
          .eq('marca_dagua', false)
          .select('id');
        if (error || !data?.length) {
          await supabase.storage.from(BUCKET).remove([caminho]);
          if (error) throw error;
        }
        aoAvancar?.(i + 1, alvo.length);
      }
    },
    onSettled: invalidar,
  });

  /* Volta as fotos ao arquivo sem marca e apaga a cópia com marca, que se refaz com um clique. */
  const tirarMarca = useMutation({
    mutationFn: async ({ fotos }: { fotos: PropertyMedia[] }) => {
      for (const foto of fotos) {
        const o = foto.original_sem_marca;
        if (!o) continue;
        const { data, error } = await supabase
          .from('property_media')
          .update({
            storage_path: o.storage_path,
            bytes: o.bytes,
            width: o.width,
            height: o.height,
            mime_type: o.mime_type,
            marca_dagua: false,
            original_sem_marca: null,
          })
          .eq('id', foto.id)
          .eq('storage_path', foto.storage_path)
          .select('id');
        if (error) throw error;
        if (data?.length) await supabase.storage.from(BUCKET).remove([foto.storage_path]);
      }
    },
    onSettled: invalidar,
  });

  /*
   * "Imagem ilustrativa": o empreendimento na planta mostra render, e o site
   * avisa na foto (nada inventado no site). Uma foto ou várias numa gravação.
   */
  const ilustrativa = useMutation({
    mutationFn: async ({ ids, valor }: { ids: string[]; valor: boolean }) => {
      if (!ids.length) return;
      const { error } = await supabase.from('property_media').update({ is_illustrative: valor }).in('id', ids);
      if (error) throw error;
    },
    onSettled: invalidar,
  });

  return { enviar, reordenar, ordenar, remover, porMarca, tirarMarca, ilustrativa };
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
      const { data, error } = await supabase.from('properties').select('*').eq('id', id!).single();
      if (error) throw error;
      return data as unknown as PropertyFull;
    },
  });
}

/** Quem demonstrou interesse neste imóvel. */
export function useInteressados(propertyId: string | undefined) {
  return useQuery({
    queryKey: ['imovel-interessados', propertyId],
    enabled: !!propertyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lead_property_interests')
        .select('id, is_primary, created_at, leads(id, full_name, phone_e164, stage_id)')
        .eq('property_id', propertyId!)
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
        .eq('id', ownerId!)
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
        .eq('property_id', propertyId!);
      if (error) throw error;
      const dias = data ?? [];
      return {
        total: dias.reduce((soma, d) => soma + d.views, 0),
        desde: dias.reduce<string | null>((menor, d) => (!menor || d.day < menor ? d.day : menor), null),
      };
    },
  });
}
