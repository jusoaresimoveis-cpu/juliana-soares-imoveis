-- =============================================================================
-- EMPREENDIMENTO COM VÁRIAS UNIDADES
--
-- Pedido do usuário em 08/10/2026 (caso New York Residence: 90 apartamentos,
-- 10 disponíveis na tabela de outubro, mesmas fotos e mesmo lazer). O
-- empreendimento continua sendo UM imóvel (uma página, uma galeria, um código
-- público, os mesmos leads), e as unidades ficam embaixo dele, com planta,
-- preço e situação próprios. Desenho escolhido entre três propostas (docs/
-- DECISOES.md, "Empreendimento com unidades").
--
--   - `properties.has_units` liga o modo. Com ele, o preço do imóvel é o "a
--     partir de" (o menor entre as unidades DISPONÍVEIS) e a situação vem das
--     unidades: ninguém digita, um gatilho calcula.
--   - `property_floorplans`: as plantas (nome, quartos, suítes, área, finais).
--   - `property_units`: as unidades ("804", andar 8, planta, preço, situação).
--   - A tabela da construtora sai todo 1º dia útil do mês (com o CUB/SC). Até
--     a Juliana aplicar a do mês, o site mostra "Consulte" no lugar dos preços
--     (decisão do usuário, 08/10): preço de tabela vencida é preço errado.
--   - Entrega (só o ano), situação da obra e registro de incorporação saem no
--     site; a construtora NÃO (fica no CRM: o cliente não pode ir comprar
--     direto com ela). O registro é exigência da Lei 4.591/64, art. 32, § 3º.
--
-- Imóvel comum (revenda, aluguel) continua com `has_units` falso e não muda.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1 · O imóvel
-- -----------------------------------------------------------------------------
alter table public.properties
  add column has_units boolean not null default false,
  add column units_available smallint not null default 0,
  add column units_table_month date,
  add column incorporation_registry text,
  add column incorporation_registry_office text;

alter table public.properties
  -- Alvo das chaves compostas das tabelas novas: unidade de outra imobiliária
  -- não se liga ao imóvel desta, nem com o id na mão.
  add constraint properties_org_id_uk unique (organization_id, id),
  add constraint properties_units_table_month_ck check (units_table_month is null or extract(day from units_table_month) = 1),
  -- Empreendimento com unidades é venda: o "de/por" e o aluguel são de imóvel único.
  add constraint properties_unidades_ck check (not has_units or (for_sale and not for_rent and original_price_cents is null)),
  add constraint properties_registro_ck check (
    (incorporation_registry is null or char_length(btrim(incorporation_registry)) between 1 and 80)
    and (incorporation_registry_office is null or char_length(btrim(incorporation_registry_office)) between 1 and 120)
  );

comment on column public.properties.has_units is
  'Empreendimento com várias unidades (property_units). O preço vira o "a partir de" e a situação vem das unidades, calculados por tg_property_derivar_das_unidades.';
comment on column public.properties.units_available is
  'Quantas unidades estão disponíveis. Calculado pelo gatilho; só leitura.';
comment on column public.properties.units_table_month is
  'Mês da tabela de preços aplicada (sempre dia 1). Se não é o mês corrente (horário de Brasília), o site mostra "Consulte" no lugar dos preços.';
comment on column public.properties.incorporation_registry is
  'Registro de incorporação (ex.: R-8 96.726). Sai no site: a Lei 4.591/64, art. 32, § 3º, exige nos anúncios.';
comment on column public.properties.incorporation_registry_office is
  'Cartório do registro de incorporação. Sai no site junto do registro.';
comment on column public.properties.delivery_at is
  'Previsão de entrega. Só o ANO sai no site ("Entrega em 2030"), porque é o que a construtora divulga; guardado como 1º de janeiro.';
comment on column public.properties.developer is
  'Construtora. Uso interno: nunca sai no site nem em criativo (o cliente compraria direto com ela).';

-- As fotos de empreendimento na planta são renders: o site avisa.
alter table public.property_media add column is_illustrative boolean not null default false;
comment on column public.property_media.is_illustrative is
  'Imagem ilustrativa (render, decorado). O site mostra o aviso na foto: nada inventado no site.';

