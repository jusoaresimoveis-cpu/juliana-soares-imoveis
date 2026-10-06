-- =============================================================================
-- O PREÇO DE TABELA: "DE R$ X POR R$ Y"
--
-- Pedido do usuário em 06/10/2026: imóvel à venda com valor de tabela e
-- desconto, e o site mostrando os dois. `price_cents` continua sendo o preço de
-- venda, o que se paga (o "por"). `original_price_cents` é o de tabela (o
-- "de"), e só existe ACIMA dele: igual ou abaixo não é desconto, e "de R$ 900
-- mil por R$ 950 mil" na vitrine faz a página parecer erro. A mesma regra está
-- em `precoDeTabela` (packages/contracts), que o formulário e o site usam.
--
-- Só venda: aluguel não tem tabela. A busca por faixa e a ordem por preço
-- continuam no preço de venda, que é o que a pessoa paga.
-- =============================================================================

alter table public.properties add column original_price_cents bigint;

alter table public.properties
  add constraint properties_original_price_ck check (
    original_price_cents is null
    or (price_cents is not null and price_cents > 0 and original_price_cents > price_cents)
  );

comment on column public.properties.original_price_cents is
  'Preço de TABELA da venda, em centavos: o "de" do "de R$ X por R$ Y". Só existe acima de price_cents.';

-- -----------------------------------------------------------------------------
-- A leitura do site (20260924000200) devolve o preço de tabela junto com o de
-- venda. O resto da função é o mesmo.
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
          'amenities',       to_jsonb(p.amenities),
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
