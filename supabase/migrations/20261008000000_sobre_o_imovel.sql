-- =============================================================================
-- "SOBRE O IMÓVEL": O QUE A UNIDADE, O EMPREENDIMENTO E O LAZER TÊM
--
-- Pedido do usuário em 08/10/2026: no cadastro, uma aba com itens prontos para
-- marcar, separados em unidade (o apartamento, a casa), empreendimento
-- (estrutura e segurança do condomínio) e área de lazer, e em cada uma um
-- campo para digitar o que não estiver na lista; mais "informações
-- adicionais", só texto. O site mostra tudo na seção "Sobre o imóvel".
--
-- Um jsonb por imóvel, e não a coluna antiga `amenities` (text[] sem
-- categoria, que o CRM nunca deixou editar e estava vazia em todos os imóveis):
-- o mesmo item pode ser da unidade ou do condomínio (a churrasqueira na sacada
-- e a do salão de festas são fatos diferentes), e o texto livre precisa saber
-- a categoria.
--
--   { "unidade": { "itens": ["lavabo"], "outros": ["Cozinha com ilha"] },
--     "empreendimento": {...}, "lazer": {...}, "adicionais": { "outros": [...] } }
--
-- Os ids e os rótulos moram em packages/contracts (`ITENS_DO_IMOVEL`). O banco
-- confere o FORMATO, não os ids: a lista vai crescer, e um id novo não pode
-- depender de migration.
-- =============================================================================

/*
 * O formato de `features`: só as quatro categorias, cada uma com `itens` e
 * `outros`, listas de texto de 1 a 120 caracteres e no máximo 300 por lista.
 * Os mesmos números estão em packages/contracts (`LIMITE_DO_TEXTO_LIVRE`,
 * `LIMITE_DE_ITENS`), e um teste confere.
 *
 * Fica executável por quem grava imóvel: a CHECK chama a função com o papel de
 * quem escreve.
 */
create or replace function public.caracteristicas_validas(_c jsonb)
returns boolean
language sql
immutable
set search_path = public
as $$
  select jsonb_typeof(_c) = 'object'
     and not exists (
       select 1
         from jsonb_each(_c) as categoria
        where categoria.key not in ('unidade', 'empreendimento', 'lazer', 'adicionais')
           or jsonb_typeof(categoria.value) <> 'object'
           or exists (
                select 1
                  from jsonb_each(categoria.value) as lista
                 where lista.key not in ('itens', 'outros')
                    or jsonb_typeof(lista.value) <> 'array'
                    or jsonb_array_length(lista.value) > 300
                    or exists (
                         select 1
                           from jsonb_array_elements(lista.value) as texto
                          where jsonb_typeof(texto) <> 'string'
                             or char_length(texto #>> '{}') not between 1 and 120
                       )
              )
     );
$$;

revoke all on function public.caracteristicas_validas(jsonb) from public, anon;
grant execute on function public.caracteristicas_validas(jsonb) to authenticated, service_role;

alter table public.properties
  add column features jsonb not null default '{}'::jsonb;

alter table public.properties
  add constraint properties_features_ck check (public.caracteristicas_validas(features));

comment on column public.properties.features is
  'Sobre o imóvel: itens marcados (ids de ITENS_DO_IMOVEL, packages/contracts) e texto livre por categoria (unidade, empreendimento, lazer, adicionais).';

-- -----------------------------------------------------------------------------
-- A leitura do site (20261006000000) devolve `features` no lugar de
-- `amenities`, que ninguém preenchia. O resto da função é o mesmo.
-- -----------------------------------------------------------------------------
create or replace function public.site_imoveis(_organizacao text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(imovel order by destaque desc, publicado_em desc), '[]'::jsonb)
    from (
      select
        p.is_featured as destaque,
        p.published_at as publicado_em,
        jsonb_build_object(
          'public_code',     p.public_code,
          'slug',            p.slug,
          'old_slugs',       (select coalesce(jsonb_agg(h.old_slug order by h.replaced_at), '[]'::jsonb)
                                from public.property_slug_history h
                               where h.property_id = p.id),
          'public_title',    p.public_title,
          'description',     p.description,
          'property_type',   p.property_type,
          'for_sale',        p.for_sale,
          'for_rent',        p.for_rent,
          'status',          p.status,
          -- Valor de um regime que o imóvel não tem fica em casa: um imóvel
          -- que só aluga pode ter o preço de venda que o dono pediu anotado.
          'price_cents',     case when p.for_sale then p.price_cents end,
          'original_price_cents', case when p.for_sale then p.original_price_cents end,
          'rent_cents',      case when p.for_rent then p.rent_cents end,
          'condo_fee_cents', p.condo_fee_cents,
          'iptu_year_cents', p.iptu_year_cents,
          'bedrooms',        p.bedrooms,
          'suites',          p.suites,
          'bathrooms',       p.bathrooms,
          'parking_spots',   p.parking_spots,
          'area_built',      p.area_built,
          'area_total',      p.area_total,
          'neighborhood',    p.neighborhood,
          'city',            p.city,
          'features',        p.features,
          'is_featured',     p.is_featured,
          -- Trocar uma foto não mexe em `properties.updated_at`, mas muda a
          -- página: o sitemap precisa saber.
          'updated_at',      greatest(p.updated_at,
                                      (select max(m.created_at) from public.property_media m where m.property_id = p.id)),
          'media',           (select coalesce(jsonb_agg(jsonb_build_object(
                                        'storage_path', m.storage_path,
                                        'width',        m.width,
                                        'height',       m.height,
                                        'alt_text',     m.alt_text,
                                        'caption',      m.caption)
                                      order by m.is_cover desc, m.position, m.created_at), '[]'::jsonb)
                                from public.property_media m
                               where m.property_id = p.id and m.kind = 'image')
        ) as imovel
        from public.properties p
        join public.organizations o on o.id = p.organization_id
       where o.slug = _organizacao
         and o.is_active
         and p.is_published
    ) publicados;
$$;

revoke all on function public.site_imoveis(text) from public;
grant execute on function public.site_imoveis(text) to anon, authenticated, service_role;