-- -----------------------------------------------------------------------------
-- 2 · As plantas e as unidades
-- -----------------------------------------------------------------------------
create table public.property_floorplans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  property_id uuid not null,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  -- Os finais desta planta ("02", "04", "05"): é por eles que "Gerar unidades"
  -- acha a planta de cada apartamento.
  finals text[] not null default '{}' check (array_to_string(finals, ',') ~ '^([0-9A-Za-z]{1,4}(,|$))*$'),
  -- Os quartos SEM as suítes, como no imóvel (regra de 25/09).
  bedrooms smallint check (bedrooms >= 0),
  suites smallint check (suites >= 0),
  bathrooms smallint check (bathrooms >= 0),
  parking_spots smallint check (parking_spots >= 0),
  area_built numeric(10,2) check (area_built > 0),
  position smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint property_floorplans_name_uk unique (property_id, name),
  constraint property_floorplans_org_id_uk unique (organization_id, property_id, id),
  constraint property_floorplans_property_fk foreign key (organization_id, property_id)
    references public.properties (organization_id, id) on delete cascade
);

comment on table public.property_floorplans is
  'Planta (tipologia) de um empreendimento com unidades: quartos, suítes, área e os finais que a seguem.';

create table public.property_units (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  property_id uuid not null,
  floorplan_id uuid not null,
  -- O identificador puro ("804", "01"). "Apto 804" e "Sala 01" vêm do tipo do
  -- imóvel (rotuloDaUnidade, packages/contracts).
  label text not null check (label ~ '^[0-9A-Za-z]{1,8}$'),
  floor smallint check (floor between -10 and 300),
  -- Só quando difere da planta (as salas comerciais têm cada uma a sua).
  area_built numeric(10,2) check (area_built > 0),
  price_cents bigint check (price_cents is null or price_cents > 0),
  -- Nasce vendida: unidade só aparece no site depois que a tabela a dá como
  -- disponível. Nada vira disponível por omissão.
  status text not null default 'vendido',
  -- Interno: nunca sai para o site.
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- A mesma lista de UNIT_STATUSES (packages/contracts).
  constraint property_units_status_ck check (status in ('disponivel', 'reservado', 'vendido')),
  constraint property_units_preco_ck check (status <> 'disponivel' or price_cents is not null),
  constraint property_units_label_uk unique (property_id, label),
  constraint property_units_org_id_uk unique (organization_id, property_id, id),
  constraint property_units_property_fk foreign key (organization_id, property_id)
    references public.properties (organization_id, id) on delete cascade,
  -- A planta tem que ser do mesmo empreendimento.
  constraint property_units_floorplan_fk foreign key (organization_id, property_id, floorplan_id)
    references public.property_floorplans (organization_id, property_id, id) on delete restrict
);

comment on table public.property_units is
  'Unidade de um empreendimento (apartamento, sala): planta, andar, preço e situação. Vendida não sai no site.';

create index property_units_vitrine_idx on public.property_units (property_id, status, price_cents);
create index property_units_floorplan_idx on public.property_units (floorplan_id);

create trigger property_floorplans_updated_at
  before update on public.property_floorplans
  for each row execute function public.set_updated_at();
create trigger property_units_updated_at
  before update on public.property_units
  for each row execute function public.set_updated_at();

-- O projeto nasceu com a exposição automática desligada: cada GRANT abaixo é
-- necessário, inclusive o do service_role. O site não lê estas tabelas: lê
-- `site_imoveis` (security definer).
alter table public.property_floorplans enable row level security;
alter table public.property_units enable row level security;

create policy property_floorplans_org on public.property_floorplans
  to authenticated
  using (organization_id = (select public.current_org_id()))
  with check (organization_id = (select public.current_org_id()));
create policy property_units_org on public.property_units
  to authenticated
  using (organization_id = (select public.current_org_id()))
  with check (organization_id = (select public.current_org_id()));

revoke all on public.property_floorplans from anon, authenticated;
revoke all on public.property_units from anon, authenticated;
grant select, insert, update, delete on public.property_floorplans to authenticated;
grant select, insert, update, delete on public.property_units to authenticated;
grant all on public.property_floorplans to service_role;
grant all on public.property_units to service_role;

-- -----------------------------------------------------------------------------
-- 3 · O "a partir de" e a situação, calculados
-- -----------------------------------------------------------------------------

