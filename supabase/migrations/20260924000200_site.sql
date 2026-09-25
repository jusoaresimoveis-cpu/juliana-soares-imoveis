-- =============================================================================
-- O SITE
--
-- O site público (Next.js, apps/site) lê os imóveis daqui, com a chave pública,
-- e é avisado quando um imóvel muda para refazer as páginas.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1 · A leitura
--
-- Uma função, e não `select` em `properties` liberado para o `anon`: a tabela
-- tem dono, observação interna, endereço que a corretora pode não ter liberado
-- e rascunho não publicado. Liberar a tabela e confiar numa policy por coluna
-- é um esquecimento de distância de vazar tudo isso. Aqui sai só o que a página
-- mostra, e só do que está publicado.
--
-- Uma chamada devolve TODOS os publicados: o site filtra em memória. Uma
-- corretora autônoma tem centenas de imóveis, e assim cada página estática sai
-- de uma ida só ao banco.
--
-- Alugado, vendido e suspenso também saem: a página do imóvel continua no ar
-- com aviso (o link pode estar num grupo de WhatsApp) e é o site que tira da
-- vitrine. Despublicar no CRM é o que tira do ar.
--
-- `stable` porque o site chama por GET, que o PostgREST só aceita em função
-- que não escreve, e é o GET que o cache do Next guarda.
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

-- -----------------------------------------------------------------------------
-- 2 · O aviso
--
-- Quando um imóvel ou uma foto muda, o banco chama `/api/revalidar` do site, e
-- as páginas que mostram imóveis se refazem na visita seguinte. Sem isto, a
-- Juliana salvaria o imóvel e o site mostraria o antigo por até uma hora.
--
-- Um aviso por COMANDO, não por linha: reordenar vinte fotos é um aviso, não
-- vinte. E vale para qualquer caminho de escrita (tela, importação, SQL à mão),
-- que é o motivo de ser gatilho e não código do CRM.
--
-- O endereço e o segredo moram no Vault (`site_revalidar_url` e
-- `site_revalidar_segredo`). Sem eles, a função não faz nada: é o estado antes
-- do lançamento, e não pode travar o cadastro de imóvel.
-- -----------------------------------------------------------------------------
create or replace function public.avisar_site_dos_imoveis()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url     text;
  v_segredo text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'site_revalidar_url';
  select decrypted_secret into v_segredo from vault.decrypted_secrets where name = 'site_revalidar_segredo';
  if v_url is null or v_segredo is null then
    return null;
  end if;

  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-revalidacao', v_segredo),
    body    := '{}'::jsonb);
  return null;
end $$;

revoke all on function public.avisar_site_dos_imoveis() from public, anon, authenticated;

create trigger properties_avisa_site
  after insert or update or delete on public.properties
  for each statement execute function public.avisar_site_dos_imoveis();

create trigger property_media_avisa_site
  after insert or update or delete on public.property_media
  for each statement execute function public.avisar_site_dos_imoveis();
