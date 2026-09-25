-- =============================================================================
-- CENÁRIO DOS TESTES DE RLS
--
-- Duas imobiliárias, e é esse o ponto: uma policy escrita errado só aparece
-- quando existe um segundo cliente para ver o dado do primeiro. Com uma
-- organização só, TODA policy passa — inclusive as que não filtram nada.
--
-- Roda como `postgres`, que ignora RLS. Aqui se monta o mundo; quem tenta ler
-- é o teste, com o papel trocado.
--
-- Idempotente: apaga o que plantou antes e planta de novo. Os ids são fixos e
-- fora da faixa que o `gen_random_uuid` produz na prática, para nunca colidirem
-- com dado de verdade caso alguém aponte isto para o lugar errado.
-- =============================================================================

begin;

-- A ordem importa: as chaves estrangeiras são todas `on delete cascade` a partir
-- da organização, então apagar as duas orgs leva junto imóvel, lead, etapa e
-- perfil. `auth.users` fica de fora do cascade e sai depois.
delete from public.organizations where id in (
  '00000000-0000-4000-a000-000000000001',
  '00000000-0000-4000-b000-000000000001'
);
delete from auth.users where id in (
  '00000000-0000-4000-a000-000000000010',
  '00000000-0000-4000-a000-000000000011',
  '00000000-0000-4000-a000-000000000012',
  '00000000-0000-4000-a000-000000000013',
  '00000000-0000-4000-b000-000000000010',
  '00000000-0000-4000-b000-000000000011'
);

-- -----------------------------------------------------------------------------
-- As duas imobiliárias
-- -----------------------------------------------------------------------------

insert into public.organizations (id, name, slug, city, state) values
  ('00000000-0000-4000-a000-000000000001', 'Imobiliária A', 'imob-a', 'Porto Belo', 'SC'),
  ('00000000-0000-4000-b000-000000000001', 'Imobiliária B', 'imob-b', 'Itapema',    'SC');

-- -----------------------------------------------------------------------------
-- As pessoas
--
-- `auth.users` é do Supabase e tem dezenas de colunas; as que importam aqui são
-- o id — que vira o `sub` do JWT e portanto o `auth.uid()` — e o e-mail. O resto
-- fica no padrão. Senha não existe: nenhum destes usuários faz login, eles são
-- vestidos por `set local request.jwt.claims`.
-- -----------------------------------------------------------------------------

insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-4000-a000-000000000010', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'corretor@a.teste', '', now(), now(), now()),
  ('00000000-0000-4000-a000-000000000011', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'gerente@a.teste',  '', now(), now(), now()),
  ('00000000-0000-4000-a000-000000000012', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'admin@a.teste',    '', now(), now(), now()),
  -- O SEGUNDO corretor da mesma casa. Sem ele, "o colega não vê o meu número"
  -- e "o de outra imobiliária não vê" seriam a mesma pergunta, e só a segunda
  -- estaria sendo testada.
  ('00000000-0000-4000-a000-000000000013', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'colega@a.teste',   '', now(), now(), now()),
  ('00000000-0000-4000-b000-000000000010', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'corretor@b.teste', '', now(), now(), now()),
  ('00000000-0000-4000-b000-000000000011', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'gerente@b.teste',  '', now(), now(), now());

insert into public.profiles (id, organization_id, full_name, email) values
  ('00000000-0000-4000-a000-000000000010', '00000000-0000-4000-a000-000000000001', 'Corretor da A', 'corretor@a.teste'),
  ('00000000-0000-4000-a000-000000000011', '00000000-0000-4000-a000-000000000001', 'Gerente da A',  'gerente@a.teste'),
  ('00000000-0000-4000-a000-000000000012', '00000000-0000-4000-a000-000000000001', 'Admin da A',    'admin@a.teste'),
  ('00000000-0000-4000-a000-000000000013', '00000000-0000-4000-a000-000000000001', 'Colega da A',   'colega@a.teste'),
  ('00000000-0000-4000-b000-000000000010', '00000000-0000-4000-b000-000000000001', 'Corretor da B', 'corretor@b.teste'),
  ('00000000-0000-4000-b000-000000000011', '00000000-0000-4000-b000-000000000001', 'Gerente da B',  'gerente@b.teste');

insert into public.user_roles (user_id, organization_id, role) values
  ('00000000-0000-4000-a000-000000000010', '00000000-0000-4000-a000-000000000001', 'corretor'),
  ('00000000-0000-4000-a000-000000000011', '00000000-0000-4000-a000-000000000001', 'gerente'),
  ('00000000-0000-4000-a000-000000000012', '00000000-0000-4000-a000-000000000001', 'admin'),
  ('00000000-0000-4000-a000-000000000013', '00000000-0000-4000-a000-000000000001', 'corretor'),
  ('00000000-0000-4000-b000-000000000010', '00000000-0000-4000-b000-000000000001', 'corretor'),
  ('00000000-0000-4000-b000-000000000011', '00000000-0000-4000-b000-000000000001', 'gerente');

-- -----------------------------------------------------------------------------
-- Uma linha de cada coisa, dos dois lados
--
-- Simetria é o que torna o teste legível: toda pergunta vira "o da A enxerga o
-- da B?". Uma fixtura torta faria um teste passar por falta de dado em vez de
-- por acerto da policy.
-- -----------------------------------------------------------------------------

