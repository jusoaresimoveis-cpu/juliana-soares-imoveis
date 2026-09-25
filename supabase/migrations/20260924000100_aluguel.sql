-- =============================================================================
-- ALUGUEL ANUAL
--
-- O CRM de origem nasceu para venda: um preço só (`price_cents`) e uma
-- finalidade só (`purpose`). A Juliana também aluga (anual; temporada está
-- fora), e o mesmo imóvel pode estar à venda E para alugar, com os dois
-- valores na mesma página.
--
-- Por isso o regime vira duas marcas, `for_sale` e `for_rent`, cada uma com o
-- seu valor: `price_cents` continua sendo o preço de VENDA e `rent_cents` é o
-- aluguel MENSAL. Um campo "preço" que muda de sentido conforme a finalidade é
-- o tipo de coisa que acaba com aluguel de R$ 3.500 listado entre imóveis à
-- venda por R$ 3.500.
--
-- `purpose` continua existindo, agora calculado das marcas: a função da
-- landing page e o CRM leem a coluna, e o CHECK herdado segue valendo.
-- =============================================================================

alter table public.properties
  add column for_sale boolean not null default true,
  add column for_rent boolean not null default false,
  add column rent_cents bigint,
  add column rental_guarantees text[] not null default '{}';

alter table public.properties
  -- Imóvel sem regime nenhum não aparece em listagem nenhuma e ninguém percebe.
  add constraint properties_regime_ck check (for_sale or for_rent),
  add constraint properties_rent_ck check (rent_cents is null or rent_cents >= 0),
  -- As garantias da Lei do Inquilinato (art. 37) mais as que o mercado usa.
  -- Lista fechada: é filtro e é texto no site, e "Fiador" e "fiador" viraria
  -- duas garantias diferentes. Ver RENTAL_GUARANTEES em packages/contracts.
  add constraint properties_guarantees_ck check (
    rental_guarantees <@ array['caucao', 'fiador', 'seguro_fianca', 'titulo_capitalizacao', 'carta_fianca']::text[]
  );

comment on column public.properties.price_cents is
  'Preço de VENDA, em centavos. Só vale quando for_sale.';
comment on column public.properties.rent_cents is
  'Aluguel MENSAL, em centavos. Só vale quando for_rent.';

-- A finalidade principal, calculada: à venda (com ou sem aluguel) é venda.
alter table public.properties drop column purpose;
alter table public.properties
  add column purpose text generated always as (case when for_sale then 'venda' else 'aluguel' end) stored;
alter table public.properties
  add constraint properties_purpose_ck check (purpose in ('venda', 'aluguel', 'temporada'));