/* A regra, num lugar só (o CRM e o site a repetem em resumoDoEmpreendimento). */
create or replace function public.resumo_das_unidades(_imovel uuid)
returns table (total integer, disponiveis integer, reservadas integer, menor_cents bigint, maior_cents bigint, menor_reservada_cents bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select count(*)::int,
         count(*) filter (where status = 'disponivel')::int,
         count(*) filter (where status = 'reservado')::int,
         min(price_cents) filter (where status = 'disponivel'),
         max(price_cents) filter (where status = 'disponivel'),
         min(price_cents) filter (where status = 'reservado')
    from public.property_units
   where property_id = _imovel;
$$;

revoke all on function public.resumo_das_unidades(uuid) from public, anon;
grant execute on function public.resumo_das_unidades(uuid) to authenticated, service_role;

/*
 * Com unidades, preço e situação do imóvel vêm delas, a cada gravação do
 * imóvel (e as unidades tocam o imóvel quando mudam, ver abaixo).
 *
 * BEFORE e por linha, de propósito: o formulário do CRM reenvia o preço que
 * carregou (arredondado em reais) e a situação; aqui eles são recalculados, e
 * o valor digitado nunca sobrescreve o calculado. O "de/por" é zerado antes
 * do CHECK `properties_unidades_ck`.
 *
 * Sem unidade cadastrada, ou antes da primeira tabela aplicada, o imóvel fica
 * sem preço e com a situação que tinha. As unidades nascem vendidas (nada fica
 * disponível por omissão), e sem esta guarda "Gerar unidades" tiraria da
 * vitrine, como vendido, um empreendimento já no ar e com anúncio rodando.
 */
create or replace function public.tg_property_derivar_das_unidades()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  r record;
begin
  if not new.has_units then
    new.units_available := 0;
    return new;
  end if;

  select * into r from public.resumo_das_unidades(new.id);
  new.original_price_cents := null;
  new.units_available := least(r.disponiveis, 32767);
  if r.total = 0 or new.units_table_month is null then
    new.price_cents := null;
    return new;
  end if;

  new.price_cents := coalesce(r.menor_cents, r.menor_reservada_cents);
  -- Suspenso é decisão de quem cadastra (tirar da vitrine); o resto vem das unidades.
  if new.status <> 'suspenso' then
    new.status := case
      when r.disponiveis > 0 then 'disponivel'
      when r.reservadas > 0 then 'reservado'
      else 'vendido'
    end;
  end if;
  return new;
end $$;

revoke all on function public.tg_property_derivar_das_unidades() from public, anon, authenticated;

create trigger properties_derivar_unidades
  before insert or update on public.properties
  for each row execute function public.tg_property_derivar_das_unidades();

/*
 * Mudou unidade ou planta: o imóvel é tocado (`updated_at`), o que recalcula o
 * "a partir de" pelo gatilho acima, avisa o site uma vez (`properties_avisa_
 * site`, por comando) e atualiza a data do sitemap.
 *
 * Por comando e com tabela de transição: aplicar a tabela do mês muda dezenas
 * de unidades e toca o imóvel uma vez. Comando que não mudou linha nenhuma não
 * toca nada (e não avisa o site à toa). Três gatilhos por tabela porque o
 * Postgres não aceita tabela de transição em gatilho de mais de um evento.
 */
create or replace function public.tg_unidades_tocam_o_imovel()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if not exists (select 1 from novas) then return null; end if;
    update public.properties set updated_at = now() where id in (select property_id from novas);
  elsif tg_op = 'DELETE' then
    if not exists (select 1 from antigas) then return null; end if;
    update public.properties set updated_at = now() where id in (select property_id from antigas);
  else
    if not exists (select 1 from novas) then return null; end if;
    update public.properties set updated_at = now()
     where id in (select property_id from novas union select property_id from antigas);
  end if;
  return null;
end $$;

revoke all on function public.tg_unidades_tocam_o_imovel() from public, anon, authenticated;

create trigger property_units_toca_imovel_ins after insert on public.property_units
  referencing new table as novas for each statement execute function public.tg_unidades_tocam_o_imovel();
create trigger property_units_toca_imovel_upd after update on public.property_units
  referencing new table as novas old table as antigas for each statement execute function public.tg_unidades_tocam_o_imovel();
create trigger property_units_toca_imovel_del after delete on public.property_units
  referencing old table as antigas for each statement execute function public.tg_unidades_tocam_o_imovel();
create trigger property_floorplans_toca_imovel_ins after insert on public.property_floorplans
  referencing new table as novas for each statement execute function public.tg_unidades_tocam_o_imovel();
create trigger property_floorplans_toca_imovel_upd after update on public.property_floorplans
  referencing new table as novas old table as antigas for each statement execute function public.tg_unidades_tocam_o_imovel();
create trigger property_floorplans_toca_imovel_del after delete on public.property_floorplans
  referencing old table as antigas for each statement execute function public.tg_unidades_tocam_o_imovel();

-- -----------------------------------------------------------------------------
-- 4 · A tabela do mês
-- -----------------------------------------------------------------------------

/*
 * Aplica a tabela da construtora: o preço e a situação de cada unidade da
 * lista, e o mês da tabela no imóvel. Uma chamada, tudo ou nada.
 *
 * `_linhas`: [{"label": "804", "price_cents": 84056940, "status": "disponivel"}, ...]
 * Unidade que não veio na lista fica como estava (nada é vendido por omissão:
 * quem decide é a conferência do CRM). Rótulo que não existe, ou repetido,
 * recusa a tabela inteira, com a lista na mensagem. Só grava o que mudou, e
 * aplicar a mesma tabela de novo não muda nada nem avisa o site.
 *
 * Devolve quantas unidades mudaram.
 */
create or replace function public.aplicar_tabela_de_unidades(_imovel uuid, _mes date, _linhas jsonb)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_mes date := date_trunc('month', _mes)::date;
  v_problema text;
  v_mudou integer;
begin
  if _mes is null then
    raise exception 'Informe o mês da tabela.' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from public.properties where id = _imovel and has_units) then
    raise exception 'Imóvel não encontrado, ou sem unidades.' using errcode = 'no_data_found';
  end if;
  if jsonb_typeof(coalesce(_linhas, '[]'::jsonb)) <> 'array' then
    raise exception 'A tabela tem que ser uma lista.' using errcode = 'check_violation';
  end if;

  if exists (select 1 from jsonb_to_recordset(coalesce(_linhas, '[]'::jsonb)) as l(label text)
              where nullif(btrim(l.label), '') is null) then
    raise exception 'Há linha sem unidade na tabela.' using errcode = 'check_violation';
  end if;

  select string_agg(d.label, ', ' order by d.label) into v_problema
    from (select l.label
            from jsonb_to_recordset(coalesce(_linhas, '[]'::jsonb)) as l(label text)
           group by l.label
          having count(*) > 1) d;
  if v_problema is not null then
    raise exception 'Unidade repetida na tabela: %', v_problema using errcode = 'check_violation';
  end if;

  select string_agg(l.label, ', ' order by l.label) into v_problema
    from jsonb_to_recordset(coalesce(_linhas, '[]'::jsonb)) as l(label text)
   where not exists (select 1 from public.property_units u where u.property_id = _imovel and u.label = l.label);
  if v_problema is not null then
    raise exception 'Unidades que não existem neste imóvel: %', v_problema using errcode = 'check_violation';
  end if;

  update public.property_units u
     set price_cents = l.price_cents,
         status = l.status
    from jsonb_to_recordset(coalesce(_linhas, '[]'::jsonb)) as l(label text, price_cents bigint, status text)
   where u.property_id = _imovel
     and u.label = l.label
     and (u.price_cents is distinct from l.price_cents or u.status is distinct from l.status);
  get diagnostics v_mudou = row_count;

  update public.properties
     set units_table_month = v_mes
   where id = _imovel
     and units_table_month is distinct from v_mes;

  return v_mudou;