--
-- TRÊS etapas, e não uma.
--
-- Com uma só, a 122 — que tira o lead da primeira etapa quando alguém responde —
-- não teria para onde mover, e todo teste dela passaria por falta de dado. A
-- terceira existe para provar o contrário: que um salto feito à mão, pulando a
-- segunda, NÃO é desfeito.
--
insert into public.pipeline_stages (id, organization_id, key, label, position) values
  ('00000000-0000-4000-a000-000000000020', '00000000-0000-4000-a000-000000000001', 'novo',            'Novo',            1),
  ('00000000-0000-4000-a000-000000000021', '00000000-0000-4000-a000-000000000001', 'em_atendimento',  'Em atendimento',  2),
  ('00000000-0000-4000-a000-000000000022', '00000000-0000-4000-a000-000000000001', 'visita_agendada', 'Visita agendada', 3),
  ('00000000-0000-4000-b000-000000000020', '00000000-0000-4000-b000-000000000001', 'novo',            'Novo',            1),
  ('00000000-0000-4000-b000-000000000021', '00000000-0000-4000-b000-000000000001', 'em_atendimento',  'Em atendimento',  2),
  ('00000000-0000-4000-b000-000000000022', '00000000-0000-4000-b000-000000000001', 'visita_agendada', 'Visita agendada', 3);

insert into public.properties (id, organization_id, title, city, state) values
  ('00000000-0000-4000-a000-000000000030', '00000000-0000-4000-a000-000000000001', 'Imóvel da A', 'Porto Belo', 'SC'),
  ('00000000-0000-4000-b000-000000000030', '00000000-0000-4000-b000-000000000001', 'Imóvel da B', 'Itapema',    'SC');

--
-- TRÊS leads na imobiliária A, e cada um com um dono diferente de propósito.
--
-- Com um lead só — que era o caso até a 079 — todo teste de carteira passaria
-- por falta de dado: "o corretor vê 1" e "o gerente vê 1" seriam a mesma
-- afirmação, e nenhuma das duas provaria recorte nenhum. O sem dono é o caso
-- que mais importa: é assim que o lead nasce quando chega do WhatsApp ou da
-- landing page, e é ele que o corretor NÃO pode ver antes de alguém distribuir.
insert into public.leads (id, organization_id, stage_id, full_name, phone, assigned_to) values
  ('00000000-0000-4000-a000-000000000040', '00000000-0000-4000-a000-000000000001',
   '00000000-0000-4000-a000-000000000020', 'Cliente da A', '+5547999990001',
   '00000000-0000-4000-a000-000000000010'),
  ('00000000-0000-4000-a000-000000000041', '00000000-0000-4000-a000-000000000001',
   '00000000-0000-4000-a000-000000000020', 'Cliente do Gerente', '+5547999990011',
   '00000000-0000-4000-a000-000000000011'),
  ('00000000-0000-4000-a000-000000000042', '00000000-0000-4000-a000-000000000001',
   '00000000-0000-4000-a000-000000000020', 'Cliente sem dono', '+5547999990012',
   null),
  ('00000000-0000-4000-b000-000000000040', '00000000-0000-4000-b000-000000000001',
   '00000000-0000-4000-b000-000000000020', 'Cliente da B', '+5547999990002',
   '00000000-0000-4000-b000-000000000010');

-- -----------------------------------------------------------------------------
-- Uma conexão com a Meta em cada casa, com DONO
--
-- Desde a 087 a imobiliária pode ter mais de uma BM, e tudo do domínio Meta —
-- conta de anúncio, página, gasto, execução — é lido pela conexão de onde veio.
-- Sem estas duas linhas, toda policy do domínio responde vazio e os testes
-- passariam por falta de dado em vez de por acerto da regra.
--
-- `app_secret_id` e `access_token_id` são `not null` e apontam para o Vault por
-- convenção, sem chave estrangeira: aqui são UUIDs quaisquer, porque nenhum
-- teste lê segredo — e nenhum deve.
-- -----------------------------------------------------------------------------

insert into public.meta_integrations
  (id, organization_id, owner_id, label, app_id, app_secret_id, access_token_id, scopes)
values
  ('00000000-0000-4000-a000-000000000070', '00000000-0000-4000-a000-000000000001',
   '00000000-0000-4000-a000-000000000011', 'BM da A', '111', gen_random_uuid(), gen_random_uuid(),
   array['ads_read','leads_retrieval']),
  ('00000000-0000-4000-b000-000000000070', '00000000-0000-4000-b000-000000000001',
   '00000000-0000-4000-b000-000000000011', 'BM da B', '222', gen_random_uuid(), gen_random_uuid(),
   array['ads_read']);

-- -----------------------------------------------------------------------------
-- Um número de WhatsApp conectado, da imobiliária A
--
-- Sem ele não dá para testar a regra que decide o que vira lead — e essa regra
-- é a que separa "conversa" de "oportunidade que entra no funil e divide o
-- gasto de anúncio".
-- -----------------------------------------------------------------------------

--
-- O DONO é o corretor, de propósito: assim o admin e o gerente da mesma
-- imobiliária são pessoas DIFERENTES do dono do número. Sem isso, o teste de
-- privacidade passaria por coincidência — todo mundo sendo a mesma pessoa.
insert into public.whatsapp_instances
  (id, organization_id, label, provider, provider_instance_name, base_url, status,
   connected_phone_e164, owner_id, created_by)
values
  ('00000000-0000-4000-a000-000000000050', '00000000-0000-4000-a000-000000000001',
   'Número da A', 'uazapi', 'teste_a', 'https://exemplo.invalido', 'conectada',
   '+5547999990000',
   '00000000-0000-4000-a000-000000000010', '00000000-0000-4000-a000-000000000010');

-- O código público é o que aparece no "Ref. 1002-BR-A" da mensagem.
update public.properties
   set public_code = '1002'
 where id = '00000000-0000-4000-a000-000000000030';

commit;
