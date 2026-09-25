-- =============================================================================
-- SEED DA JULIANA
--
-- O que é dela e não é schema: a organização, as etapas do funil e quem entra
-- no CRM. Fica fora de `migrations/` de propósito (dado de cliente não entra
-- em migration): assim o mesmo schema serve de base para outro cliente sem
-- limpeza.
--
-- Idempotente: rodar de novo não duplica nada. A organização e as etapas voltam
-- para os valores daqui; o perfil de quem já existe não é tocado.
--
-- Como rodar, depois das migrations: SQL Editor do Supabase, colar e executar.
-- Os usuários precisam existir antes em Authentication → Users; a última parte
-- os encontra pelo e-mail e avisa (sem falhar) quem ainda não foi criado.
-- =============================================================================

begin;

-- NAP igual ao do site (`apps/site/src/config/site.ts`) e ao Perfil da Empresa.
insert into public.organizations (
  name, slug, creci, phone, phone_country, email, city, state, address,
  default_locale, enabled_locales, timezone, custom_domain, brand_color, whatsapp_instance_limit
) values (
  'Juliana Soares Corretora de Imóveis', 'juliana-soares', 'CRECI/SC 53396-F',
  '+5547997354111', 'BR', 'jusoaresimoveis@gmail.com', 'Itapema', 'SC', 'Rua 143, 40, Sala 08, Centro',
  -- Sem mercados internacionais: ela atende Itapema e Porto Belo, em português.
  'pt-BR', array['pt-BR'], 'America/Sao_Paulo', 'julianasoaresimoveis.com.br', '#8B6A40',
  -- Um número só, o dela.
  1
)
on conflict (slug) do update set
  name = excluded.name,
  creci = excluded.creci,
  phone = excluded.phone,
  email = excluded.email,
  city = excluded.city,
  state = excluded.state,
  address = excluded.address,
  default_locale = excluded.default_locale,
  enabled_locales = excluded.enabled_locales,
  custom_domain = excluded.custom_domain,
  brand_color = excluded.brand_color,
  whatsapp_instance_limit = excluded.whatsapp_instance_limit;

-- As etapas de `DEFAULT_STAGES` (packages/contracts/src/pipeline.ts), com a
-- visita ANTES da proposta. Servem para compra e para aluguel: numa locação, a
-- "proposta" é a proposta de locação e o "fechado" é o contrato assinado.
insert into public.pipeline_stages (
  organization_id, key, label, position, color,
  requires_value, requires_reason, requires_schedule, is_won, is_lost
)
select o.id, e.key, e.label, e.position, e.color,
       e.requires_value, e.requires_reason, e.requires_schedule, e.is_won, e.is_lost
  from public.organizations o
 cross join (values
   ('novo',             'Novo',             1, '#B08A5A', false, false, false, false, false),
   ('em_atendimento',   'Em atendimento',   2, '#8B6A40', false, false, false, false, false),
   ('visita_agendada',  'Visita agendada',  3, '#2F9BE0', false, false, true,  false, false),
   ('visita_realizada', 'Visita realizada', 4, '#12B886', false, false, false, false, false),
   ('proposta',         'Proposta',         5, '#C77A16', true,  false, false, false, false),
   ('fechado',          'Fechado',          6, '#0FA97D', true,  false, false, true,  false),
   ('perdido',          'Perdido',          7, '#E0456F', false, true,  false, false, true)
 ) as e(key, label, position, color, requires_value, requires_reason, requires_schedule, is_won, is_lost)
 where o.slug = 'juliana-soares'
on conflict (organization_id, key) do update set
  label = excluded.label,
  position = excluded.position,
  color = excluded.color,
  requires_value = excluded.requires_value,
  requires_reason = excluded.requires_reason,
  requires_schedule = excluded.requires_schedule,
  is_won = excluded.is_won,
  is_lost = excluded.is_lost;

-- Quem entra, e com que papel.
--
-- A Juliana é GERENTE: atende e acompanha a carteira inteira, e o papel já nasce
-- com alcance 'todos' nos avisos. O ADMIN é a agência, que cuida de sistema,
-- integrações e verba (a tela de Inteligência é só do admin); ele nasce com
-- alcance 'nenhum', porque não atende lead. É o mesmo arranjo do CRM de origem.
do $usuarios$
declare
  v_org uuid;
  v_usuario uuid;
  u record;
begin
  select id into v_org from public.organizations where slug = 'juliana-soares';

  for u in
    select * from (values
      ('jusoaresimoveis@gmail.com', 'Juliana Soares', '+5547997354111', 'CRECI/SC 53396-F', 'Corretora de imóveis', 'gerente'),
      ('gutobuyno@gmail.com', 'Guto', null, null, 'Administrador do sistema', 'admin')
    ) as linha(email, nome, telefone, creci, cargo, papel)
  loop
    select id into v_usuario from auth.users where lower(email) = u.email;
    if v_usuario is null then
      raise notice 'Usuário % ainda não existe em Authentication → Users. Crie e rode este arquivo de novo.', u.email;
      continue;
    end if;

    -- Perfil que já existe fica como está: o nome e o telefone podem ter sido
    -- ajustados no próprio CRM.
    insert into public.profiles (id, organization_id, full_name, email, phone, creci, title)
    values (v_usuario, v_org, u.nome, u.email, u.telefone, u.creci, u.cargo)
    on conflict (id) do nothing;

    insert into public.user_roles (user_id, organization_id, role)
    values (v_usuario, v_org, u.papel::public.app_role)
    on conflict (user_id, organization_id, role) do nothing;
  end loop;
end $usuarios$;

commit;