end $$;

revoke all on function public.aplicar_tabela_de_unidades(uuid, date, jsonb) from public, anon;
grant execute on function public.aplicar_tabela_de_unidades(uuid, date, jsonb) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 5 · A leitura do site (20261008000000) com o empreendimento
--
-- Imóvel comum: a mesma saída de antes, mais `empreendimento: null` e
-- `is_illustrative` nas fotos. Com unidades: o "a partir de" em `price_cents`
-- e o bloco `empreendimento`, com as plantas que ainda têm unidade disponível
-- ou reservada e essas unidades. Vendida, nota interna, construtora e ids não
-- saem. Com a tabela fora do mês corrente, todo preço sai nulo: o site mostra
-- "Consulte" até a Juliana aplicar a do mês.
--
-- Só unidade DISPONÍVEL sai com preço: a reservada guarda o preço do dia em que
-- foi reservada, que pode ser de uma tabela antiga, e não está à venda. Sem
-- disponível, ou com o empreendimento suspenso, não há "a partir de" nem
-- contagem: a página diria "10 disponíveis" ao lado de "não está disponível".
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
          -- Com unidades, é o "a partir de", e só com a tabela do mês.
          'price_cents',     case when p.for_sale and (not p.has_units
                                                   or (t.vigente and p.units_available > 0 and p.status <> 'suspenso'))
                                  then p.price_cents end,
          'original_price_cents', case when p.for_sale and not p.has_units then p.original_price_cents end,
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
          -- página: o sitemap precisa saber. (Unidade e planta tocam o imóvel.)
          'updated_at',      greatest(p.updated_at,
                                      (select max(m.created_at) from public.property_media m where m.property_id = p.id)),
          'media',           (select coalesce(jsonb_agg(jsonb_build_object(
                                        'storage_path',    m.storage_path,
                                        'width',           m.width,
                                        'height',          m.height,
                                        'alt_text',        m.alt_text,
                                        'caption',         m.caption,
                                        'is_illustrative', m.is_illustrative)
                                      order by m.is_cover desc, m.position, m.created_at), '[]'::jsonb)
                                from public.property_media m
                               where m.property_id = p.id and m.kind = 'image'),
          'empreendimento',  case when p.has_units then jsonb_build_object(
            'units_table_month',             p.units_table_month,
            'table_is_current',              t.vigente,
            'units_available',               case when p.status = 'suspenso' then 0 else p.units_available end,
            'construction_status',           p.construction_status,
            'delivery_year',                 extract(year from p.delivery_at)::int,
            'incorporation_registry',        nullif(btrim(p.incorporation_registry), ''),
            'incorporation_registry_office', nullif(btrim(p.incorporation_registry_office), ''),
            'payment_notes',                 nullif(btrim(p.payment_notes), ''),
            'floorplans', (
              select coalesce(jsonb_agg(jsonb_build_object(
                       'name',          f.name,
                       'bedrooms',      f.bedrooms,
                       'suites',        f.suites,
                       'bathrooms',     f.bathrooms,
                       'parking_spots', f.parking_spots,
                       'area_built',    f.area_built,
                       'units', (
                         select jsonb_agg(jsonb_build_object(
                                  'label',       u.label,
                                  'floor',       u.floor,
                                  'area_built',  coalesce(u.area_built, f.area_built),
                                  'price_cents', case when t.vigente and u.status = 'disponivel' and p.status <> 'suspenso'
                                                      then u.price_cents end,
                                  'status',      u.status)
                                order by u.price_cents nulls last, u.label)
                           from public.property_units u
                          where u.floorplan_id = f.id
                            and u.status in ('disponivel', 'reservado')))
                     order by f.position, f.name), '[]'::jsonb)
                from public.property_floorplans f
               where f.property_id = p.id
                 and exists (select 1 from public.property_units u
                              where u.floorplan_id = f.id and u.status in ('disponivel', 'reservado')))
          ) end
        ) as imovel
        from public.properties p
        join public.organizations o on o.id = p.organization_id
        -- A tabela vale no mês em que foi aplicada, no horário de Brasília.
        cross join lateral (
          select coalesce(p.units_table_month >= date_trunc('month', now() at time zone 'America/Sao_Paulo')::date, false) as vigente
        ) t
       where o.slug = _organizacao
         and o.is_active
         and p.is_published
    ) publicados;
$$;

revoke all on function public.site_imoveis(text) from public;
grant execute on function public.site_imoveis(text) to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 6 · A virada do mês
--
-- No dia 1, a tabela do mês anterior deixa de valer e o site tem que mostrar
-- "Consulte". Nada no banco muda nessa hora, então nenhum gatilho avisa o site,
-- e a página ficaria até uma hora (o `revalidate`) com o preço velho. Um
-- agendamento avisa o site às 00h01 de Brasília (03h01 UTC: o pg_cron roda em
-- UTC, e o Brasil não tem horário de verão desde 2019).
-- -----------------------------------------------------------------------------

/* O mesmo aviso de `avisar_site_dos_imoveis`, fora de gatilho. Sem o Vault, não faz nada. */
create or replace function public.revalidar_site()
returns void
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
    return;
  end if;
  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-revalidacao', v_segredo),
    body    := '{}'::jsonb);
end $$;

revoke all on function public.revalidar_site() from public, anon, authenticated;

DO $agenda$
BEGIN
  PERFORM cron.schedule('site-virada-do-mes', '1 3 1 * *', $cron$ select public.revalidar_site(); $cron$);
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'Sem privilégio para agendar: rode o cron.schedule deste arquivo à mão.';
END $agenda$;
