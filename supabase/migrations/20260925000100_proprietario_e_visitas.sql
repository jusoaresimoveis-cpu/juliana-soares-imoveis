-- =============================================================================
-- O PROPRIETÁRIO DO IMÓVEL E AS VISITAS À PÁGINA DE CADA UM
--
-- Pedido do usuário em 25/09/2026. A Juliana administra a locação de imóveis de
-- terceiros, e o dono vai acompanhar, num painel só dele, o desempenho do
-- imóvel (docs/DECISOES.md, "Painel do proprietário"). Entra aqui o que esse
-- painel vai precisar e que já serve à Juliana hoje, na ficha do imóvel:
--
--   - `property_owners`: quem é o dono (nome, cidade onde mora, telefone). É
--     uma tabela, e não colunas no imóvel, porque um dono pode ter mais de um
--     imóvel e o login dele vai ser um só, pelo telefone. `user_id` fica
--     reservado para esse login.
--   - `property_page_views`: as visitas à página do imóvel no site, uma linha
--     por imóvel e por dia. Quem conta é o site, pela `registrar_visita`.
--
-- O projeto nasceu com a exposição automática de tabelas desligada: tabela
-- nova chega à API só com Dxtm, e cada GRANT abaixo é necessário, inclusive o
-- do `service_role`. A RLS liga sozinha (gatilho de evento), e as policies
-- estão aqui.
-- =============================================================================

create table public.property_owners (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  full_name text not null check (length(trim(full_name)) > 0),
  -- Onde o dono mora, que não é onde fica o imóvel.
  city text,
  phone_e164 text not null check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  -- O login do painel do proprietário, quando ele existir.
  user_id uuid unique references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- O dono é o telefone: o mesmo número em dois imóveis é a mesma pessoa, e é
  -- por ele que o login vai achar os imóveis dela.
  constraint property_owners_phone_uq unique (organization_id, phone_e164),
  -- Alvo da chave composta de `properties`, que impede ligar o imóvel ao dono
  -- de outra imobiliária.
  constraint property_owners_org_id_uq unique (organization_id, id)
);

comment on table public.property_owners is
  'Proprietário de imóvel (dono que entrega para a corretora administrar). Um por telefone em cada organização.';

create trigger property_owners_updated_at
  before update on public.property_owners
  for each row execute function public.set_updated_at();

alter table public.property_owners enable row level security;

create policy property_owners_org on public.property_owners
  to authenticated
  using (organization_id = (select public.current_org_id()))
  with check (organization_id = (select public.current_org_id()));

revoke all on public.property_owners from anon, authenticated;
grant select, insert, update on public.property_owners to authenticated;
grant all on public.property_owners to service_role;

alter table public.properties add column owner_id uuid;

comment on column public.properties.owner_id is
  'Proprietário do imóvel (property_owners). Nunca sai para o site: site_imoveis lista os campos que devolve.';

-- Composta com a organização: um `owner_id` de outra casa não passa, mesmo que
-- alguém descubra o id (a checagem de chave estrangeira não passa pela RLS).
-- Apagar o dono só solta o imóvel: `set null (owner_id)`, sem tocar na
-- organização.
alter table public.properties
  add constraint properties_owner_fk
  foreign key (organization_id, owner_id)
  references public.property_owners (organization_id, id)
  on delete set null (owner_id);

create index properties_owner_id_idx on public.properties (owner_id) where owner_id is not null;

/*
 * Grava o dono do imóvel a partir do formulário do CRM.
 *
 * O dono é achado pelo telefone (normalizado como o dos leads, por `to_e164`):
 * o mesmo número num segundo imóvel reaproveita o cadastro e atualiza nome e
 * cidade. Nome e telefone vazios soltam o imóvel do dono, sem apagar o
 * cadastro, que pode ter outros imóveis.
 *
 * `security invoker`: quem chama precisa poder editar o imóvel e o cadastro de
 * donos da própria organização, pela RLS de sempre.
 */
create or replace function public.definir_proprietario(_imovel uuid, _nome text, _cidade text, _telefone text)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_org uuid;
  v_fone text;
  v_id uuid;
begin
  select organization_id into v_org from public.properties where id = _imovel;
  if v_org is null then
    raise exception 'Imóvel não encontrado.' using errcode = 'no_data_found';
  end if;

  if coalesce(trim(_nome), '') = '' and coalesce(trim(_telefone), '') = '' then
    update public.properties set owner_id = null where id = _imovel;
    return null;
  end if;

  if coalesce(trim(_nome), '') = '' then
    raise exception 'Informe o nome do proprietário.' using errcode = 'check_violation';
  end if;

  v_fone := public.to_e164(_telefone, 'BR');
  if v_fone is null then
    raise exception 'Telefone do proprietário inválido: use o DDD e o número.' using errcode = 'check_violation';
  end if;

  insert into public.property_owners (organization_id, full_name, city, phone_e164)
  values (v_org, trim(_nome), nullif(trim(_cidade), ''), v_fone)
  on conflict (organization_id, phone_e164) do update
     set full_name = excluded.full_name,
         city = excluded.city
  returning id into v_id;

  update public.properties set owner_id = v_id where id = _imovel;
  return v_id;
end $$;

revoke all on function public.definir_proprietario(uuid, text, text, text) from public, anon;
grant execute on function public.definir_proprietario(uuid, text, text, text) to authenticated, service_role;

create table public.property_page_views (
  property_id uuid not null references public.properties(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  -- O dia no horário de Brasília: a visita das 22h é do dia em que aconteceu.
  day date not null,
  views integer not null default 0 check (views >= 0),
  primary key (property_id, day)
);

comment on table public.property_page_views is
  'Visitas à página do imóvel no site, por dia. Escrita só por registrar_visita.';

create index property_page_views_org_idx on public.property_page_views (organization_id);

alter table public.property_page_views enable row level security;

create policy property_page_views_read on public.property_page_views
  for select to authenticated
  using (organization_id = (select public.current_org_id()));

-- Ninguém escreve direto: a única porta é a função abaixo.
revoke all on public.property_page_views from anon, authenticated;
grant select on public.property_page_views to authenticated;
grant all on public.property_page_views to service_role;

/*
 * Conta uma visita à página de um imóvel.
 *
 * O site chama com a chave pública, por isso `security definer`: o visitante
 * não lê nem escreve a tabela, só passa por aqui. Só conta imóvel publicado de
 * organização ativa; código que não existe não faz nada, e a função não
 * devolve nada que diga se o imóvel existe.
 *
 * Cada aparelho conta uma vez por imóvel e por dia (quem cuida disso é o
 * site), então o número se lê como "pessoas por dia", não como recarregamento.
 */
create or replace function public.registrar_visita(_organizacao text, _codigo text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.property_page_views (property_id, organization_id, day, views)
  select p.id, p.organization_id, (now() at time zone 'America/Sao_Paulo')::date, 1
    from public.properties p
    join public.organizations o on o.id = p.organization_id
   where o.slug = _organizacao
     and o.is_active
     and p.is_published
     and lower(p.public_code) = lower(_codigo)
  on conflict (property_id, day) do update
     set views = public.property_page_views.views + 1;
$$;

revoke all on function public.registrar_visita(text, text) from public;
grant execute on function public.registrar_visita(text, text) to anon, authenticated, service_role;
