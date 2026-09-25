-- =============================================================================
-- BASE DO CRM
--
-- O schema do CRM de origem (SelectusConnect), consolidado: as 152 migrations
-- dele, até a de 25/09/2026, aplicadas em ordem num banco vazio e extraídas com
-- pg_dump. As funções estão no texto original da migration que as definiu por
-- último (o pg_dump reescreveria o cabeçalho); o resto está como o pg_dump
-- escreve.
--
-- Sem dado de cliente: nem organização, nem etapa de funil. Isso vem do seed de
-- cada cliente (supabase/seeds). Os modelos de documento do sistema entram,
-- porque são do produto.
--
-- Duas diferenças em relação à origem, de propósito:
--  - as policies documentos_read e documentos_write do storage não existem
--    aqui (ver o comentário antes das policies, no fim do arquivo);
--  - os comentários de função não citam nome nem telefone de gente de verdade.
--
-- Mudança de schema daqui em diante é migration nova. Este arquivo não se edita.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;
--
-- PostgreSQL database dump
--



SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--



--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--



--
-- Name: app_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.app_role AS ENUM (
    'admin',
    'gerente',
    'corretor'
);


--
-- Name: agente_pegar_tarefas(integer); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.agente_pegar_tarefas(_limite integer default 5)
returns table (conversa uuid, organizacao uuid, instancia uuid)
language sql
volatile
security definer
set search_path = public
as $fn$
  update public.whatsapp_conversations c
     set agente_responder_em = null,
         agente_espera_desde = null
   where c.id in (
     select c2.id
       from public.whatsapp_conversations c2
       join public.organizations o       on o.id = c2.organization_id
       join public.whatsapp_instances i  on i.id = c2.instance_id
      where c2.agente_responder_em is not null
        and c2.agente_responder_em <= now()
        and c2.agente_pausado_em is null
        and not c2.is_group
        and o.agente_ativo
        and i.agente_ativo
        and i.status = 'conectada'
        and public.wa_estado_da_conversa(c2.id) = 'lead'
      order by c2.agente_responder_em
      limit greatest(1, least(coalesce(_limite, 5), 20))
      for update of c2 skip locked
   )
  returning c.id, c.organization_id, c.instance_id;
$fn$;


--
-- Name: FUNCTION agente_pegar_tarefas(_limite integer); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.agente_pegar_tarefas(_limite integer) IS 'As conversas que o agente PODE responder agora. Reivindica e devolve — duas chamadas nao pegam a mesma.';


--
-- Name: avisar_espera_longa(); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.avisar_espera_longa()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r      record;
  v_desde interval;
  v_texto text;
  v_quem  uuid[];
  v_saiu  integer;
  v_n     integer := 0;
begin
  for r in
    select l.id,
           l.organization_id,
           l.full_name,
           l.assigned_to,
           l.esperando_desde
      from public.leads l
      join public.organizations o  on o.id = l.organization_id
      join public.pipeline_stages s on s.id = l.stage_id
     where l.esperando_desde is not null
       -- A espera desta vez ainda não foi avisada.
       and l.espera_avisada is distinct from l.esperando_desde
       and l.excluded_at is null
       and o.is_active
       and o.aviso_espera_horas is not null
       and l.esperando_desde < now() - make_interval(hours => o.aviso_espera_horas)
       /*
        * A janela, na hora da imobiliária. Fora dela o lead continua na fila e
        * no painel; só o aviso espera o dia começar.
        */
       and extract(hour from now() at time zone o.timezone) between 8 and 20
       /*
        * Ganho e perda ficam de fora, como na tela. Cobrar resposta de quem já
        * foi encerrado é o jeito mais rápido de o alarme virar ruído.
        */
       and not s.is_won
       and not s.is_lost
     order by l.esperando_desde
     limit 200
  loop
    begin
      v_desde := now() - r.esperando_desde;
      v_texto := case
        when v_desde >= interval '2 days' then format('há %s dias', extract(day from v_desde)::int)
        when v_desde >= interval '1 day'  then 'há 1 dia'
        else format('há %sh', greatest(1, (extract(epoch from v_desde) / 3600)::int))
      end;

      select array_agg(p) into v_quem
        from unnest(array(select public.notification_audience(
               r.organization_id, r.id, r.assigned_to))) p;

      if coalesce(array_length(v_quem, 1), 0) > 0 then
        select public.create_notification(
          r.organization_id,
          v_quem,
          'lead_esperando',
          r.full_name,
          /*
           * O corpo diz o TEMPO, não o que a pessoa escreveu. O texto da
           * mensagem já está no cartão do painel e na conversa, para quem tem
           * acesso a ela; repetir conteúdo de conversa dentro de um push que
           * acende na tela de bloqueio do celular é exposição que o aviso não
           * precisa para cumprir a função.
           */
          'Sem resposta ' || v_texto,
          '/leads/' || r.id,
          'lead', r.id,
          null)
        into v_saiu;

        -- O que conta é a notificação que SAIU: quem silenciou o tipo não entra
        -- na conta, senão o número vira propaganda do próprio alarme.
        v_n := v_n + coalesce(v_saiu, 0);
      end if;

      -- Marca DEPOIS de avisar, e dentro do mesmo bloco: se o aviso falhar, a
      -- marca volta atrás junto e a próxima execução tenta de novo.
      update public.leads set espera_avisada = r.esperando_desde where id = r.id;

    exception when others then
      -- Um lead problemático não pode parar a fila dos outros.
      raise warning 'aviso de espera nao saiu (lead %): %', r.id, sqlerrm;
    end;
  end loop;

  return v_n;
end $$;


--
-- Name: FUNCTION avisar_espera_longa(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.avisar_espera_longa() IS 'Avisa quem atende sobre lead sem resposta ha mais de organizations.aviso_espera_horas. Uma vez por espera, so das 8h as 20h da imobiliaria.';


--
-- Name: cc_from_e164(text); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.cc_from_e164(_e164 text)
returns char(2)
language sql
immutable
parallel safe
set search_path = ''
as $fn$
  select public.pais_da_discagem(_e164)
$fn$;


--
-- Name: FUNCTION cc_from_e164(_e164 text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.cc_from_e164(_e164 text) IS 'Apelido de pais_da_discagem. Ate a 126 conhecia sete paises e devolvia BR para o resto.';


--
-- Name: create_notification(uuid, uuid[], text, text, text, text, text, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.create_notification(
  _org          uuid,
  _recipients   uuid[],
  _type         text,
  _title        text,
  _body         text default null,
  _link_path    text default null,
  _entity_type  text default null,
  _entity_id    uuid default null,
  _actor        uuid default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_actor uuid := coalesce(_actor, auth.uid());
  v_group text;
  v_n     integer := 0;
  v_id    uuid;
  v_ve    uuid[];
begin
  -- O tipo entra na chave: 'lead_novo' e 'mensagem_recebida' do mesmo lead são
  -- duas linhas, não uma que se sobrescreve.
  v_group := _type || ':' || coalesce(_entity_type || ':' || _entity_id::text,
                                      gen_random_uuid()::text);

  /*
   * Quem pode LER a conversa é quem pode ser avisado sobre ela.
   *
   * O corpo desta notificação carrega 120 caracteres do texto da mensagem, e
   * vira push no celular. Sem este recorte, fechar a tela para o gerente e
   * deixar o aviso passar entregaria o conteúdo pela porta dos fundos — e por
   * um caminho que ninguém pensa em auditar.
   *
   * Uma vez só, fora do laço: a resposta é a mesma para todos os destinatários.
   */
  if _entity_type = 'conversa' and _entity_id is not null then
    select coalesce(array_agg(q), '{}'::uuid[]) into v_ve
      from public.quem_ve_a_conversa(_entity_id) q;
  end if;

  foreach v_id in array coalesce(_recipients, '{}'::uuid[])
  loop
    -- Ninguém é notificado do que fez. O corretor que cadastrou o lead não
    -- precisa de aviso de que o lead existe.
    continue when v_actor is not null and v_id = v_actor;

    -- Aviso sobre conversa que a pessoa não pode abrir não é aviso, é vazamento.
    continue when v_ve is not null and not (v_id = any(v_ve));

    -- Preferência de tipo aplicada AQUI, no caminho único, e não em cada
    -- produtor. É o que garante que tipo novo já nasce respeitando o silêncio.
    continue when exists (
      select 1 from public.notification_preferences np
       where np.profile_id = v_id and _type = any(np.muted_types));

    insert into public.notifications as n
      (organization_id, recipient_id, type, title, body, link_path,
       related_entity_type, related_entity_id, group_key)
    values
      (_org, v_id, _type, _title, _body, _link_path, _entity_type, _entity_id, v_group)
    on conflict (recipient_id, group_key) where not is_read
    do update set
      event_count   = n.event_count + 1,
      title         = excluded.title,
      body          = excluded.body,
      link_path     = excluded.link_path,
      last_event_at = now();

    v_n := v_n + 1;
  end loop;

  return v_n;
end $fn$;


--
-- Name: current_org_id(); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.current_org_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select organization_id from public.profiles where id = auth.uid();
$$;


--
-- Name: dono_do_anuncio(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.dono_do_anuncio(_org uuid, _ad_id text)
returns uuid
language sql
stable
security definer
set search_path = public
as $fn$
  select i.owner_id
    from public.meta_ads_spend s
    join public.meta_ad_accounts ct
      on ct.organization_id = s.organization_id
     and ct.ad_account_id   = s.ad_account_id
    join public.meta_integrations i on i.id = ct.integration_id
    join public.profiles p          on p.id = i.owner_id
   where s.organization_id = _org
     -- Vazio é SENTINELA em `meta_ads_spend` (ver 017): a linha de gasto do
     -- nível de campanha tem `ad_id` vazio. Sem esta guarda, um lead com anúncio
     -- vazio casaria com as agregadas de TODAS as contas e o `order by`
     -- escolheria uma ao acaso — atribuição sorteada com toda a cara de estar
     -- certa.
     and s.ad_id = nullif(_ad_id, '')
     -- Dono desativado não recebe lead: a ficha entraria numa carteira que
     -- ninguém abre. É a mesma exigência que a 088 pôs na conexão.
     and p.is_active
     and exists (
       select 1 from public.user_roles ur
        where ur.user_id = i.owner_id and ur.organization_id = _org
     )
   -- Um anúncio pode ter mudado de conta. Vale onde ele está AGORA.
   order by s.date desc
   limit 1;
$fn$;


--
-- Name: FUNCTION dono_do_anuncio(_org uuid, _ad_id text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.dono_do_anuncio(_org uuid, _ad_id text) IS 'De quem e a conexao que paga este anuncio. So o uuid do dono — nunca gasto nem nome de conta.';


--
-- Name: e_admin(uuid); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.e_admin(_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1 from public.user_roles
     where user_id = auth.uid()
       and organization_id = _org
       and role = 'admin'
  );
$fn$;


--
-- Name: FUNCTION e_admin(_org uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.e_admin(_org uuid) IS 'Verdadeiro só para o papel admin. Para gerente use is_admin_or_above.';


--
-- Name: encaixe_do_texto(text); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.encaixe_do_texto(_texto text)
returns text
language plpgsql
stable
set search_path = public
as $fn$
declare
  v_texto   text;
  v_quantas integer;
  v_encaixe text;
begin
  v_texto := btrim(regexp_replace(
    lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(_texto, ''))),
    '\s+', ' ', 'g'));

  if v_texto = '' then
    return null;
  end if;

  select count(distinct e.encaixe), min(e.encaixe)
    into v_quantas, v_encaixe
    from (values
      ('a entrada e as parcelas cabem',          'cabe'),
      ('la entrada y las cuotas caben',          'cabe'),
      ('the down payment fits',                  'cabe'),
      ('preciso de mais prazo na entrada',       'precisa_prazo'),
      ('necesito mas plazo en la entrada',       'precisa_prazo'),
      ('i need more time on the down payment',   'precisa_prazo'),
      ('dependo de financiamento bancario',      'depende_banco'),
      ('dependo de financiacion bancaria',       'depende_banco'),
      ('i depend on bank financing',             'depende_banco')
    ) as e(frase, encaixe)
   where position(e.frase in v_texto) > 0;

  return case when v_quantas = 1 then v_encaixe end;
end $fn$;


--
-- Name: FUNCTION encaixe_do_texto(_texto text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.encaixe_do_texto(_texto text) IS 'O encaixe financeiro que um texto afirma, ou nulo. As frases sao as que o quiz escreve.';


--
-- Name: enfileirar_mensagem(uuid, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.enfileirar_mensagem(
  _conversation_id uuid,
  _body            text,
  _autor           uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conv   record;
  v_msg    uuid;
  v_autor  uuid := coalesce(_autor, auth.uid());
begin
  select c.*, i.status as instancia_status, i.label as instancia_label
    into v_conv
    from public.whatsapp_conversations c
    join public.whatsapp_instances i on i.id = c.instance_id
   where c.id = _conversation_id;

  if v_conv is null then
    raise exception 'Conversa não encontrada' using errcode = 'no_data_found';
  end if;

  -- A conferência da 058, com a MESMA mensagem de "não encontrada" logo acima.
  -- Dizer "essa conversa não é sua" confirmaria ao curioso que o id existe.
  if auth.uid() is not null
     and v_conv.organization_id is distinct from (select public.current_org_id()) then
    raise exception 'Conversa não encontrada' using errcode = 'no_data_found';
  end if;

  if v_conv.contact_e164 is null then
    raise exception 'Esta conversa ainda não tem um número identificado'
      using errcode = 'check_violation';
  end if;

  -- NUNCA cai para outro número. Na referência, instância fora do ar fazia a
  -- resposta sair pela "melhor instância" — ou seja, por um número que o
  -- cliente não conhece, quebrando a conversa dos dois lados.
  if v_conv.instancia_status <> 'conectada' then
    raise exception 'O número % está desconectado', v_conv.instancia_label
      using errcode = 'check_violation';
  end if;

  if coalesce(trim(_body), '') = '' then
    raise exception 'Mensagem vazia' using errcode = 'check_violation';
  end if;

  -- A mensagem primeiro. Se o envio falhar, ela continua na thread.
  insert into public.whatsapp_messages
    (organization_id, conversation_id, lead_id, instance_id, direction,
     dedupe_key, kind, body, status, sent_by, occurred_at, automatica)
  values
    (v_conv.organization_id, v_conv.id, v_conv.lead_id, v_conv.instance_id, 'saida',
     'local:' || gen_random_uuid()::text, 'texto', trim(_body), 'enfileirada', v_autor, now(),
     -- Sem autor é o agente: o corretor sempre traz `auth.uid()`, e a função do
     -- agente chama com autor nulo de propósito. É esta coluna que diz ao
     -- gatilho de pausa quem falou.
     v_autor is null)
  returning id into v_msg;

  insert into public.whatsapp_outbox
    (organization_id, conversation_id, instance_id, message_id, to_e164, body, requested_by)
  values
    (v_conv.organization_id, v_conv.id, v_conv.instance_id, v_msg,
     v_conv.contact_e164, trim(_body), v_autor);

  update public.whatsapp_conversations
     set last_message_at = now(),
         last_message_body = left(trim(_body), 200),
         /*
          * "Respondeu, então leu" vale para GENTE.
          *
          * Se o agente responde e zera o contador, o corretor nunca vê que o
          * cliente escreveu — o pré-atendimento vira atendimento inteiro por
          * engano, sem ninguém ter decidido isso. Automático não lê por ninguém.
          */
         unread_count = case when v_autor is null then unread_count else 0 end
   where id = v_conv.id;

  return v_msg;
end $$;


--
-- Name: finalidade_do_texto(text); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.finalidade_do_texto(_texto text)
returns text
language plpgsql
stable
set search_path = public
as $fn$
declare
  v_texto   text;
  v_quantas integer;
  v_final   text;
begin
  v_texto := btrim(regexp_replace(
    lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(_texto, ''))),
    '\s+', ' ', 'g'));

  if v_texto = '' then
    return null;
  end if;

  -- Quem nega não quer.
  if position('nao quero' in v_texto) > 0 or position('no quiero' in v_texto) > 0 then
    return null;
  end if;

  select count(distinct f.finalidade), min(f.finalidade)
    into v_quantas, v_final
    from (values
      ('quero investir',       'investir'),
      ('quiero invertir',      'investir'),
      ('i want to invest',     'investir'),
      ('quero morar',          'morar'),
      ('quiero vivir',         'morar'),
      ('i want to live there', 'morar'),
      ('para veraneio',        'segunda_residencia'),
      ('para vacaciones',      'segunda_residencia'),
      ('holiday home',         'segunda_residencia')
    ) as f(frase, finalidade)
   where position(f.frase in v_texto) > 0;

  return case when v_quantas = 1 then v_final end;
end $fn$;


--
-- Name: FUNCTION finalidade_do_texto(_texto text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.finalidade_do_texto(_texto text) IS 'A finalidade que um texto afirma, ou nulo. Tres idiomas desde a 135. Na duvida nao afirma.';


--
-- Name: find_or_create_lead(uuid, text, text, character, text, text, text, uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.find_or_create_lead(
  _org          uuid,
  _full_name    text,
  _phone        text default null,
  _phone_cc     char(2) default 'BR',
  _email        text default null,
  _source       text default 'manual',
  _entry_point  text default null,
  _property_id  uuid default null,
  _attribution  jsonb default '{}'::jsonb
)
returns table (o_lead_id uuid, o_is_new boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_e164  text;
  v_id    uuid;
  v_new   boolean := false;
  v_stage uuid;
begin
  v_e164 := public.to_e164(_phone, _phone_cc);

  if v_e164 is null and _email is null then
    raise exception 'Lead precisa de telefone válido ou e-mail';
  end if;

  perform pg_advisory_xact_lock(hashtext(_org::text || coalesce(v_e164, lower(_email))));

  if v_e164 is not null then
    select id into v_id from public.leads
     where organization_id = _org and phone_e164 = v_e164;
  end if;

  if v_id is null and _email is not null then
    select id into v_id from public.leads
     where organization_id = _org and lower(email) = lower(_email);
  end if;

  if v_id is null then
    select id into v_stage from public.pipeline_stages
     where organization_id = _org and is_active order by position limit 1;

    insert into public.leads (
      organization_id, stage_id, full_name, phone, phone_country, email,
      source, entry_point,
      ft_landing_page_id, ft_variant, ft_locale, ft_meta_ad_id,
      ft_utm_source, ft_utm_campaign, ft_occurred_at,
      lt_landing_page_id, lt_variant, lt_meta_ad_id, lt_occurred_at,
      attribution_method, variants_seen, gclid, fbclid, landing_page_url, referrer
    ) values (
      _org, v_stage, _full_name, _phone, _phone_cc, _email,
      _source, _entry_point,
      (_attribution->>'landing_page_id')::uuid,
      nullif(_attribution->>'variant','')::char(1),
      nullif(_attribution->>'locale',''),
      nullif(_attribution->>'meta_ad_id',''),
      nullif(_attribution->>'utm_source',''),
      nullif(_attribution->>'utm_campaign',''),
      coalesce((_attribution->>'occurred_at')::timestamptz, now()),
      (_attribution->>'landing_page_id')::uuid,
      nullif(_attribution->>'variant','')::char(1),
      nullif(_attribution->>'meta_ad_id',''),
      coalesce((_attribution->>'occurred_at')::timestamptz, now()),
      coalesce(nullif(_attribution->>'method',''), 'none'),
      case when _attribution->>'variant' is null then '{}'::char(1)[]
           else array[(_attribution->>'variant')::char(1)] end,
      nullif(_attribution->>'gclid',''),
      nullif(_attribution->>'fbclid',''),
      nullif(_attribution->>'landing_page_url',''),
      nullif(_attribution->>'referrer','')
    )
    returning id into v_id;

    v_new := true;
    perform public.log_timeline_event(v_id, 'lead', 'created', 'Lead criado', null, _attribution);
  else
    -- Lead que volta: o último toque sempre atualiza; o primeiro só se este
    -- toque for cronologicamente anterior ao que já está gravado.
    perform public.touch_lead_attribution(v_id, _attribution);
  end if;

  if _property_id is not null then
    insert into public.lead_property_interests (organization_id, lead_id, property_id)
    values (_org, v_id, _property_id)
    on conflict (lead_id, property_id) do nothing;
  end if;

  return query select v_id, v_new;
end $$;


--
-- Name: fuso_da_org(uuid); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.fuso_da_org(_org uuid)
returns text
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(nullif(o.timezone, ''), 'America/Sao_Paulo')
    from public.organizations o where o.id = _org;
$$;


--
-- Name: has_role_in_org(public.app_role, uuid); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.has_role_in_org(_role public.app_role, _org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
     where user_id = auth.uid() and organization_id = _org and role = _role
  );
$$;


--
-- Name: incrementar_falha_push(uuid); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.incrementar_falha_push(_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.push_subscriptions
     set failure_count = failure_count + 1,
         last_failure_at = now()
   where id = _id;
$$;


--
-- Name: inicio_do_dia(date, text); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.inicio_do_dia(_dia date, _tz text)
returns timestamptz
language sql
immutable
security invoker
set search_path = public
as $$
  select _dia::timestamp at time zone _tz;
$$;


--
-- Name: instante_do_provedor(text); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.instante_do_provedor(_bruto text)
returns timestamptz
language sql
immutable
as $$
  select case
           when nullif(_bruto, '') is null then null
           when _bruto::bigint > 100000000000 then to_timestamp(_bruto::bigint / 1000.0)
           else to_timestamp(_bruto::bigint)
         end;
$$;


--
-- Name: FUNCTION instante_do_provedor(_bruto text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.instante_do_provedor(_bruto text) IS 'Carimbo do provedor em segundos OU milissegundos. Acima de 1e11 é milissegundo — 1e11 segundos seria o ano 5138.';


--
-- Name: is_admin_or_above(uuid); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.is_admin_or_above(_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
     where user_id = auth.uid()
       and organization_id = _org
       and role in ('admin', 'gerente')
  );
$$;


--
-- Name: landing_do_ref(uuid, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.landing_do_ref(
  _org uuid, _public_code text, _market text, _variant text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select lp.id
    from public.landing_pages lp
    join public.properties p on p.id = lp.property_id
   where lp.organization_id = _org
     and lower(p.public_code) = lower(_public_code)
     and lp.market  = lower(_market)
     and lp.variant = lower(_variant)
   limit 1;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: landing_pages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.landing_pages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    property_id uuid NOT NULL,
    variant text NOT NULL,
    angulo text CONSTRAINT landing_pages_template_not_null NOT NULL,
    cta_kind text NOT NULL,
    headline text,
    subheadline text,
    cta_label text,
    is_published boolean DEFAULT false NOT NULL,
    published_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    market text DEFAULT 'br'::text NOT NULL,
    locale text DEFAULT 'pt-BR'::text NOT NULL,
    layout text DEFAULT 'padrao'::text NOT NULL,
    CONSTRAINT landing_pages_angulo_ck CHECK ((angulo = ANY (ARRAY['experiencia'::text, 'investimento'::text, 'oportunidade'::text]))),
    CONSTRAINT landing_pages_cta_ck CHECK ((cta_kind = ANY (ARRAY['whatsapp'::text, 'formulario'::text, 'ambos'::text, 'quiz'::text]))),
    CONSTRAINT landing_pages_layout_ck CHECK ((layout = ANY (ARRAY['padrao'::text, 'proposta'::text, 'lancamento'::text, 'vitrine'::text, 'orla'::text, 'direto'::text]))),
    CONSTRAINT landing_pages_locale_ck CHECK ((locale = ANY (ARRAY['pt-BR'::text, 'es'::text, 'en'::text]))),
    CONSTRAINT landing_pages_market_ck CHECK ((market = ANY (ARRAY['br'::text, 'ar'::text, 'cl'::text, 'us'::text, 'es'::text]))),
    CONSTRAINT landing_pages_var_ck CHECK ((variant = ANY (ARRAY['a'::text, 'b'::text, 'c'::text])))
);


--
-- Name: TABLE landing_pages; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.landing_pages IS 'Uma linha por (imóvel, variante). Os textos nulos significam "herda do imóvel".';


--
-- Name: COLUMN landing_pages.angulo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.landing_pages.angulo IS 'O ARGUMENTO que a página defende. Independe do desenho.';


--
-- Name: COLUMN landing_pages.market; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.landing_pages.market IS 'País de quem lê (ISO alfa-2). Dimensão, nunca braço do experimento — o A/B/C roda dentro de um mercado.';


--
-- Name: COLUMN landing_pages.locale; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.landing_pages.locale IS 'Idioma do texto. Deriva do mercado; vários mercados compartilham um idioma.';


--
-- Name: COLUMN landing_pages.layout; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.landing_pages.layout IS 'O DESENHO da página. Independe do argumento.';


--
-- Name: landing_gerar(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.landing_gerar(
  _property_id uuid, _mercado text, _layout text default 'padrao')
returns setof public.landing_pages
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_org    uuid := public.current_org_id();
  v_locale text;
begin
  if v_org is null then raise exception 'sem organização'; end if;
  if _layout not in ('padrao','proposta') then
    raise exception 'layout desconhecido: %', _layout;
  end if;

  -- O idioma sai do mercado, e sai AQUI. Deixar a tela mandar os dois
  -- permitiria uma página marcada "Estados Unidos" escrita em português — e o
  -- hreflang diria inglês para texto em português, pior que não ter hreflang.
  v_locale := case _mercado
                when 'br' then 'pt-BR' when 'us' then 'en'
                when 'ar' then 'es'    when 'cl' then 'es'
                when 'es' then 'es'
              end;
  if v_locale is null then raise exception 'mercado desconhecido: %', _mercado; end if;

  if not exists (
    select 1 from public.properties where id = _property_id and organization_id = v_org
  ) then
    raise exception 'imóvel não encontrado';
  end if;

  insert into public.landing_pages
    (organization_id, property_id, market, locale, variant, angulo, layout, cta_kind)
  values
    (v_org, _property_id, _mercado, v_locale, 'a', 'experiencia',  _layout, 'whatsapp'),
    (v_org, _property_id, _mercado, v_locale, 'b', 'investimento', _layout, 'formulario'),
    (v_org, _property_id, _mercado, v_locale, 'c', 'oportunidade', _layout, 'ambos')
  on conflict (organization_id, property_id, market, variant) do nothing;

  return query
    select * from public.landing_pages
     where organization_id = v_org and property_id = _property_id and market = _mercado
     order by variant;
end $$;


--
-- Name: landing_marco(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.landing_marco(_pagina uuid, _marco text)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare v_org uuid;
begin
  if _marco not in ('scroll_50', 'scroll_75', 'form_started', 'whatsapp_tap', 'quiz_started') then
    return;
  end if;

  select organization_id into v_org
    from public.landing_pages where id = _pagina and is_published;
  if not found then return; end if;

  /*
   * A linha do dia pode não existir ainda: a visita é contada no primeiro
   * render, mas se aquela chamada falhou o marco chegaria numa linha
   * inexistente e se perderia em silêncio. Aqui ele cria a linha com ZERO
   * visitas, que é a verdade.
   */
  insert into public.landing_page_daily (organization_id, landing_page_id, date, views)
  values (v_org, _pagina, current_date, 0)
  on conflict (landing_page_id, date) do nothing;

  if _marco = 'scroll_50' then
    update public.landing_page_daily
       set scroll_50 = scroll_50 + 1
     where landing_page_id = _pagina and date = current_date;
  elsif _marco = 'scroll_75' then
    update public.landing_page_daily
       set scroll_75 = scroll_75 + 1
     where landing_page_id = _pagina and date = current_date;
  elsif _marco = 'whatsapp_tap' then
    update public.landing_page_daily
       set whatsapp_tap = whatsapp_tap + 1
     where landing_page_id = _pagina and date = current_date;
  elsif _marco = 'quiz_started' then
    update public.landing_page_daily
       set quiz_started = quiz_started + 1
     where landing_page_id = _pagina and date = current_date;
  else
    update public.landing_page_daily
       set form_started = form_started + 1
     where landing_page_id = _pagina and date = current_date;
  end if;
end $fn$;


--
-- Name: landing_placar(uuid, text, date, date); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.landing_placar(
  _property_id uuid, _mercado text, _since date, _until date)
returns table (
  landing_page_id uuid,
  mercado         text,
  variante        text,
  angulo          text,
  layout          text,
  cta_kind        text,
  publicada       boolean,
  visitas         bigint,
  rolou_50        bigint,
  rolou_75        bigint,
  comecou_form    bigint,
  tocou_whatsapp  bigint,
  leads           bigint
)
language sql
stable
security invoker
set search_path = public
as $fn$
  select p.id, p.market, p.variant, p.angulo, p.layout, p.cta_kind, p.is_published,
         coalesce((select sum(d.views) from public.landing_page_daily d
                    where d.landing_page_id = p.id
                      and d.date between _since and _until), 0)::bigint,
         coalesce((select sum(d.scroll_50) from public.landing_page_daily d
                    where d.landing_page_id = p.id
                      and d.date between _since and _until), 0)::bigint,
         coalesce((select sum(d.scroll_75) from public.landing_page_daily d
                    where d.landing_page_id = p.id
                      and d.date between _since and _until), 0)::bigint,
         coalesce((select sum(d.form_started) from public.landing_page_daily d
                    where d.landing_page_id = p.id
                      and d.date between _since and _until), 0)::bigint,
         coalesce((select sum(d.whatsapp_tap) from public.landing_page_daily d
                    where d.landing_page_id = p.id
                      and d.date between _since and _until), 0)::bigint,
         -- `ab_contaminated` fica de fora: quem viu duas variantes não pertence
         -- a nenhuma, e contá-lo nas duas infla as duas.
         coalesce((select count(*) from public.leads l
                    where l.organization_id = p.organization_id
                      and l.excluded_at is null
                      and l.ft_landing_page_id = p.id
                      and not coalesce(l.ab_contaminated, false)
                      and l.created_at::date between _since and _until), 0)::bigint
    from public.landing_pages p
   where p.organization_id = public.current_org_id()
     and p.property_id = _property_id
     -- O filtro por mercado é OBRIGATÓRIO: sem ele o placar somaria a variante
     -- A da Argentina com a A dos Estados Unidos, e o vencedor seria o mercado
     -- com mais verba.
     and p.market = _mercado
   order by p.variant;
$fn$;


--
-- Name: landing_publica(text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.landing_publica(_org_slug text, _mercado text, _slug text, _variante text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_prop public.properties%rowtype;
  v_page public.landing_pages%rowtype;
  v_org  uuid;
  v_pub  text;
  v_chave text := regexp_replace(lower(coalesce(_org_slug, '')), '^www\.', '');
  v_por_dominio boolean := false;
  v_base text;
begin
  if _variante is null or _variante not in ('a','b','c') then
    return jsonb_build_object('erro', 'variante inválida');
  end if;
  if _mercado is null or _mercado not in ('br','ar','cl','us','es') then
    return jsonb_build_object('erro', 'mercado inválido');
  end if;

  select id, coalesce(lower(custom_domain), '') = v_chave
    into v_org, v_por_dominio
    from public.organizations
   where is_active and (slug = v_chave or lower(custom_domain) = v_chave)
   limit 1;

  if v_org is null then
    return jsonb_build_object('erro', 'nao_encontrado');
  end if;

  v_base := case when v_por_dominio then '' else '/' || v_chave end;

  select * into v_prop from public.properties
   where organization_id = v_org and slug = _slug and is_published;

  if not found then
    select p.* into v_prop
      from public.property_slug_history h
      join public.properties p on p.id = h.property_id
     where h.organization_id = v_org and h.old_slug = _slug and p.is_published
     order by h.replaced_at desc
     limit 1;
  end if;

  if not found then
    return jsonb_build_object('erro', 'nao_encontrado');
  end if;

  v_pub := public.titulo_publico(v_prop.public_title, v_prop.property_type,
                                 v_prop.bedrooms, v_prop.neighborhood, v_prop.city);

  select * into v_page from public.landing_pages
   where property_id = v_prop.id
     and market  = _mercado
     and variant = _variante
     and is_published;

  if not found then
    return jsonb_build_object('erro', 'nao_encontrado');
  end if;

  return jsonb_build_object(
    'pagina', jsonb_build_object(
      'id',          v_page.id,
      'variante',    v_page.variant,
      'mercado',     v_page.market,
      'idioma',      v_page.locale,
      'angulo',      v_page.angulo,
      'layout',      v_page.layout,
      'cta_kind',    v_page.cta_kind,
      'headline',    coalesce(nullif(v_page.headline, ''), v_pub),
      'subheadline', nullif(v_page.subheadline, ''),
      'cta_label',   nullif(v_page.cta_label, ''),
      'ref_code',    upper(v_prop.public_code) || '-' || upper(v_page.market) || '-' || upper(v_page.variant),
      'public_code', upper(v_prop.public_code),
      'caminho',     v_base || '/' || _mercado || '/imovel/' || v_prop.slug
    ),

    'alternativas', coalesce((
      select jsonb_agg(distinct jsonb_build_object(
               'mercado', o.market, 'idioma', o.locale,
               'caminho', v_base || '/' || o.market || '/imovel/' || v_prop.slug))
        from public.landing_pages o
       where o.property_id = v_prop.id and o.is_published
    ), '[]'::jsonb),

    'imovel', jsonb_build_object(
      'titulo',        v_pub,
      'descricao',     v_prop.description,
      'tipo',          v_prop.property_type,
      'finalidade',    v_prop.purpose,
      'preco_cents',   v_prop.price_cents,
      'moeda',         'BRL',
      'condominio_cents', v_prop.condo_fee_cents,
      'iptu_cents',    v_prop.iptu_year_cents,
      'area_total',    v_prop.area_total,
      'area_util',     v_prop.area_built,
      'quartos',       v_prop.bedrooms,
      'suites',        v_prop.suites,
      'banheiros',     v_prop.bathrooms,
      'vagas',         v_prop.parking_spots,
      'andar',         v_prop.floor,
      'comodidades',   to_jsonb(v_prop.amenities),
      'bairro',        v_prop.neighborhood,
      'cidade',        v_prop.city,
      'estado',        v_prop.state,
      'recorte',       nullif(v_prop.recorte_path, ''),
      'hero_metade',   nullif(v_prop.hero_metade_path, ''),
      -- Nula, a apresentação cai para a capa da galeria e o bloco continua de
      -- pé — como todo bloco deste modelo.
      'apresentacao',  nullif(v_prop.apresentacao_path, ''),
      'endereco',      case when v_prop.show_exact_address
                            then nullif(trim(coalesce(v_prop.address,'') || ' ' ||
                                             coalesce(v_prop.address_number,'')), '') end,
      'latitude',      case when v_prop.show_exact_address then v_prop.latitude end,
      'longitude',     case when v_prop.show_exact_address then v_prop.longitude end,
      'endereco_exato', v_prop.show_exact_address
    ),

    'pagamento', jsonb_build_object(
      'formas',          to_jsonb(coalesce(v_prop.payment_methods, '{}')),
      'entrada_cents',   v_prop.down_payment_cents,
      'parcelas',        v_prop.installments_count,
      'parcela_cents',   v_prop.installment_cents,
      'reforcos',        v_prop.reinforcement_count,
      'reforco_cents',   v_prop.reinforcement_cents,
      'reforco_periodo', v_prop.reinforcement_period,
      'chaves_cents',    v_prop.keys_cents,
      'observacoes',     nullif(v_prop.payment_notes, '')
    ),

    'fotos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'path',    m.storage_path,
               'legenda', m.caption,
               'alt',     m.alt_text,
               'comodo',  m.room,
               'capa',    m.is_cover,
               'largura', m.width,
               'altura',  m.height)
               order by m.is_cover desc, m.position, m.created_at)
        from public.property_media m
       where m.property_id = v_prop.id and m.kind = 'image'
    ), '[]'::jsonb),

    'whatsapp', (
      select i.connected_phone_e164
        from public.whatsapp_instances i
       where i.organization_id = v_org
         and i.status = 'conectada'
         and i.connected_phone_e164 is not null
         -- A LINHA NOVA, e o motivo desta migration inteira.
         and exists (
           select 1 from public.user_roles ur
            where ur.user_id = i.owner_id
              and ur.organization_id = i.organization_id
              and ur.role in ('admin', 'gerente'))
       order by i.last_seen_at desc nulls last
       limit 1),

    'cidade_bloco', (
      select jsonb_build_object(
               'chamada', c.chamada, 'fonte', c.chamada_fonte,
               'argumento', c.argumento, 'imagem', c.imagem_path,
               'imagem_larga', c.imagem_larga,
               'imagem_cena', c.imagem_cena)
        from public.landing_cidades c
       where c.organization_id = v_org
         and lower(c.cidade) = lower(v_prop.city)
         and c.estado = v_prop.state
         and c.locale = v_page.locale
       limit 1),

    'pontos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'titulo', t.titulo, 'chamada', t.chamada, 'texto', t.texto,
               'fecho', t.fecho, 'numeros', t.numeros, 'imagens', to_jsonb(t.imagens))
               order by t.posicao, t.titulo)
        from public.landing_pontos t
       where t.organization_id = v_org
         and lower(t.cidade) = lower(v_prop.city)
         and t.estado = v_prop.state
         and t.locale = v_page.locale
    ), '[]'::jsonb),

    'distancia_ponto_m', v_prop.ponto_distancia_m,

    'corretora', (
      select jsonb_build_object('nome', o.name, 'logo', o.logo_url,
                                'creci', o.creci, 'cor', o.brand_color,
                                'pixel', o.meta_pixel_id)
        from public.organizations o where o.id = v_org)
  );
end $function$;


--
-- Name: landing_ref_code(text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.landing_ref_code(_public_code text, _market text, _variant text)
returns text
language sql
immutable
set search_path = public
as $$
  select upper(_public_code) || '-' || upper(_market) || '-' || upper(_variant);
$$;


--
-- Name: landing_visita(uuid); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.landing_visita(_pagina uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_org uuid;
begin
  select organization_id into v_org
    from public.landing_pages where id = _pagina and is_published;
  if not found then return; end if;

  insert into public.landing_page_daily (organization_id, landing_page_id, date, views)
  values (v_org, _pagina, current_date, 1)
  on conflict (landing_page_id, date) do update set views = landing_page_daily.views + 1;
end $$;


--
-- Name: lead_e_meu(uuid); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.lead_e_meu(_lead_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1
      from public.leads l
     where l.id = _lead_id
       and l.organization_id = (select public.current_org_id())
       and (l.assigned_to = (select auth.uid()) or public.ve_a_carteira_toda())
  );
$fn$;


--
-- Name: FUNCTION lead_e_meu(_lead_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.lead_e_meu(_lead_id uuid) IS 'Este lead esta no meu nome, ou eu sou gestao? Usada pelas policies das tabelas filhas do lead.';


--
-- Name: lead_origem_meta(uuid); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.lead_origem_meta(_lead uuid)
returns table (
  conta      text,
  campanha   text,
  conjunto   text,
  anuncio    text,
  situacao   text,
  permalink  text
)
language sql
stable
security definer
set search_path = public
as $fn$
  with alvo as (
    -- A organização vem do LEAD e é conferida contra a de quem chama. Sem isto,
    -- um id de lead de outra imobiliária devolveria os nomes das campanhas dela.
    select l.ft_meta_ad_id as ad_id, l.organization_id as org
      from public.leads l
     where l.id = _lead
       and l.organization_id = (select public.current_org_id())
       and nullif(l.ft_meta_ad_id, '') is not null
  ),
  /*
   * A hierarquia vem do GASTO porque é a única tabela que amarra os quatro
   * níveis na mesma linha. `meta_ad_dimensions` sabe o nome de um objeto e não
   * sabe de quem ele é filho.
   *
   * Mais recente primeiro: um anúncio pode ter sido movido de conjunto, e o que
   * interessa é onde ele está agora.
   */
  hierarquia as (
    select s.ad_account_id, s.campaign_id, s.adset_id
      from public.meta_ads_spend s
      join alvo a on a.ad_id = s.ad_id and a.org = s.organization_id
     order by s.date desc
     limit 1
  )
  select
    ct.name,
    camp.name,
    cj.name,
    -- O nome do anúncio NÃO depende do gasto: um anúncio recém-criado, que
    -- ainda não gastou um centavo, já tem nome — e é dele que vem o primeiro
    -- lead. Sem este caminho separado, o lead mais novo seria o único sem nome.
    an.name,
    an.effective_status,
    an.permalink
    from alvo a
    left join hierarquia h on true
    left join public.meta_ad_dimensions an
           on an.organization_id = a.org and an.level = 'ad'       and an.object_id = a.ad_id
    left join public.meta_ad_dimensions camp
           on camp.organization_id = a.org and camp.level = 'campaign' and camp.object_id = h.campaign_id
    left join public.meta_ad_dimensions cj
           on cj.organization_id = a.org and cj.level = 'adset'    and cj.object_id = h.adset_id
    left join public.meta_ad_accounts ct
           on ct.organization_id = a.org and ct.ad_account_id = h.ad_account_id;
$fn$;


--
-- Name: FUNCTION lead_origem_meta(_lead uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.lead_origem_meta(_lead uuid) IS 'Conta, campanha, conjunto e anuncio de um lead — SO os nomes. Gasto continua restrito a gestao.';


--
-- Name: lead_preencher_qualificacao(uuid, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.lead_preencher_qualificacao(
  _lead       uuid,
  _origem     text,
  _finalidade text default null,
  _prazo      text default null,
  _encaixe    text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_n integer;
begin
  if _origem is null or _origem not in ('whatsapp', 'landing', 'formulario_meta') then
    raise exception 'origem de qualificacao desconhecida: %', coalesce(_origem, '(nula)')
      using errcode = '22023';
  end if;

  if _lead is null or (_finalidade is null and _prazo is null and _encaixe is null) then
    return false;
  end if;

  perform set_config('app.qualificacao_origem', _origem, true);

  update public.leads l
     set finalidade         = coalesce(l.finalidade, _finalidade),
         prazo_compra       = coalesce(l.prazo_compra, _prazo),
         encaixe_financeiro = coalesce(l.encaixe_financeiro, _encaixe)
   where l.id = _lead
     and (   (l.finalidade         is null and _finalidade is not null)
          or (l.prazo_compra       is null and _prazo      is not null)
          or (l.encaixe_financeiro is null and _encaixe    is not null));
  get diagnostics v_n = row_count;

  perform set_config('app.qualificacao_origem', '', true);

  return v_n > 0;
end $fn$;


--
-- Name: FUNCTION lead_preencher_qualificacao(_lead uuid, _origem text, _finalidade text, _prazo text, _encaixe text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.lead_preencher_qualificacao(_lead uuid, _origem text, _finalidade text, _prazo text, _encaixe text) IS 'Grava respostas de qualificacao vindas de fora da ficha. So preenche o que esta vazio e avisa o historico da origem.';


--
-- Name: temperatura_pela_regra(text, text); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.temperatura_pela_regra(_prazo text, _encaixe text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $fn$
  select case
    when _prazo is null then null
    when _prazo in ('ate_30_dias', 'de_1_a_3_meses') and _encaixe = 'cabe' then 'quente'
    when _prazo in ('ate_30_dias', 'de_1_a_3_meses', 'de_3_a_6_meses') then 'morno'
    else 'frio'
  end
$fn$;


--
-- Name: FUNCTION temperatura_pela_regra(_prazo text, _encaixe text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.temperatura_pela_regra(_prazo text, _encaixe text) IS 'Temperatura do lead pelas respostas. Mudar aqui exige reescrever as linhas: coluna gerada nao se recalcula sozinha.';


--
-- Name: to_e164(text, character); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.to_e164(_raw text, _cc char(2))
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  d text;
begin
  if _raw is null or _cc is null then
    return null;
  end if;

  d := regexp_replace(_raw, '\D', '', 'g');
  if d = '' then
    return null;
  end if;

  -- Já veio com DDI completo e plausível.
  if left(_raw, 1) = '+' and length(d) between 8 and 15 then
    /*
     * O BRASIL PRECISA DE UMA CONFERIDA MESMO ASSIM.
     *
     * 12 dígitos começando em 55 é DDI + DDD + oito dígitos — o formato antigo,
     * anterior ao nono dígito. Se o primeiro dígito do assinante for 6, 7, 8 ou
     * 9, aquilo é celular e falta o 9; se for 2 a 5, é telefone fixo, e fixo
     * continua com oito dígitos até hoje.
     *
     * É a MESMA regra que já existe no ramo 'BR' logo abaixo. Ela só nunca era
     * alcançada por quem chega com o '+' — que é todo mundo que vem do
     * WhatsApp.
     */
    if left(d, 2) = '55' and length(d) = 12 and substr(d, 5, 1) ~ '[6-9]' then
      d := substr(d, 1, 4) || '9' || substr(d, 5);
    end if;
    return '+' || d;
  end if;

  case upper(_cc)
    when 'BR' then
      d := regexp_replace(d, '^0+', '');
      if left(d, 2) = '55' and length(d) in (12, 13) then
        d := substr(d, 3);
      end if;
      -- Celular sem o nono dígito: 10 dígitos com 3º dígito >= 6.
      if length(d) = 10 and substr(d, 3, 1) ~ '[6-9]' then
        d := substr(d, 1, 2) || '9' || substr(d, 3);
      end if;
      if length(d) not in (10, 11) then
        return null;
      end if;
      return '+55' || d;

    when 'AR' then
      d := regexp_replace(d, '^0+', '');
      if left(d, 2) = '54' then d := substr(d, 3); end if;
      d := regexp_replace(d, '^9', '');
      if length(d) not between 10 and 11 then return null; end if;
      return '+549' || d;

    when 'CL' then
      if left(d, 2) = '56' then d := substr(d, 3); end if;
      if length(d) <> 9 then return null; end if;
      return '+56' || d;

    when 'UY' then
      if left(d, 3) = '598' then d := substr(d, 4); end if;
      if length(d) not between 8 and 9 then return null; end if;
      return '+598' || d;

    when 'PY' then
      if left(d, 3) = '595' then d := substr(d, 4); end if;
      if length(d) not between 8 and 9 then return null; end if;
      return '+595' || d;

    when 'US', 'CA' then
      if length(d) = 11 and left(d, 1) = '1' then d := substr(d, 2); end if;
      if length(d) <> 10 then return null; end if;
      return '+1' || d;

    when 'PT' then
      if left(d, 3) = '351' then d := substr(d, 4); end if;
      if length(d) <> 9 then return null; end if;
      return '+351' || d;

    else
      return null;
  end case;
end $$;


--
-- Name: FUNCTION to_e164(_raw text, _cc character); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.to_e164(_raw text, _cc character) IS 'Normaliza telefone para E.164. Desde a 139, celular brasileiro sempre com o nono digito, venha ele como vier.';


--
-- Name: leads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.leads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    stage_id uuid NOT NULL,
    full_name text NOT NULL,
    phone text,
    phone_country character(2) DEFAULT 'BR'::bpchar NOT NULL,
    phone_e164 text GENERATED ALWAYS AS (public.to_e164(phone, phone_country)) STORED,
    email text,
    source text DEFAULT 'manual'::text NOT NULL,
    entry_point text,
    assigned_to uuid,
    ft_landing_page_id uuid,
    ft_variant character(1),
    ft_locale text,
    ft_meta_ad_id text,
    ft_utm_source text,
    ft_utm_campaign text,
    ft_occurred_at timestamp with time zone,
    lt_landing_page_id uuid,
    lt_variant character(1),
    lt_meta_ad_id text,
    lt_occurred_at timestamp with time zone,
    attribution_method text DEFAULT 'none'::text NOT NULL,
    ab_contaminated boolean DEFAULT false NOT NULL,
    variants_seen character(1)[] DEFAULT '{}'::bpchar[] NOT NULL,
    gclid text,
    fbclid text,
    landing_page_url text,
    referrer text,
    deal_value_cents bigint,
    commission_pct numeric(5,2),
    loss_reason text,
    loss_reason_text text,
    first_contact_at timestamp with time zone,
    stage_changed_at timestamp with time zone DEFAULT now() NOT NULL,
    notes text,
    tags text[] DEFAULT '{}'::text[] NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    excluded_at timestamp with time zone,
    furthest_position integer DEFAULT 1 NOT NULL,
    city text,
    finalidade text,
    prazo_compra text,
    encaixe_financeiro text,
    temperatura_manual text,
    temperatura_regra text GENERATED ALWAYS AS (public.temperatura_pela_regra(prazo_compra, encaixe_financeiro)) STORED,
    temperatura text GENERATED ALWAYS AS (COALESCE(temperatura_manual, public.temperatura_pela_regra(prazo_compra, encaixe_financeiro))) STORED,
    esperando_desde timestamp with time zone,
    espera_avisada timestamp with time zone,
    silencio_desde timestamp with time zone,
    toques_sem_resposta integer DEFAULT 0 NOT NULL,
    CONSTRAINT leads_city_ck CHECK (((city IS NULL) OR ((char_length(btrim(city)) >= 1) AND (char_length(btrim(city)) <= 80)))),
    CONSTRAINT leads_contact_ck CHECK (((phone IS NOT NULL) OR (email IS NOT NULL))),
    CONSTRAINT leads_encaixe_financeiro_ck CHECK ((encaixe_financeiro = ANY (ARRAY['cabe'::text, 'precisa_prazo'::text, 'depende_banco'::text]))),
    CONSTRAINT leads_finalidade_ck CHECK ((finalidade = ANY (ARRAY['morar'::text, 'investir'::text, 'segunda_residencia'::text, 'avaliando'::text]))),
    CONSTRAINT leads_ft_variant_ck CHECK (((ft_variant IS NULL) OR (ft_variant = ANY (ARRAY['a'::bpchar, 'b'::bpchar, 'c'::bpchar])))),
    CONSTRAINT leads_locale_ck CHECK (((ft_locale IS NULL) OR (ft_locale = ANY (ARRAY['pt-BR'::text, 'es'::text, 'en'::text])))),
    CONSTRAINT leads_loss_ck CHECK (((loss_reason IS NULL) OR (loss_reason = ANY (ARRAY['preco_acima'::text, 'comprou_outro'::text, 'sem_credito'::text, 'localizacao'::text, 'sem_resposta'::text, 'fora_do_perfil'::text, 'so_pesquisando'::text, 'outro'::text])))),
    CONSTRAINT leads_lt_variant_ck CHECK (((lt_variant IS NULL) OR (lt_variant = ANY (ARRAY['a'::bpchar, 'b'::bpchar, 'c'::bpchar])))),
    CONSTRAINT leads_method_ck CHECK ((attribution_method = ANY (ARRAY['form'::text, 'ctwa'::text, 'ref_code'::text, 'time_window'::text, 'none'::text, 'reconciliado'::text]))),
    CONSTRAINT leads_prazo_compra_ck CHECK ((prazo_compra = ANY (ARRAY['ate_30_dias'::text, 'de_1_a_3_meses'::text, 'de_3_a_6_meses'::text, 'mais_de_6_meses'::text, 'pesquisando'::text]))),
    CONSTRAINT leads_source_ck CHECK ((source = ANY (ARRAY['landing_page'::text, 'meta_ads'::text, 'google_ads'::text, 'link_bio'::text, 'instagram'::text, 'facebook'::text, 'whatsapp'::text, 'portal'::text, 'indicacao'::text, 'placa'::text, 'manual'::text, 'outro'::text]))),
    CONSTRAINT leads_temperatura_manual_ck CHECK ((temperatura_manual = ANY (ARRAY['quente'::text, 'morno'::text, 'frio'::text])))
);


--
-- Name: COLUMN leads.excluded_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.leads.excluded_at IS 'Marcado como não-lead (conversa pessoal). Fora de toda contagem do painel; a linha e o histórico ficam.';


--
-- Name: COLUMN leads.furthest_position; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.leads.furthest_position IS 'A etapa mais avançada por onde o lead JÁ passou. Saída (perdido) não conta. É o que o funil soma.';


--
-- Name: COLUMN leads.city; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.leads.city IS 'Cidade INFORMADA pela pessoa (conversa, formulário). Nunca deduzida do DDD.';


--
-- Name: COLUMN leads.finalidade; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.leads.finalidade IS 'Para que a pessoa quer o imovel. Dito por ela ou anotado pelo corretor.';


--
-- Name: COLUMN leads.prazo_compra; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.leads.prazo_compra IS 'Quando pretende comprar. E o que decide a temperatura.';


--
-- Name: COLUMN leads.encaixe_financeiro; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.leads.encaixe_financeiro IS 'Se a entrada e as parcelas cabem. depende_banco = precisa de imovel pronto.';


--
-- Name: COLUMN leads.temperatura_manual; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.leads.temperatura_manual IS 'Marcacao do corretor. Ganha da regra; nulo = vale a regra.';


--
-- Name: COLUMN leads.temperatura_regra; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.leads.temperatura_regra IS 'O que a regra diz, com ou sem marcacao manual. Gerada.';


--
-- Name: COLUMN leads.temperatura; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.leads.temperatura IS 'O selo que vale: a marcacao manual ou, sem ela, a regra. Gerada. Nulo = sem qualificacao.';


--
-- Name: COLUMN leads.esperando_desde; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.leads.esperando_desde IS 'Quando chegou a PRIMEIRA mensagem do cliente que ninguem respondeu. Nulo = a casa falou por ultimo.';


--
-- Name: COLUMN leads.espera_avisada; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.leads.espera_avisada IS 'O valor de esperando_desde que ja virou aviso. Diferente dele = ainda nao avisado.';


--
-- Name: COLUMN leads.silencio_desde; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.leads.silencio_desde IS 'Quando a casa falou pela ultima vez sem resposta depois. Nulo = a bola esta com a casa.';


--
-- Name: COLUMN leads.toques_sem_resposta; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.leads.toques_sem_resposta IS 'Mensagens que a casa mandou desde a ultima resposta do cliente. Impede a fila de insistir para sempre.';


--
-- Name: leads_da_exportacao(uuid, timestamp with time zone, timestamp with time zone, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.leads_da_exportacao(
  _org         uuid,
  _ini         timestamptz,
  _fim         timestamptz,
  _responsavel uuid,
  _etapa       uuid
)
returns setof public.leads
language sql
stable
security invoker
set search_path = public
as $$
  select l.*
    from public.leads l
   where l.organization_id = _org
     and l.excluded_at is null
     and l.attribution_method <> 'reconciliado'
     and l.created_at >= _ini
     and l.created_at <  _fim
     and (_responsavel is null or l.assigned_to = _responsavel)
     and (_etapa is null or l.stage_id = _etapa);
$$;


--
-- Name: leads_de_qual_pagina(uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.leads_de_qual_pagina(_leads uuid[])
returns table (
  lead_id  uuid,
  rotulo   text,
  imovel   text,
  variante text,
  mercado  text,
  url      text
)
language sql
stable
security definer
set search_path = public
as $fn$
  select
    l.id,
    'LP · ' || public.nome_curto_do_imovel(coalesce(nullif(p.title, ''), p.public_code))
      || ' · ' || upper(lp.variant)
      -- O mercado só quando NÃO é o de casa. No Brasil o sufixo não informa
      -- nada e ainda sugere que a página é de fora.
      || case when lp.market <> 'br' then ' · ' || upper(lp.market) else '' end,
    public.nome_curto_do_imovel(coalesce(nullif(p.title, ''), p.public_code)),
    upper(lp.variant),
    upper(lp.market),
    case
      when nullif(o.custom_domain, '') is not null
        then 'https://' || o.custom_domain || '/' || lp.market || '/imovel/' || p.slug || '/' || lp.variant
      else '/' || o.slug || '/' || lp.market || '/imovel/' || p.slug || '/' || lp.variant
    end
    from public.leads l
    join public.landing_pages lp on lp.id = l.ft_landing_page_id
    join public.properties p     on p.id = lp.property_id
    join public.organizations o  on o.id = l.organization_id
   where l.id = any(_leads)
     and l.organization_id = (select public.current_org_id())
     and (l.assigned_to = (select auth.uid()) or public.ve_a_carteira_toda());
$fn$;


--
-- Name: FUNCTION leads_de_qual_pagina(_leads uuid[]); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.leads_de_qual_pagina(_leads uuid[]) IS 'De qual landing page o lead veio: rotulo pronto, nome do imovel, variante, mercado e a URL publica.';


--
-- Name: leads_etiquetas(uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.leads_etiquetas(_leads uuid[])
returns table (
  lead_id     uuid,
  conta       text,
  responsavel text
)
language sql
stable
security definer
set search_path = public
as $fn$
  with alvo as (
    select l.id,
           l.organization_id            as org,
           nullif(l.ft_meta_ad_id, '')  as ad_id,
           l.assigned_to
      from public.leads l
     where l.id = any(_leads)
       and l.organization_id = (select public.current_org_id())
       -- O MESMO recorte da 079. A função passa por cima da RLS por construção;
       -- sem esta linha ela seria a porta dos fundos para a carteira alheia.
       and (l.assigned_to = (select auth.uid()) or public.ve_a_carteira_toda())
  ),
  /*
   * De qual conta o anúncio é.
   *
   * A hierarquia vem do GASTO porque é a única tabela que amarra anúncio e conta
   * na mesma linha — `meta_ad_dimensions` sabe o nome de um objeto e não sabe de
   * quem ele é filho. `distinct on` com `date desc` pega a mais recente: um
   * anúncio pode ter sido movido, e o que interessa é onde ele está agora.
   *
   * Consequência honesta: anúncio que ainda não gastou um centavo não tem conta
   * conhecida, e o lead dele fica sem esta etiqueta até a primeira importação.
   * Etiqueta ausente é melhor do que etiqueta adivinhada.
   */
  hierarquia as (
    select distinct on (s.ad_id) s.ad_id, s.ad_account_id
      from public.meta_ads_spend s
      join alvo a on a.ad_id = s.ad_id and a.org = s.organization_id
     order by s.ad_id, s.date desc
  )
  select
    a.id,
    ct.name,
    p.full_name
    from alvo a
    left join hierarquia h on h.ad_id = a.ad_id
    left join public.meta_ad_accounts ct
           on ct.organization_id = a.org and ct.ad_account_id = h.ad_account_id
    left join public.profiles p on p.id = a.assigned_to;
$fn$;


--
-- Name: FUNCTION leads_etiquetas(_leads uuid[]); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.leads_etiquetas(_leads uuid[]) IS 'Conta de anuncio e responsavel de varios leads, em uma ida. SO nomes — gasto continua restrito a gestao.';


--
-- Name: leads_exportar(date, date, uuid, uuid, boolean); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.leads_exportar(
  _de          date,
  _ate         date,
  _responsavel uuid    default null,
  _etapa       uuid    default null,
  _so_contar   boolean default false
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare
  v_org    uuid := public.current_org_id();
  v_eu     uuid := auth.uid();
  v_tz     text;
  v_de     date;
  v_ate    date;
  v_ini    timestamptz;
  v_fim    timestamptz;
  v_n      integer;
  v_linhas jsonb;
begin
  if v_org is null or v_eu is null or not public.is_admin_or_above(v_org) then
    raise exception 'Exportar leads é só para gerente e admin.' using errcode = '42501';
  end if;

  if _de is null or _ate is null then
    raise exception 'Escolha o período.' using errcode = '22023';
  end if;

  -- Período invertido é endireitado, como na tela: recusar exigiria mensagem
  -- de erro para um engano que o próprio campo de data torna óbvio.
  v_de  := least(_de, _ate);
  v_ate := greatest(_de, _ate);
  v_tz  := public.fuso_da_org(v_org);
  v_ini := public.inicio_do_dia(v_de, v_tz);
  v_fim := public.inicio_do_dia(v_ate + 1, v_tz);

  if _so_contar then
    select count(*) into v_n
      from public.leads_da_exportacao(v_org, v_ini, v_fim, _responsavel, _etapa);
    return jsonb_build_object('total', v_n);
  end if;

  select count(*),
         coalesce(jsonb_agg(to_jsonb(x) order by x.entrada desc, x.nome), '[]'::jsonb)
    into v_n, v_linhas
    from (
      select l.full_name                   as nome,
             l.phone_e164                  as telefone_e164,
             l.phone                       as telefone_bruto,
             l.phone_country::text         as pais,
             l.city                        as cidade,
             p.full_name                   as corretor,
             -- A hora sai no relógio da organização, sem fuso: a planilha é
             -- lida em Brasília, e o Excel não tem onde guardar fuso.
             to_char(l.created_at at time zone v_tz, 'YYYY-MM-DD"T"HH24:MI:SS') as entrada,
             s.label                       as etapa,
             l.source                      as origem,
             l.entry_point                 as entrada_por,
             coalesce(camp.nome, nullif(btrim(l.ft_utm_campaign), '')) as campanha,
             -- Marcador estrutural (domínio `.invalid`) nunca é e-mail de gente.
             case when l.email ilike '%.invalid' then null else l.email end as email,
             to_char(conv.ultimo at time zone v_tz, 'YYYY-MM-DD"T"HH24:MI:SS') as ultimo_contato,
             case when s.is_lost then l.loss_reason end      as motivo_perda,
             case when s.is_lost then l.loss_reason_text end as motivo_perda_texto,
             -- O que a pessoa disse. `temperatura` já é o selo que vale: a
             -- marcação do corretor ou, sem ela, a regra.
             l.temperatura                 as temperatura,
             l.finalidade                  as finalidade,
             l.prazo_compra                as prazo_compra,
             l.encaixe_financeiro          as encaixe_financeiro
        from public.leads_da_exportacao(v_org, v_ini, v_fim, _responsavel, _etapa) l
        left join public.profiles p on p.id = l.assigned_to
        left join public.pipeline_stages s on s.id = l.stage_id
        /*
         * A campanha do anúncio de primeiro toque. O lead guarda o ANÚNCIO; a
         * campanha sai do gasto importado — o mesmo caminho da Inteligência.
         * Anúncio que nunca gastou não tem campanha conhecida, e fica em branco.
         */
        left join lateral (
          select d.name as nome
            from public.meta_ads_spend g
            join public.meta_ad_dimensions d
              on d.organization_id = g.organization_id
             and d.level = 'campaign'
             and d.object_id = g.campaign_id
           where l.ft_meta_ad_id is not null
             and g.organization_id = v_org
             and g.ad_id = l.ft_meta_ad_id
           order by g.date desc
           limit 1
        ) camp on true
        left join lateral (
          select max(c.last_message_at) as ultimo
            from public.whatsapp_conversations c
           where c.lead_id = l.id
        ) conv on true
    ) x;

  insert into public.lead_exportacoes
    (organization_id, exportado_por, exportado_por_nome, periodo_de, periodo_ate,
     responsavel, etapa, quantidade)
  values
    (v_org, v_eu, (select pr.full_name from public.profiles pr where pr.id = v_eu),
     v_de, v_ate, _responsavel, _etapa, v_n);

  return jsonb_build_object('total', v_n, 'de', v_de, 'ate', v_ate, 'linhas', v_linhas);
end $fn$;


--
-- Name: limitar(text, integer, interval); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.limitar(_chave text, _teto integer, _janela interval)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_n integer;
begin
  insert into public.limite_acessos as l (chave, janela_inicio, n)
       values (_chave, now(), 1)
  on conflict (chave) do update
     -- Janela vencida reinicia a contagem; janela viva soma. A comparação e as
     -- duas atribuições enxergam o MESMO `l.janela_inicio`, o de antes do
     -- update, então não há como reiniciar a janela e somar em cima dela.
     set n = case when l.janela_inicio < now() - _janela then 1 else l.n + 1 end,
         janela_inicio = case when l.janela_inicio < now() - _janela then now()
                              else l.janela_inicio end
    returning l.n into v_n;

  /*
   * Faxina oportunista.
   *
   * A chave é o hash de um IP, então a tabela ganha uma linha por visitante e
   * nunca perderia nenhuma. Um `pg_cron` diário resolveria, mas amarraria esta
   * defesa à saúde do agendador — e ela precisa funcionar sozinha. Uma vez a
   * cada cem passagens, apaga o que já não conta mais.
   */
  if random() < 0.01 then
    delete from public.limite_acessos where janela_inicio < now() - interval '1 day';
  end if;

  return v_n <= _teto;
end $$;


--
-- Name: FUNCTION limitar(_chave text, _teto integer, _janela interval); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.limitar(_chave text, _teto integer, _janela interval) IS 'Conta e decide numa instrução só. true = pode seguir. Só o service_role executa.';


--
-- Name: limpar_credencial_do_passado(integer); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.limpar_credencial_do_passado(_lote integer default 2000)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_n integer;
begin
  with alvo as (
    select id from public.whatsapp_messages
     where raw ? 'token' or raw ? 'apikey' or raw ? 'apiKey'
        or raw ? 'admintoken' or raw ? 'adminToken'
        /*
         * A CREDENCIAL dentro do envelope, e não o envelope.
         *
         * `jsonb_typeof(raw -> 'instance') = 'object'` — o critério da 130 —
         * continua verdadeiro depois da limpeza, porque tirar o token de dentro
         * do objeto não apaga o objeto. A linha voltava à fila para sempre.
         */
        or (raw -> 'instance') ? 'token'      or (raw -> 'instance') ? 'apikey'
        or (raw -> 'instance') ? 'apiKey'     or (raw -> 'instance') ? 'admintoken'
        or (raw -> 'instance') ? 'adminToken'
     limit _lote
  )
  update public.whatsapp_messages m
     set raw = public.sem_credencial(m.raw)
    from alvo a
   where m.id = a.id;

  get diagnostics v_n = row_count;

  -- Uma tabela por vez: o lote é o limite de trava que eu aceito segurar por
  -- execução, e somar as duas dobraria ele sem querer.
  if v_n > 0 then
    return v_n;
  end if;

  with alvo as (
    select id from public.whatsapp_inbox
     where payload ? 'token' or payload ? 'apikey' or payload ? 'apiKey'
        or payload ? 'admintoken' or payload ? 'adminToken'
        or (payload -> 'instance') ? 'token'      or (payload -> 'instance') ? 'apikey'
        or (payload -> 'instance') ? 'apiKey'     or (payload -> 'instance') ? 'admintoken'
        or (payload -> 'instance') ? 'adminToken'
     limit _lote
  )
  update public.whatsapp_inbox i
     set payload = public.sem_credencial(i.payload)
    from alvo a
   where i.id = a.id;

  get diagnostics v_n = row_count;

  if v_n = 0 then
    -- Acabou: o trabalho tenta se recolher. Nunca foi visto funcionando, porque
    -- com o critério da 130 esta linha era inalcançável.
    begin
      perform cron.unschedule('limpar-credencial');
    exception when others then
      raise warning 'limpeza terminou mas nao consegui desagendar: %', sqlerrm;
    end;
  end if;

  return v_n;
end $$;


--
-- Name: FUNCTION limpar_credencial_do_passado(_lote integer); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.limpar_credencial_do_passado(_lote integer) IS 'Tira a credencial do payload ja gravado, em lotes. Sem agendamento desde a 133: o passado acabou.';


--
-- Name: log_timeline_event(uuid, text, text, text, text, jsonb, uuid); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.log_timeline_event(
  _lead_id     uuid,
  _category    text,
  _event_type  text,
  _title       text,
  _description text default null,
  _metadata    jsonb default '{}'::jsonb,
  _actor       uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org   uuid;
  v_actor uuid;
  v_label text;
  v_id    uuid;
begin
  select organization_id into v_org from public.leads where id = _lead_id;
  if v_org is null then
    return null;
  end if;

  -- A conferência nova. Devolve nulo em vez de estourar, para casar com a linha
  -- de cima: para quem chama, um lead de outra organização passa a ser
  -- indistinguível de um lead que não existe — que é a resposta certa, e a que
  -- não conta ao curioso que o id dele acertou.
  if auth.uid() is not null and v_org is distinct from (select public.current_org_id()) then
    return null;
  end if;

  v_actor := coalesce(_actor, auth.uid());
  if v_actor is not null and not exists (select 1 from public.profiles where id = v_actor) then
    v_actor := null;
  end if;

  select full_name into v_label from public.profiles where id = v_actor;

  insert into public.lead_timeline_events
    (organization_id, lead_id, category, event_type, title, description, metadata, actor_user_id, actor_label)
  values
    (v_org, _lead_id, _category, _event_type, _title, _description, coalesce(_metadata, '{}'::jsonb),
     v_actor, coalesce(v_label, 'Sistema'))
  returning id into v_id;

  return v_id;
end $$;


--
-- Name: marcar_conversa_lida(uuid); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.marcar_conversa_lida(_conversation_id uuid)
returns void
language sql
security invoker
set search_path = public
as $$
  update public.whatsapp_conversations set unread_count = 0 where id = _conversation_id;
$$;


--
-- Name: meta_cobertura_atribuicao(date, date); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.meta_cobertura_atribuicao(_since date, _until date)
returns table (com_atribuicao bigint, total bigint)
language sql
stable
security invoker
set search_path = public
as $$
  with cfg as (
    select public.fuso_da_org(public.current_org_id()) as tz
  )
  select count(*) filter (where l.ft_meta_ad_id is not null)::bigint,
         count(*)::bigint
    from public.leads l, cfg c
   where l.organization_id = public.current_org_id()
     and l.excluded_at is null
     and l.created_at >= public.inicio_do_dia(_since, c.tz)
     and l.created_at <  public.inicio_do_dia(_until + 1, c.tz);
$$;


--
-- Name: meta_conexao_e_minha(uuid); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.meta_conexao_e_minha(_integracao uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1 from public.meta_integrations i
     where i.id = _integracao
       and i.organization_id = (select public.current_org_id())
       and (i.owner_id = (select auth.uid()) or public.ve_a_carteira_toda())
  );
$fn$;


--
-- Name: FUNCTION meta_conexao_e_minha(_integracao uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.meta_conexao_e_minha(_integracao uuid) IS 'Esta conexao Meta e minha, ou eu sou gestao? A regra de leitura do dominio Meta, num lugar so.';


--
-- Name: meta_conta_e_minha(text); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.meta_conta_e_minha(_ad_account_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1
      from public.meta_ad_accounts a
      join public.meta_integrations i on i.id = a.integration_id
     where a.ad_account_id = _ad_account_id
       and a.organization_id = (select public.current_org_id())
       and (i.owner_id = (select auth.uid()) or public.ve_a_carteira_toda())
  );
$fn$;


--
-- Name: FUNCTION meta_conta_e_minha(_ad_account_id text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.meta_conta_e_minha(_ad_account_id text) IS 'Esta conta de anuncio e de uma conexao minha? Usada pelas policies de gasto e de dimensao.';


--
-- Name: meta_conversao_descartar(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.meta_conversao_descartar(_id uuid, _motivo text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.meta_conversoes
     set estado = 'expirado', erro = left(coalesce(_motivo, ''), 1200)
   where id = _id;
$$;


--
-- Name: meta_conversao_enfileirar(uuid, text, timestamp with time zone, bigint); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.meta_conversao_enfileirar(
  _lead uuid, _evento text, _quando timestamptz, _valor bigint default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_org uuid; v_tem_origem boolean; v_metodo text;
begin
  select l.organization_id,
         (l.fbclid is not null or l.ft_meta_ad_id is not null),
         l.attribution_method
    into v_org, v_tem_origem, v_metodo
    from public.leads l
   where l.id = _lead and l.excluded_at is null;

  if v_org is null then return; end if;

  /*
   * SÓ QUEM VEIO DE ANÚNCIO. Sem `ctwa_clid` e sem `fbclid` a Meta não tem como
   * ligar esta conversão a um clique — e o lead de indicação, o do cadastro
   * manual e o do portal nunca tiveram nada com ela. Mandar o telefone deles,
   * ainda que em hash, é entregar a uma empresa de fora o contato de alguém que
   * chegou por conta própria. Entre as duas opções, a mais fechada.
   */
  if not v_tem_origem then return; end if;

  /*
   * E NÃO O `lead` QUE O FORMULÁRIO JÁ MANDOU, com o mesmo `event_id` do pixel
   * do navegador. Um terceiro envio, com outro id, faria a Meta contar dois.
   */
  if _evento = 'lead' and v_metodo = 'form' then return; end if;

  insert into public.meta_conversoes (organization_id, lead_id, evento, ocorrido_em, valor_centavos)
  values (v_org, _lead, _evento, _quando, _valor)
  on conflict (lead_id, evento) do nothing;
end $$;


--
-- Name: meta_conversao_enviada(uuid); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.meta_conversao_enviada(_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.meta_conversoes
     set estado = 'enviado', enviado_em = now(), erro = null, erro_codigo = null
   where id = _id;
$$;


--
-- Name: meta_conversao_falhou(uuid, integer, text); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.meta_conversao_falhou(
  _id uuid, _codigo integer default null, _motivo text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_tentativas integer;
begin
  select tentativas into v_tentativas from public.meta_conversoes where id = _id;

  update public.meta_conversoes
     set estado = case when v_tentativas >= 6 then 'falhou' else 'pendente' end,
         -- 2, 4, 8, 16, 32, 64 minutos. Sem o adiamento, um erro permanente
         -- vira uma chamada por minuto para sempre contra a Graph.
         proxima_em  = now() + make_interval(mins => least(power(2, v_tentativas)::int, 64)),
         erro_codigo = _codigo,
         erro        = left(coalesce(_motivo, ''), 1200)
   where id = _id;
end $$;


--
-- Name: meta_conversoes_drenar(); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.meta_conversoes_drenar()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_segredo text; v_url text; v_pendentes integer;
begin
  perform public.meta_conversoes_expirar();

  -- Não acorda ninguém à toa: sem fila, sem chamada.
  select count(*) into v_pendentes from public.meta_conversoes
   where estado = 'pendente' and proxima_em <= now();
  if v_pendentes = 0 then return; end if;

  select decrypted_secret into v_segredo from vault.decrypted_secrets where name = 'meta_cron_secret';
  if v_segredo is null then
    raise exception 'meta_cron_secret ausente no Vault — as conversões não estão voltando para a Meta';
  end if;

  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'functions_base_url';
  if v_url is null then
    raise exception 'functions_base_url ausente no Vault';
  end if;

  perform net.http_post(
    url     := v_url || '/meta-conversoes',
    headers := jsonb_build_object('Content-Type','application/json','X-Cron-Secret', v_segredo),
    body    := '{}'::jsonb);
end $$;


--
-- Name: meta_conversoes_expirar(); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.meta_conversoes_expirar()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_n integer;
begin
  update public.meta_conversoes
     set estado = 'expirado',
         erro   = coalesce(erro, 'passou de 7 dias — a Meta não aceita mais')
   where estado in ('pendente','falhou')
     and ocorrido_em < now() - interval '7 days';
  get diagnostics v_n = row_count;
  return v_n;
end $$;


--
-- Name: meta_conversoes_pendencia(); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.meta_conversoes_pendencia()
returns table (o_titulo text, o_detalhe text, o_quantos bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_erro text; v_json jsonb; v_titulo text; v_detalhe text;
begin
  if not public.is_admin_or_above(public.current_org_id()) then return; end if;

  select c.erro into v_erro
    from public.meta_conversoes c
   where c.organization_id = public.current_org_id()
     and c.estado in ('falhou','expirado')
     and c.erro is not null
   order by c.proxima_em desc
   limit 1;

  if v_erro is null then return; end if;

  /*
   * O texto da Meta vem embrulhado em JSON dentro de uma frase nossa, e pode
   * vir CORTADO — o campo guarda 1.200 caracteres. `::jsonb` num pedaço de
   * JSON estoura, e uma exceção aqui derrubaria a tela inteira de inteligência
   * por causa de um aviso. Então a conversão é tentada e o fracasso dela é uma
   * resposta legítima: mostra-se a frase crua, que já é melhor que nada.
   */
  begin
    v_json := substring(v_erro from position('{' in v_erro))::jsonb;
    v_titulo  := v_json->'error'->>'error_user_title';
    v_detalhe := v_json->'error'->>'error_user_msg';
  exception when others then
    v_titulo := null;
  end;

  if v_titulo is null then
    v_titulo  := 'A Meta recusou as conversões';
    v_detalhe := left(v_erro, 300);
  end if;

  return query
    select v_titulo, v_detalhe,
           (select count(*) from public.meta_conversoes c
             where c.organization_id = public.current_org_id()
               and c.estado in ('falhou','expirado'));
end $$;


--
-- Name: meta_conversoes_reenfileirar(integer); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.meta_conversoes_reenfileirar(_limite integer default 1)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_n integer; v_forte boolean;
begin
  select exists (select 1 from public.organizations
                  where meta_whatsapp_dataset_id is not null) into v_forte;

  update public.meta_conversoes c
     set estado = 'pendente', proxima_em = now(), tentativas = 0,
         erro = null, erro_codigo = null
    from public.leads l
   where l.id = c.lead_id
     and c.estado in ('expirado','falhou')
     and c.ocorrido_em > now() - interval '7 days'
     /*
      * Pela rota forte, sem clique e sem página não adianta (a 144 e a 145).
      * Pela `chat`, adianta: basta telefone ou e-mail.
      */
     and (case
            when l.attribution_method <> 'ctwa' then true
            when not v_forte then (l.phone_e164 is not null or l.email is not null)
            else l.fbclid is not null
                 and exists (select 1 from public.meta_ad_dimensions d
                              where d.organization_id = c.organization_id
                                and d.level = 'ad'
                                and d.object_id = l.ft_meta_ad_id
                                and d.page_id is not null)
          end)
     and c.id in (
       select f.id from public.meta_conversoes f
        where f.estado in ('expirado','falhou')
          and f.ocorrido_em > now() - interval '7 days'
        order by f.ocorrido_em desc
        limit _limite);
  get diagnostics v_n = row_count;
  return v_n;
end $$;


--
-- Name: meta_conversoes_reivindicar(integer); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.meta_conversoes_reivindicar(_limite integer default 20)
returns table (
  o_id             uuid,
  o_evento         text,
  o_ocorrido_em    timestamptz,
  o_valor_centavos bigint,
  o_pixel_id       text,
  o_dataset_id     text,
  o_waba_id        text,
  o_page_id        text,
  o_ctwa_clid      text,
  o_telefone       text,
  o_email          text,
  o_acao           text
)
language sql
security definer
set search_path = public
as $$
  with pego as (
    update public.meta_conversoes c
       set estado = 'processando', tentativas = c.tentativas + 1
     where c.id in (
       select f.id from public.meta_conversoes f
        where f.estado = 'pendente' and f.proxima_em <= now()
        order by f.ocorrido_em
        limit _limite
        for update skip locked)
    returning c.*)
  select p.id, p.evento, p.ocorrido_em, p.valor_centavos,
         o.meta_pixel_id,
         o.meta_whatsapp_dataset_id,
         o.whatsapp_business_account_id,
         (select d.page_id from public.meta_ad_dimensions d
           where d.organization_id = p.organization_id
             and d.level = 'ad'
             and d.object_id = l.ft_meta_ad_id),
         l.fbclid,
         l.phone_e164,
         l.email,
         /*
          * A ORIGEM DA AÇÃO, decidida pelo que a casa TEM.
          *
          * `business_messaging` é a rota do CTWA e exige um conjunto de dados
          * nascido da conta oficial do WhatsApp. Enquanto ele não existir, a
          * conversão vai como `chat` — que é o que ela é, literalmente: uma
          * conversão feita num aplicativo de mensagens.
          *
          * A troca é automática nos dois sentidos. No dia em que alguém
          * preencher `meta_whatsapp_dataset_id`, os eventos passam a sair pela
          * rota forte sem ninguém mexer em código; e se o conjunto for
          * removido, voltam para a fraca em vez de pararem.
          */
         case
           when l.attribution_method = 'ctwa' and o.meta_whatsapp_dataset_id is not null
             then 'business_messaging'
           when l.attribution_method = 'ctwa' then 'chat'
           else 'website'
         end
    from pego p
    join public.leads l         on l.id = p.lead_id
    join public.organizations o on o.id = p.organization_id;
$$;


--
-- Name: meta_conversoes_resumo(); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.meta_conversoes_resumo()
returns table (o_evento text, o_enviados bigint, o_na_fila bigint, o_falhou bigint, o_expirou bigint)
language sql
stable
security definer
set search_path = public
as $$
  select c.evento,
         count(*) filter (where c.estado = 'enviado'),
         count(*) filter (where c.estado in ('pendente','processando')),
         count(*) filter (where c.estado = 'falhou'),
         count(*) filter (where c.estado = 'expirado')
    from public.meta_conversoes c
   where c.organization_id = public.current_org_id()
     and public.is_admin_or_above(c.organization_id)
   group by c.evento
   order by c.evento;
$$;


--
-- Name: meta_drenar(); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.meta_drenar()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_segredo text; v_url text; v_pendentes integer;
begin
  -- Não acorda ninguém à toa: sem fila, sem chamada.
  select count(*) into v_pendentes from public.meta_webhook_inbox
   where status = 'pendente' and next_attempt_at <= now();
  if v_pendentes = 0 then return; end if;

  select decrypted_secret into v_segredo from vault.decrypted_secrets where name = 'meta_cron_secret';
  if v_segredo is null then
    raise exception 'meta_cron_secret ausente no Vault — a fila da Meta está parada';
  end if;

  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'functions_base_url';
  if v_url is null then
    raise exception 'functions_base_url ausente no Vault';
  end if;

  perform net.http_post(
    url     := v_url || '/meta-trabalhador',
    headers := jsonb_build_object('Content-Type','application/json','X-Cron-Secret', v_segredo),
    body    := '{}'::jsonb);
end $$;


--
-- Name: meta_evento_falhou(uuid, integer, text); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.meta_evento_falhou(
  _id uuid, _codigo integer default null, _motivo text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_tentativas integer;
begin
  select attempts into v_tentativas from public.meta_webhook_inbox where id = _id;

  update public.meta_webhook_inbox
     set status = case when v_tentativas >= 6 then 'erro' else 'pendente' end,
         -- 2, 4, 8, 16, 32, 64 minutos.
         next_attempt_at = now() + make_interval(mins => least(power(2, v_tentativas)::int, 64)),
         last_error_code = _codigo,
         motivo = _motivo
   where id = _id;
end $$;


--
-- Name: meta_fora_do_painel_anuncios(); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.meta_fora_do_painel_anuncios()
returns setof text
language sql
stable
security definer
set search_path = public
as $fn$
  select distinct s.ad_id
    from public.meta_ads_spend s
    join public.meta_ad_dimensions d
      on d.organization_id = s.organization_id
     and d.level = 'campaign'
     and d.object_id = s.campaign_id
     and not d.conta_no_painel
   where s.organization_id = (select public.current_org_id())
     and s.ad_id <> '';
$fn$;


--
-- Name: FUNCTION meta_fora_do_painel_anuncios(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.meta_fora_do_painel_anuncios() IS 'Anuncios de campanha desligada. Usada por toda contagem de lead do painel.';


--
-- Name: meta_fora_do_painel_campanhas(); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.meta_fora_do_painel_campanhas()
returns setof text
language sql
stable
security definer
set search_path = public
as $fn$
  select d.object_id
    from public.meta_ad_dimensions d
   where d.organization_id = (select public.current_org_id())
     and d.level = 'campaign'
     and not d.conta_no_painel;
$fn$;


--
-- Name: FUNCTION meta_fora_do_painel_campanhas(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.meta_fora_do_painel_campanhas() IS 'Campanhas que o painel ignora. Usada pela soma de gasto.';


--
-- Name: meta_gasto_agregado(date, date, text); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.meta_gasto_agregado(
  _since date,
  _until date,
  _nivel text default 'ad'
)
returns table (
  object_id        text,
  nome             text,
  campanha         text,
  conta            text,
  objective        text,
  status           text,
  currency         char(3),
  spend_minor      bigint,
  impressions      bigint,
  clicks           bigint,
  cadastros        bigint,
  conversas        bigint,
  leads_atribuidos bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  with escopo as (
    select g.*,
           case _nivel when 'campaign' then g.campaign_id
                       when 'adset'    then g.adset_id
                       else g.ad_id end as chave
      from public.meta_ads_spend g
     where g.organization_id = public.current_org_id()
       and g.date between _since and _until
  ),
  gasto as (
    select chave, currency,
           min(campaign_id)    as campaign_id,
           min(ad_account_id)  as ad_account_id,
           sum(spend_minor)::bigint as spend_minor,
           sum(impressions)::bigint as impressions,
           sum(clicks)::bigint      as clicks,
           sum(lead_count)::bigint      as cadastros,
           sum(messaging_count)::bigint as conversas
      from escopo
     where chave <> ''
     group by chave, currency
  ),
  cfg as (
    select public.fuso_da_org(public.current_org_id()) as tz
  ),
  /*
   * O lead pelo ANÚNCIO de primeiro toque, cortado no DIA DA ORGANIZAÇÃO.
   *
   * Intervalo meio-aberto entre dois instantes, e não conversão de cada linha
   * para data: é o filtro certo E indexável. Converter linha a linha obrigaria
   * a varrer a tabela inteira — a 030 deixou isso escrito em `inicio_do_dia`.
   */
  leads as (
    select l.ft_meta_ad_id as chave, count(*)::bigint as n
      from public.leads l, cfg c
     where l.organization_id = public.current_org_id()
       and l.ft_meta_ad_id is not null
       and l.excluded_at is null
       and l.created_at >= public.inicio_do_dia(_since, c.tz)
       and l.created_at <  public.inicio_do_dia(_until + 1, c.tz)
     group by l.ft_meta_ad_id
  )
  select g.chave,
         d.name,
         cam.name,
         ct.name,
         d.objective,
         d.effective_status,
         g.currency,
         g.spend_minor,
         g.impressions,
         g.clicks,
         g.cadastros,
         g.conversas,
         coalesce(l.n, 0)
    from gasto g
    left join public.meta_ad_dimensions d
           on d.organization_id = public.current_org_id()
          and d.level     = _nivel
          and d.object_id = g.chave
    left join public.meta_ad_dimensions cam
           on cam.organization_id = public.current_org_id()
          and cam.level     = 'campaign'
          and cam.object_id = g.campaign_id
    left join public.meta_ad_accounts ct
           on ct.organization_id = public.current_org_id()
          and ct.ad_account_id = g.ad_account_id
    -- Só casa lead com gasto no nível do anúncio: nos níveis acima, o
    -- ft_meta_ad_id não é a mesma chave, e juntar produziria zero silencioso.
    left join leads l on _nivel = 'ad' and l.chave = g.chave
   order by g.spend_minor desc;
$$;


--
-- Name: meta_importar_gasto(text); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.meta_importar_gasto(_modo text default 'quente')
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_segredo text; v_url text; v_contas integer;
begin
  -- Sem conta ligada não há o que importar, e não se acorda função à toa.
  select count(*) into v_contas from public.meta_ad_accounts where enabled;
  if v_contas = 0 then return; end if;

  perform public.meta_soltar_presas();

  select decrypted_secret into v_segredo from vault.decrypted_secrets where name = 'meta_cron_secret';
  if v_segredo is null then
    raise exception 'meta_cron_secret ausente no Vault — a importação de gasto está parada';
  end if;

  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'functions_base_url';
  if v_url is null then
    raise exception 'functions_base_url ausente no Vault';
  end if;

  perform net.http_post(
    url     := v_url || '/meta-insights',
    headers := jsonb_build_object('Content-Type','application/json','X-Cron-Secret', v_segredo),
    body    := jsonb_build_object('modo', _modo));
end $$;


--
-- Name: meta_reivindicar_conta(uuid, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.meta_reivindicar_conta(
  _integracao    uuid,
  _ad_account_id text,
  _nome          text default null,
  _moeda         text default null,
  _fuso          text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_org  uuid;
  v_dona uuid;
  v_conexao uuid;
begin
  select organization_id into v_org from public.meta_integrations where id = _integracao;
  if v_org is null or nullif(trim(_ad_account_id), '') is null then
    return 'invalida';
  end if;

  insert into public.meta_ad_accounts
    (organization_id, integration_id, ad_account_id, name, currency, timezone_name, synced_at)
  values (
    v_org,
    _integracao,
    _ad_account_id,
    nullif(trim(coalesce(_nome, '')), ''),
    nullif(left(trim(coalesce(_moeda, '')), 3), ''),
    nullif(trim(coalesce(_fuso, '')), ''),
    now())
  on conflict (ad_account_id) do nothing;

  if found then
    return 'criada';
  end if;

  select organization_id, integration_id into v_dona, v_conexao
    from public.meta_ad_accounts where ad_account_id = _ad_account_id;

  -- A linha existe e é de outra imobiliária: ninguém escreve nada.
  if v_dona is distinct from v_org then
    return 'de_outra_casa';
  end if;

  /*
   * Mesma casa, OUTRA conexão.
   *
   * Acontece de verdade: o gestor de tráfego enxerga a conta pelo token dele e
   * pelo token do cliente. Quem registrou primeiro fica — trocar a conexão da
   * conta trocaria o token usado para buscar o gasto dela, no meio do caminho e
   * sem ninguém pedir.
   */
  if v_conexao is not null and v_conexao is distinct from _integracao then
    return 'de_outra_conexao';
  end if;

  /*
   * `enabled` fica FORA do update, de propósito. É a allowlist: alguém marcou
   * aquela conta como "pode gastar por aqui". Regravá-la a cada descoberta
   * desligaria contas em uso toda vez que alguém clicasse em "Buscar da Meta".
   */
  update public.meta_ad_accounts
     set integration_id = coalesce(integration_id, _integracao),
         name          = coalesce(nullif(trim(coalesce(_nome, '')), ''), name),
         currency      = coalesce(nullif(left(trim(coalesce(_moeda, '')), 3), ''), currency),
         timezone_name = coalesce(nullif(trim(coalesce(_fuso, '')), ''), timezone_name),
         synced_at     = now()
   where ad_account_id = _ad_account_id;

  return 'atualizada';
end $fn$;


--
-- Name: FUNCTION meta_reivindicar_conta(_integracao uuid, _ad_account_id text, _nome text, _moeda text, _fuso text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.meta_reivindicar_conta(_integracao uuid, _ad_account_id text, _nome text, _moeda text, _fuso text) IS 'Registra a conta na conexao, sem tomar a de outra casa nem a de outra conexao.';


--
-- Name: meta_webhook_inbox; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.meta_webhook_inbox (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    leadgen_id text NOT NULL,
    page_id text NOT NULL,
    form_id text,
    payload jsonb NOT NULL,
    signature_ok boolean NOT NULL,
    status text DEFAULT 'pendente'::text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    next_attempt_at timestamp with time zone DEFAULT now() NOT NULL,
    last_error_code integer,
    motivo text,
    lead_id uuid,
    received_at timestamp with time zone DEFAULT now() NOT NULL,
    processed_at timestamp with time zone,
    integration_id uuid,
    CONSTRAINT meta_webhook_inbox_st_ck CHECK ((status = ANY (ARRAY['pendente'::text, 'processando'::text, 'processado'::text, 'erro'::text, 'descartado'::text])))
);


--
-- Name: COLUMN meta_webhook_inbox.integration_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.meta_webhook_inbox.integration_id IS 'De qual conexao o evento chegou. A URL do webhook ja carrega este id; antes ele era jogado fora.';


--
-- Name: meta_reivindicar_eventos(integer); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.meta_reivindicar_eventos(_limit integer default 10)
returns setof public.meta_webhook_inbox
language sql
security definer
set search_path = public
as $$
  update public.meta_webhook_inbox e
     set status = 'processando', attempts = e.attempts + 1
   where e.id in (
     select id from public.meta_webhook_inbox
      where status = 'pendente' and next_attempt_at <= now()
      order by received_at
      limit _limit
      for update skip locked)
  returning e.*;
$$;


--
-- Name: meta_reivindicar_pagina(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.meta_reivindicar_pagina(
  _integracao uuid,
  _page_id    text,
  _nome       text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_org  uuid;
  v_dona uuid;
  v_conexao uuid;
begin
  select organization_id into v_org from public.meta_integrations where id = _integracao;
  if v_org is null or nullif(trim(_page_id), '') is null then
    return 'invalida';
  end if;

  -- Sem `webhook_secret_hash`: a 018 derrubou essa coluna de `meta_pages`. O
  -- segredo do webhook é da INTEGRAÇÃO, não da página.
  insert into public.meta_pages (organization_id, integration_id, page_id, page_name)
  values (v_org, _integracao, _page_id, nullif(trim(coalesce(_nome, '')), ''))
  on conflict (page_id) do nothing;

  if found then
    return 'criada';
  end if;

  select organization_id, integration_id into v_dona, v_conexao
    from public.meta_pages where page_id = _page_id;

  if v_dona is distinct from v_org then
    return 'de_outra_casa';
  end if;
  if v_conexao is not null and v_conexao is distinct from _integracao then
    return 'de_outra_conexao';
  end if;

  update public.meta_pages
     set integration_id = coalesce(integration_id, _integracao),
         page_name = coalesce(nullif(trim(coalesce(_nome, '')), ''), page_name)
   where page_id = _page_id;

  return 'atualizada';
end $fn$;


--
-- Name: FUNCTION meta_reivindicar_pagina(_integracao uuid, _page_id text, _nome text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.meta_reivindicar_pagina(_integracao uuid, _page_id text, _nome text) IS 'Registra a pagina na conexao, sem tomar a de outra casa nem a de outra conexao.';


--
-- Name: meta_saude(uuid, text, integer, text); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.meta_saude(
  _integracao uuid, _saude text, _codigo integer default null, _msg text default null)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_antes text;
  v_org   uuid;
  v_nome  text;
begin
  select health, organization_id, coalesce(nullif(label, ''), 'Meta')
    into v_antes, v_org, v_nome
    from public.meta_integrations where id = _integracao;

  if v_org is null then return; end if;

  update public.meta_integrations
     set health = _saude, health_error_code = _codigo, health_message = _msg,
         health_changed_at = case when v_antes is distinct from _saude then now()
                                  else health_changed_at end
   where id = _integracao;

  -- Avisa só na TRANSIÇÃO para um estado grave. Avisar a cada tentativa
  -- transformaria o sino em ruído, e o corretor pararia de olhar.
  if v_antes is distinct from _saude and _saude in ('precisa_reconectar','sem_permissao') then
    perform public.create_notification(
      v_org,
      array(
        select p.id from public.profiles p
          join public.user_roles ur on ur.user_id = p.id and ur.organization_id = p.organization_id
         where p.organization_id = v_org and p.is_active
           and ur.role::text in ('gerente','admin')
        union
        -- O DONO da conexão precisa saber que a conexão dele parou, mesmo que
        -- ele não seja da gestão. É o token dele que precisa ser refeito.
        select i.owner_id from public.meta_integrations i where i.id = _integracao),
      'sistema',
      'A conexão com a Meta parou · ' || v_nome,
      'Os anúncios continuam rodando, mas os leads não estão entrando. Reconecte em Anúncios.',
      '/anuncios',
      /*
       * A chave de agrupamento passa a ser a CONEXÃO.
       *
       * Era a organização, e `create_notification` soma no contador quando a
       * chave repete: com duas BMs, a segunda quebrando enquanto o alerta da
       * primeira está não-lido viraria "event_count = 2" — indistinguível de a
       * primeira ter oscilado duas vezes, e sem dizer qual reconectar.
       */
      'meta_saude', _integracao,
      null);
  end if;
end $fn$;


--
-- Name: meta_soltar_presas(integer); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.meta_soltar_presas(_minutos integer default 20)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_n integer;
begin
  update public.meta_sync_runs
     set status = 'erro',
         error_message = 'execução interrompida sem terminar',
         finished_at = now()
   where status = 'running'
     and started_at < now() - make_interval(mins => _minutos);
  get diagnostics v_n = row_count;
  return v_n;
end $$;


--
-- Name: meta_ultima_sincronizacao(); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.meta_ultima_sincronizacao()
returns table (kind text, ad_account_id text, status text, finished_at timestamptz,
               truncated boolean, rows_written integer, error_message text)
language sql
stable
security invoker
set search_path = public
as $fn$
  -- Uma linha por CONTA, e não por tipo. `coalesce(ad_account_id, '')` porque a
  -- 017 admite tipos sem conta (nenhum é escrito hoje, mas o check os permite) e
  -- `distinct on` não agrupa nulos como iguais.
  select distinct on (r.kind, coalesce(r.ad_account_id, ''))
         r.kind, r.ad_account_id, r.status, r.finished_at,
         r.truncated, r.rows_written, r.error_message
    from public.meta_sync_runs r
   where r.organization_id = (select public.current_org_id())
   order by r.kind, coalesce(r.ad_account_id, ''), r.started_at desc;
$fn$;


--
-- Name: FUNCTION meta_ultima_sincronizacao(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.meta_ultima_sincronizacao() IS 'Estado da ultima importacao POR CONTA DE ANUNCIO. Uma conta parada nao pode ficar escondida atras de outra que terminou.';


--
-- Name: meta_verificar_presos(); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.meta_verificar_presos()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_org uuid; v_n integer := 0; v_quantos integer;
begin
  for v_org, v_quantos in
    select organization_id, count(*) from public.meta_webhook_inbox
     where status = 'erro' and processed_at is null
       and received_at > now() - interval '24 hours'
     group by organization_id
  loop
    perform public.create_notification(
      v_org,
      array(
        select p.id from public.profiles p
          join public.user_roles ur on ur.user_id = p.id and ur.organization_id = p.organization_id
         where p.organization_id = v_org and p.is_active
           and ur.role::text in ('gerente','admin')),
      'sistema',
      v_quantos || ' lead(s) da Meta não entraram',
      'O anúncio gerou lead que o CRM não conseguiu processar. Veja em Anúncios.',
      '/anuncios',
      'meta_presos', v_org,
      null);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;


--
-- Name: meta_zerar_ausentes(uuid, text, date, date, uuid); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.meta_zerar_ausentes(
  _org uuid, _conta text, _since date, _until date, _run uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_n integer;
begin
  update public.meta_ads_spend
     set spend_minor = 0, impressions = 0, clicks = 0,
         lead_count = 0, messaging_count = 0,
         import_run_id = _run, synced_at = now()
   where organization_id = _org
     and ad_account_id = _conta
     and date between _since and _until
     -- Não foi tocada por esta execução: a Meta não a reportou.
     and import_run_id is distinct from _run
     -- Só mexe no que tinha valor. Zerar zero é escrita à toa.
     and (spend_minor > 0 or coalesce(lead_count, 0) > 0 or coalesce(messaging_count, 0) > 0);

  get diagnostics v_n = row_count;
  return v_n;
end $$;


--
-- Name: mkt_cadeia_por_anuncio(date, date); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.mkt_cadeia_por_anuncio(_since date, _until date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_org     uuid := public.current_org_id();
  v_fuso    text;
  v_ini     timestamptz;
  v_fim     timestamptz;
  v_alvo    bigint;
  v_teto    bigint;
  v_sync_ok boolean;
  v_pos_venda integer;
  v_saida   jsonb;
begin
  if v_org is null then
    return jsonb_build_object('erro', 'sem organização');
  end if;

  -- Mesma porta da `mkt_inteligencia` e da `mkt_por_angulo`: verba é assunto de
  -- quem manda.
  if not public.e_admin(v_org) then
    return jsonb_build_object('erro', 'sem permissão');
  end if;

  v_fuso := public.fuso_da_org(v_org);
  v_ini  := public.inicio_do_dia(_since, v_fuso);
  v_fim  := public.inicio_do_dia(_until + 1, v_fuso);

  select o.cpl_alvo_minor, o.cpl_teto_minor
    into v_alvo, v_teto
    from public.organizations o where o.id = v_org;

  -- Se a sincronia da Meta falhou, o gasto está incompleto e nenhum veredito
  -- vale. Mesma guarda da 108 e da 134.
  select bool_and(u.status = 'ok' and not u.truncated)
    into v_sync_ok
    from public.meta_ultima_sincronizacao() u;

  /* A posição da etapa de GANHO, para somar o valor só de quem chegou lá. */
  select min(s.position) into v_pos_venda
    from public.pipeline_stages s
   where s.organization_id = v_org and s.is_won;

  with
  /*
   * OS DEGRAUS DA CADEIA SAEM DA TABELA, não de uma lista escrita aqui.
   *
   * O funil é editável por desenho (a `pipeline_stages` existe justamente para
   * o cliente mexer sem migração). Uma lista fixa aqui faria a tela parar de
   * enxergar a etapa nova no dia em que alguém a criasse, em silêncio.
   *
   * Fora ficam: a primeira posição (todo lead nasce nela, contá-la seria
   * repetir a coluna "leads") e as de PERDA — a Meta não tem o que fazer com
   * derrota, e `furthest_position` já não conta perdido desde a 070.
   */
  degraus as (
    select s.key, s.label, s.position
      from public.pipeline_stages s
     where s.organization_id = v_org
       and not s.is_lost
       and s.position > 1
     order by s.position
  ),

  /* A que campanha cada anúncio pertence HOJE. `distinct on` pela data mais
     recente, igual à `hier` da 108 e da 134. */
  hier as (
    select distinct on (s.ad_id)
           s.ad_id, s.campaign_id, s.ad_account_id
      from public.meta_ads_spend s
     where s.organization_id = v_org and s.ad_id <> ''
     order by s.ad_id, s.date desc
  ),

  gasto as (
    select s.ad_id,
           sum(s.spend_minor)               as gasto,
           sum(s.link_clicks)               as cliques,
           /* O que a META conta de conversa iniciada, ao lado do que o CRM
              conseguiu transformar em ficha. A distância entre os dois é a
              qualidade do tráfego, e ela não aparece em nenhum outro lugar. */
           sum(s.messaging_count)           as conversas,
           max(s.date)                      as ultimo_dia,
           count(distinct s.date)           as dias
      from public.meta_ads_spend s
     where s.organization_id = v_org
       and s.ad_id <> ''
       and s.date >= _since and s.date <= _until
       and s.ad_id not in (select public.meta_fora_do_painel_anuncios())
     group by s.ad_id
  ),

  /*
   * A COORTE: os leads que cada anúncio trouxe no período.
   *
   * `created_at` na janela, e o alcance medido ATÉ HOJE — ver o cabeçalho.
   */
  vindos as (
    select le.ft_meta_ad_id as ad_id,
           count(*)                                                as leads,
           count(*) filter (where le.first_contact_at is not null)  as atendidos,
           sum(coalesce(le.deal_value_cents, 0))
             filter (where le.furthest_position >= v_pos_venda)     as valor
      from public.leads le
     where le.organization_id = v_org
       and le.excluded_at is null
       and le.created_at >= v_ini and le.created_at < v_fim
       and le.ft_meta_ad_id is not null
       and le.ft_meta_ad_id not in (select public.meta_fora_do_painel_anuncios())
     group by le.ft_meta_ad_id
  ),

  /*
   * OS DEGRAUS DE CADA ANÚNCIO, numa passada só.
   *
   * `cross join` com os degraus e `filter` por posição: cada lead é contado uma
   * vez em cada degrau que ele alcançou. Fazer isto DENTRO do `vindos` faria o
   * `count(*)` de leads contar lead × degrau — cinco vezes mais leads do que
   * existem, num número que decide verba.
   */
  passos as (
    select z.ad_id, jsonb_object_agg(z.key, z.n) as passos
      from (
        select le.ft_meta_ad_id as ad_id, d.key,
               count(*) filter (where le.furthest_position >= d.position) as n
          from public.leads le
          cross join degraus d
         where le.organization_id = v_org
           and le.excluded_at is null
           and le.created_at >= v_ini and le.created_at < v_fim
           and le.ft_meta_ad_id is not null
           and le.ft_meta_ad_id not in (select public.meta_fora_do_painel_anuncios())
         group by le.ft_meta_ad_id, d.key
      ) z
     group by z.ad_id
  ),

  /*
   * Anúncio que GASTOU ou que TROUXE. Os dois lados importam: o que gastou sem
   * trazer é o que se corta, e o que trouxe sem gasto no período (lead que
   * chegou hoje de anúncio pausado ontem) não pode sumir da conta. Na medição
   * de 24/09 eram 50 com gasto e 27 com lead, e 3 traziam sem ter gasto.
   */
  ads as (
    select coalesce(g.ad_id, v.ad_id) as ad_id
      from gasto g full outer join vindos v on v.ad_id = g.ad_id
  ),

  anuncio as (
    select a.ad_id,
           d.name                      as nome,
           d.effective_status          as estado,
           d.angulo,
           dc.name                     as campanha,
           coalesce(g.gasto, 0)        as gasto,
           coalesce(g.cliques, 0)      as cliques,
           coalesce(g.conversas, 0)    as conversas,
           coalesce(v.leads, 0)        as leads,
           coalesce(v.atendidos, 0)    as atendidos,
           coalesce(v.valor, 0)        as valor,
           coalesce(p.passos, '{}'::jsonb) as passos,
           g.ultimo_dia,
           coalesce(g.dias, 0)         as dias
      from ads a
      left join gasto g  on g.ad_id = a.ad_id
      left join vindos v on v.ad_id = a.ad_id
      left join passos p on p.ad_id = a.ad_id
      left join hier h   on h.ad_id = a.ad_id
      left join public.meta_ad_dimensions d
             on d.organization_id = v_org and d.level = 'ad' and d.object_id = a.ad_id
      left join public.meta_ad_dimensions dc
             on dc.organization_id = v_org and dc.level = 'campaign' and dc.object_id = h.campaign_id
  ),

  calc as (
    select an.*,
           -- A FAIXA, copiada letra por letra da 108 e da 134. Duas fórmulas
           -- parecidas dariam dois vereditos para a mesma conta.
           an.gasto::numeric / nullif(an.leads, 0)                              as cpl,
           an.gasto::numeric
             / nullif(an.leads + 1.96 * sqrt(an.leads::numeric), 0)             as cpl_piso,
           case when an.leads - 1.96 * sqrt(an.leads::numeric) > 0
                then an.gasto::numeric / (an.leads - 1.96 * sqrt(an.leads::numeric))
           end                                                                  as cpl_teto
      from anuncio an
  )

  select jsonb_build_object(
    'periodo',  jsonb_build_object('de', _since, 'ate', _until),
    'meta_cpl', v_alvo,
    'teto_cpl', v_teto,
    'sincronizacao', jsonb_build_object('ok', coalesce(v_sync_ok, false)),

    /* Os degraus vão JUNTO com os números, no mesmo instante e da mesma
       cadeia de CTEs: a tela desenha as colunas a partir daqui, e uma lista
       que viesse de outra consulta poderia descrever um funil diferente do que
       foi contado. */
    'degraus', (select coalesce(jsonb_agg(to_jsonb(d) order by d.position), '[]'::jsonb) from degraus d),

    'total', (
      select jsonb_build_object(
        'gasto',     coalesce(sum(c.gasto), 0),
        'cliques',   coalesce(sum(c.cliques), 0),
        'conversas', coalesce(sum(c.conversas), 0),
        'leads',     coalesce(sum(c.leads), 0),
        'valor',     coalesce(sum(c.valor), 0),
        'anuncios',  count(*),
        'passos', (
          select coalesce(jsonb_object_agg(z.key, z.n), '{}'::jsonb)
            from (select d.key,
                         (select coalesce(sum((c2.passos->>d.key)::bigint), 0) from calc c2) as n
                    from degraus d) z))
        from calc c),

    'anuncios', (
      select coalesce(jsonb_agg(to_jsonb(c) order by c.gasto desc, c.leads desc), '[]'::jsonb)
        from calc c
       /* Anúncio sem gasto E sem lead no período não é informação, é ruído: a
          conta tem 297 anúncios e quase todos dormem. */
       where c.gasto > 0 or c.leads > 0)
  )
  into v_saida;

  return v_saida;
end $fn$;


--
-- Name: FUNCTION mkt_cadeia_por_anuncio(_since date, _until date); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.mkt_cadeia_por_anuncio(_since date, _until date) IS 'Gasto → conversa → lead → cada degrau do funil, por ANÚNCIO. Coorte: conta os leads nascidos no período e até onde eles chegaram, mesmo depois do período.';


--
-- Name: mkt_inteligencia(date, date); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.mkt_inteligencia(_since date, _until date)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $fn$
declare
  v_org        uuid := public.current_org_id();
  v_fuso       text;
  v_ini        timestamptz;
  v_fim        timestamptz;
  v_alvo       bigint;
  v_teto       bigint;
  v_pos_visita integer;
  v_pos_prop   integer;
  v_pos_venda  integer;
  v_pos_prim   integer;
  v_resposta   numeric;
  v_sync_ok    boolean;
  v_sync_em    timestamptz;
  v_campanhas  jsonb;
  v_resumo     jsonb;
  v_cobertura  jsonb;
  v_dias       integer := greatest(1, (_until - _since) + 1);
begin
  if v_org is null then
    return jsonb_build_object('erro', 'sem organização');
  end if;

  if not public.e_admin(v_org) then
    return jsonb_build_object('erro', 'sem permissão');
  end if;

  v_fuso := public.fuso_da_org(v_org);
  v_ini  := public.inicio_do_dia(_since, v_fuso);
  v_fim  := public.inicio_do_dia(_until + 1, v_fuso);

  select o.cpl_alvo_minor, o.cpl_teto_minor
    into v_alvo, v_teto
    from public.organizations o where o.id = v_org;

  select min(s.position) filter (where s.key = 'visita_agendada'),
         min(s.position) filter (where s.key = 'proposta'),
         min(s.position) filter (where s.is_won),
         min(s.position) filter (where not s.is_lost)
    into v_pos_visita, v_pos_prop, v_pos_venda, v_pos_prim
    from public.pipeline_stages s
   where s.organization_id = v_org;

  select percentile_cont(0.5) within group (
           order by extract(epoch from (l.first_contact_at - l.created_at)) / 60.0)
    into v_resposta
    from public.leads l
   where l.organization_id = v_org
     and l.excluded_at is null
     and l.first_contact_at is not null
     and l.created_at >= v_ini and l.created_at < v_fim;

  select bool_and(u.status = 'ok' and not u.truncated), max(u.finished_at)
    into v_sync_ok, v_sync_em
    from public.meta_ultima_sincronizacao() u;

  with
  hier as (
    select distinct on (s.ad_id)
           s.ad_id, s.campaign_id, s.adset_id, s.ad_account_id
      from public.meta_ads_spend s
     where s.organization_id = v_org and s.ad_id <> ''
     order by s.ad_id, s.date desc
  ),

  g as (
    select s.campaign_id,
           min(s.ad_account_id)                as conta,
           min(s.currency)                     as moeda,
           count(distinct s.currency)          as moedas,
           sum(s.spend_minor)                  as gasto,
           sum(s.impressions)                  as impressoes,
           sum(s.clicks)                       as cliques,
           sum(s.link_clicks)                  as cliques_link,
           sum(s.lead_count)                   as cadastros_meta,
           sum(s.messaging_count)              as conversas_meta,
           count(distinct s.date)              as dias,
           max(s.date)                         as ultimo_dia
      from public.meta_ads_spend s
     where s.organization_id = v_org
       and s.date between _since and _until
       and s.campaign_id <> ''
     group by s.campaign_id
  ),

  l as (
    select h.campaign_id,
           count(*)                                                          as leads,
           count(*) filter (where le.first_contact_at is not null)            as atendidos,
           count(*) filter (where le.furthest_position >= v_pos_visita)       as qualificados,
           count(*) filter (where le.furthest_position >= v_pos_prop)         as propostas,
           count(*) filter (where le.furthest_position >= v_pos_venda)        as vendas,
           sum(le.deal_value_cents) filter (where le.furthest_position >= v_pos_venda) as vgv,
           (percentile_cont(0.5) within group (
             order by extract(epoch from (le.first_contact_at - le.created_at)) / 60.0)
             filter (where le.first_contact_at is not null))::numeric          as resposta
      from public.leads le
      join hier h on h.ad_id = le.ft_meta_ad_id
     where le.organization_id = v_org
       and le.excluded_at is null
       and le.created_at >= v_ini and le.created_at < v_fim
       and le.ft_meta_ad_id not in (select public.meta_fora_do_painel_anuncios())
     group by h.campaign_id
  ),

  v as (
    select h.campaign_id,
           count(*) filter (where vi.status <> 'cancelada')       as agendadas,
           count(*) filter (where vi.status = 'realizada')        as realizadas
      from public.visits vi
      join public.leads le on le.id = vi.lead_id and le.excluded_at is null
      join hier h on h.ad_id = le.ft_meta_ad_id
     where vi.organization_id = v_org
       and le.created_at >= v_ini and le.created_at < v_fim
     group by h.campaign_id
  ),

  orc_conj as (
    select h.campaign_id,
           sum(d.budget_minor)                              as soma,
           count(*) filter (where d.budget_minor is not null) as quantos,
           min(d.budget_kind)                               as tipo
      from public.meta_ad_dimensions d
      join (select distinct campaign_id, adset_id from hier where adset_id <> '') h
        on h.adset_id = d.object_id
     where d.organization_id = v_org and d.level = 'adset' and d.budget_minor is not null
     group by h.campaign_id
  ),

  destino as (
    select distinct on (h.campaign_id) h.campaign_id, d.destination_type
      from public.meta_ad_dimensions d
      join (select distinct campaign_id, adset_id from hier where adset_id <> '') h
        on h.adset_id = d.object_id
     where d.organization_id = v_org and d.level = 'adset' and d.destination_type is not null
     order by h.campaign_id, d.destination_type
  ),

  base as (
    select g.campaign_id,
           d.name, d.effective_status, d.objective, d.budget_minor, d.budget_kind,
           d.bid_strategy, d.property_id, d.synced_at,
           p.title  as imovel,
           ct.name  as conta_nome,
           g.conta, g.moeda, g.moedas, g.gasto, g.impressoes, g.cliques, g.cliques_link,
           g.cadastros_meta, g.conversas_meta, g.dias, g.ultimo_dia,
           de.destination_type,
           coalesce(l.leads, 0)        as leads,
           coalesce(l.atendidos, 0)    as atendidos,
           coalesce(l.qualificados, 0) as qualificados,
           coalesce(l.propostas, 0)    as propostas,
           coalesce(l.vendas, 0)       as vendas,
           l.vgv, l.resposta,
           coalesce(v.agendadas, 0)  as visitas_agendadas,
           coalesce(v.realizadas, 0) as visitas_realizadas,
           oc.soma as orc_conjuntos, oc.quantos as n_conjuntos, oc.tipo as tipo_conjuntos
      from g
      left join public.meta_ad_dimensions d
        on d.organization_id = v_org and d.level = 'campaign' and d.object_id = g.campaign_id
      left join public.properties p on p.id = d.property_id
      left join public.meta_ad_accounts ct on ct.ad_account_id = g.conta
      left join l  on l.campaign_id  = g.campaign_id
      left join v  on v.campaign_id  = g.campaign_id
      left join orc_conj oc on oc.campaign_id = g.campaign_id
      left join destino de on de.campaign_id = g.campaign_id
     where coalesce(d.conta_no_painel, true)
  ),

  calc as (
    select b.*,
           b.gasto::numeric / nullif(b.leads, 0)                                    as cpl,
           b.gasto::numeric
             / nullif(b.leads + 1.96 * sqrt(b.leads::numeric), 0)                   as cpl_piso,
           case when b.leads - 1.96 * sqrt(b.leads::numeric) > 0
                then b.gasto::numeric / (b.leads - 1.96 * sqrt(b.leads::numeric))
           end                                                                      as cpl_teto,
           b.gasto::numeric / nullif(b.qualificados, 0)                             as cpql,
           b.gasto::numeric / nullif(b.visitas_realizadas, 0)                       as custo_visita,
           coalesce(b.cadastros_meta, 0) + coalesce(b.conversas_meta, 0)            as resultados_meta,
           coalesce(b.budget_minor, b.orc_conjuntos)                                as orcamento,
           case when b.budget_minor is not null then 'campanha'
                when b.orc_conjuntos is not null then 'conjuntos' end               as orcamento_nivel
      from base b
  ),

  vered as (
    select c.*,
           case
             /*
              * PARADA vem antes de tudo. Veredito é recomendação de AÇÃO, e
              * campanha que não entrega não tem ação possível: o dinheiro já
              * saiu. Só `ACTIVE` conta, igual a `estaEntregando` do pacote de
              * contratos.
              */
             when c.effective_status is distinct from 'ACTIVE'  then 'parada'
             -- Sem TETO não há semáforo. O alvo é opcional e só destrava o verde.
             when v_teto is null                                then 'sem_meta'
             when not coalesce(v_sync_ok, false)                then 'sem_leitura'
             /*
              * Gasto alto e ZERO resultado — a única evidência que contagem
              * pequena consegue dar. Contra o TETO e não contra o alvo: é o
              * limiar conservador dos dois, e a afirmação continua valendo.
              * Se o custo real fosse o teto, a chance de nada ter saído depois
              * de gastar quatro vezes ele é e⁻⁴, ou 1,8%.
              */
             when c.leads = 0 and c.gasto >= 4 * v_teto         then 'revisar'
             /*
              * Piso de dez leads, e o motivo é da FÓRMULA e não do produto: a
              * faixa usa a aproximação normal da Poisson, que é ruim abaixo de
              * cerca de dez eventos. Usá-la com três seria fingir uma precisão
              * que ela não tem.
              */
             when c.leads < 10                                  then 'sem_leitura'
             -- Atendimento lento não pode virar culpa da mídia: cada campanha
             -- cai sempre na mesma carteira.
             when v_resposta is not null and c.resposta is not null
                  and c.resposta > 2 * v_resposta               then 'observar'
             /*
              * VERMELHO — o melhor caso já passa do teto.
              *
              * `cpl_piso` é a ponta OTIMISTA da faixa. Se nem ela cabe no
              * máximo que a casa aceita pagar, não é azar de amostra: é preço.
              */
             when c.cpl_piso >= v_teto                          then 'revisar'
             /*
              * VERDE — o palpite bate o alvo E o pior caso ainda cabe no teto.
              *
              * As duas condições juntas, e a segunda é a que faz o trabalho: o
              * topo da faixa carrega o tamanho da amostra dentro dele, então
              * campanha com poucos leads (que não tem topo) nunca chega aqui.
              * É o que substituiu o limiar de 25 leads da versão anterior.
              */
             when v_alvo is not null and c.cpl <= v_alvo
                  and c.cpl_teto is not null and c.cpl_teto <= v_teto then 'rende'
             else                                                    'observar'
           end as veredito
      from calc c
  )

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id',              x.campaign_id,
      'nome',            x.name,
      'status',          x.effective_status,
      'objetivo',        x.objective,
      'destino',         x.destination_type,
      'conta',           x.conta,
      'conta_nome',      x.conta_nome,
      'moeda',           x.moeda,
      'imovel',          x.imovel,
      'imovel_id',       x.property_id,
      'lance',           x.bid_strategy,
      'orcamento',       x.orcamento,
      'orcamento_tipo',  coalesce(x.budget_kind, x.tipo_conjuntos),
      'orcamento_nivel', x.orcamento_nivel,
      'conjuntos',       x.n_conjuntos,
      'gasto',           x.gasto,
      'dias',            x.dias,
      'ultimo_dia',      x.ultimo_dia,
      'impressoes',      x.impressoes,
      'cliques',         x.cliques,
      'cliques_link',    x.cliques_link,
      'ctr',             round(x.cliques_link * 100.0 / nullif(x.impressoes, 0), 3),
      'cpc',             round(x.gasto::numeric / nullif(x.cliques_link, 0), 0),
      'cpm',             round(x.gasto::numeric * 1000 / nullif(x.impressoes, 0), 0),
      'resultados_meta', x.resultados_meta,
      'leads',           x.leads,
      'atendidos',       x.atendidos,
      'qualificados',    x.qualificados,
      'propostas',       x.propostas,
      'vendas',          x.vendas,
      'vgv',             x.vgv,
      'visitas_agendadas',  x.visitas_agendadas,
      'visitas_realizadas', x.visitas_realizadas,
      'cpl',             round(x.cpl, 0),
      'cpl_piso',        round(x.cpl_piso, 0),
      'cpl_teto',        round(x.cpl_teto, 0),
      'cpql',            round(x.cpql, 0),
      'custo_visita',    round(x.custo_visita, 0),
      'resposta_min',    round(x.resposta, 0),
      'veredito',        x.veredito,
      'faltam',          greatest(0, 10 - x.leads),
      'moedas',          x.moedas
    ) order by x.gasto desc), '[]'::jsonb)
    into v_campanhas
    from vered x;

  select jsonb_build_object(
           'gasto',        case when count(distinct s.currency) = 1 then sum(s.spend_minor) end,
           'moedas',       count(distinct s.currency),
           'moeda',        case when count(distinct s.currency) = 1 then min(s.currency) end,
           'impressoes',   sum(s.impressions),
           'cliques',      sum(s.clicks),
           'cliques_link', sum(s.link_clicks),
           'campanhas',    count(distinct s.campaign_id),
           'contas',       count(distinct s.ad_account_id)
         )
    into v_resumo
    from public.meta_ads_spend s
   where s.organization_id = v_org
     and s.date between _since and _until
     and s.campaign_id <> '';

  select jsonb_build_object(
           'leads',     count(*),
           'com_ad',    count(*) filter (where le.ft_meta_ad_id is not null),
           'na_tela',   count(*) filter (
                          where le.ft_meta_ad_id is not null
                            and exists (select 1 from public.meta_ads_spend s
                                         where s.organization_id = v_org
                                           and s.ad_id = le.ft_meta_ad_id)),
           'por_origem', coalesce((
             select jsonb_object_agg(t.source, t.n)
               from (select le2.source, count(*) as n
                       from public.leads le2
                      where le2.organization_id = v_org
                        and le2.excluded_at is null
                        and le2.created_at >= v_ini and le2.created_at < v_fim
                      group by le2.source) t), '{}'::jsonb)
         )
    into v_cobertura
    from public.leads le
   where le.organization_id = v_org
     and le.excluded_at is null
     and le.created_at >= v_ini and le.created_at < v_fim;

  return jsonb_build_object(
    'periodo', jsonb_build_object('de', _since, 'ate', _until, 'dias', v_dias),
    'cobertura', v_cobertura,
    'provisorio_desde', (current_date - 3),
    'meta_cpl',   v_alvo,
    'teto_cpl',   v_teto,
    'resposta_casa', round(v_resposta, 0),
    'sincronizacao', jsonb_build_object('ok', coalesce(v_sync_ok, false), 'quando', v_sync_em),
    'etapas', jsonb_build_object(
      'visita', v_pos_visita, 'proposta', v_pos_prop, 'venda', v_pos_venda, 'primeira', v_pos_prim),
    'resumo', v_resumo,
    'campanhas', v_campanhas
  );
end $fn$;


--
-- Name: FUNCTION mkt_inteligencia(_since date, _until date); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.mkt_inteligencia(_since date, _until date) IS 'Mesa de decisão de verba. Só admin. Alvo e teto, faixa de confiança de Poisson.';


--
-- Name: mkt_por_angulo(date, date); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.mkt_por_angulo(_since date, _until date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_org        uuid := public.current_org_id();
  v_fuso       text;
  v_ini        timestamptz;
  v_fim        timestamptz;
  v_alvo       bigint;
  v_teto       bigint;
  v_pos_visita integer;
  v_sync_ok    boolean;
  v_saida      jsonb;
begin
  if v_org is null then
    return jsonb_build_object('erro', 'sem organização');
  end if;

  -- Mesma porta da `mkt_inteligencia`: verba é assunto de quem manda.
  if not public.e_admin(v_org) then
    return jsonb_build_object('erro', 'sem permissão');
  end if;

  v_fuso := public.fuso_da_org(v_org);
  v_ini  := public.inicio_do_dia(_since, v_fuso);
  v_fim  := public.inicio_do_dia(_until + 1, v_fuso);

  select o.cpl_alvo_minor, o.cpl_teto_minor
    into v_alvo, v_teto
    from public.organizations o where o.id = v_org;

  select min(s.position) filter (where s.key = 'visita_agendada')
    into v_pos_visita
    from public.pipeline_stages s
   where s.organization_id = v_org;

  -- Se a sincronia da Meta falhou, o gasto está incompleto e nenhum veredito
  -- vale. Mesma guarda da 108.
  select bool_and(u.status = 'ok' and not u.truncated)
    into v_sync_ok
    from public.meta_ultima_sincronizacao() u;

  with
  /*
   * A que campanha cada anúncio pertence hoje. `distinct on` pela data mais
   * recente, igual à `hier` da 108: anúncio pode ser duplicado entre conjuntos,
   * e o que vale é onde ele está agora.
   */
  hier as (
    select distinct on (s.ad_id)
           s.ad_id, s.campaign_id, s.ad_account_id
      from public.meta_ads_spend s
     where s.organization_id = v_org and s.ad_id <> ''
     order by s.ad_id, s.date desc
  ),

  gasto as (
    select s.ad_id,
           sum(s.spend_minor)      as gasto,
           max(s.date)             as ultimo_dia,
           count(distinct s.date)  as dias
      from public.meta_ads_spend s
     where s.organization_id = v_org
       and s.ad_id <> ''
       and s.date >= _since and s.date <= _until
       and s.ad_id not in (select public.meta_fora_do_painel_anuncios())
     group by s.ad_id
  ),

  vindos as (
    select le.ft_meta_ad_id                                               as ad_id,
           count(*)                                                       as leads,
           count(*) filter (where le.first_contact_at is not null)         as atendidos,
           count(*) filter (where le.temperatura = 'quente')               as quentes,
           count(*) filter (where le.furthest_position >= v_pos_visita)    as visitas
      from public.leads le
     where le.organization_id = v_org
       and le.excluded_at is null
       and le.created_at >= v_ini and le.created_at < v_fim
       and le.ft_meta_ad_id is not null
       and le.ft_meta_ad_id not in (select public.meta_fora_do_painel_anuncios())
     group by le.ft_meta_ad_id
  ),

  /*
   * Anúncio que GASTOU ou que TROUXE. Os dois lados importam: o que gastou sem
   * trazer é o que se corta, e o que trouxe sem gasto no período (lead que
   * chegou hoje de anúncio pausado ontem) não pode sumir da conta.
   */
  ads as (
    select coalesce(g.ad_id, v.ad_id) as ad_id
      from gasto g full outer join vindos v on v.ad_id = g.ad_id
  ),

  anuncio as (
    select a.ad_id,
           d.name                                  as nome,
           d.effective_status                      as estado,
           d.angulo,
           dc.name                                 as campanha,
           coalesce(g.gasto, 0)                    as gasto,
           coalesce(v.leads, 0)                    as leads,
           coalesce(v.atendidos, 0)                as atendidos,
           coalesce(v.quentes, 0)                  as quentes,
           coalesce(v.visitas, 0)                  as visitas,
           g.ultimo_dia,
           coalesce(g.dias, 0)                     as dias
      from ads a
      left join gasto g on g.ad_id = a.ad_id
      left join vindos v on v.ad_id = a.ad_id
      left join hier h on h.ad_id = a.ad_id
      left join public.meta_ad_dimensions d
             on d.organization_id = v_org and d.level = 'ad' and d.object_id = a.ad_id
      left join public.meta_ad_dimensions dc
             on dc.organization_id = v_org and dc.level = 'campaign' and dc.object_id = h.campaign_id
  ),

  porangulo as (
    select coalesce(an.angulo, 'sem_angulo')        as angulo,
           count(*)                                 as anuncios,
           count(*) filter (where an.estado = 'ACTIVE') as ativos,
           sum(an.gasto)                            as gasto,
           sum(an.leads)                            as leads,
           sum(an.atendidos)                        as atendidos,
           sum(an.quentes)                          as quentes,
           sum(an.visitas)                          as visitas
      from anuncio an
     group by 1
  ),

  calc as (
    select p.*,
           -- A FAIXA, copiada letra por letra da 108.
           p.gasto::numeric / nullif(p.leads, 0)                                    as cpl,
           p.gasto::numeric
             / nullif(p.leads + 1.96 * sqrt(p.leads::numeric), 0)                   as cpl_piso,
           case when p.leads - 1.96 * sqrt(p.leads::numeric) > 0
                then p.gasto::numeric / (p.leads - 1.96 * sqrt(p.leads::numeric))
           end                                                                      as cpl_teto
      from porangulo p
  )

  select jsonb_build_object(
    'periodo',  jsonb_build_object('de', _since, 'ate', _until),
    'meta_cpl', v_alvo,
    'teto_cpl', v_teto,
    'sincronizacao', jsonb_build_object('ok', coalesce(v_sync_ok, false)),

    /*
     * As duas listas saem da MESMA cadeia de CTEs, no mesmo instante. Em duas
     * instruções separadas os totais poderiam discordar por um lead que entrou
     * no meio — e discordância entre dois cartões da mesma tela destrói a
     * confiança nos dois.
     */
    'angulos', (
      select coalesce(jsonb_agg(to_jsonb(c) || jsonb_build_object(
        'veredito',
        case
          when v_teto is null                                then 'sem_meta'
          when not coalesce(v_sync_ok, false)                then 'sem_leitura'
          -- Gasto alto e ZERO lead: a única afirmação que contagem pequena sustenta.
          when c.leads = 0 and c.gasto >= 4 * v_teto         then 'revisar'
          -- Dez é da FÓRMULA, não do produto: abaixo disso a faixa não vale.
          when c.leads < 10                                  then 'sem_leitura'
          when c.cpl_piso > v_teto                           then 'revisar'
          when v_alvo is not null and c.cpl < v_alvo
               and c.cpl_teto is not null and c.cpl_teto <= v_teto then 'rende'
          else 'observar'
        end,
        'faltam', greatest(0, 10 - c.leads)
      ) order by c.gasto desc), '[]'::jsonb)
        from calc c
    ),

    'anuncios', (
      select coalesce(jsonb_agg(to_jsonb(a) order by a.gasto desc, a.leads desc), '[]'::jsonb)
        from anuncio a
    )
  ) into v_saida;

  return v_saida;
end $fn$;


--
-- Name: FUNCTION mkt_por_angulo(_since date, _until date); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.mkt_por_angulo(_since date, _until date) IS 'Gasto, leads e faixa de custo agrupados pelo ANGULO do criativo. Mesma formula de faixa da 108.';


--
-- Name: nome_curto_do_imovel(text); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.nome_curto_do_imovel(_titulo text)
returns text
language sql
immutable
set search_path = public
as $fn$
  with limpo as (
    select trim(regexp_replace(
             coalesce(_titulo, ''),
             /*
              * Do fim para o começo, repetidamente: `+$` com alternância pega
              * "Residencial Club" numa passada só, sem precisar de laço.
              *
              * Acentos escritos os dois jeitos porque o cadastro é digitado à
              * mão e "edificio" sem acento chega tanto quanto "edifício".
              */
             '(\s+(residencial|residence|resid[êe]ncia|club|clube|condom[íi]nio|edif[íi]cio|ed\.?|torre|empreendimento|apart[- ]?hotel))+$',
             '', 'gi')) as v
  )
  -- Se sobrou vazio, o nome ERA só a categoria. Aí o título inteiro é melhor do
  -- que nada — some a etiqueta, e etiqueta vazia é pior que etiqueta longa.
  select coalesce(nullif((select v from limpo), ''), nullif(trim(coalesce(_titulo, '')), ''));
$fn$;


--
-- Name: FUNCTION nome_curto_do_imovel(_titulo text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.nome_curto_do_imovel(_titulo text) IS 'O nome que identifica o predio, sem a categoria no fim. Para etiquetas e listas.';


--
-- Name: notification_audience(uuid, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.notification_audience(
  _org     uuid,
  _lead_id uuid default null,
  _dono    uuid default null
)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  -- Quem pediu 'todos' recebe qualquer lead. Quem pediu 'meus' só recebe se o
  -- lead for dele. Quem pediu 'nenhum' fica de fora — é o padrão do admin, que
  -- cuida de mídia e de sistema e não trabalha carteira.
  --
  -- Lead sem dono cai só em quem tem alcance 'todos'. Com dois corretores dá na
  -- mesma; com quinze, é a diferença entre um aviso e quinze.
  with escolhidos as (
    select p.id
      from public.profiles p
      left join public.notification_preferences np on np.profile_id = p.id
     where p.organization_id = _org
       and p.is_active
       and coalesce(np.lead_scope, 'meus') <> 'nenhum'
       and (
         coalesce(np.lead_scope, 'meus') = 'todos'
         or (_dono is not null and p.id = _dono)
       )
  )
  select id from escolhidos

  union

  -- Rede de segurança: lead que não avisaria NINGUÉM vai para quem manda.
  --
  -- A combinação que produz o vazio é banal e chega sozinha: enquanto não
  -- existe gerente, o admin está em 'nenhum' por padrão e o corretor em 'meus',
  -- então um lead sem dono entra e ninguém fica sabendo — sem erro, sem fila
  -- parada, sem nada para investigar depois. Foi o que aconteceu no primeiro
  -- teste desta migration.
  --
  -- Aqui a preferência 'nenhum' é deliberadamente desrespeitada, porque perder
  -- o lead é pior do que incomodar o gestor. Assim que existir alguém com
  -- alcance 'todos', este ramo para de produzir linha.
  select p.id
    from public.profiles p
    join public.user_roles ur
      on ur.user_id = p.id and ur.organization_id = p.organization_id
   where p.organization_id = _org
     and p.is_active
     and ur.role::text in ('gerente','admin')
     and not exists (select 1 from escolhidos);
$$;


--
-- Name: painel_funil(uuid, date, date); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.painel_funil(_org uuid, _de date, _ate date)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $fn$
  with c as (
    select public.inicio_do_dia(_de, public.fuso_da_org(_org))      as ini,
           public.inicio_do_dia(_ate + 1, public.fuso_da_org(_org)) as fim,
           case when public.ve_a_carteira_toda() then null::uuid else (select auth.uid()) end as dono
  )
  select coalesce(
    jsonb_agg(jsonb_build_object('key', key, 'label', label, 'total', total)
              order by position),
    '[]'::jsonb)
    from (
      select s.key, s.label, s.position,
             -- Até onde o lead CHEGOU, e não onde ele está agora. Um lead
             -- perdido no "Novo" conta uma vez em "Novo" e em mais lugar nenhum.
             count(l.id) filter (where l.furthest_position >= s.position)::bigint as total
        from public.pipeline_stages s
        left join public.leads l
          on l.organization_id = _org
         and l.excluded_at is null
         and l.created_at >= (select ini from c)
         and l.created_at <  (select fim from c)
         -- No ON e não no WHERE: no WHERE, o `left join` viraria `inner` e as
         -- etapas sem lead nenhum sumiriam em vez de aparecerem zeradas.
         and ((select dono from c) is null or l.assigned_to = (select dono from c))
         and (l.ft_meta_ad_id is null or l.ft_meta_ad_id not in (select public.meta_fora_do_painel_anuncios()))
       where s.organization_id = _org and not s.is_lost
       group by s.key, s.label, s.position
    ) x;
$fn$;


--
-- Name: painel_indicadores(date, date); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.painel_indicadores(_since date, _until date)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $fn$
declare
  v_org  uuid := public.current_org_id();
  v_dias integer := greatest(1, (_until - _since) + 1);
begin
  if v_org is null then
    return jsonb_build_object('erro', 'sem organização');
  end if;

  return jsonb_build_object(
    'periodo',  jsonb_build_object('de', _since, 'ate', _until, 'dias', v_dias),
    'escopo',   case when public.ve_a_carteira_toda() then 'todos' else 'meus' end,
    -- `security invoker`, então quem responde é a policy de `meta_ad_accounts`.
    've_verba', exists (select 1 from public.meta_ad_accounts where enabled),
    'atual',    public.painel_janela(v_org, _since, _until),
    -- Colado no começo deste, com o mesmo número de dias: é o que torna a
    -- comparação justa.
    'anterior', public.painel_janela(v_org, _since - v_dias, _since - 1),
    'funil',    public.painel_funil(v_org, _since, _until),
    'serie',    public.painel_serie(v_org, _since, _until),
    'origens',  public.painel_origens(v_org, _since, _until)
  );
end $fn$;


--
-- Name: painel_janela(uuid, date, date); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.painel_janela(_org uuid, _de date, _ate date)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $fn$
  with c as (
    select public.inicio_do_dia(_de, public.fuso_da_org(_org))      as ini,
           public.inicio_do_dia(_ate + 1, public.fuso_da_org(_org)) as fim,
           -- Nulo = vê tudo. Preenchido = só o que está neste nome.
           case when public.ve_a_carteira_toda() then null::uuid else (select auth.uid()) end as dono
  )
  select jsonb_build_object(
    'leads', (
      select count(*) from public.leads l, c
       where l.organization_id = _org and l.excluded_at is null
         and l.created_at >= c.ini and l.created_at < c.fim
         and (l.ft_meta_ad_id is null or l.ft_meta_ad_id not in (select public.meta_fora_do_painel_anuncios()))
         and (c.dono is null or l.assigned_to = c.dono)),

    -- Só os leads que a Meta trouxe. É este o denominador honesto do custo por
    -- lead: dividir o gasto de anúncio por indicação e placa na rua faz o custo
    -- sair barato, e a decisão de verba é tomada em cima disso.
    'leads_meta', (
      select count(*) from public.leads l, c
       where l.organization_id = _org and l.excluded_at is null
         and l.created_at >= c.ini and l.created_at < c.fim
         and l.ft_meta_ad_id is not null
         and (l.ft_meta_ad_id is null or l.ft_meta_ad_id not in (select public.meta_fora_do_painel_anuncios()))
         and (c.dono is null or l.assigned_to = c.dono)),

    /*
     * O gasto NÃO ganha recorte por dono, e não precisa: `meta_ads_spend` já é
     * legível só por admin e gerente desde a 017, e estas funções são
     * `security invoker`. Para o corretor a soma volta zero pela policy, e a
     * tela retira os dois cartões de mídia em vez de exibir R$ 0,00.
     */
    'investido_menor', (
      select coalesce(sum(spend_minor), 0) from public.meta_ads_spend
       where organization_id = _org and date between _de and _ate
         -- Campanha desligada não soma: verba de recrutamento não é verba de
         -- captação, e misturar as duas estraga os dois números.
         and campaign_id not in (select public.meta_fora_do_painel_campanhas())),

    'moedas', (
      select count(distinct currency) from public.meta_ads_spend
       where organization_id = _org and date between _de and _ate
         and spend_minor > 0
         and campaign_id not in (select public.meta_fora_do_painel_campanhas())),

    /*
     * Venda conta pela data em que MUDOU DE ETAPA, não pela de entrada.
     *
     * Um lead que entrou em junho e fechou em agosto é venda de agosto. Usar
     * uma data só joga o mês bom no mês errado.
     */
    'vendas', (
      select count(*) from public.leads l
        join public.pipeline_stages s on s.id = l.stage_id, c
       where l.organization_id = _org and l.excluded_at is null and s.is_won
         and coalesce(l.stage_changed_at, l.created_at) >= c.ini
         and coalesce(l.stage_changed_at, l.created_at) <  c.fim
         and (l.ft_meta_ad_id is null or l.ft_meta_ad_id not in (select public.meta_fora_do_painel_anuncios()))
         and (c.dono is null or l.assigned_to = c.dono)),

    'vgv_centavos', (
      select coalesce(sum(l.deal_value_cents), 0) from public.leads l
        join public.pipeline_stages s on s.id = l.stage_id, c
       where l.organization_id = _org and l.excluded_at is null and s.is_won
         and coalesce(l.stage_changed_at, l.created_at) >= c.ini
         and coalesce(l.stage_changed_at, l.created_at) <  c.fim
         and (l.ft_meta_ad_id is null or l.ft_meta_ad_id not in (select public.meta_fora_do_painel_anuncios()))
         and (c.dono is null or l.assigned_to = c.dono)),

    'propostas', (
      select count(*) from public.leads l
        join public.pipeline_stages s on s.id = l.stage_id, c
       where l.organization_id = _org and l.excluded_at is null and s.key = 'proposta'
         and coalesce(l.stage_changed_at, l.created_at) >= c.ini
         and coalesce(l.stage_changed_at, l.created_at) <  c.fim
         and (l.ft_meta_ad_id is null or l.ft_meta_ad_id not in (select public.meta_fora_do_painel_anuncios()))
         and (c.dono is null or l.assigned_to = c.dono)),

    /*
     * Quantas visitas foram MARCADAS no período — por `created_at`, não por
     * `starts_at`.
     *
     * Contar pela data da visita dentro de uma janela que termina HOJE só
     * inclui visita que já aconteceu. Uma visita agendada é, por definição,
     * futura: marcada hoje para 5 de setembro, ela ficava fora de toda janela e
     * o painel dizia "0 visitas" no mesmo dia em que a agenda mostrava uma.
     *
     * Por `created_at` o número passa a medir a mesma coisa que os cartões ao
     * lado: trabalho FEITO no período. Lead que entrou, proposta que abriu,
     * venda que fechou — e visita que foi marcada.
     *
     * Visita cancelada não conta, e visita do colega não é visita minha. O
     * recorte por dono aqui é o que a RLS não faz: a agenda continua
     * compartilhada de propósito — dois corretores precisam enxergar o mesmo
     * calendário para não marcarem no mesmo horário — mas o INDICADOR é
     * pessoal, porque está ao lado dos leads da pessoa.
     */
    'visitas', (
      select count(*) from public.visits v, c
       where v.organization_id = _org and v.created_at >= c.ini and v.created_at < c.fim
         and v.status <> 'cancelada'
         and (c.dono is null or v.assigned_to = c.dono)),

    /*
     * O que ainda VAI acontecer, independente do período escolhido.
     *
     * A saudação do painel pergunta "por onde você começa hoje?" e respondia com
     * um número retrospectivo — que é a pergunta errada. Visita marcada para a
     * semana que vem é justamente o que a pessoa precisa ver ao abrir o CRM, e
     * nenhum filtro de período deveria escondê-la.
     *
     * Só `agendada` e `confirmada`: realizada já passou, e cancelada e
     * não-compareceu não pedem nada de ninguém.
     */
    'visitas_proximas', (
      select count(*) from public.visits v, c
       where v.organization_id = _org
         and v.starts_at >= now()
         and v.status in ('agendada', 'confirmada')
         and (c.dono is null or v.assigned_to = c.dono)),

    /*
     * Tempo até o primeiro contato, em minutos.
     *
     * Entra só quem JÁ FOI contatado. Tratar quem ainda não foi como zero faria
     * a média melhorar exatamente quando o atendimento piora, porque lead
     * esquecido puxaria o número para baixo.
     */
    'minutos_ate_contato', (
      select round(avg(extract(epoch from (l.first_contact_at - l.created_at)) / 60))
        from public.leads l, c
       where l.organization_id = _org and l.excluded_at is null
         and l.created_at >= c.ini and l.created_at < c.fim
         and l.first_contact_at is not null and l.first_contact_at >= l.created_at
         and (l.ft_meta_ad_id is null or l.ft_meta_ad_id not in (select public.meta_fora_do_painel_anuncios()))
         and (c.dono is null or l.assigned_to = c.dono)),

    'contatados', (
      select count(*) from public.leads l, c
       where l.organization_id = _org and l.excluded_at is null
         and l.created_at >= c.ini and l.created_at < c.fim
         and l.first_contact_at is not null
         and (l.ft_meta_ad_id is null or l.ft_meta_ad_id not in (select public.meta_fora_do_painel_anuncios()))
         and (c.dono is null or l.assigned_to = c.dono))
  );
$fn$;


--
-- Name: painel_origens(uuid, date, date); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.painel_origens(_org uuid, _de date, _ate date)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $fn$
  with cfg as (
    select public.fuso_da_org(_org) as tz,
           case when public.ve_a_carteira_toda() then null::uuid else (select auth.uid()) end as dono
  )
  select coalesce(
    jsonb_agg(jsonb_build_object('source', x.source, 'n', x.n) order by x.n desc, x.source),
    '[]'::jsonb)
    from (
      select l.source, count(*)::bigint as n
        from public.leads l, cfg c
       where l.organization_id = _org
         and l.excluded_at is null
         and l.created_at >= public.inicio_do_dia(_de, c.tz)
         and l.created_at <  public.inicio_do_dia(_ate + 1, c.tz)
         and (c.dono is null or l.assigned_to = c.dono)
       and (l.ft_meta_ad_id is null or l.ft_meta_ad_id not in (select public.meta_fora_do_painel_anuncios()))
       group by l.source
    ) x;
$fn$;


--
-- Name: painel_serie(uuid, date, date); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.painel_serie(_org uuid, _de date, _ate date)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $fn$
  with cfg as (
    select public.fuso_da_org(_org) as tz,
           case when (_ate - _de) > 92 then 'semana' else 'dia' end as passo,
           case when public.ve_a_carteira_toda() then null::uuid else (select auth.uid()) end as dono
  ),
  balde as (
    select generate_series(
             case when c.passo = 'semana' then date_trunc('week', _de::timestamp)::date else _de end,
             _ate,
             case when c.passo = 'semana' then interval '7 days' else interval '1 day' end
           )::date as dia
      from cfg c
  ),
  entradas as (
    select case when c.passo = 'semana'
                then date_trunc('week', (l.created_at at time zone c.tz))::date
                else (l.created_at at time zone c.tz)::date
           end as dia,
           count(*)::bigint as n
      from public.leads l, cfg c
     where l.organization_id = _org
       and l.excluded_at is null
       and l.created_at >= public.inicio_do_dia(_de, c.tz)
       and l.created_at <  public.inicio_do_dia(_ate + 1, c.tz)
       and (c.dono is null or l.assigned_to = c.dono)
       and (l.ft_meta_ad_id is null or l.ft_meta_ad_id not in (select public.meta_fora_do_painel_anuncios()))
     group by 1
  )
  select jsonb_build_object(
    'passo', (select passo from cfg),
    'pontos', coalesce(
      (select jsonb_agg(jsonb_build_object('dia', b.dia, 'n', coalesce(e.n, 0)) order by b.dia)
         from balde b left join entradas e on e.dia = b.dia),
      '[]'::jsonb)
  );
$fn$;


--
-- Name: pais_da_discagem(text); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.pais_da_discagem(_e164 text)
returns char(2)
language sql
immutable
parallel safe
set search_path = ''
as $fn$
  select coalesce(
    (select p.iso
       from (values
      ('1', 'US'), ('7', 'RU'), ('27', 'ZA'), ('31', 'NL'),
      ('32', 'BE'), ('33', 'FR'), ('34', 'ES'), ('39', 'IT'),
      ('41', 'CH'), ('44', 'GB'), ('49', 'DE'), ('51', 'PE'),
      ('52', 'MX'), ('53', 'CU'), ('54', 'AR'), ('55', 'BR'),
      ('56', 'CL'), ('57', 'CO'), ('58', 'VE'), ('61', 'AU'),
      ('81', 'JP'), ('86', 'CN'), ('351', 'PT'), ('353', 'IE'),
      ('591', 'BO'), ('592', 'GY'), ('593', 'EC'), ('594', 'GF'),
      ('595', 'PY'), ('597', 'SR'), ('598', 'UY'), ('971', 'AE'),
      ('972', 'IL')
     ) as p(codigo, iso)
      where _e164 like '+' || p.codigo || '%'
      order by length(p.codigo) desc
      limit 1),
    'ZZ')::char(2)
$fn$;


--
-- Name: FUNCTION pais_da_discagem(_e164 text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.pais_da_discagem(_e164 text) IS 'A sigla do pais pelo codigo de discagem do numero. ZZ quando o codigo nao e conhecido.';


--
-- Name: parse_ref_code(text); Type: FUNCTION; Schema: public; Owner: -
--

create function public.parse_ref_code(_texto text)
returns table (o_public_code text, o_variant text, o_market text)
language sql
immutable
as $$
  select lower(m[1]), lower(m[3]), lower(nullif(m[2], ''))
    -- O terceiro argumento é o que faltava: 'i' de insensível a maiúscula,
    -- para o banco ler o mesmo que o contrato lê.
    from regexp_match(coalesce(_texto, ''),
           '\mRef\.?\s*([A-Za-z0-9]{4})(?:-([A-Za-z]{2}))?-([ABCabc])\M', 'i') as m
   where m is not null;
$$;


--
-- Name: pessoais_contagem(); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.pessoais_contagem()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select case
           when (select public.is_admin_or_above((select public.current_org_id())))
             then (select count(*)::integer
                     from public.whatsapp_conversations
                    where organization_id = (select public.current_org_id())
                      and public.wa_e_pessoal(classification, is_group))
         end;
$$;


--
-- Name: pode_ver_conversa(uuid); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.pode_ver_conversa(_conv_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1
      from public.whatsapp_conversations c
     where c.id = _conv_id
       -- A fronteira entre imobiliárias continua sendo a primeira pergunta.
       and c.organization_id = (select public.current_org_id())
  )
  and (select auth.uid()) in (select public.quem_ve_a_conversa(_conv_id));
$fn$;


--
-- Name: FUNCTION pode_ver_conversa(_conv_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.pode_ver_conversa(_conv_id uuid) IS 'Eu posso ler esta conversa? Le de quem_ve_a_conversa, a definicao unica.';


--
-- Name: pode_ver_documento(uuid); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.pode_ver_documento(_doc_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.documents d
      left join public.leads l on l.id = d.lead_id
     where d.id = _doc_id
       and d.organization_id = (select public.current_org_id())
       and (
         (select public.is_admin_or_above(d.organization_id))
         or l.assigned_to = (select auth.uid())
         or d.created_by  = (select auth.uid())
       )
  );
$$;


--
-- Name: FUNCTION pode_ver_documento(_doc_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.pode_ver_documento(_doc_id uuid) IS 'Visibilidade de um documento já gravado. NÃO usar em política de SELECT da própria tabela: sendo stable, não enxerga a linha que está sendo inserida na mesma instrução, e um insert...returning falharia.';


--
-- Name: pode_ver_pasta_de_lead(text); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.pode_ver_pasta_de_lead(_lead text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.leads l
     where l.id::text = _lead
       and l.organization_id = (select public.current_org_id())
       and ((select public.is_admin_or_above(l.organization_id))
            or l.assigned_to = (select auth.uid()))
  );
$$;


--
-- Name: porta_da_mensagem(jsonb, text); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.porta_da_mensagem(_raw jsonb, _ref_code text)
returns text
language sql
immutable
set search_path = ''
as $fn$
  select case
    when coalesce(coalesce(_raw->'message', _raw)->'content'->'contextInfo'->>'conversionSource', '') <> ''
      or coalesce(coalesce(_raw->'message', _raw)->'content'->'contextInfo'->>'entryPointConversionSource', '') = 'ctwa_ad'
      then 'whatsapp'
    when nullif(_ref_code, '') is not null
      then 'landing'
  end
$fn$;


--
-- Name: FUNCTION porta_da_mensagem(_raw jsonb, _ref_code text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.porta_da_mensagem(_raw jsonb, _ref_code text) IS 'Por qual porta do funil a mensagem chegou: clique em anuncio (whatsapp), codigo de referencia (landing), ou nulo.';


--
-- Name: prazo_do_texto(text); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.prazo_do_texto(_texto text)
returns text
language plpgsql
stable
set search_path = public
as $fn$
declare
  v_texto   text;
  v_quantas integer;
  v_prazo   text;
begin
  v_texto := btrim(regexp_replace(
    lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(_texto, ''))),
    '\s+', ' ', 'g'));

  if v_texto = '' then
    return null;
  end if;

  select count(distinct p.prazo), min(p.prazo)
    into v_quantas, v_prazo
    from (values
      ('comprar nos proximos 30 dias',     'ate_30_dias'),
      ('comprar en los proximos 30 dias',  'ate_30_dias'),
      ('buying within 30 days',            'ate_30_dias'),
      ('comprar de 1 a 3 meses',           'de_1_a_3_meses'),
      ('buying in 1 to 3 months',          'de_1_a_3_meses'),
      ('comprar de 3 a 6 meses',           'de_3_a_6_meses'),
      ('buying in 3 to 6 months',          'de_3_a_6_meses'),
      ('comprar daqui a mais de 6 meses',  'mais_de_6_meses'),
      ('comprar en mas de 6 meses',        'mais_de_6_meses'),
      ('buying in more than 6 months',     'mais_de_6_meses'),
      ('so pesquisando por enquanto',      'pesquisando'),
      ('solo investigando por ahora',      'pesquisando'),
      ('just looking for now',             'pesquisando')
    ) as p(frase, prazo)
   where position(p.frase in v_texto) > 0;

  return case when v_quantas = 1 then v_prazo end;
end $fn$;


--
-- Name: FUNCTION prazo_do_texto(_texto text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.prazo_do_texto(_texto text) IS 'O prazo de compra que um texto afirma, ou nulo. As frases sao as que o quiz escreve.';


--
-- Name: processar_inbox(integer); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.processar_inbox(_limit integer default 50)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r            record;
  v_n          integer := 0;
  v_msg        jsonb;
  v_jid        text;
  v_digitos    text;
  v_e164       text;
  v_lid        text;
  v_direcao    text;
  v_texto      text;
  v_grupo      boolean;
  v_conv       uuid;
  v_lead       uuid;
  v_grupo_jid  text;    -- o id do GRUPO, que não é o de quem falou nele
  v_grupo_nome text;
  v_ctx        jsonb;    -- contextInfo da mensagem: onde a Meta assina o clique
  v_anuncio    text;     -- id do anúncio, quando veio de Click To WhatsApp
  v_ctwa_clid  text;
  v_lead_novo  boolean := false;
  v_msg_id     uuid;
  v_dedupe     text;
  v_prov_id    text;
  v_ref        record;
  v_imovel     uuid;
  v_nome       text;
  v_quando     timestamptz;
  v_dono       uuid;
  v_kind       text;
begin
  for r in
    -- Reserva ANTES de trabalhar. Carimbo antes, nunca depois.
    update public.whatsapp_inbox ib
       set status = 'processando', attempts = ib.attempts + 1
     where ib.id in (
       select id from public.whatsapp_inbox
        where status = 'pendente'
        order by received_at
        limit _limit
        for update skip locked)
    returning ib.*
  loop
    begin
      /*
       * Zera o que é DA VOLTA, antes de qualquer coisa.
       *
       * `v_lead` é declarado uma vez e o laço processa até vinte eventos. Até
       * hoje isso não aparecia porque toda mensagem que chegava criava lead e
       * reatribuía a variável em todas as voltas. A partir do momento em que
       * mensagem sem prova de origem NÃO cria lead, a volta seguinte herdaria o
       * lead da anterior — e a conversa de um estranho nasceria grudada no lead
       * de outra pessoa. Cross-contaminação silenciosa, do tipo que só se
       * descobre quando um cliente vê o dado errado na tela.
       */
      v_lead      := null;
      v_lead_novo := false;

      -- ---- Eventos que não são mensagem -----------------------------------
      if r.event_type = 'connection' then
        /*
         * O estado vem ANINHADO, e o `else` não rebaixa.
         *
         * Os dois erros custaram o primeiro dia do cliente no ar. O provedor
         * manda `{"instance":{"name":...,"status":"connected"}}` e isto lia o
         * `status` do nível de cima, que não existe — caía no `else` e gravava
         * um estado de número morto. Com a instância fora de 'conectada',
         * `enfileirar_mensagem` recusa toda resposta e a landing esconde o
         * botão de WhatsApp: o número funcionando e o CRM inteiro se
         * comportando como se estivesse quebrado.
         *
         * `else status` mantém o que estava, igual ao bloco de `messages_update`
         * logo abaixo — que sempre esteve certo. Palavra que não se reconhece é
         * ignorância, não defeito, e ignorância não desliga número que funciona.
         */
        update public.whatsapp_instances
           set status = case lower(coalesce(r.payload->'instance'->>'status',
                                            r.payload->>'status',
                                            r.payload->>'state', ''))
                          when 'connected'    then 'conectada'
                          when 'open'         then 'conectada'
                          when 'online'       then 'conectada'
                          when 'connecting'   then 'pareando'
                          when 'qrcode'       then 'pareando'
                          when 'pairing'      then 'pareando'
                          when 'disconnected' then 'desconectada'
                          when 'logout'       then 'desconectada'
                          when 'offline'      then 'credenciada_offline'
                          else status
                        end,
               last_seen_at = now()
         where id = r.instance_id;

        update public.whatsapp_inbox set status='processado', processed_at=now() where id = r.id;
        v_n := v_n + 1;
        continue;
      end if;

      if r.event_type = 'messages_update' then
        -- O ACK de entregue/lido. Na referência este evento era jogado fora, e
        -- os tiquinhos que a tela desenhava nunca apareciam.
        update public.whatsapp_messages
           set status = case lower(coalesce(r.payload->>'status',''))
                          when 'delivered' then 'entregue'
                          when 'read'      then 'lida'
                          when 'played'    then 'lida'
                          else status
                        end,
               status_at = now()
         where organization_id = r.organization_id
           and provider_message_id = coalesce(r.payload->>'id', r.payload->>'messageid');

        update public.whatsapp_inbox set status='processado', processed_at=now() where id = r.id;
        v_n := v_n + 1;
        continue;
      end if;

      if r.event_type <> 'messages' then
        update public.whatsapp_inbox set status='ignorado', processed_at=now() where id = r.id;
        v_n := v_n + 1;
        continue;
      end if;

      -- ---- Mensagem --------------------------------------------------------
      v_msg     := coalesce(r.payload->'message', r.payload);
      v_direcao := case when coalesce((v_msg->>'fromMe')::boolean, false) then 'saida' else 'entrada' end;
      v_grupo   := coalesce(v_msg->>'isGroup', 'false')::boolean;

      -- Inbound traz `sender_pn`; outbound, o destino em `chatid`.
      v_jid := case when v_direcao = 'entrada'
                    then coalesce(v_msg->>'sender_pn', v_msg->>'sender', v_msg->>'chatid')
                    else coalesce(v_msg->>'chatid', v_msg->>'to') end;

      /*
       * Grupo tem identidade PRÓPRIA, e ela não é a de quem falou.
       *
       * O provedor manda três coisas na mesma mensagem: `chatid` é o grupo,
       * `groupName` é o nome dele, e `sender_pn` é quem abriu a boca lá dentro.
       * O código usava `sender_pn` como identidade da conversa — e assim a
       * conversa não era do grupo, era de cada participante. Deu 53 linhas na
       * tela para 8 grupos, com o nome do último a falar em cada uma.
       */
      v_grupo_jid  := case when v_grupo then v_msg->>'chatid' end;
      v_grupo_nome := case when v_grupo then nullif(v_msg->>'groupName', '') end;

      v_digitos := split_part(split_part(coalesce(v_jid,''), ':', 1), '@', 1);
      v_digitos := regexp_replace(v_digitos, '\D', '', 'g');

      -- Identificador anônimo: conversa nasce sem telefone e sem lead.
      if coalesce(v_jid,'') like '%@lid%' or length(v_digitos) > 13 then
        v_lid  := v_jid;
        v_e164 := null;
      else
        v_lid  := null;
        v_e164 := case when length(v_digitos) >= 10 then '+' || v_digitos else null end;
      end if;

      v_texto   := coalesce(v_msg->>'text', v_msg->>'body', v_msg->>'caption');
      /*
       * `senderName` é QUEM MANDOU — e numa mensagem que sai, quem mandou é a
       * imobiliária.
       *
       * O upsert da conversa usava este nome sempre, e o `coalesce(excluded,
       * c)` faz o valor novo ganhar do antigo. Resultado: bastava o corretor
       * responder para a conversa passar a se chamar com o nome dele. Cinco
       * telefones diferentes, cinco pessoas diferentes, todas com o mesmo nome
       * na lista — e a tela virou uma coluna de clones.
       *
       * Nome de contato só vem de quem CHEGA. Quando não houver nenhum (uma
       * conversa que a imobiliária começou), fica nulo e a tela mostra o
       * telefone, que é a verdade disponível.
       */
      v_nome    := nullif(coalesce(v_msg->>'senderName', v_msg->>'pushName', ''), '');
      if v_direcao <> 'entrada' then
        v_nome := null;
      end if;
      v_prov_id := coalesce(v_msg->>'id', v_msg->>'messageid');
      -- Milissegundo ou segundo, o provedor que decide. Ver `instante_do_provedor`.
      v_quando  := coalesce(
                     public.instante_do_provedor(v_msg->>'messageTimestamp'),
                     r.received_at);

      -- O tipo sai de `tipo_da_mensagem`, que le `mediaType` antes de
      -- `messageType`. A versao que morava aqui comparava 'ImageMessage' com
      -- 'image' e devolvia 'texto' para tudo — ver o cabecalho da 125.
      v_kind := public.tipo_da_mensagem(v_msg);

      -- Chave de duplicata NUNCA nula.
      v_dedupe := coalesce(
        v_prov_id,
        md5(coalesce(v_jid,'') || '|' || v_direcao || '|' ||
            extract(epoch from v_quando)::text || '|' || left(coalesce(v_texto,''), 300)));

      -- Ref code: é ele que liga campanha → conversa → lead.
      select o_public_code, o_variant into v_ref from public.parse_ref_code(v_texto);

      /*
       * A assinatura da Meta, que vale mais do que qualquer texto.
       *
       * Quando a pessoa clica num anúncio de Click To WhatsApp, o WhatsApp
       * entrega no `contextInfo` quem a mandou: `conversionSource` = 'FB_Ads',
       * `entryPointConversionSource` = 'ctwa_ad', o id do anúncio em
       * `externalAdReply.sourceID` e o `ctwaClid` do clique.
       *
       * Isto é atribuição de PRIMEIRA MÃO — a própria plataforma dizendo que
       * este contato veio deste anúncio. É mais forte que o nosso `Ref.`, que
       * depende de a pessoa não apagar o texto antes de enviar.
       *
       * A saudação do anúncio é escrita na Meta e NÃO carrega o nosso código.
       * Foi por isso que, no primeiro dia com o número no ar, o único contato
       * que realmente veio de anúncio foi o único que não virou lead.
       */
      v_ctx := v_msg->'content'->'contextInfo';
      if coalesce(v_ctx->>'conversionSource', '') <> ''
         or coalesce(v_ctx->>'entryPointConversionSource', '') = 'ctwa_ad' then
        -- `sourceID` com D maiúsculo. Escrito assim no payload, e procurar por
        -- `sourceId` devolve nulo em silêncio.
        v_anuncio   := nullif(v_ctx->'externalAdReply'->>'sourceID', '');
        v_ctwa_clid := nullif(v_ctx->'externalAdReply'->>'ctwaClid', '');
      else
        v_anuncio   := null;
        v_ctwa_clid := null;
      end if;
      if v_ref.o_public_code is not null then
        select id into v_imovel from public.properties
         where organization_id = r.organization_id
           and lower(public_code) = v_ref.o_public_code;
      end if;

      -- Lead: só para mensagem que CHEGA, e nunca de grupo.
      --
      -- Outbound para quem não é lead NÃO cria lead: o corretor fala com
      -- síndico, despachante e fornecedor, e nada disso pode entrar no funil
      -- contaminando a conversão por campanha.
      /*
       * E, agora, SÓ COM PROVA DE ORIGEM.
       *
       * Toda mensagem que chegava virava lead. No primeiro dia isso encheu o
       * funil com três "leads" que não são lead nenhum: uma conversa pessoal
       * que já existia antes do CRM, um contato conhecido, e um número de
       * telemarketing sem nome. Nenhum veio de anúncio, nenhum veio de página.
       *
       * Lead é oportunidade com ORIGEM CONHECIDA — é o que se conta, o que se
       * divide pelo gasto de anúncio e o que decide verba. Contato do WhatsApp
       * é conversa, e conversa continua aparecendo inteira na tela de Conversas.
       * Misturar os dois faz o custo por lead parecer barato porque o
       * denominador cresceu com gente que nunca viu um anúncio.
       *
       * A prova é o código de referência: quem clica no botão da landing page
       * chega com ele na primeira mensagem. Sem prova, a conversa só se liga a
       * um lead que JÁ EXISTA com aquele telefone — o do formulário, o da Meta,
       * o cadastrado à mão — e nunca inventa um.
       */
      if v_direcao = 'entrada' and not v_grupo and v_e164 is not null then
       if v_anuncio is not null or v_ctwa_clid is not null then
        -- Veio de anúncio. `meta_ads` é a origem, e o id do anúncio vai junto:
        -- é ele que liga este lead ao gasto daquela peça no painel.
        select o_lead_id, o_is_new into v_lead, v_lead_novo
          from public.find_or_create_lead(
            r.organization_id,
            coalesce(v_nome, v_e164),
            v_e164,
            public.cc_from_e164(v_e164),
            null,
            'meta_ads',
            'whatsapp_inbound',
            v_imovel,
            jsonb_strip_nulls(jsonb_build_object(
              'method',      'ctwa',
              'meta_ad_id',  v_anuncio,
              'fbclid',      v_ctwa_clid,
              'utm_source',  'meta',
              'variant',     v_ref.o_variant)));

       elsif v_ref.o_public_code is null then
        -- Sem prova: só amarra no que já existe. `select into` sem linha deixa
        -- `v_lead` nulo, que é exatamente o que se quer dizer aqui.
        select id into v_lead
          from public.leads
         where organization_id = r.organization_id
           /*
            * O NUMERO CANONICO, e nao o que o provedor mandou.
            *
            * O WhatsApp entrega o celular brasileiro SEM o nono digito
            * (554788887777) e quem digita na landing escreve COM
            * (5547988887777). Ate a 139 os dois viravam fichas diferentes: a
            * busca aqui comparava o cru, e `find_or_create_lead` comparava o
            * normalizado. Agora os dois lados passam pela mesma funcao.
            */
           and phone_e164 = public.to_e164(v_e164, public.pais_da_discagem(v_e164))
         order by created_at
         limit 1;
       else
        select o_lead_id, o_is_new into v_lead, v_lead_novo
          from public.find_or_create_lead(
            r.organization_id,
            coalesce(v_nome, v_e164),
            v_e164,
            public.cc_from_e164(v_e164),
            null,
            'whatsapp',
            'whatsapp_inbound',
            v_imovel,
            -- As chaves são `variant` e `method`, o vocabulário que
            -- find_or_create_lead lê (003, linhas 340 e 350). Uma primeira
            -- versão daqui passou `ft_variant`/`attribution_method`, que são os
            -- nomes das COLUNAS — o jsonb foi aceito sem reclamar, as chaves
            -- caíram no vazio, e o lead nasceu com method 'none' e sem
            -- variante. Silencioso: o Ref code aparecia certo na conversa e
            -- errado no lead, que é justamente onde o painel de A/B lê.
            case when v_ref.o_variant is not null
                 then jsonb_build_object('variant', v_ref.o_variant, 'method', 'ref_code')
                 else '{}'::jsonb end);
       end if;
      end if;

      -- Conversa. SEM tocar em contador nem em "última mensagem" ainda.
      --
      -- A ordem aqui é a correção de um bug próprio, pego no primeiro teste:
      -- incrementar `unread_count` no upsert da conversa acontece ANTES de
      -- saber se a mensagem é reentrega. O provedor reenviou, a mensagem foi
      -- corretamente descartada pela chave de duplicata — e a conversa ficou
      -- com duas não lidas para uma mensagem só. O contador é o que o corretor
      -- olha para decidir o que atender.
      if v_grupo then
        /*
         * Caminho próprio, porque a chave é outra.
         *
         * `on conflict` precisa apontar para UM índice, e o de grupo não é o de
         * contato — tanto que o de contato exclui grupo na condição. Enfiar os
         * dois no mesmo `insert` foi o que deixou grupo sem nenhuma trava.
         *
         * Sem telefone e sem LID: um grupo não é uma pessoa, e guardar o número
         * de um participante ali é exatamente a confusão que gerou a duplicata.
         */
        insert into public.whatsapp_conversations as c
          (organization_id, instance_id, is_group, group_jid, group_subject,
           contact_name, property_id)
        values
          (r.organization_id, r.instance_id, true, v_grupo_jid, v_grupo_nome,
           coalesce(v_grupo_nome, v_grupo_jid), v_imovel)
        on conflict (organization_id, instance_id, group_jid)
          where is_group and group_jid is not null
        do update set
          -- O nome do grupo pode mudar, e a última notícia é a boa.
          group_subject = coalesce(excluded.group_subject, c.group_subject),
          contact_name  = coalesce(excluded.contact_name,  c.contact_name),
          property_id   = coalesce(c.property_id, excluded.property_id)
        returning c.id into v_conv;

      elsif v_e164 is null and v_lid is not null then
        /*
         * Contato que chega só com LID, e o terceiro caso da mesma família.
         *
         * O WhatsApp passou a entregar certos contatos por um identificador
         * anônimo, sem telefone. Existe índice único para isso — e o `insert`
         * apontava o `on conflict` só para o índice de CONTATO. Resultado: a
         * segunda mensagem da mesma pessoa batia num índice que ninguém estava
         * esperando, virava exceção, cinco tentativas e o evento morria na fila.
         *
         * Não era duplicata como no grupo: era MENSAGEM PERDIDA. Três eventos
         * já tinham ido embora assim quando isto foi escrito.
         */
        insert into public.whatsapp_conversations as c
          (organization_id, instance_id, lead_id, contact_e164, contact_lid,
           is_group, group_jid, contact_name, ref_code, property_id)
        values
          (r.organization_id, r.instance_id, v_lead, null, v_lid,
           false, null, v_nome,
           case when v_ref.o_public_code is not null
                then upper(v_ref.o_public_code) || '-' || upper(v_ref.o_variant) end,
           v_imovel)
        on conflict (organization_id, instance_id, contact_lid)
          where contact_lid is not null and contact_e164 is null
        do update set
          lead_id      = coalesce(c.lead_id, excluded.lead_id),
          contact_name = coalesce(excluded.contact_name, c.contact_name),
          ref_code     = coalesce(c.ref_code, excluded.ref_code),
          property_id  = coalesce(c.property_id, excluded.property_id)
        returning c.id into v_conv;

      else
      insert into public.whatsapp_conversations as c
        (organization_id, instance_id, lead_id, contact_e164, contact_lid,
         is_group, group_jid, contact_name, ref_code, property_id)
      values
        (r.organization_id, r.instance_id, v_lead, v_e164, v_lid,
         false, null, v_nome,
         case when v_ref.o_public_code is not null
              then upper(v_ref.o_public_code) || '-' || upper(v_ref.o_variant) end,
         v_imovel)
      on conflict (organization_id, instance_id, contact_e164)
        where contact_e164 is not null and not is_group
      do update set
        lead_id      = coalesce(c.lead_id, excluded.lead_id),
        contact_name = coalesce(excluded.contact_name, c.contact_name),
        ref_code     = coalesce(c.ref_code, excluded.ref_code),
        property_id  = coalesce(c.property_id, excluded.property_id)
      returning c.id into v_conv;
      end if;

      -- Mensagem. Não voltou id → é reentrega → sai sem efeito colateral.
      insert into public.whatsapp_messages
        (organization_id, conversation_id, lead_id, instance_id, direction,
         provider_message_id, dedupe_key, kind, body, ref_code,
         media_status, status, occurred_at, raw)
      values
        (r.organization_id, v_conv, v_lead, r.instance_id, v_direcao,
         v_prov_id, v_dedupe, v_kind, v_texto,
         case when v_ref.o_public_code is not null
              then upper(v_ref.o_public_code) || '-' || upper(v_ref.o_variant) end,
         /*
          * A FILA DE MIDIA SO ACEITA CONVERSA DE CLIENTE.
          *
          * Decisao do Guto em 23/09: midia de conversa pessoal e de grupo nao e
          * para copiar. A conta que ele viu: dos 433 arquivos baixados naquele
          * dia, UM era de conversa de lead.
          *
          * A pergunta e feita a CONVERSA, e nao a `v_lead`: aquela variavel so
          * e preenchida para mensagem que CHEGA, entao usa-la deixaria de fora
          * a foto que o corretor MANDA para o cliente, que e a que ele mais vai
          * querer rever depois.
          */
         case when v_kind in ('imagem','audio','video','documento','figurinha')
                   and exists (select 1 from public.whatsapp_conversations c
                                where c.id = v_conv and c.lead_id is not null)
              then 'pendente' else 'sem_midia' end,
         case when v_direcao = 'entrada' then 'recebida' else 'enviada' end,
         v_quando, r.payload)
      on conflict (organization_id, dedupe_key) do nothing
      returning id into v_msg_id;

      if v_msg_id is null then
        update public.whatsapp_inbox set status='ignorado', processed_at=now() where id = r.id;
        v_n := v_n + 1;
        continue;
      end if;

      -- Só AGORA a conversa avança. Somado no banco, não em ler-modificar-
      -- escrever no aplicativo — a referência perdia contagem sob concorrência.
      update public.whatsapp_conversations
         set unread_count = unread_count + case when v_direcao = 'entrada' then 1 else 0 end,
             last_message_at = greatest(coalesce(last_message_at, v_quando), v_quando),
             last_message_body = left(coalesce(v_texto, '(mídia)'), 200)
       where id = v_conv;

      -- Aviso. Só para o que chega, e nunca quando esta mesma mensagem acabou
      -- de criar o lead: o gatilho de lead novo já disparou, e dois banners
      -- para o mesmo fato é ruído.
      if v_direcao = 'entrada' and not coalesce(v_lead_novo, false) then
        select assigned_to into v_dono from public.leads where id = v_lead;

        perform public.create_notification(
          r.organization_id,
          array(select public.notification_audience(r.organization_id, v_lead, v_dono)),
          'mensagem_recebida',
          'Mensagem de ' || coalesce(v_nome, v_e164, 'contato'),
          left(coalesce(v_texto, '(mídia)'), 120),
          case when v_lead is not null then '/leads/' || v_lead else '/conversas' end,
          'conversa', v_conv,
          null);
      end if;

      /*
       * Mensagem chegando É o sinal de vida.
       *
       * O vigia (`whatsapp_saude`) marca `credenciada_offline` quando
       * `last_seen_at` passa de cinco minutos — e esse campo só era tocado pela
       * tela de configuração, ao consultar o provedor. Ou seja: bastava ninguém
       * abrir aquela tela por cinco minutos para o número ser declarado morto.
       *
       * Aconteceu em produção: `last_seen_at` parado às 14:16, mensagens
       * chegando até as 17:29, e o CRM recusando todo envio com "número não
       * conectado" enquanto o WhatsApp trabalhava normalmente.
       *
       * Tráfego é prova melhor do que qualquer consulta. E a volta só vale
       * contra o veredito do VIGIA: `desconectada` é logout de verdade, e isso
       * mensagem nenhuma desfaz.
       */
      update public.whatsapp_instances
         set last_seen_at = now(),
             status = case when status = 'credenciada_offline' then 'conectada' else status end,
             last_error = case when status = 'credenciada_offline' then null else last_error end
       where id = r.instance_id;

      update public.whatsapp_inbox set status='processado', processed_at=now() where id = r.id;
      v_n := v_n + 1;

    exception when others then
      -- Nada some sem deixar rastro. Cinco tentativas e depois falha visível.
      update public.whatsapp_inbox
         set status = case when attempts >= 5 then 'falhou' else 'pendente' end,
             error  = left(sqlerrm, 500)
       where id = r.id;
    end;
  end loop;

  return v_n;
end $$;


--
-- Name: FUNCTION processar_inbox(_limit integer); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.processar_inbox(_limit integer) IS 'Processa a fila de entrada do WhatsApp. Desde a 139, acha o lead pelo numero canonico.';


--
-- Name: push_drenar(); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.push_drenar()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_segredo text; v_url text;
begin
  select decrypted_secret into v_segredo from vault.decrypted_secrets where name = 'push_cron_secret';
  if v_segredo is null then
    raise exception 'push_cron_secret ausente no Vault — o envio de push está parado';
  end if;

  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'functions_base_url';
  if v_url is null then
    raise exception 'functions_base_url ausente no Vault';
  end if;

  perform net.http_post(
    url     := v_url || '/push-trabalhador',
    headers := jsonb_build_object('Content-Type','application/json','X-Cron-Secret', v_segredo),
    body    := '{}'::jsonb);
end $$;


--
-- Name: push_verificar_atraso(integer); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.push_verificar_atraso(_minutos integer default 15)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_org uuid; v_n integer := 0;
begin
  for v_org in
    select distinct organization_id from public.push_outbox
     where status = 'pendente' and created_at < now() - make_interval(mins => _minutos)
  loop
    perform public.create_notification(
      v_org,
      array(
        select p.id from public.profiles p
          join public.user_roles ur on ur.user_id = p.id and ur.organization_id = p.organization_id
         where p.organization_id = v_org and p.is_active and ur.role::text in ('gerente','admin')),
      'sistema',
      'Avisos no celular estão atrasados',
      'A fila de envio parou. O sino dentro do CRM continua funcionando.',
      '/configuracoes?aba=notificacoes',
      'push_backlog', v_org,
      null);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;


--
-- Name: quem_ve_a_conversa(uuid); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.quem_ve_a_conversa(_conv uuid)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $fn$
  with d as (
    select c.id,
           c.organization_id,
           i.owner_id,
           l.assigned_to,
           -- A MESMA função que a view e a trava do agente usam. Aqui ela roda
           -- em contexto de definer, então enxerga o lead mesmo quando a RLS da
           -- 079 o esconderia de quem perguntou — o estado da conversa é um
           -- fato dela, não uma opinião de quem olha.
           public.wa_estado_da_conversa(c.id) as estado
      from public.whatsapp_conversations c
      left join public.whatsapp_instances i on i.id = c.instance_id
      left join public.leads l              on l.id = c.lead_id
     where c.id = _conv
  )

  -- 1. O DONO DO NÚMERO. Tudo que chega no aparelho dele, sem exceção e sem
  --    depender de classificação.
  select d.owner_id from d where d.owner_id is not null

  union

  /*
   * 2. Número ÓRFÃO — a casa responde por ele.
   *
   * `owner_id` nulo não deveria acontecer (a 067 preencheu, e a edge function
   * sempre carimba), mas se acontecer sem esta rede a conversa fica invisível
   * para TODO MUNDO: mensagem de cliente entrando numa caixa que ninguém
   * enxerga, sem erro e sem fila parada. É o pior desfecho possível, e o mais
   * difícil de descobrir.
   */
  select ur.user_id
    from d
    join public.user_roles ur
      on ur.organization_id = d.organization_id
     and ur.role in ('admin', 'gerente')
   where d.owner_id is null

  union

  -- 3. LEAD com origem comprovada: o corretor responsável por ele.
  select d.assigned_to from d where d.estado = 'lead' and d.assigned_to is not null

  union

  -- 4. LEAD com origem comprovada: a gestão. Veio de verba da casa, a casa
  --    acompanha. Esta é a ÚNICA porta da gestão para o celular de outra pessoa.
  select ur.user_id
    from d
    join public.user_roles ur
      on ur.organization_id = d.organization_id
     and ur.role in ('admin', 'gerente')
   where d.estado = 'lead';
$fn$;


--
-- Name: FUNCTION quem_ve_a_conversa(_conv uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.quem_ve_a_conversa(_conv uuid) IS 'A UNICA definicao de quem le uma conversa. A policy e a audiencia da notificacao leem daqui.';


--
-- Name: rls_auto_enable(); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.rls_auto_enable()
returns event_trigger
language plpgsql
as $$
declare
  obj record;
begin
  for obj in
    select * from pg_event_trigger_ddl_commands()
     where command_tag = 'CREATE TABLE' and schema_name = 'public'
  loop
    execute format('alter table %s enable row level security', obj.object_identity);
  end loop;
end $$;


--
-- Name: run_due_reminders(integer); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.run_due_reminders(_limit integer default 200)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r      record;
  v_n    integer := 0;
  v_atraso integer;
begin
  for r in
    -- Reserva ANTES de notificar. No sistema auditado o carimbo de "já enviei"
    -- vinha depois do envio, e qualquer falha no meio reenviava o lembrete a
    -- cada rodada.
    update public.lead_reminders lr
       set status = 'notificado', notified_at = now()
     where lr.id in (
       select id from public.lead_reminders
        -- Janela ABERTA PARA TRÁS. O sistema auditado usava uma faixa futura
        -- estreita: três horas fora do ar e o lembrete não casava mais com
        -- filtro nenhum, ficando pendente para sempre, sem erro em lugar algum.
        where status = 'pendente'
          and remind_at <= now()
        order by remind_at
        limit _limit
        for update skip locked)
    returning lr.*
  loop
    v_atraso := (extract(epoch from now() - r.remind_at) / 60)::integer;

    perform public.create_notification(
      r.organization_id,
      array[r.assigned_to],
      'lembrete',
      r.title,
      -- Atrasado é entregue MARCADO, não descartado. Para "ligar de volta para
      -- o cliente", chegar tarde é ruim; sumir sem deixar rastro é pior.
      case when v_atraso > 60
           then coalesce(r.body || ' · ', '') || 'atrasado ' || v_atraso || ' min'
           else r.body end,
      '/leads/' || r.lead_id,
      'reminder', r.id,
      null);

    v_n := v_n + 1;
  end loop;

  return v_n;
end $$;


--
-- Name: sem_credencial(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.sem_credencial(_payload jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case
    when _payload is null then null
    when jsonb_typeof(_payload) <> 'object' then _payload
    else
      (_payload - 'token' - 'apikey' - 'apiKey' - 'admintoken' - 'adminToken')
      ||
      /*
       * O `instance` do payload é um objeto que descreve o número, e o provedor
       * repete o token lá dentro. Trinta linhas hoje; a chave some do mesmo
       * jeito.
       */
      case when jsonb_typeof(_payload -> 'instance') = 'object'
           then jsonb_build_object('instance',
                  (_payload -> 'instance')
                    - 'token' - 'apikey' - 'apiKey' - 'admintoken' - 'adminToken')
           else '{}'::jsonb
      end
  end;
$$;


--
-- Name: FUNCTION sem_credencial(_payload jsonb); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.sem_credencial(_payload jsonb) IS 'Tira as chaves de credencial do payload do provedor. Usada na porta das duas tabelas e na limpeza do historico.';


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end $$;


--
-- Name: slugify(text); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.slugify(_txt text)
returns text
language sql
immutable
set search_path = public, extensions
as $$
  -- Forma de dois argumentos de propósito: unaccent(text) é STABLE, e marcar
  -- slugify como IMMUTABLE chamando-a seria mentira que só aparece no dia em
  -- que esta função for usada numa coluna gerada ou num índice.
  select trim(both '-' from
           regexp_replace(
             lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(_txt, ''))),
             '[^a-z0-9]+', '-', 'g'));
$$;


--
-- Name: FUNCTION slugify(_txt text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.slugify(_txt text) IS 'Slug estável a partir de texto livre. Usado em slug de imóvel e de landing page.';


--
-- Name: snooze_reminder(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.snooze_reminder(_id uuid, _minutos integer)
returns void
language sql
security invoker
set search_path = public
as $$
  update public.lead_reminders
     set status = 'pendente',
         remind_at = greatest(now(), remind_at) + make_interval(mins => _minutos),
         notified_at = null,
         snooze_count = snooze_count + 1
   where id = _id;
$$;


--
-- Name: tg_agente_agenda_resposta(); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.tg_agente_agenda_resposta()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_conv record;
begin
  /*
   * Mensagem que SAI e não é do agente significa que gente assumiu.
   *
   * Vale para a resposta pela tela e para a resposta pelo celular do corretor,
   * que chega espelhada pelo webhook — as duas com `automatica = false`. O
   * agente cala e não volta sozinho: quem assumiu decide quando devolver.
   */
  if new.direction <> 'entrada' then
    if not new.automatica then
      update public.whatsapp_conversations
         set agente_pausado_em   = coalesce(agente_pausado_em, now()),
             agente_pausado_por  = coalesce(agente_pausado_por, new.sent_by),
             agente_responder_em = null,
             agente_espera_desde = null
       where id = new.conversation_id;
    end if;
    return new;
  end if;

  select c.id, c.is_group, c.agente_pausado_em, c.agente_espera_desde,
         (o.agente_ativo and i.agente_ativo) as ligado
    into v_conv
    from public.whatsapp_conversations c
    join public.organizations o       on o.id = c.organization_id
    join public.whatsapp_instances i  on i.id = c.instance_id
   where c.id = new.conversation_id;

  if not found or v_conv.is_group or v_conv.agente_pausado_em is not null then
    return new;
  end if;

  if not coalesce(v_conv.ligado, false) then
    return new;
  end if;

  -- A trava, de novo, aqui. O agendamento nem chega a existir para conversa que
  -- o agente não pode tocar — e assim a fila de tarefas nasce limpa.
  if public.wa_estado_da_conversa(new.conversation_id) is distinct from 'lead' then
    return new;
  end if;

  /*
   * De 60 a 180 segundos, sorteado a cada mensagem.
   *
   * Duas razões, e nenhuma é estética. Responder em três segundos cravados,
   * sempre, é assinatura de máquina — e assinatura de máquina é o que faz um
   * número ser bloqueado. E a espera absorve quem manda quatro mensagens
   * seguidas: o relógio reinicia, e a pessoa recebe UMA resposta ao terminar de
   * escrever, não quatro.
   *
   * O teto de dez minutos existe para quem nunca para de digitar. Sem ele, a
   * conversa mais animada seria justamente a que nunca é respondida.
   */
  update public.whatsapp_conversations
     set agente_espera_desde = coalesce(agente_espera_desde, now()),
         agente_responder_em = least(
           now() + make_interval(secs => 60 + floor(random() * 121)::int),
           coalesce(agente_espera_desde, now()) + interval '10 minutes')
   where id = new.conversation_id;

  return new;
end $fn$;


--
-- Name: tg_conexao_meta_ganha_nome(); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.tg_conexao_meta_ganha_nome()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if nullif(trim(coalesce(new.label, '')), '') is null then
    new.label := coalesce(
      'BM de ' || (select p.full_name from public.profiles p where p.id = new.owner_id),
      -- Sem dono resolvido o nome ainda precisa existir: uma linha sem rótulo
      -- num seletor é uma opção que não se sabe o que faz.
      'Conexão da casa');
  end if;
  return new;
end $fn$;


--
-- Name: tg_conversa_foto(); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.tg_conversa_foto()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare v_url text;
begin
  /*
   * O ENVELOPE VEM DE FORA, e por isso a origem é conferida.
   *
   * Este valor nasce no provedor e vai parar num `<img src>` no navegador de
   * quem atende. Sem a trava de domínio, quem controlasse o payload apontaria a
   * tela para onde quisesse — e cada avatar viraria uma chamada a um servidor
   * escolhido por terceiro, entregando IP e sessão de quem olha.
   *
   * `pps.whatsapp.net` é o CDN de foto de perfil do WhatsApp. A barra no fim do
   * prefixo não é detalhe: sem ela, `pps.whatsapp.net.dominio-do-atacante.com`
   * passaria.
   */
  v_url := nullif(new.raw->'chat'->>'imagePreview', '');

  if v_url is null or v_url not like 'https://pps.whatsapp.net/%' then
    return null;
  end if;

  /*
   * Sempre a mais recente, mesmo que a foto seja a mesma.
   *
   * A assinatura vence sozinha; guardar a URL antiga porque "a imagem não
   * mudou" daria avatar quebrado dois dias depois. O que decide se precisa
   * BAIXAR de novo é `foto_origem`, não esta coluna.
   */
  update public.whatsapp_conversations c
     set foto_url = v_url
   where c.id = new.conversation_id
     and c.foto_url is distinct from v_url;

  return null;
exception when others then
  /*
   * Um avatar nunca pode derrubar a entrada de mensagem.
   *
   * Este gatilho roda dentro da transação que grava a mensagem. Se ele levantar,
   * a mensagem do cliente se perde — e perder mensagem para não perder foto é
   * uma troca que ninguém aceitaria se fosse perguntada em voz alta.
   */
  raise warning 'foto do contato nao registrada (conversa %): %', new.conversation_id, sqlerrm;
  return null;
end $fn$;


--
-- Name: tg_conversa_virou_lead_pega_midia(); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.tg_conversa_virou_lead_pega_midia()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare v_n integer;
begin
  if new.lead_id is null or old.lead_id is not null then
    return null;
  end if;

  update public.whatsapp_messages m
     set media_status = 'pendente'
   where m.conversation_id = new.id
     and m.media_status = 'sem_midia'
     and m.kind in ('imagem','audio','video','documento','figurinha')
     and m.provider_message_id is not null
     and m.occurred_at > now() - interval '3 days';

  get diagnostics v_n = row_count;
  if v_n > 0 then
    raise notice 'conversa % virou lead: % midia(s) de volta para a fila', new.id, v_n;
  end if;

  return null;
exception when others then
  -- Classificar a conversa e o que importa; a midia e conveniencia.
  raise warning 'midia da conversa % nao voltou para a fila: %', new.id, sqlerrm;
  return null;
end $fn$;


--
-- Name: FUNCTION tg_conversa_virou_lead_pega_midia(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.tg_conversa_virou_lead_pega_midia() IS 'Conversa que ganha lead recupera a midia dos ultimos 3 dias, que a 131 nao enfileirou na entrada.';


--
-- Name: tg_desativado_solta_lembretes(); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.tg_desativado_solta_lembretes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.is_active and not new.is_active then
    update public.lead_reminders
       set status = 'cancelado'
     where assigned_to = new.id
       and status = 'pendente';
  end if;
  return new;
end $$;


--
-- Name: tg_enfileirar_push(); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.tg_enfileirar_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  /*
   * A porta do TOQUE, e ela vem antes de tudo.
   *
   * Lista de PERMISSÃO e não de bloqueio, de propósito: com bloqueio, um tipo
   * novo nasceria tocando e voltaria a encher o aparelho sem ninguém ter
   * escolhido isso. Aqui ele nasce calado, e o teste que compara esta lista com
   * o contrato falha até alguém decidir — o que força a decisão em vez de
   * deixá-la acontecer.
   */
  if new.type not in (
    'lead_esperando',   -- ninguém voltou para o cliente; não existe em outro lugar
    'lead_atribuido',   -- alguém passou este lead PARA VOCÊ
    'lead_quente',      -- a qualificação mudou a ordem do dia
    'lembrete',         -- a pessoa pediu para ser lembrada
    'visita_proxima',   -- compromisso com hora marcada
    'whatsapp_fora',    -- o número caiu e o lead está evaporando na entrada
    'sistema'           -- o balde do que precisa de gente, e é raro
  ) then
    return new;
  end if;

  insert into public.push_outbox (organization_id, notification_id, subscription_id, payload)
  select
    new.organization_id,
    new.id,
    s.id,
    jsonb_build_object(
      'title', new.title,
      'body',  new.body,
      'url',   coalesce(new.link_path, '/'),
      'type',  new.type,
      'group_key', new.group_key,
      'notification_id', new.id::text)
    from public.push_subscriptions s
    left join public.notification_preferences p on p.profile_id = s.profile_id
   where s.profile_id = new.recipient_id
     and coalesce(p.push_enabled, true);

  return new;
end $$;


--
-- Name: tg_gasto_adota_lead_orfao(); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.tg_gasto_adota_lead_orfao()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  update public.leads l
     set assigned_to = public.dono_do_anuncio(l.organization_id, l.ft_meta_ad_id)
   where l.assigned_to is null
     and l.excluded_at is null
     and exists (
       select 1 from novo n
        where n.organization_id = l.organization_id
          and n.ad_id = l.ft_meta_ad_id
          and n.ad_id <> ''
     )
     -- Sem esta linha, um anúncio cuja conexão tem dono desativado faria o
     -- `update` gravar nulo por cima de nulo a cada importação: nada muda no
     -- valor, mas a linha é reescrita e o gatilho de aviso da 074 acorda à toa,
     -- de hora em hora, para sempre.
     and public.dono_do_anuncio(l.organization_id, l.ft_meta_ad_id) is not null;

  return null;
end $fn$;


--
-- Name: tg_inbox_sem_credencial(); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.tg_inbox_sem_credencial()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.payload := public.sem_credencial(new.payload);
  return new;
end $$;


--
-- Name: tg_lead_atribuido(); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.tg_lead_atribuido()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_quem text;
begin
  -- Só quando o dono MUDA e passa a existir alguém.
  if new.assigned_to is null or new.assigned_to is not distinct from old.assigned_to then
    return new;
  end if;

  /*
   * Quem pega o lead para si não recebe aviso de si mesmo.
   *
   * O corretor que abre a ficha e se coloca como responsável acabou de decidir
   * isso — avisá-lo é contar o que ele já sabe, e é assim que uma caixa de
   * avisos vira ruído que ninguém lê.
   */
  if new.assigned_to = (select auth.uid()) then
    return new;
  end if;

  select full_name into v_quem from public.profiles where id = (select auth.uid());

  perform public.create_notification(
    new.organization_id,
    array[new.assigned_to],
    'lead_atribuido',
    new.full_name,
    -- Sem ator não houve repasse: o lead chegou por uma fonte que é da pessoa.
    case
      when nullif(v_quem, '') is null then 'Chegou um lead para você'
      else v_quem || ' passou este lead para você'
    end,
    '/leads/' || new.id,
    'lead', new.id,
    (select auth.uid()));

  return new;
end $fn$;


--
-- Name: tg_lead_conversao_etapa(); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.tg_lead_conversao_etapa()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_chave text; v_won boolean; v_evento text; v_valor bigint;
begin
  if new.stage_id is not distinct from old.stage_id then return null; end if;

  select s.key, s.is_won into v_chave, v_won
    from public.pipeline_stages s where s.id = new.stage_id;

  /*
   * O QUE NÃO VAI, E É A METADE DA DECISÃO.
   *
   * `em_atendimento` não vai. Desde a 122 essa etapa anda SOZINHA, no instante
   * em que um humano responde a mensagem — e a medição de 24/09 mostrou o
   * resultado: 158 das 179 mudanças de etapa de toda a história são para ela,
   * e 156 dos 187 leads vivos estão parados nela. Um evento que acontece com
   * quase todo mundo não separa ninguém de ninguém.
   *
   * `perdido` não vai: a Meta não tem o que fazer com derrota.
   */
  v_evento := case
    when v_won                        then 'venda'
    when v_chave = 'visita_agendada'  then 'visita_agendada'
    when v_chave = 'visita_realizada' then 'visita_realizada'
    when v_chave = 'proposta'         then 'proposta'
    else null end;

  if v_evento is null then return null; end if;

  /* Só a venda leva valor, e só se alguém o tiver escrito. Mandar a venda sem
     valor faria a Meta otimizar como se toda venda valesse igual. */
  if v_evento = 'venda' then v_valor := new.deal_value_cents; end if;

  perform public.meta_conversao_enfileirar(new.id, v_evento, now(), v_valor);
  return null;
end $$;


--
-- Name: tg_lead_conversao_nova(); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.tg_lead_conversao_nova()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.meta_conversao_enfileirar(
    new.id, 'lead', coalesce(new.ft_occurred_at, new.created_at));
  return null;
end $$;


--
-- Name: tg_lead_conversao_origem(); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.tg_lead_conversao_origem()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (old.fbclid is null and old.ft_meta_ad_id is null)
     and (new.fbclid is not null or new.ft_meta_ad_id is not null) then
    perform public.meta_conversao_enfileirar(
      new.id, 'lead', coalesce(new.ft_occurred_at, new.created_at));
  end if;
  return null;
end $$;


--
-- Name: tg_lead_do_dono_do_anuncio(); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.tg_lead_do_dono_do_anuncio()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if new.assigned_to is not null or nullif(new.ft_meta_ad_id, '') is null then
    return new;
  end if;

  new.assigned_to := public.dono_do_anuncio(new.organization_id, new.ft_meta_ad_id);
  return new;
end $fn$;


--
-- Name: tg_lead_do_dono_do_numero(); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.tg_lead_do_dono_do_numero()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_dono uuid;
begin
  if new.lead_id is null then
    return new;
  end if;

  select i.owner_id into v_dono
    from public.whatsapp_instances i
   where i.id = new.instance_id
     and i.organization_id = new.organization_id;

  if v_dono is null then
    return new;
  end if;

  /*
   * `assigned_to is null` no WHERE é a trava toda.
   *
   * Sem ela, toda mensagem que chega devolveria o lead para o dono do número —
   * desfazendo em silêncio um repasse que o gerente acabou de fazer à mão, e
   * desfazendo de novo na mensagem seguinte. O dono da fonte decide quem PEGA o
   * lead, não quem fica com ele para sempre.
   */
  update public.leads
     set assigned_to = v_dono
   where id = new.lead_id
     and organization_id = new.organization_id
     and assigned_to is null;

  return new;
end $fn$;


--
-- Name: tg_lead_espera(); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.tg_lead_espera()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_lead uuid;
begin
  -- O mesmo `coalesce` da 092: a maioria das mensagens nasce sem `lead_id`, e
  -- quem guarda o vínculo é a conversa.
  v_lead := coalesce(
    new.lead_id,
    (select c.lead_id from public.whatsapp_conversations c where c.id = new.conversation_id));

  if v_lead is null then
    return null;
  end if;

  if new.direction = 'entrada' then
    /*
     * `least` e não `coalesce` sozinho: a primeira mensagem sem resposta é a que
     * mede a dívida, e mensagem pode chegar fora de ordem quando o processamento
     * fica parado. Sem o `least`, uma mensagem atrasada de ontem sobrescreveria
     * a espera com uma hora mais nova e a fila diria que a pessoa chegou agora.
     */
    update public.leads
       set esperando_desde = least(coalesce(esperando_desde, new.occurred_at), new.occurred_at)
     where id = v_lead
       and (esperando_desde is null or esperando_desde > new.occurred_at);

    /*
     * O CLIENTE FALOU: o silêncio acabou e a contagem de toques zera.
     *
     * Em `update` próprio porque a condição é outra — o de cima só escreve
     * quando a espera é mais antiga, e este precisa valer sempre que a mensagem
     * for mais nova que o último toque. Uma mensagem atrasada não pode apagar um
     * silêncio que começou DEPOIS dela.
     */
    update public.leads
       set silencio_desde = null,
           toques_sem_resposta = 0
     where id = v_lead
       and (silencio_desde is null or silencio_desde <= new.occurred_at);

  elsif not new.automatica then
    /*
     * A casa respondeu, a fila esvazia. Com uma guarda de tempo: a resposta só
     * limpa a espera que começou ANTES dela. Sem isso, uma saída antiga chegando
     * atrasada apagaria uma pergunta que o cliente fez depois.
     */
    update public.leads
       set esperando_desde = null
     where id = v_lead
       and esperando_desde is not null
       and esperando_desde <= new.occurred_at;

    /*
     * E COMEÇA (ou continua) O SILÊNCIO.
     *
     * `greatest` pelo mesmo motivo do `least` lá em cima: o que vale é a
     * mensagem mais NOVA da casa. O toque conta sempre — duas mensagens
     * seguidas sem resposta são dois toques, e é essa contagem que impede a
     * fila de insistir para sempre.
     *
     * Só marca silêncio se o cliente não estiver esperando resposta nossa mais
     * nova: a condição de `esperando_desde` acima já cuidou disso na mesma
     * transação.
     */
    update public.leads
       set silencio_desde = greatest(coalesce(silencio_desde, new.occurred_at), new.occurred_at),
           toques_sem_resposta = toques_sem_resposta + 1
     where id = v_lead
       and (esperando_desde is null or esperando_desde > new.occurred_at);
  end if;

  return null;
exception when others then
  -- A fila é conveniência; a mensagem do cliente é o produto. Mesmo padrão da
  -- 115, da 121 e da 122.
  raise warning 'espera nao registrada (mensagem %, lead %): %', new.id, v_lead, sqlerrm;
  return null;
end $fn$;


--
-- Name: FUNCTION tg_lead_espera(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.tg_lead_espera() IS 'Mantem esperando_desde (a bola com a casa) e silencio_desde/toques_sem_resposta (a bola com o cliente).';


--
-- Name: tg_lead_landing_do_ref(); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.tg_lead_landing_do_ref()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ref  record;
  v_page uuid;
begin
  -- Só na PRIMEIRA mensagem que chega, e só quando ainda não há página.
  if new.direction <> 'entrada' or new.body is null then
    return new;
  end if;

  select o_public_code, o_market, o_variant into v_ref
    from public.parse_ref_code(new.body);

  -- Sem mercado no código não há como escolher entre as cinco páginas, e
  -- chutar uma atribuiria a conversa ao país errado.
  if v_ref.o_public_code is null or v_ref.o_market is null then
    return new;
  end if;

  select public.landing_do_ref(new.organization_id, v_ref.o_public_code,
                               v_ref.o_market, v_ref.o_variant)
    into v_page;
  if v_page is null then
    return new;
  end if;

  /*
   * `is null` no update: primeiro toque não se sobrescreve.
   *
   * A pessoa que volta três dias depois por outro anúncio manda um segundo
   * código. Deixar o último ganhar mediria recência e chamaria de originação —
   * é a mesma regra que `ft_occurred_at` já protege para a variante.
   */
  update public.leads
     set ft_landing_page_id = v_page
   where id = new.lead_id
     and organization_id = new.organization_id
     and ft_landing_page_id is null;

  return new;
end $$;


--
-- Name: tg_lead_marca_avanco(); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.tg_lead_marca_avanco()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_pos    integer;
  v_perdeu boolean;
begin
  select position, is_lost into v_pos, v_perdeu
    from public.pipeline_stages where id = new.stage_id;

  -- Saída não é avanço. O recorde anterior fica de pé, e é ele que diz onde a
  -- pessoa estava quando desistiu.
  if coalesce(v_perdeu, false) then
    new.furthest_position := coalesce(old.furthest_position, new.furthest_position, 1);
  else
    new.furthest_position := greatest(
      coalesce(old.furthest_position, 1),
      coalesce(v_pos, 1));
  end if;

  return new;
end $$;


--
-- Name: tg_lead_nasce_com_dono(); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.tg_lead_nasce_com_dono()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if new.assigned_to is null
     and (select auth.uid()) is not null
     and not public.ve_a_carteira_toda()
  then
    new.assigned_to := (select auth.uid());
  end if;
  return new;
end $fn$;


--
-- Name: tg_lead_primeiro_contato(); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.tg_lead_primeiro_contato()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_lead     uuid;
  v_org      uuid;
  v_etapa    uuid;
  v_primeira uuid;
  v_pos      integer;
  v_destino  uuid;
begin
  if new.direction <> 'saida' then
    return new;
  end if;

  v_lead := coalesce(
    new.lead_id,
    (select c.lead_id from public.whatsapp_conversations c where c.id = new.conversation_id));

  if v_lead is null then
    return new;
  end if;

  /*
   * `occurred_at`, e não `now()`.
   *
   * A mensagem que o corretor manda pelo celular chega aqui pelo webhook, com
   * atraso — às vezes segundos, às vezes bem mais se o processamento tiver
   * ficado parado. Gravar `now()` colocaria na conta um tempo de resposta que
   * não foi o dele, e o número existe justamente para medir isso.
   */
  update public.leads
     set first_contact_at = new.occurred_at
   where id = v_lead
     and (first_contact_at is null or first_contact_at > new.occurred_at);

  /*
   * E, agora, O CARTÃO ANDA.
   *
   * `automatica` é a primeira guarda porque é a que protege o futuro: a resposta
   * do agente de IA não é atendimento, e um lead que sai de "Novo" por causa
   * dela desaparece da fila de quem ninguém tocou. Resposta digitada no CRM e
   * resposta pelo celular do corretor chegam as duas com `automatica = false` —
   * o insert da 069 nem nomeia a coluna —, então a guarda não fecha nenhum
   * caminho de gente.
   */
  if not new.automatica then
    begin
      select l.organization_id, l.stage_id
        into v_org, v_etapa
        from public.leads l
       where l.id = v_lead;

      -- A primeira etapa ativa da organização, pela MESMA definição que
      -- `find_or_create_lead` usa para escolher onde o lead nasce (003).
      select s.id, s.position
        into v_primeira, v_pos
        from public.pipeline_stages s
       where s.organization_id = v_org
         and s.is_active
       order by s.position
       limit 1;

      /*
       * Só anda quem está na PRIMEIRA etapa. É a guarda que carrega o peso.
       *
       * Sem ela: todo salto que pula a posição 2 é desfeito; o lead que a 114
       * cria já em "Perdido" seria ressuscitado ao receber uma resposta; e a
       * mensagem atrasada, que reescreve `first_contact_at` para trás, arrancaria
       * de "Proposta" um lead que já andou.
       */
      if v_etapa is not distinct from v_primeira then
        /*
         * O destino sai da CHAVE, nunca de `position = 2`.
         *
         * `(organization_id, key)` é a única unicidade da tabela (001); o índice
         * de posição não é único. E a organização é nomeada porque esta função é
         * `security definer` — sem ela, a etapa da casa errada.
         *
         * `is_active` porque lead em etapa inativa não cai em coluna nenhuma do
         * quadro e deixa o seletor da ficha em branco. `not is_lost and not
         * is_won` porque um destino desses seria mover o lead para o fim do funil
         * sozinho. `position > v_pos` porque uma casa que reordenou as etapas não
         * pode ter o cartão puxado para trás.
         */
        select s.id
          into v_destino
          from public.pipeline_stages s
         where s.organization_id = v_org
           and s.key = 'em_atendimento'
           and s.is_active
           and not s.is_lost
           and not s.is_won
           and s.position > v_pos;

        /*
         * UPDATE próprio, NOMEANDO `stage_id` no SET — nunca `new.stage_id := `.
         *
         * `leads_marca_avanco` é `before update OF stage_id`, e o `update of`
         * olha a lista do SET do comando. Assim `furthest_position` sobe por
         * `greatest`, `stage_changed_at` é carimbado e a linha "Novo → Em
         * atendimento" entra no histórico — os três de graça, pelos gatilhos que
         * já existem.
         */
        if v_destino is not null then
          update public.leads
             set stage_id = v_destino
           where id = v_lead
             and stage_id = v_primeira;
        end if;
      end if;
    exception when others then
      /*
       * O cartão não andou. A mensagem do cliente entra assim mesmo.
       *
       * Esta função é AFTER INSERT na mesma transação da mensagem, e até aqui ela
       * não tinha bloco de exceção nenhum: qualquer erro novo deixaria de ser "o
       * cartão não andou" e viraria "a mensagem sumiu".
       */
      raise warning 'cartao nao andou (mensagem %, lead %): %', new.id, v_lead, sqlerrm;
    end;
  end if;

  return new;
end $fn$;


--
-- Name: FUNCTION tg_lead_primeiro_contato(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.tg_lead_primeiro_contato() IS 'Carimba o primeiro contato e tira o lead da primeira etapa quando GENTE responde. Nunca derruba a mensagem.';


--
-- Name: tg_lead_qualificacao(); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.tg_lead_qualificacao()
returns trigger
language plpgsql
set search_path = public
as $fn$
declare
  v_resumo text;
  v_titulo text;
  v_origem text;
  v_perdeu boolean;
  v_quem   uuid[];
begin
  if  new.finalidade         is not distinct from old.finalidade
  and new.prazo_compra       is not distinct from old.prazo_compra
  and new.encaixe_financeiro is not distinct from old.encaixe_financeiro
  and new.temperatura_manual is not distinct from old.temperatura_manual then
    return null;
  end if;

  v_resumo := concat_ws(' · ',
    case new.finalidade
      when 'morar'              then 'Morar'
      when 'investir'           then 'Investir'
      when 'segunda_residencia' then 'Segunda residência'
      when 'avaliando'          then 'Ainda avaliando'
    end,
    case new.prazo_compra
      when 'ate_30_dias'     then 'Nos próximos 30 dias'
      when 'de_1_a_3_meses'  then 'De 1 a 3 meses'
      when 'de_3_a_6_meses'  then 'De 3 a 6 meses'
      when 'mais_de_6_meses' then 'Daqui a mais de 6 meses'
      when 'pesquisando'     then 'Só pesquisando'
    end,
    case new.encaixe_financeiro
      when 'cabe'          then 'Entrada e parcelas cabem'
      when 'precisa_prazo' then 'Precisa de mais prazo'
      when 'depende_banco' then 'Depende de financiamento bancário'
    end);

  v_titulo := 'Qualificação: ' || case new.temperatura
      when 'quente' then 'quente'
      when 'morno'  then 'morno'
      when 'frio'   then 'frio'
      else 'incompleta'
    end;

  if new.temperatura_manual is not null then
    v_titulo := v_titulo || ' (marcada à mão)';
  end if;

  v_origem := coalesce(
    nullif(current_setting('app.qualificacao_origem', true), ''),
    case when auth.uid() is null then 'sistema' else 'ficha' end);

  -- "Investir" anotado pelo corretor depois de dez minutos de conversa e
  -- "investir" de um toque num botão do anúncio não valem a mesma coisa. Quando
  -- não foi a ficha, a linha diz de onde veio.
  v_resumo := concat_ws(' · ',
    nullif(v_resumo, ''),
    case v_origem
      when 'whatsapp'        then 'lido da mensagem do WhatsApp'
      when 'landing'         then 'respondido na landing page'
      when 'formulario_meta' then 'respondido no formulário da Meta'
    end);

  perform public.log_timeline_event(
    new.id, 'lead', 'qualificacao', v_titulo, nullif(v_resumo, ''),
    jsonb_build_object(
      'origem',             v_origem,
      'finalidade',         new.finalidade,
      'prazo_compra',       new.prazo_compra,
      'encaixe_financeiro', new.encaixe_financeiro,
      'temperatura_manual', new.temperatura_manual,
      'temperatura_regra',  new.temperatura_regra,
      'temperatura',        new.temperatura));

  /*
   * E, quando o lead ESQUENTA, alguém fica sabendo.
   *
   * Só na virada: `old.temperatura` diferente de quente. Sem isso, cada retoque
   * numa ficha já quente vira um aviso novo, e a caixa de avisos ensina a ser
   * ignorada — que é a morte silenciosa de qualquer sino.
   */
  if new.temperatura = 'quente' and old.temperatura is distinct from 'quente' then
    begin
      select s.is_lost or s.is_won into v_perdeu
        from public.pipeline_stages s where s.id = new.stage_id;

      -- Lead fechado ou perdido que esquenta é correção de cadastro, não
      -- oportunidade nova.
      if not coalesce(v_perdeu, false) then
        /*
         * Quem marcou não recebe aviso de si mesmo — o princípio da 074. Quem
         * acabou de preencher a ficha já sabe o que preencheu; quem precisa
         * saber é o resto de quem acompanha.
         */
        select array_agg(p) into v_quem
          from unnest(array(select public.notification_audience(
                 new.organization_id, new.id, new.assigned_to))) p
         where auth.uid() is null or p is distinct from auth.uid();

        if coalesce(array_length(v_quem, 1), 0) > 0 then
          perform public.create_notification(
            new.organization_id,
            v_quem,
            'lead_quente',
            new.full_name,
            coalesce(nullif(v_resumo, ''), 'Qualificação preenchida'),
            '/leads/' || new.id,
            'lead', new.id,
            auth.uid());
        end if;
      end if;
    exception when others then
      -- A 113 outra vez: o aviso pode falhar, a qualificação tem de gravar.
      raise warning 'aviso de lead quente nao saiu (lead %): %', new.id, sqlerrm;
    end;
  end if;

  return null;
end $fn$;


--
-- Name: FUNCTION tg_lead_qualificacao(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.tg_lead_qualificacao() IS 'Escreve a qualificacao no historico e avisa quem acompanha quando o lead vira quente.';


--
-- Name: tg_lead_stage_change(); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.tg_lead_stage_change()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_de   text;
  v_para text;
begin
  if new.stage_id is distinct from old.stage_id then
    new.stage_changed_at := now();

    -- O primeiro contato é o momento em que o lead sai da primeira etapa.
    if new.first_contact_at is null
       and exists (select 1 from public.pipeline_stages where id = old.stage_id and position = 1) then
      new.first_contact_at := now();
    end if;

    select label into v_de   from public.pipeline_stages where id = old.stage_id;
    select label into v_para from public.pipeline_stages where id = new.stage_id;

    perform public.log_timeline_event(
      new.id, 'etapa', 'stage_changed',
      coalesce(v_de, '?') || ' → ' || coalesce(v_para, '?'),
      null,
      jsonb_build_object('de', v_de, 'para', v_para)
    );
  end if;
  return new;
end $$;


--
-- Name: tg_mantem_um_admin(); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.tg_mantem_um_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_restantes integer;
begin
  if old.is_active and not new.is_active then
    select count(*) into v_restantes
      from public.user_roles ur
      join public.profiles p on p.id = ur.user_id
     where ur.organization_id = new.organization_id
       and ur.role = 'admin'
       and p.is_active
       and p.id <> new.id;

    if v_restantes = 0 and exists (
      select 1 from public.user_roles ur
       where ur.user_id = new.id
         and ur.organization_id = new.organization_id
         and ur.role = 'admin'
    ) then
      raise exception 'Esta é a última conta de administrador ativa — promova outra antes de desativá-la'
        using errcode = 'insufficient_privilege';
    end if;
  end if;
  return new;
end $$;


--
-- Name: tg_mensagem_qualifica(); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.tg_mensagem_qualifica()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_porta   text;
  v_final   text;
  v_prazo   text;
  v_encaixe text;
  v_lead    uuid;
begin
  v_porta := public.porta_da_mensagem(new.raw, new.ref_code);
  if v_porta is null then
    return null;
  end if;

  v_final   := public.finalidade_do_texto(new.body);
  v_prazo   := public.prazo_do_texto(new.body);
  v_encaixe := public.encaixe_do_texto(new.body);

  if v_final is null and v_prazo is null and v_encaixe is null then
    return null;
  end if;

  v_lead := coalesce(
    new.lead_id,
    (select c.lead_id from public.whatsapp_conversations c where c.id = new.conversation_id));

  perform public.lead_preencher_qualificacao(v_lead, v_porta, v_final, v_prazo, v_encaixe);
  return null;
exception when others then
  raise warning 'qualificacao nao lida (mensagem %): %', new.id, sqlerrm;
  return null;
end $fn$;


--
-- Name: FUNCTION tg_mensagem_qualifica(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.tg_mensagem_qualifica() IS 'Le finalidade, prazo e encaixe da mensagem que chega, quando ela tem prova de origem.';


--
-- Name: tg_mensagem_sem_credencial(); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.tg_mensagem_sem_credencial()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.raw := public.sem_credencial(new.raw);
  return new;
end $$;


--
-- Name: tg_nao_desativa_a_si(); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.tg_nao_desativa_a_si()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null
     and new.id = auth.uid()
     and old.is_active and not new.is_active then
    raise exception 'Você não pode desativar a própria conta'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;


--
-- Name: tg_notify_lead_novo(); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.tg_notify_lead_novo()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  /*
   * Duas rotas nascem caladas, pelo mesmo motivo: nenhuma delas é alguém
   * chegando agora.
   *
   *   importacao_lote     — cem leads de uma vez viram cem avisos, e a caixa
   *                         de notificação vira o lugar que ninguém abre.
   *   reconciliacao_meta  — lançamento contábil de conversa que já aconteceu
   *                         fora daqui. Avisar pediria ação sobre uma linha
   *                         que não tem telefone para ligar.
   */
  if new.entry_point in ('importacao_lote', 'reconciliacao_meta') then
    return new;
  end if;

  perform public.create_notification(
    new.organization_id,
    array(select public.notification_audience(new.organization_id, new.id, new.assigned_to)),
    'lead_novo',
    'Novo lead: ' || new.full_name,
    case when new.ft_utm_campaign is not null
         then 'Campanha: ' || new.ft_utm_campaign
         else 'Origem: ' || coalesce(new.entry_point, new.source::text) end,
    '/leads/' || new.id,
    'lead', new.id, null);

  return new;
end $fn$;


--
-- Name: tg_perfil_nao_troca_de_org(); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.tg_perfil_nao_troca_de_org()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Sem `auth.uid()` é o papel de serviço: cron, edge function, migration. Ele
  -- semeia a primeira conta e precisa passar, como em `tg_so_admin_cria_admin`.
  if auth.uid() is null then
    return new;
  end if;

  if new.organization_id is distinct from old.organization_id then
    raise exception 'O vínculo com a imobiliária não se troca por aqui'
      using errcode = 'insufficient_privilege';
  end if;

  -- O `id` é a mesma história: ele é a chave para `auth.users` e é o que
  -- `auth.uid()` compara. Reescrevê-lo seria assumir a linha de outra pessoa.
  if new.id is distinct from old.id then
    raise exception 'O identificador do perfil não muda'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end $$;


--
-- Name: tg_preferencia_ao_nascer(); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.tg_preferencia_ao_nascer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notification_preferences (profile_id, organization_id, lead_scope)
  values (
    new.user_id,
    new.organization_id,
    case new.role::text
      when 'admin'   then 'nenhum'
      when 'gerente' then 'todos'
      else 'meus'
    end
  )
  -- Só o primeiro papel semeia. Trocar de papel depois NÃO reescreve a
  -- preferência: se o gerente escolheu receber só os leads dele, virar admin e
  -- voltar não pode desfazer essa escolha por baixo.
  on conflict (profile_id) do nothing;

  return new;
end $$;


--
-- Name: tg_prefs_limita_alcance(); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.tg_prefs_limita_alcance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_papel text;
begin
  select ur.role::text into v_papel
    from public.user_roles ur
   where ur.user_id = new.profile_id
     and ur.organization_id = new.organization_id
   order by case ur.role::text
              when 'admin' then 3 when 'gerente' then 2 else 1 end desc
   limit 1;

  if coalesce(v_papel, 'corretor') = 'corretor' and new.lead_scope = 'todos' then
    raise exception 'Corretor não pode receber aviso de todos os leads (papel: %)', v_papel
      using errcode = 'check_violation';
  end if;

  return new;
end $$;


--
-- Name: tg_property_slug(); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.tg_property_slug()
returns trigger
language plpgsql
set search_path = public
as $$
declare v_desejado text;
begin
  v_desejado := left(public.slugify(public.titulo_publico(
                  new.public_title, new.property_type, new.bedrooms,
                  new.neighborhood, new.city)), 70)
                || '-' || lower(new.public_code);

  /*
   * A URL é PEGAJOSA de propósito.
   *
   * Ela só muda quando alguém mexe no nome público — que é uma decisão
   * deliberada. Corrigir o número de dormitórios, o bairro ou o tipo NÃO move
   * a URL: um anúncio pago apontando para o endereço antigo continuaria
   * funcionando por causa do histórico, mas a métrica da página se partiria em
   * duas no meio da campanha, e ninguém entenderia por quê.
   */
  if new.slug is null then
    new.slug := v_desejado;

  elsif tg_op = 'UPDATE'
        and new.public_title is distinct from old.public_title
        and new.slug = old.slug then
    -- Nome público mudou de propósito: a URL acompanha, e a antiga fica
    -- registrada para o anúncio que já está rodando continuar abrindo.
    insert into public.property_slug_history (organization_id, property_id, old_slug)
    values (old.organization_id, old.id, old.slug)
    on conflict (organization_id, old_slug) do nothing;

    new.slug := v_desejado;
  end if;

  -- Carimba a publicação na primeira vez que o imóvel vai ao ar.
  if new.is_published and new.published_at is null then
    new.published_at := now();
  end if;

  return new;
end $$;


--
-- Name: tg_saida_automatica_so_para_lead(); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.tg_saida_automatica_so_para_lead()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_estado text;
begin
  -- Pedido por uma PESSOA passa direto. A conversa é do corretor, e ele fala com
  -- quem quiser — inclusive na conversa pessoal dele, que é dele.
  if new.requested_by is not null then
    return new;
  end if;

  v_estado := public.wa_estado_da_conversa(new.conversation_id);

  if v_estado is distinct from 'lead' then
    raise exception
      'Resposta automatica recusada: a conversa % esta como "%", e automatico so fala onde a origem foi comprovada',
      new.conversation_id, coalesce(v_estado, 'desconhecida')
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end $fn$;


--
-- Name: tg_so_admin_cria_admin(); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.tg_so_admin_cria_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_alvo   text := new.role::text;
  v_antigo text := case when tg_op = 'UPDATE' then old.role::text else null end;
begin
  -- O papel de serviço (cron, edge function com service_role) não tem auth.uid()
  -- e precisa poder semear a primeira conta. Quem chega pela API autenticada
  -- sempre tem.
  if auth.uid() is null then
    return new;
  end if;

  -- Só interessa quando 'admin' entra ou sai da jogada.
  if v_alvo <> 'admin' and coalesce(v_antigo, '') <> 'admin' then
    return new;
  end if;

  if not exists (
    select 1 from public.user_roles ur
     where ur.user_id = auth.uid()
       and ur.organization_id = new.organization_id
       and ur.role = 'admin'
  ) then
    raise exception 'Só um administrador pode conceder ou remover o papel de administrador'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end $$;


--
-- Name: tg_so_o_dono_torna_pessoal(); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.tg_so_o_dono_torna_pessoal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Papel de serviço: processamento da caixa de entrada, cron, edge function.
  if auth.uid() is null then
    return new;
  end if;

  if new.classification is distinct from old.classification then
    if not exists (
      select 1 from public.whatsapp_instances i
       where i.id = new.instance_id
         and i.owner_id = (select auth.uid())
    ) then
      raise exception 'Só quem conectou este número classifica as conversas dele'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  return new;
end $$;


--
-- Name: tg_visit_carimbos(); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.tg_visit_carimbos()
returns trigger
language plpgsql
as $$
begin
  if new.status is distinct from old.status then
    if new.status = 'confirmada' and new.confirmed_at is null then
      new.confirmed_at := now();
    end if;
    if new.status in ('realizada','nao_compareceu','cancelada') and new.closed_at is null then
      new.closed_at := now();
    end if;
  end if;
  return new;
end $$;


--
-- Name: tg_visit_cria_lembrete(); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.tg_visit_cria_lembrete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.assigned_to is null then
    return new;
  end if;

  insert into public.lead_reminders
    (organization_id, lead_id, assigned_to, visit_id, title, body, remind_at, created_by)
  values
    (new.organization_id, new.lead_id, new.assigned_to, new.id,
     'Visita em 2 horas',
     (select title from public.properties where id = new.property_id),
     new.starts_at - interval '2 hours',
     new.created_by);

  return new;
end $$;


--
-- Name: tg_visit_timeline(); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.tg_visit_timeline()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quando text;
  v_imovel text;
begin
  select title into v_imovel from public.properties where id = new.property_id;

  v_quando := to_char(new.starts_at at time zone 'America/Sao_Paulo', 'DD/MM/YYYY') ||
              ' às ' ||
              to_char(new.starts_at at time zone 'America/Sao_Paulo', 'HH24:MI');

  if tg_op = 'INSERT' then
    perform public.log_timeline_event(
      new.lead_id, 'visita', 'visita_agendada', 'Visita agendada',
      coalesce(v_imovel || ' — ', '') || v_quando,
      jsonb_build_object('visit_id', new.id, 'starts_at', new.starts_at,
                         'property_id', new.property_id)
    );
    return new;
  end if;

  if new.status is distinct from old.status then
    perform public.log_timeline_event(
      new.lead_id, 'visita', 'visita_' || new.status,
      case new.status
        when 'confirmada'     then 'Visita confirmada'
        when 'realizada'      then 'Visita realizada'
        when 'nao_compareceu' then 'Lead não compareceu'
        when 'cancelada'      then 'Visita cancelada'
        else 'Visita atualizada'
      end,
      case new.status
        when 'cancelada' then coalesce(new.cancel_reason, v_quando)
        when 'realizada' then coalesce(new.outcome_notes, v_quando)
        else v_quando
      end,
      jsonb_build_object('visit_id', new.id, 'starts_at', new.starts_at,
                         'de', old.status, 'para', new.status)
    );
  end if;

  return new;
end $$;


--
-- Name: tg_whatsapp_respeita_teto(); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.tg_whatsapp_respeita_teto()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_teto  smallint;
  v_atual integer;
begin
  perform pg_advisory_xact_lock(hashtext(new.organization_id::text || ':wa_provision'));

  select whatsapp_instance_limit into v_teto
    from public.organizations where id = new.organization_id;

  select count(*) into v_atual
    from public.whatsapp_instances where organization_id = new.organization_id;

  if v_atual >= coalesce(v_teto, 5) then
    raise exception 'Limite de % número(s) de WhatsApp atingido para esta imobiliária', v_teto
      using errcode = 'check_violation';
  end if;

  return new;
end $$;


--
-- Name: tg_whatsapp_um_por_corretor(); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.tg_whatsapp_um_por_corretor()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_gestao boolean;
  v_tem    integer;
begin
  if new.owner_id is null then
    return new;
  end if;

  select exists (
    select 1 from public.user_roles
     where user_id = new.owner_id
       and organization_id = new.organization_id
       and role in ('admin', 'gerente')
  ) into v_gestao;

  if v_gestao then
    return new;
  end if;

  -- O mesmo `pg_advisory_xact_lock` da 010 já está segurando esta transação por
  -- organização, então dois cliques simultâneos não passam os dois.
  select count(*) into v_tem
    from public.whatsapp_instances
   where organization_id = new.organization_id
     and owner_id = new.owner_id;

  if v_tem >= 1 then
    raise exception 'Cada corretor conecta um número. Para trocar, desconecte o atual primeiro.'
      using errcode = 'check_violation';
  end if;

  return new;
end $fn$;


--
-- Name: tipo_da_mensagem(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.tipo_da_mensagem(_msg jsonb)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $fn$
  select case
    /*
     * `mediaType` primeiro: é o campo que o provedor preenche de verdade.
     * `collection` é álbum de fotos; `gif` chega como vídeo curto.
     */
    when m in ('image', 'collection')  then 'imagem'
    when m in ('ptt', 'audio')         then 'audio'
    when m in ('video', 'gif')         then 'video'
    when m = 'document'                then 'documento'
    when m like '%sticker%'            then 'figurinha'
    when m = 'vcard'                   then 'contato'
    when m = 'location'                then 'local'

    /*
     * Sem `mediaType`, a classe da mensagem. São 38 imagens no banco que
     * chegaram assim, e sem esta metade elas continuariam invisíveis.
     */
    when t = 'imagemessage'    then 'imagem'
    when t = 'audiomessage'    then 'audio'
    when t = 'videomessage'    then 'video'
    when t = 'documentmessage' then 'documento'
    when t = 'stickermessage'  then 'figurinha'
    when t = 'contactmessage'  then 'contato'
    when t = 'locationmessage' then 'local'

    /*
     * Todo o resto é texto, e isso inclui `url` — prévia de link numa mensagem
     * escrita. São 417 no banco; tratá-las como arquivo encheria a fila de
     * download com pedidos que nunca teriam resposta.
     */
    else 'texto'
  end
  from (
    /*
     * `nullif` antes do `coalesce`, e não é firula: o provedor manda
     * `mediaType` como STRING VAZIA, não como ausente. Sem o `nullif`, um
     * `coalesce(mediaType, messageType)` devolve a string vazia e engole o
     * campo seguinte — foi assim que a conferência do ensaio acusou 55
     * mensagens de mídia como "sem sinal nenhum no envelope".
     *
     * `type` fica por último e hoje não resolve nada: medido no banco, ele só
     * vale 'text', 'media', 'reaction' e 'poll' — categoria grossa, que não
     * nomeia tipo nenhum. Fica porque é de graça e porque o provedor pode
     * passar a preenchê-lo.
     */
    select lower(coalesce(nullif(_msg->>'mediaType', ''), '')) as m,
           lower(coalesce(nullif(_msg->>'messageType', ''),
                          nullif(_msg->>'type', ''), '')) as t
  ) campos
$fn$;


--
-- Name: FUNCTION tipo_da_mensagem(_msg jsonb); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.tipo_da_mensagem(_msg jsonb) IS 'O tipo de uma mensagem do WhatsApp: mediaType primeiro, classe da mensagem depois, texto no resto.';


--
-- Name: titulo_publico(text, text, integer, text, text); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.titulo_publico(
  _public_title text,
  _tipo text,
  _quartos integer,
  _bairro text,
  _cidade text
)
returns text
language sql
immutable
set search_path = public
as $$
  select coalesce(
    nullif(trim(_public_title), ''),
    nullif(trim(
      initcap(replace(coalesce(_tipo, 'imóvel'), '_', ' ')) ||
      case when coalesce(_quartos, 0) > 0
           then ' ' || _quartos || ' dormitório' || case when _quartos > 1 then 's' else '' end
           else '' end ||
      coalesce(' · ' || nullif(trim(_bairro), ''), ' · ' || nullif(trim(_cidade), ''), '')
    ), ''),
    'Imóvel'
  );
$$;


--
-- Name: to_base36(bigint); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.to_base36(_n bigint)
returns text
language plpgsql
immutable
as $$
declare
  chars constant text := '0123456789abcdefghijklmnopqrstuvwxyz';
  out   text := '';
  n     bigint := _n;
begin
  if n = 0 then return '0'; end if;
  while n > 0 loop
    out := substr(chars, (n % 36)::int + 1, 1) || out;
    n := n / 36;
  end loop;
  return out;
end $$;


--
-- Name: touch_lead_attribution(uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.touch_lead_attribution(_lead_id uuid, _attr jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_when timestamptz := coalesce((_attr->>'occurred_at')::timestamptz, now());
  v_var  char(1)     := nullif(_attr->>'variant','')::char(1);
begin
  update public.leads l
     set lt_landing_page_id = coalesce((_attr->>'landing_page_id')::uuid, l.lt_landing_page_id),
         lt_variant         = coalesce(v_var, l.lt_variant),
         lt_meta_ad_id      = coalesce(nullif(_attr->>'meta_ad_id',''), l.lt_meta_ad_id),
         lt_occurred_at     = v_when,

         ft_landing_page_id = case when v_when < coalesce(l.ft_occurred_at, 'infinity'::timestamptz)
                                   then coalesce((_attr->>'landing_page_id')::uuid, l.ft_landing_page_id)
                                   else l.ft_landing_page_id end,
         ft_variant         = case when v_when < coalesce(l.ft_occurred_at, 'infinity'::timestamptz)
                                   then coalesce(v_var, l.ft_variant) else l.ft_variant end,
         ft_occurred_at     = least(coalesce(l.ft_occurred_at, v_when), v_when),

         variants_seen      = case when v_var is null or v_var = any(l.variants_seen)
                                   then l.variants_seen else l.variants_seen || v_var end,
         gclid              = coalesce(l.gclid,  nullif(_attr->>'gclid','')),
         fbclid             = coalesce(l.fbclid, nullif(_attr->>'fbclid',''))
   where l.id = _lead_id;

  -- Viu mais de uma variante: sai da leitura do experimento. Melhor um lead
  -- de fora do que um resultado contaminado decidindo onde vai o orçamento.
  update public.leads
     set ab_contaminated = true
   where id = _lead_id and array_length(variants_seen, 1) > 1;
end $$;


--
-- Name: vault_apagar(uuid); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.vault_apagar(_id uuid)
returns void
language sql
security definer
set search_path = public, vault
as $$
  delete from vault.secrets where id = _id;
$$;


--
-- Name: vault_guardar(text, text); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.vault_guardar(_nome text, _valor text)
returns uuid
language plpgsql
security definer
set search_path = public, vault
as $$
declare v_id uuid;
begin
  -- Nome repetido substitui o valor em vez de criar um segredo órfão: rotacionar
  -- token não pode deixar rastro decifrável para trás.
  select id into v_id from vault.secrets where name = _nome;

  if v_id is null then
    select vault.create_secret(_valor, _nome) into v_id;
  else
    perform vault.update_secret(v_id, _valor);
  end if;

  return v_id;
end $$;


--
-- Name: vault_ler(uuid); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.vault_ler(_id uuid)
returns text
language sql
security definer
set search_path = public, vault
as $$
  select decrypted_secret from vault.decrypted_secrets where id = _id;
$$;


--
-- Name: ve_a_carteira_toda(); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.ve_a_carteira_toda()
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select public.is_admin_or_above((select public.current_org_id()));
$fn$;


--
-- Name: FUNCTION ve_a_carteira_toda(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.ve_a_carteira_toda() IS 'Quem enxerga os leads de toda a imobiliaria: admin e gerente. Corretor ve so a propria carteira.';


--
-- Name: visit_conflicts(uuid, timestamp with time zone, timestamp with time zone, uuid); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.visit_conflicts(
  _assigned_to uuid,
  _starts_at   timestamptz,
  _ends_at     timestamptz,
  _ignore_id   uuid default null
)
returns table (
  o_visit_id   uuid,
  o_starts_at  timestamptz,
  o_ends_at    timestamptz,
  o_lead_name  text
)
language sql
stable
security invoker
set search_path = public
as $$
  select v.id, v.starts_at, v.ends_at, l.full_name
    from public.visits v
    join public.leads l on l.id = v.lead_id
   where v.assigned_to = _assigned_to
     and v.status in ('agendada','confirmada')
     and (_ignore_id is null or v.id <> _ignore_id)
     and tstzrange(v.starts_at, v.ends_at) && tstzrange(_starts_at, _ends_at)
   order by v.starts_at;
$$;


--
-- Name: wa_classificar_conversa(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.wa_classificar_conversa(
  _conversa uuid,
  _classificacao text default null
)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_org  uuid := public.current_org_id();
  v_lead uuid;
begin
  if _classificacao is not null and _classificacao not in ('lead','pessoal') then
    raise exception 'classificação inválida: %', _classificacao;
  end if;

  -- A organização vem do perfil de quem chamou, nunca do parâmetro. O `where`
  -- é o que impede classificar a conversa de outra imobiliária com um id
  -- adivinhado — a RLS já barraria, mas defesa que depende de uma camada só
  -- é defesa que some quando alguém mexe naquela camada.
  update public.whatsapp_conversations
     set classification = _classificacao, updated_at = now()
   where id = _conversa and organization_id = v_org
  returning lead_id into v_lead;

  if not found then
    raise exception 'conversa não encontrada';
  end if;

  if v_lead is not null then
    update public.leads
       set excluded_at = case when _classificacao = 'pessoal' then now() else null end
     where id = v_lead and organization_id = v_org;
  end if;

  return coalesce(_classificacao, 'automático');
end $$;


--
-- Name: wa_e_pessoal(text, boolean); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.wa_e_pessoal(_classification text, _is_group boolean)
returns boolean
language sql
immutable
as $$
  select coalesce(_classification = 'pessoal', false)
      or (_classification is null and coalesce(_is_group, false));
$$;


--
-- Name: FUNCTION wa_e_pessoal(_classification text, _is_group boolean); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.wa_e_pessoal(_classification text, _is_group boolean) IS 'Pessoal: marcada à mão, ou grupo que ninguém classificou. Nunca devolve nulo — a view e a policy usam esta mesma função.';


--
-- Name: wa_estado_da_conversa(uuid); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.wa_estado_da_conversa(_conv uuid)
returns text
language sql
stable
set search_path = public
as $fn$
  select case
           when public.wa_e_pessoal(c.classification, c.is_group) then 'pessoal'
           when public.wa_tem_origem(l.source, l.ft_meta_ad_id, l.ft_landing_page_id,
                                     l.ft_utm_source, c.ref_code, c.property_id) then 'lead'
           else 'sem_origem'
         end
    from public.whatsapp_conversations c
    left join public.leads l on l.id = c.lead_id
   where c.id = _conv;
$fn$;


--
-- Name: FUNCTION wa_estado_da_conversa(_conv uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.wa_estado_da_conversa(_conv uuid) IS 'A UNICA definicao de lead/sem_origem/pessoal. A view e a trava do agente leem daqui.';


--
-- Name: wa_numero_resumo(uuid); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.wa_numero_resumo(_instancia uuid)
returns table (rotulo text, estado text, e_meu boolean)
language sql
stable
security definer
set search_path = public
as $fn$
  select i.label,
         i.status,
         i.owner_id = (select auth.uid())
    from public.whatsapp_instances i
   where i.id = _instancia
     -- A fronteira que continua valendo: nome e estado de número de OUTRA
     -- imobiliária não saem daqui de jeito nenhum.
     and i.organization_id = (select public.current_org_id());
$fn$;


--
-- Name: FUNCTION wa_numero_resumo(_instancia uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.wa_numero_resumo(_instancia uuid) IS 'Rotulo e estado do numero, para a conversa saber se da para responder. Nao devolve telefone.';


--
-- Name: wa_tem_origem(text, text, uuid, text, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.wa_tem_origem(
  _source text,
  _ft_meta_ad_id text,
  _ft_landing_page_id uuid,
  _ft_utm_source text,
  _ref_code text,
  _property_id uuid
)
returns boolean
language sql
immutable
security invoker
set search_path = public
as $$
  select _ft_meta_ad_id is not null
      or _ft_landing_page_id is not null
      or nullif(_ft_utm_source, '') is not null
      or nullif(_ref_code, '') is not null
      or _property_id is not null
      or _source in ('meta_ads','google_ads','landing_page','link_bio',
                     'instagram','facebook','portal','indicacao','placa');
$$;


--
-- Name: whatsapp_alarmes(); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.whatsapp_alarmes()
returns table (
  id            uuid,
  label         text,
  telefone      text,
  status        text,
  desde         timestamptz,
  e_meu         boolean
)
language sql
stable
security definer
set search_path = public
as $fn$
  select i.id,
         coalesce(i.label, i.connected_phone_e164, 'Número sem nome'),
         i.connected_phone_e164,
         i.status,
         -- Desde quando está fora. `last_seen_at` é o último sinal de vida; sem
         -- ele, a data em que a linha mudou pela última vez.
         coalesce(i.last_seen_at, i.updated_at),
         i.owner_id = (select auth.uid())
    from public.whatsapp_instances i
   where i.organization_id = (select public.current_org_id())
     and i.status in ('desconectada', 'erro', 'credenciada_offline')
     /*
      * Quem vê: o DONO do número, e a gestão.
      *
      * Corretor não precisa saber que o número de outro corretor caiu — é a
      * mesma disciplina da 086, em que o celular é de quem atende. Mas a
      * gestão precisa, porque é ela que decide pausar a verba.
      */
     and (i.owner_id = (select auth.uid())
          or public.is_admin_or_above((select public.current_org_id())))
   order by coalesce(i.last_seen_at, i.updated_at);
$fn$;


--
-- Name: FUNCTION whatsapp_alarmes(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.whatsapp_alarmes() IS 'Números fora do ar que o chamador pode ver. Vazio é o estado bom.';


--
-- Name: whatsapp_drenar_saida(); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.whatsapp_drenar_saida()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_segredo text;
  v_url     text;
begin
  select decrypted_secret into v_segredo
    from vault.decrypted_secrets where name = 'whatsapp_cron_secret';

  if v_segredo is null then
    raise exception 'whatsapp_cron_secret ausente no Vault — o envio está parado';
  end if;

  select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'functions_base_url';

  if v_url is null then
    raise exception 'functions_base_url ausente no Vault';
  end if;

  /*
   * 25 segundos, declarados.
   *
   * O padrão do `pg_net` é 5 s, e ele bastou enquanto o trabalhador só enviava
   * mensagem. Desde a 125 ele também baixa mídia, e um vídeo de 9 MB não cabe
   * em cinco segundos — a chamada morria no meio e a fila nunca andava.
   *
   * Vinte e cinco, e não sessenta: o `cron` chama de minuto em minuto, e um
   * limite maior que o intervalo empilha execuções que disputam as mesmas
   * linhas. Fica abaixo do intervalo de propósito.
   */
  perform net.http_post(
    url     := v_url || '/whatsapp-trabalhador',
    headers := jsonb_build_object('Content-Type','application/json','X-Cron-Secret', v_segredo),
    body    := '{}'::jsonb,
    timeout_milliseconds := 25000);
end $$;


--
-- Name: FUNCTION whatsapp_drenar_saida(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.whatsapp_drenar_saida() IS 'Acorda o trabalhador do WhatsApp. 25s de espera: desde a 125 ele tambem baixa midia.';


--
-- Name: whatsapp_fotos_pendentes(integer); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.whatsapp_fotos_pendentes(_limite integer default 10)
returns table (
  id              uuid,
  organization_id uuid,
  foto_url        text,
  caminho_novo    text
)
language sql
stable
security definer
set search_path = public
as $fn$
  select c.id,
         c.organization_id,
         c.foto_url,
         split_part(c.foto_url, '?', 1)
    from public.whatsapp_conversations c
   where c.lead_id is not null
     and c.foto_url is not null
     -- Caminho igual ao guardado = mesma imagem, já está em casa.
     and split_part(c.foto_url, '?', 1) is distinct from c.foto_origem
     /*
      * Quem falhou não é tentado para sempre.
      *
      * Sem isto, uma conversa cuja foto some do CDN volta em toda rodada e
      * empurra as pendentes de verdade para fora do teto — a fila fica cheia
      * de um caso que nunca vai resolver.
      */
     and (c.foto_erro is null or c.foto_em < now() - interval '24 hours')
   order by c.foto_em nulls first, c.last_message_at desc nulls last
   limit greatest(1, least(_limite, 50));
$fn$;


--
-- Name: FUNCTION whatsapp_fotos_pendentes(_limite integer); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.whatsapp_fotos_pendentes(_limite integer) IS 'Conversas de LEAD cuja foto precisa ser copiada. Contato sem lead nunca entra aqui, por decisão de privacidade.';


--
-- Name: whatsapp_quem_avisar(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.whatsapp_quem_avisar(_org uuid, _dono uuid)
returns uuid[]
language sql
stable
security definer
set search_path = public
as $fn$
  select array_agg(distinct p.id)
    from public.profiles p
    left join public.user_roles ur
      on ur.user_id = p.id and ur.organization_id = p.organization_id
   where p.organization_id = _org
     and p.is_active
     and (ur.role::text in ('gerente', 'admin') or p.id = _dono);
$fn$;


--
-- Name: whatsapp_saude(integer); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.whatsapp_saude(_minutos integer default 5)
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  r    record;
  v_n  integer := 0;
begin
  /*
   * PORTA 1 — quem morreu calado.
   *
   * Estava `conectada` e parou de dar sinal. Vira `credenciada_offline`, que é
   * o estado que diz "as credenciais valem, o aparelho é que sumiu".
   */
  update public.whatsapp_instances i
     set status = 'credenciada_offline',
         last_error = 'Sem sinal do provedor há mais de ' || _minutos || ' min'
   where i.status = 'conectada'
     and (i.last_seen_at is null or i.last_seen_at < now() - make_interval(mins => _minutos));

  /*
   * PORTA 2 — quem está fora do ar, não importa como chegou lá.
   *
   * Inclui o que a porta 1 acabou de marcar E o que já estava `desconectada`
   * ou em `erro` por conta do provedor. Era este o buraco original: a instância
   * que declara a própria queda nunca passava pela porta 1, e portanto nunca
   * gerava aviso nenhum.
   *
   * `pareando` fica DE FORA de propósito: alguém está reconectando neste
   * instante, e avisar no meio da reconexão é ruído sobre uma coisa que já
   * está sendo resolvida.
   */
  for r in
    select i.*
      from public.whatsapp_instances i
     where i.status in ('desconectada', 'erro', 'credenciada_offline')
       /*
        * A TRAVA DO REPETECO.
        *
        * O cron roda a cada cinco minutos. Sem isto, um número caído no fim de
        * semana produziria seiscentos avisos até segunda — e a caixa de
        * notificação viraria exatamente o lugar que ninguém abre, que é o
        * problema que este alarme existe para resolver.
        *
        * Seis horas: perto o bastante para não deixar um dia inteiro passar em
        * silêncio, longe o bastante para o aviso continuar sendo notícia.
        */
       and not exists (
         select 1 from public.notifications n
          where n.related_entity_type = 'whatsapp_instance'
            and n.related_entity_id = i.id
            and n.type = 'whatsapp_fora'
            and n.created_at > now() - interval '6 hours'
       )
  loop
    /*
     * CADA UM NO SEU BLOCO.
     *
     * Sem isto, um erro em qualquer aviso derruba a transação inteira: os
     * outros números não são avisados e a marcação da porta 1 é desfeita. O
     * vigia precisa terminar a ronda mesmo tropeçando numa porta.
     *
     * O `warning` vai para o log do Postgres. Engolir em silêncio devolveria o
     * problema desta migração — algo que não funciona e não reclama.
     */
    begin
      perform public.create_notification(
        r.organization_id,
        public.whatsapp_quem_avisar(r.organization_id, r.owner_id),
        'whatsapp_fora',
        'WhatsApp fora do ar: ' || coalesce(r.label, r.connected_phone_e164, 'número'),
        /*
         * O corpo diz a CONSEQUÊNCIA, e essa é a mudança que importa.
         *
         * "Desconectado" é estado de sistema e não move ninguém. "Todo lead que
         * chegar está sendo perdido" é o que faz alguém largar o que está
         * fazendo — que é exatamente o que precisava ter acontecido ontem.
         */
        'Todo lead que chegar neste número está sendo perdido. Reconecte, ou pause as campanhas que apontam para ele.',
        '/configuracoes?aba=whatsapp',
        'whatsapp_instance', r.id,
        null);
      v_n := v_n + 1;
    exception when others then
      raise warning 'whatsapp_saude não conseguiu avisar sobre % (%): %',
        r.id, coalesce(r.label, '?'), sqlerrm;
    end;
  end loop;

  return v_n;
end $fn$;


--
-- Name: availability_blocks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.availability_blocks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    profile_id uuid,
    starts_at timestamp with time zone NOT NULL,
    ends_at timestamp with time zone NOT NULL,
    reason text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT availability_blocks_period_ck CHECK ((ends_at > starts_at))
);


--
-- Name: broker_availability; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.broker_availability (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    profile_id uuid NOT NULL,
    weekday smallint NOT NULL,
    starts_at time without time zone NOT NULL,
    ends_at time without time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT broker_availability_period_ck CHECK ((ends_at > starts_at)),
    CONSTRAINT broker_availability_weekday_ck CHECK (((weekday >= 0) AND (weekday <= 6)))
);


--
-- Name: document_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid,
    key text NOT NULL,
    name text NOT NULL,
    description text,
    icon text,
    body_html text NOT NULL,
    fields jsonb DEFAULT '[]'::jsonb NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    is_system boolean DEFAULT false NOT NULL,
    display_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    lead_id uuid,
    property_id uuid,
    template_id uuid,
    template_key text,
    title text NOT NULL,
    variables_used jsonb DEFAULT '{}'::jsonb NOT NULL,
    rendered_html text NOT NULL,
    with_letterhead boolean DEFAULT true NOT NULL,
    with_signature boolean DEFAULT true NOT NULL,
    created_by uuid,
    created_by_name text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: error_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.error_reports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid,
    user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    origem text NOT NULL,
    mensagem text NOT NULL,
    pilha text,
    rota text,
    agente text,
    tela text,
    versao text,
    rastro jsonb DEFAULT '[]'::jsonb NOT NULL,
    comentario text,
    resolvido_em timestamp with time zone,
    CONSTRAINT error_reports_origem_check CHECK ((origem = ANY (ARRAY['tela'::text, 'janela'::text, 'promessa'::text])))
);


--
-- Name: TABLE error_reports; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.error_reports IS 'Caixa-preta do CRM. Escrita só pela edge function `reportar-erro`; leitura só para gestor da organização.';


--
-- Name: COLUMN error_reports.organization_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.error_reports.organization_id IS 'Nulo quando o erro aconteceu sem sessão (tela de entrar). Esses só se leem pelo painel do Supabase.';


--
-- Name: landing_cidades; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.landing_cidades (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    cidade text NOT NULL,
    estado character(2) NOT NULL,
    locale text NOT NULL,
    chamada text,
    chamada_fonte text,
    argumento text,
    imagem_path text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    imagem_larga text,
    imagem_cena text,
    CONSTRAINT landing_cidades_fonte_ck CHECK (((chamada IS NULL) OR (chamada_fonte IS NOT NULL))),
    CONSTRAINT landing_cidades_locale_ck CHECK ((locale = ANY (ARRAY['pt-BR'::text, 'es'::text, 'en'::text])))
);


--
-- Name: COLUMN landing_cidades.imagem_path; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.landing_cidades.imagem_path IS 'Foto do herói — atrás do título. Precisa funcionar com texto branco por cima.';


--
-- Name: COLUMN landing_cidades.imagem_larga; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.landing_cidades.imagem_larga IS 'Foto da faixa, no meio da página. Aparece inteira, sem texto — pode ser a mais bonita.';


--
-- Name: COLUMN landing_cidades.imagem_cena; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.landing_cidades.imagem_cena IS 'Metade esquerda do herói dividido (Modelo C). Ampla e 16:9 — o lado direito fica sob o prédio.';


--
-- Name: landing_page_daily; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.landing_page_daily (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    landing_page_id uuid NOT NULL,
    date date NOT NULL,
    views bigint DEFAULT 0 NOT NULL,
    scroll_50 integer DEFAULT 0 NOT NULL,
    scroll_75 integer DEFAULT 0 NOT NULL,
    form_started integer DEFAULT 0 NOT NULL,
    whatsapp_tap integer DEFAULT 0 NOT NULL,
    quiz_started integer DEFAULT 0 NOT NULL
);


--
-- Name: COLUMN landing_page_daily.scroll_50; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.landing_page_daily.scroll_50 IS 'Sessões que passaram da metade da página. Uma por sessão, garantido no navegador.';


--
-- Name: COLUMN landing_page_daily.scroll_75; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.landing_page_daily.scroll_75 IS 'Sessões que chegaram a 75% — a antessala do formulário completo.';


--
-- Name: COLUMN landing_page_daily.form_started; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.landing_page_daily.form_started IS 'Sessões que tocaram em algum campo do formulário. Mede intenção, não envio.';


--
-- Name: COLUMN landing_page_daily.whatsapp_tap; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.landing_page_daily.whatsapp_tap IS 'Sessões que tocaram em algum botão de WhatsApp. Intenção, não conversa iniciada.';


--
-- Name: COLUMN landing_page_daily.quiz_started; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.landing_page_daily.quiz_started IS 'Sessoes que responderam a PRIMEIRA pergunta do quiz. Intencao, nao conclusao.';


--
-- Name: landing_pontos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.landing_pontos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    cidade text NOT NULL,
    estado character(2) NOT NULL,
    locale text NOT NULL,
    posicao integer DEFAULT 0 NOT NULL,
    titulo text NOT NULL,
    chamada text,
    texto text,
    fecho text,
    numeros jsonb DEFAULT '[]'::jsonb NOT NULL,
    imagens text[] DEFAULT '{}'::text[] NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT landing_pontos_loc_ck CHECK ((locale = ANY (ARRAY['pt-BR'::text, 'es'::text, 'en'::text]))),
    CONSTRAINT landing_pontos_num_ck CHECK ((jsonb_typeof(numeros) = 'array'::text))
);


--
-- Name: lead_exportacoes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lead_exportacoes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    exportado_por uuid,
    exportado_por_nome text,
    exportado_em timestamp with time zone DEFAULT now() NOT NULL,
    periodo_de date NOT NULL,
    periodo_ate date NOT NULL,
    responsavel uuid,
    etapa uuid,
    quantidade integer NOT NULL,
    CONSTRAINT lead_exportacoes_quantidade_check CHECK ((quantidade >= 0))
);


--
-- Name: lead_property_interests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lead_property_interests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    lead_id uuid NOT NULL,
    property_id uuid NOT NULL,
    is_primary boolean DEFAULT false NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: lead_reminders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lead_reminders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    lead_id uuid NOT NULL,
    assigned_to uuid NOT NULL,
    visit_id uuid,
    title text NOT NULL,
    body text,
    remind_at timestamp with time zone NOT NULL,
    status text DEFAULT 'pendente'::text NOT NULL,
    notified_at timestamp with time zone,
    completed_at timestamp with time zone,
    snooze_count integer DEFAULT 0 NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT lead_reminders_status_ck CHECK ((status = ANY (ARRAY['pendente'::text, 'notificado'::text, 'concluido'::text, 'cancelado'::text])))
);


--
-- Name: lead_timeline_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lead_timeline_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    lead_id uuid NOT NULL,
    category text NOT NULL,
    event_type text NOT NULL,
    title text NOT NULL,
    description text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    actor_user_id uuid,
    actor_label text,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT lead_timeline_category_ck CHECK ((category = ANY (ARRAY['lead'::text, 'etapa'::text, 'marketing'::text, 'visita'::text, 'mensagem'::text, 'documento'::text, 'tarefa'::text, 'sistema'::text])))
);


--
-- Name: limite_acessos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.limite_acessos (
    chave text NOT NULL,
    janela_inicio timestamp with time zone DEFAULT now() NOT NULL,
    n integer DEFAULT 0 NOT NULL
);


--
-- Name: TABLE limite_acessos; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.limite_acessos IS 'Contadores por janela para as portas públicas. Chave = rótulo da porta + hash do IP; o IP em claro nunca entra aqui.';


--
-- Name: meta_ad_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.meta_ad_accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    ad_account_id text NOT NULL,
    name text,
    currency character(3),
    timezone_name text,
    enabled boolean DEFAULT false NOT NULL,
    synced_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    integration_id uuid
);


--
-- Name: COLUMN meta_ad_accounts.integration_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.meta_ad_accounts.integration_id IS 'De qual conexao veio esta conta. E ela que diz qual token usar para buscar o gasto.';


--
-- Name: meta_ad_dimensions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.meta_ad_dimensions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    level text NOT NULL,
    object_id text NOT NULL,
    ad_account_id text NOT NULL,
    name text,
    objective text,
    destination_type text,
    effective_status text,
    permalink text,
    synced_at timestamp with time zone DEFAULT now() NOT NULL,
    conta_no_painel boolean DEFAULT true NOT NULL,
    budget_minor bigint,
    budget_kind text,
    bid_strategy text,
    property_id uuid,
    angulo text,
    page_id text,
    CONSTRAINT meta_ad_dimensions_angulo_ck CHECK (((angulo IS NULL) OR ((level = 'ad'::text) AND (angulo = ANY (ARRAY['dor'::text, 'desejo'::text, 'comparacao'::text, 'objecao'::text, 'curiosidade'::text]))))),
    CONSTRAINT meta_ad_dimensions_budget_ck CHECK (((budget_kind IS NULL) OR (budget_kind = ANY (ARRAY['diario'::text, 'total'::text])))),
    CONSTRAINT meta_ad_dimensions_lv_ck CHECK ((level = ANY (ARRAY['campaign'::text, 'adset'::text, 'ad'::text]))),
    CONSTRAINT meta_ad_dimensions_page_ck CHECK (((page_id IS NULL) OR (page_id ~ '^[0-9]{8,20}$'::text)))
);


--
-- Name: COLUMN meta_ad_dimensions.conta_no_painel; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.meta_ad_dimensions.conta_no_painel IS 'Falso = campanha fora do painel: nem o gasto dela soma, nem os leads dela contam. Nada e apagado.';


--
-- Name: COLUMN meta_ad_dimensions.budget_minor; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.meta_ad_dimensions.budget_minor IS 'Orçamento na unidade mínima da moeda da conta. Nulo = este nível não carrega orçamento (típico da campanha em ABO).';


--
-- Name: COLUMN meta_ad_dimensions.budget_kind; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.meta_ad_dimensions.budget_kind IS 'diario = daily_budget; total = lifetime_budget. Nulo quando não há orçamento neste nível.';


--
-- Name: COLUMN meta_ad_dimensions.property_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.meta_ad_dimensions.property_id IS 'Empreendimento que esta campanha anuncia. Preenchido À MÃO na tela — nunca inferido do nome.';


--
-- Name: COLUMN meta_ad_dimensions.angulo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.meta_ad_dimensions.angulo IS 'O argumento do criativo (dor, desejo, comparacao, objecao, curiosidade). Digitado na tela, nunca deduzido do nome. So no nivel ad.';


--
-- Name: COLUMN meta_ad_dimensions.page_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.meta_ad_dimensions.page_id IS 'A Página de onde o anúncio fala, extraída de creative.effective_object_story_id. A API de Conversões exige que ela seja a MESMA que gerou o ctwa_clid.';


--
-- Name: meta_ads_spend; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.meta_ads_spend (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    ad_account_id text NOT NULL,
    campaign_id text NOT NULL,
    adset_id text DEFAULT ''::text NOT NULL,
    ad_id text DEFAULT ''::text NOT NULL,
    date date NOT NULL,
    currency character(3) NOT NULL,
    report_timezone text NOT NULL,
    spend_minor bigint NOT NULL,
    impressions bigint,
    clicks bigint,
    import_run_id uuid,
    synced_at timestamp with time zone DEFAULT now() NOT NULL,
    lead_count integer,
    messaging_count integer,
    link_clicks bigint,
    CONSTRAINT meta_ads_spend_valor_ck CHECK ((spend_minor >= 0))
);


--
-- Name: COLUMN meta_ads_spend.lead_count; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.meta_ads_spend.lead_count IS 'Cadastros de formulário apurados pela META. Nulo = ainda não importado; não confundir com o lead do CRM, que vem por atribuição.';


--
-- Name: COLUMN meta_ads_spend.messaging_count; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.meta_ads_spend.messaging_count IS 'Conversas iniciadas por mensagem, apuradas pela META. Nulo = ainda não importado.';


--
-- Name: COLUMN meta_ads_spend.link_clicks; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.meta_ads_spend.link_clicks IS 'inline_link_clicks da Meta. Clique NO LINK, não clique total (coluna clicks). Nulo = não coletado naquele dia.';


--
-- Name: meta_conversoes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.meta_conversoes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    lead_id uuid NOT NULL,
    evento text NOT NULL,
    ocorrido_em timestamp with time zone NOT NULL,
    valor_centavos bigint,
    estado text DEFAULT 'pendente'::text NOT NULL,
    tentativas integer DEFAULT 0 NOT NULL,
    proxima_em timestamp with time zone DEFAULT now() NOT NULL,
    erro_codigo integer,
    erro text,
    enviado_em timestamp with time zone,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT meta_conversoes_estado_ck CHECK ((estado = ANY (ARRAY['pendente'::text, 'processando'::text, 'enviado'::text, 'falhou'::text, 'expirado'::text]))),
    CONSTRAINT meta_conversoes_evento_ck CHECK ((evento = ANY (ARRAY['lead'::text, 'visita_agendada'::text, 'visita_realizada'::text, 'proposta'::text, 'venda'::text])))
);


--
-- Name: TABLE meta_conversoes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.meta_conversoes IS 'Fila de SAÍDA: o que o CRM devolve à Meta pela API de Conversões. Entra por gatilho, sai pelo trabalhador meta-conversoes.';


--
-- Name: meta_forms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.meta_forms (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    form_id text NOT NULL,
    page_id text NOT NULL,
    name text,
    status text,
    first_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    last_drained_at timestamp with time zone,
    integration_id uuid
);


--
-- Name: meta_integrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.meta_integrations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    app_id text NOT NULL,
    app_secret_id uuid NOT NULL,
    access_token_id uuid NOT NULL,
    token_type text,
    token_expires_at timestamp with time zone,
    scopes text[] DEFAULT '{}'::text[] NOT NULL,
    health text DEFAULT 'ok'::text NOT NULL,
    health_error_code integer,
    health_message text,
    health_changed_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    webhook_secret_hash text,
    owner_id uuid NOT NULL,
    label text,
    CONSTRAINT meta_integrations_health_ck CHECK ((health = ANY (ARRAY['ok'::text, 'precisa_reconectar'::text, 'sem_permissao'::text, 'throttled'::text, 'erro'::text])))
);


--
-- Name: COLUMN meta_integrations.webhook_secret_hash; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.meta_integrations.webhook_secret_hash IS 'SHA-256 do segredo que vai no caminho da URL do webhook. O valor em claro só existe no momento da criação, mostrado uma vez.';


--
-- Name: COLUMN meta_integrations.owner_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.meta_integrations.owner_id IS 'Quem conectou esta BM. Decide o cofre, a saude e quem le o gasto das contas dela.';


--
-- Name: COLUMN meta_integrations.label; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.meta_integrations.label IS 'Nome humano da conexao. Com duas BMs na mesma casa, "a integracao" deixa de identificar.';


--
-- Name: meta_lead_submissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.meta_lead_submissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    leadgen_id text NOT NULL,
    form_id text NOT NULL,
    lead_id uuid,
    field_data jsonb NOT NULL,
    is_organic boolean DEFAULT false NOT NULL,
    is_test boolean DEFAULT false NOT NULL,
    captado_em timestamp with time zone NOT NULL,
    received_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: meta_pages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.meta_pages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    page_id text NOT NULL,
    page_name text,
    page_token_id uuid,
    granted_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    subscribed_at timestamp with time zone,
    subscribe_error text,
    integration_id uuid
);


--
-- Name: COLUMN meta_pages.subscribed_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.meta_pages.subscribed_at IS 'Quando o app foi assinado nesta Página para receber leadgen. Nulo = a Meta não vai entregar lead nenhum, mesmo com o webhook configurado.';


--
-- Name: meta_sync_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.meta_sync_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    kind text NOT NULL,
    ad_account_id text,
    window_since date,
    window_until date,
    status text DEFAULT 'running'::text NOT NULL,
    pages_fetched integer DEFAULT 0 NOT NULL,
    rows_fetched integer DEFAULT 0 NOT NULL,
    rows_written integer DEFAULT 0 NOT NULL,
    truncated boolean DEFAULT false NOT NULL,
    cursor text,
    error_code integer,
    error_message text,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    finished_at timestamp with time zone,
    integration_id uuid,
    CONSTRAINT meta_sync_runs_kind_ck CHECK ((kind = ANY (ARRAY['insights'::text, 'leads'::text, 'forms'::text, 'account_info'::text]))),
    CONSTRAINT meta_sync_runs_status_ck CHECK ((status = ANY (ARRAY['running'::text, 'ok'::text, 'parcial'::text, 'erro'::text])))
);


--
-- Name: notification_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_preferences (
    profile_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    lead_scope text DEFAULT 'meus'::text NOT NULL,
    push_enabled boolean DEFAULT true NOT NULL,
    muted_types text[] DEFAULT '{}'::text[] NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT notification_preferences_muted_ck CHECK ((muted_types <@ ARRAY['lead_novo'::text, 'lead_atribuido'::text, 'lead_quente'::text, 'lead_esperando'::text, 'mensagem_recebida'::text, 'lembrete'::text, 'visita_proxima'::text, 'sistema'::text, 'whatsapp_fora'::text])),
    CONSTRAINT notification_preferences_scope_ck CHECK ((lead_scope = ANY (ARRAY['nenhum'::text, 'meus'::text, 'todos'::text])))
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    recipient_id uuid NOT NULL,
    type text NOT NULL,
    title text NOT NULL,
    body text,
    link_path text,
    related_entity_type text,
    related_entity_id uuid,
    group_key text NOT NULL,
    event_count integer DEFAULT 1 NOT NULL,
    is_read boolean DEFAULT false NOT NULL,
    read_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_event_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT notifications_type_ck CHECK ((type = ANY (ARRAY['lead_novo'::text, 'lead_atribuido'::text, 'lead_quente'::text, 'lead_esperando'::text, 'mensagem_recebida'::text, 'lembrete'::text, 'visita_proxima'::text, 'sistema'::text, 'whatsapp_fora'::text])))
);


--
-- Name: organizations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organizations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    legal_name text,
    cnpj text,
    creci text,
    phone text,
    phone_country character(2) DEFAULT 'BR'::bpchar NOT NULL,
    email text,
    logo_url text,
    brand_color text DEFAULT '#5B3DF5'::text,
    address text,
    city text,
    state character(2),
    zip_code text,
    default_locale text DEFAULT 'pt-BR'::text NOT NULL,
    enabled_locales text[] DEFAULT ARRAY['pt-BR'::text, 'es'::text, 'en'::text] NOT NULL,
    timezone text DEFAULT 'America/Sao_Paulo'::text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    whatsapp_instance_limit smallint DEFAULT 5 NOT NULL,
    custom_domain text,
    agente_ativo boolean DEFAULT false NOT NULL,
    agente_teto_dia_centavos integer DEFAULT 500 NOT NULL,
    meta_pixel_id text,
    cpl_alvo_minor bigint,
    cpl_teto_minor bigint,
    aviso_espera_horas integer DEFAULT 2,
    whatsapp_business_account_id text,
    meta_whatsapp_dataset_id text,
    CONSTRAINT organizations_aviso_espera_ck CHECK (((aviso_espera_horas IS NULL) OR ((aviso_espera_horas >= 1) AND (aviso_espera_horas <= 72)))),
    CONSTRAINT organizations_cpl_alvo_ck CHECK (((cpl_alvo_minor IS NULL) OR ((cpl_alvo_minor > 0) AND (cpl_alvo_minor <= 100000000)))),
    CONSTRAINT organizations_cpl_ordem_ck CHECK (((cpl_alvo_minor IS NULL) OR (cpl_teto_minor IS NULL) OR (cpl_alvo_minor <= cpl_teto_minor))),
    CONSTRAINT organizations_cpl_teto_ck CHECK (((cpl_teto_minor IS NULL) OR ((cpl_teto_minor > 0) AND (cpl_teto_minor <= 100000000)))),
    CONSTRAINT organizations_default_locale_ck CHECK ((default_locale = ANY (ARRAY['pt-BR'::text, 'es'::text, 'en'::text]))),
    CONSTRAINT organizations_pixel_ck CHECK (((meta_pixel_id IS NULL) OR (meta_pixel_id ~ '^[0-9]{10,20}$'::text))),
    CONSTRAINT organizations_wa_dataset_ck CHECK (((meta_whatsapp_dataset_id IS NULL) OR (meta_whatsapp_dataset_id ~ '^[0-9]{10,20}$'::text))),
    CONSTRAINT organizations_waba_ck CHECK (((whatsapp_business_account_id IS NULL) OR (whatsapp_business_account_id ~ '^[0-9]{10,20}$'::text)))
);


--
-- Name: COLUMN organizations.brand_color; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.organizations.brand_color IS 'Cor da marca. Usada no CRM e na barra do timbre dos documentos.';


--
-- Name: COLUMN organizations.custom_domain; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.organizations.custom_domain IS 'Domínio próprio das landing pages, sem protocolo e sem www. Nulo = a URL carrega o slug.';


--
-- Name: COLUMN organizations.agente_teto_dia_centavos; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.organizations.agente_teto_dia_centavos IS 'Teto de gasto do agente por dia, em CENTAVOS. Em dinheiro e nao em tokens: e assim que o dono pensa.';


--
-- Name: COLUMN organizations.meta_pixel_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.organizations.meta_pixel_id IS 'Conjunto de dados da Meta desta imobiliaria. Publico — o token da API de Conversoes NAO vem para ca.';


--
-- Name: COLUMN organizations.cpl_alvo_minor; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.organizations.cpl_alvo_minor IS 'Onde a casa QUER chegar, em centavos. Abaixo dele, verde. Opcional: sem ele o verde não acende.';


--
-- Name: COLUMN organizations.cpl_teto_minor; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.organizations.cpl_teto_minor IS 'O MÁXIMO que a casa aceita pagar por lead, em centavos. Acima dele, vermelho.';


--
-- Name: COLUMN organizations.aviso_espera_horas; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.organizations.aviso_espera_horas IS 'Horas sem resposta ate avisar quem atende. Nulo desliga o alarme. Padrao 2.';


--
-- Name: COLUMN organizations.whatsapp_business_account_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.organizations.whatsapp_business_account_id IS 'Conta do WhatsApp na Meta (WABA). Exigida DENTRO do evento de conversa da API de Conversões. Nula enquanto o número estiver numa ponte não oficial.';


--
-- Name: COLUMN organizations.meta_whatsapp_dataset_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.organizations.meta_whatsapp_dataset_id IS 'Conjunto de dados criado a partir do WABA. É o destino dos eventos de conversa; sem ele o evento vai para o pixel do site, que não é o mesmo lugar.';


--
-- Name: pipeline_stages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pipeline_stages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    key text NOT NULL,
    label text NOT NULL,
    "position" integer NOT NULL,
    color text DEFAULT '#5B3DF5'::text NOT NULL,
    requires_value boolean DEFAULT false NOT NULL,
    requires_reason boolean DEFAULT false NOT NULL,
    is_won boolean DEFAULT false NOT NULL,
    is_lost boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    requires_schedule boolean DEFAULT false NOT NULL
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    organization_id uuid NOT NULL,
    full_name text NOT NULL,
    email text,
    phone text,
    phone_country character(2) DEFAULT 'BR'::bpchar NOT NULL,
    avatar_url text,
    creci text,
    title text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    theme_color text DEFAULT 'roxo'::text NOT NULL,
    CONSTRAINT profiles_theme_color_ck CHECK ((theme_color = ANY (ARRAY['roxo'::text, 'azul'::text, 'verde'::text, 'vermelho'::text, 'laranja'::text])))
);


--
-- Name: COLUMN profiles.theme_color; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.theme_color IS 'Paleta escolhida pela pessoa. Os valores vivem em src/lib/cores.ts e o CHECK acima repete a lista.';


--
-- Name: property_code_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.property_code_seq
    START WITH 46656
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: properties; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.properties (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    public_code text DEFAULT public.to_base36(nextval('public.property_code_seq'::regclass)) NOT NULL,
    slug text,
    title text NOT NULL,
    description text,
    property_type text DEFAULT 'apartamento'::text NOT NULL,
    purpose text DEFAULT 'venda'::text NOT NULL,
    status text DEFAULT 'disponivel'::text NOT NULL,
    price_cents bigint,
    condo_fee_cents bigint,
    iptu_year_cents bigint,
    area_total numeric(10,2),
    area_built numeric(10,2),
    bedrooms smallint,
    suites smallint,
    bathrooms smallint,
    parking_spots smallint,
    floor smallint,
    address text,
    address_number text,
    complement text,
    neighborhood text,
    city text,
    state character(2),
    zip_code text,
    latitude numeric(10,7),
    longitude numeric(10,7),
    show_exact_address boolean DEFAULT false NOT NULL,
    amenities text[] DEFAULT '{}'::text[] NOT NULL,
    internal_notes text,
    is_published boolean DEFAULT false NOT NULL,
    is_featured boolean DEFAULT false NOT NULL,
    published_at timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    payment_methods text[] DEFAULT '{}'::text[] NOT NULL,
    down_payment_cents bigint,
    installments_count integer,
    installment_cents bigint,
    reinforcement_count integer,
    reinforcement_cents bigint,
    reinforcement_period text,
    keys_cents bigint,
    payment_notes text,
    public_title text,
    developer text,
    delivery_at date,
    construction_status text,
    highlights text[] DEFAULT '{}'::text[] NOT NULL,
    ponto_distancia_m integer,
    recorte_path text,
    hero_metade_path text,
    apresentacao_path text,
    CONSTRAINT properties_obra_ck CHECK (((construction_status IS NULL) OR (construction_status = ANY (ARRAY['pre_lancamento'::text, 'lancamento'::text, 'em_obra'::text, 'pronto'::text])))),
    CONSTRAINT properties_parcela_ck CHECK (((installments_count IS NULL) = (installment_cents IS NULL))),
    CONSTRAINT properties_pay_methods_ck CHECK ((payment_methods <@ ARRAY['a_vista'::text, 'financiamento'::text, 'direto'::text, 'permuta'::text, 'fgts'::text, 'consorcio'::text])),
    CONSTRAINT properties_pay_period_ck CHECK (((reinforcement_period IS NULL) OR (reinforcement_period = ANY (ARRAY['semestral'::text, 'anual'::text])))),
    CONSTRAINT properties_pay_positivo_ck CHECK (((COALESCE(down_payment_cents, (0)::bigint) >= 0) AND (COALESCE(installment_cents, (0)::bigint) >= 0) AND (COALESCE(reinforcement_cents, (0)::bigint) >= 0) AND (COALESCE(keys_cents, (0)::bigint) >= 0) AND (COALESCE(installments_count, 0) >= 0) AND (COALESCE(reinforcement_count, 0) >= 0))),
    CONSTRAINT properties_ponto_dist_ck CHECK (((ponto_distancia_m IS NULL) OR ((ponto_distancia_m > 0) AND (ponto_distancia_m <= 15000)))),
    CONSTRAINT properties_price_ck CHECK (((price_cents IS NULL) OR (price_cents >= 0))),
    CONSTRAINT properties_purpose_ck CHECK ((purpose = ANY (ARRAY['venda'::text, 'aluguel'::text, 'temporada'::text]))),
    CONSTRAINT properties_reforco_ck CHECK (((reinforcement_count IS NULL) = (reinforcement_cents IS NULL))),
    CONSTRAINT properties_reforco_periodo_ck CHECK (((reinforcement_count IS NULL) OR (reinforcement_period IS NOT NULL))),
    CONSTRAINT properties_status_ck CHECK ((status = ANY (ARRAY['disponivel'::text, 'reservado'::text, 'vendido'::text, 'alugado'::text, 'suspenso'::text]))),
    CONSTRAINT properties_type_ck CHECK ((property_type = ANY (ARRAY['apartamento'::text, 'casa'::text, 'casa_condominio'::text, 'cobertura'::text, 'studio'::text, 'kitnet'::text, 'terreno'::text, 'chacara'::text, 'sitio'::text, 'fazenda'::text, 'sala_comercial'::text, 'loja'::text, 'galpao'::text, 'predio'::text, 'outro'::text])))
);


--
-- Name: COLUMN properties.payment_methods; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.properties.payment_methods IS 'Formas aceitas. Lista, não valor único: o mesmo imóvel aceita à vista E financiado.';


--
-- Name: COLUMN properties.reinforcement_period; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.properties.reinforcement_period IS 'Periodicidade do reforço (balão/intermediária): semestral ou anual.';


--
-- Name: COLUMN properties.keys_cents; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.properties.keys_cents IS 'Parcela devida na entrega das chaves.';


--
-- Name: COLUMN properties.payment_notes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.properties.payment_notes IS 'Condição que não cabe em campo: permuta aceita, desconto à vista, correção do saldo.';


--
-- Name: COLUMN properties.public_title; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.properties.public_title IS 'Nome DESCRITIVO da página pública. Nulo = montado da ficha. Nunca o nome do empreendimento.';


--
-- Name: COLUMN properties.developer; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.properties.developer IS 'Construtora. Uso interno — proibida em landing page e em criativo.';


--
-- Name: COLUMN properties.delivery_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.properties.delivery_at IS 'Data de entrega. Uso interno; não sai na página pública.';


--
-- Name: COLUMN properties.ponto_distancia_m; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.properties.ponto_distancia_m IS 'Distância até o ponto de interesse da cidade, em metros. Nula = a página diz "a poucos minutos".';


--
-- Name: COLUMN properties.recorte_path; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.properties.recorte_path IS 'Recorte do prédio (PNG/WebP com transparência) para o herói. "/" = servido pelo app; caso contrário, Storage. Nunca nomear pelo empreendimento.';


--
-- Name: COLUMN properties.hero_metade_path; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.properties.hero_metade_path IS 'Metade direita do herói dividido (Modelo C): prédio com céu, transparente à esquerda. "/" = servido pelo app.';


--
-- Name: COLUMN properties.apresentacao_path; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.properties.apresentacao_path IS 'Foto da seção de apresentação (Modelo C). Aparece colorida na frente e desfocada atrás. "/" = servida pelo app.';


--
-- Name: property_media; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.property_media (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    property_id uuid NOT NULL,
    kind text DEFAULT 'image'::text NOT NULL,
    storage_path text NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    is_cover boolean DEFAULT false NOT NULL,
    caption text,
    alt_text text,
    room text,
    width integer,
    height integer,
    bytes bigint,
    mime_type text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT property_media_kind_ck CHECK ((kind = ANY (ARRAY['image'::text, 'video'::text, 'document'::text, 'tour'::text])))
);


--
-- Name: property_slug_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.property_slug_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    property_id uuid NOT NULL,
    old_slug text NOT NULL,
    replaced_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: push_outbox; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.push_outbox (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    notification_id uuid NOT NULL,
    subscription_id uuid NOT NULL,
    payload jsonb NOT NULL,
    status text DEFAULT 'pendente'::text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    last_error text,
    available_at timestamp with time zone DEFAULT now() NOT NULL,
    sent_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT push_outbox_status_ck CHECK ((status = ANY (ARRAY['pendente'::text, 'enviando'::text, 'enviado'::text, 'falhou'::text, 'descartado'::text])))
);


--
-- Name: push_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.push_subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    profile_id uuid NOT NULL,
    endpoint text NOT NULL,
    p256dh text NOT NULL,
    auth text NOT NULL,
    user_agent text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    last_success_at timestamp with time zone,
    last_failure_at timestamp with time zone,
    failure_count integer DEFAULT 0 NOT NULL
);


--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    role public.app_role NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: visits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.visits (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    lead_id uuid NOT NULL,
    property_id uuid,
    assigned_to uuid,
    starts_at timestamp with time zone NOT NULL,
    ends_at timestamp with time zone NOT NULL,
    status text DEFAULT 'agendada'::text NOT NULL,
    notes text,
    outcome_notes text,
    cancel_reason text,
    confirmed_at timestamp with time zone,
    closed_at timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT visits_duration_ck CHECK (((ends_at - starts_at) <= '12:00:00'::interval)),
    CONSTRAINT visits_period_ck CHECK ((ends_at > starts_at)),
    CONSTRAINT visits_status_ck CHECK ((status = ANY (ARRAY['agendada'::text, 'confirmada'::text, 'realizada'::text, 'nao_compareceu'::text, 'cancelada'::text])))
);


--
-- Name: whatsapp_conversations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.whatsapp_conversations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    instance_id uuid,
    lead_id uuid,
    contact_e164 text,
    contact_lid text,
    is_group boolean DEFAULT false NOT NULL,
    group_jid text,
    group_subject text,
    contact_name text,
    ref_code text,
    property_id uuid,
    unread_count integer DEFAULT 0 NOT NULL,
    last_message_at timestamp with time zone,
    last_message_body text,
    archived_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    classification text,
    agente_responder_em timestamp with time zone,
    agente_espera_desde timestamp with time zone,
    agente_pausado_em timestamp with time zone,
    agente_pausado_por uuid,
    foto_url text,
    foto_origem text,
    foto_path text,
    foto_em timestamp with time zone,
    foto_erro text,
    CONSTRAINT whatsapp_conversations_class_ck CHECK (((classification IS NULL) OR (classification = ANY (ARRAY['lead'::text, 'pessoal'::text]))))
);


--
-- Name: COLUMN whatsapp_conversations.classification; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.whatsapp_conversations.classification IS 'Decisão HUMANA sobre a conversa. Nulo = ninguém decidiu ainda, e aí vale o rastreamento automático.';


--
-- Name: COLUMN whatsapp_conversations.agente_responder_em; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.whatsapp_conversations.agente_responder_em IS 'Quando o agente deve responder. Nulo = nada pendente. E por aqui que sai o atraso de 1 a 3 minutos.';


--
-- Name: COLUMN whatsapp_conversations.foto_url; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.whatsapp_conversations.foto_url IS 'Link assinado da foto, renovado a cada mensagem. Vence em ~2 dias. Serve para MOSTRAR, nunca para guardar.';


--
-- Name: COLUMN whatsapp_conversations.foto_origem; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.whatsapp_conversations.foto_origem IS 'Caminho da URL (antes do ?) da foto que está em foto_path. É o detector de troca: caminho igual, mesma imagem.';


--
-- Name: COLUMN whatsapp_conversations.foto_path; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.whatsapp_conversations.foto_path IS 'Objeto no bucket whatsapp-media. Só para conversa de lead — ver o cabeçalho.';


--
-- Name: whatsapp_conversas_v; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.whatsapp_conversas_v WITH (security_invoker='true') AS
 SELECT c.id,
    c.organization_id,
    c.instance_id,
    c.lead_id,
    c.contact_e164,
    c.contact_lid,
    c.contact_name,
    c.is_group,
    c.group_subject,
    c.ref_code,
    c.property_id,
    c.unread_count,
    c.last_message_at,
    c.last_message_body,
    c.archived_at,
    c.classification,
    l.source AS lead_source,
    l.full_name AS lead_nome,
    (l.excluded_at IS NOT NULL) AS lead_excluido,
    public.wa_estado_da_conversa(c.id) AS estado,
    n.rotulo AS numero_rotulo,
    n.estado AS numero_estado,
    COALESCE(n.e_meu, false) AS numero_e_meu,
    c.foto_url
   FROM ((public.whatsapp_conversations c
     LEFT JOIN public.leads l ON ((l.id = c.lead_id)))
     LEFT JOIN LATERAL public.wa_numero_resumo(c.instance_id) n(rotulo, estado, e_meu) ON (true));


--
-- Name: whatsapp_inbox; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.whatsapp_inbox (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    instance_id uuid NOT NULL,
    provider_event_id text,
    event_type text NOT NULL,
    payload jsonb NOT NULL,
    status text DEFAULT 'pendente'::text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    error text,
    received_at timestamp with time zone DEFAULT now() NOT NULL,
    processed_at timestamp with time zone,
    CONSTRAINT whatsapp_inbox_status_ck CHECK ((status = ANY (ARRAY['pendente'::text, 'processando'::text, 'processado'::text, 'ignorado'::text, 'falhou'::text])))
);


--
-- Name: whatsapp_instances; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.whatsapp_instances (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    label text NOT NULL,
    owner_id uuid,
    provider text DEFAULT 'uazapi'::text NOT NULL,
    provider_instance_id text,
    provider_instance_name text,
    base_url text NOT NULL,
    token_secret_id uuid,
    status text DEFAULT 'desconectada'::text NOT NULL,
    connected_phone_e164 text,
    connected_name text,
    webhook_secret_hash text,
    webhook_rotated_at timestamp with time zone,
    webhook_configured_at timestamp with time zone,
    last_seen_at timestamp with time zone,
    last_error text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    agente_ativo boolean DEFAULT false NOT NULL,
    CONSTRAINT whatsapp_instances_status_ck CHECK ((status = ANY (ARRAY['desconectada'::text, 'pareando'::text, 'conectada'::text, 'credenciada_offline'::text, 'erro'::text])))
);


--
-- Name: COLUMN whatsapp_instances.owner_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.whatsapp_instances.owner_id IS 'Quem conectou o número. É a ÚNICA pessoa que enxerga as conversas pessoais dele.';


--
-- Name: whatsapp_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.whatsapp_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    conversation_id uuid NOT NULL,
    lead_id uuid,
    instance_id uuid,
    direction text NOT NULL,
    provider_message_id text,
    dedupe_key text NOT NULL,
    kind text DEFAULT 'texto'::text NOT NULL,
    body text,
    transcript text,
    ref_code text,
    media_path text,
    media_status text DEFAULT 'sem_midia'::text NOT NULL,
    media_mime text,
    media_bytes bigint,
    media_filename text,
    status text DEFAULT 'recebida'::text NOT NULL,
    status_at timestamp with time zone,
    error text,
    sent_by uuid,
    revoked_at timestamp with time zone,
    raw jsonb DEFAULT '{}'::jsonb NOT NULL,
    occurred_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    automatica boolean DEFAULT false NOT NULL,
    CONSTRAINT whatsapp_messages_direction_ck CHECK ((direction = ANY (ARRAY['entrada'::text, 'saida'::text]))),
    CONSTRAINT whatsapp_messages_kind_ck CHECK ((kind = ANY (ARRAY['texto'::text, 'imagem'::text, 'audio'::text, 'video'::text, 'documento'::text, 'figurinha'::text, 'local'::text, 'contato'::text, 'sistema'::text]))),
    CONSTRAINT whatsapp_messages_media_ck CHECK ((media_status = ANY (ARRAY['sem_midia'::text, 'pendente'::text, 'pronta'::text, 'falhou'::text]))),
    CONSTRAINT whatsapp_messages_status_ck CHECK ((status = ANY (ARRAY['recebida'::text, 'enfileirada'::text, 'enviada'::text, 'entregue'::text, 'lida'::text, 'falhou'::text])))
);


--
-- Name: COLUMN whatsapp_messages.automatica; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.whatsapp_messages.automatica IS 'Saiu do agente, nao de gente. Falso por padrao: o espelho do celular do corretor e humano.';


--
-- Name: whatsapp_outbox; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.whatsapp_outbox (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    conversation_id uuid NOT NULL,
    instance_id uuid NOT NULL,
    message_id uuid NOT NULL,
    to_e164 text NOT NULL,
    kind text DEFAULT 'texto'::text NOT NULL,
    body text,
    media_path text,
    media_filename text,
    caption text,
    status text DEFAULT 'pendente'::text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    max_attempts integer DEFAULT 3 NOT NULL,
    next_attempt_at timestamp with time zone DEFAULT now() NOT NULL,
    error text,
    sent_at timestamp with time zone,
    provider_message_id text,
    requested_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT whatsapp_outbox_kind_ck CHECK ((kind = ANY (ARRAY['texto'::text, 'imagem'::text, 'audio'::text, 'video'::text, 'documento'::text]))),
    CONSTRAINT whatsapp_outbox_status_ck CHECK ((status = ANY (ARRAY['pendente'::text, 'enviando'::text, 'enviada'::text, 'falhou'::text, 'cancelada'::text])))
);


--
-- Name: availability_blocks availability_blocks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.availability_blocks
    ADD CONSTRAINT availability_blocks_pkey PRIMARY KEY (id);


--
-- Name: broker_availability broker_availability_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.broker_availability
    ADD CONSTRAINT broker_availability_pkey PRIMARY KEY (id);


--
-- Name: broker_availability broker_availability_uk; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.broker_availability
    ADD CONSTRAINT broker_availability_uk UNIQUE (organization_id, profile_id, weekday, starts_at);


--
-- Name: document_templates document_templates_key_uk; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_templates
    ADD CONSTRAINT document_templates_key_uk UNIQUE (organization_id, key);


--
-- Name: document_templates document_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_templates
    ADD CONSTRAINT document_templates_pkey PRIMARY KEY (id);


--
-- Name: documents documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_pkey PRIMARY KEY (id);


--
-- Name: error_reports error_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.error_reports
    ADD CONSTRAINT error_reports_pkey PRIMARY KEY (id);


--
-- Name: landing_cidades landing_cidades_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.landing_cidades
    ADD CONSTRAINT landing_cidades_pkey PRIMARY KEY (id);


--
-- Name: landing_cidades landing_cidades_uk; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.landing_cidades
    ADD CONSTRAINT landing_cidades_uk UNIQUE (organization_id, cidade, estado, locale);


--
-- Name: landing_page_daily landing_page_daily_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.landing_page_daily
    ADD CONSTRAINT landing_page_daily_pkey PRIMARY KEY (id);


--
-- Name: landing_page_daily landing_page_daily_uk; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.landing_page_daily
    ADD CONSTRAINT landing_page_daily_uk UNIQUE (landing_page_id, date);


--
-- Name: landing_pages landing_pages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.landing_pages
    ADD CONSTRAINT landing_pages_pkey PRIMARY KEY (id);


--
-- Name: landing_pages landing_pages_uk; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.landing_pages
    ADD CONSTRAINT landing_pages_uk UNIQUE (organization_id, property_id, market, variant);


--
-- Name: landing_pontos landing_pontos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.landing_pontos
    ADD CONSTRAINT landing_pontos_pkey PRIMARY KEY (id);


--
-- Name: landing_pontos landing_pontos_uk; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.landing_pontos
    ADD CONSTRAINT landing_pontos_uk UNIQUE (organization_id, cidade, estado, locale, titulo);


--
-- Name: lead_exportacoes lead_exportacoes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_exportacoes
    ADD CONSTRAINT lead_exportacoes_pkey PRIMARY KEY (id);


--
-- Name: lead_property_interests lead_property_interests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_property_interests
    ADD CONSTRAINT lead_property_interests_pkey PRIMARY KEY (id);


--
-- Name: lead_property_interests lead_property_interests_uk; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_property_interests
    ADD CONSTRAINT lead_property_interests_uk UNIQUE (lead_id, property_id);


--
-- Name: lead_reminders lead_reminders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_reminders
    ADD CONSTRAINT lead_reminders_pkey PRIMARY KEY (id);


--
-- Name: lead_timeline_events lead_timeline_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_timeline_events
    ADD CONSTRAINT lead_timeline_events_pkey PRIMARY KEY (id);


--
-- Name: leads leads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_pkey PRIMARY KEY (id);


--
-- Name: limite_acessos limite_acessos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.limite_acessos
    ADD CONSTRAINT limite_acessos_pkey PRIMARY KEY (chave);


--
-- Name: meta_ad_accounts meta_ad_accounts_conta_uk; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_ad_accounts
    ADD CONSTRAINT meta_ad_accounts_conta_uk UNIQUE (ad_account_id);


--
-- Name: meta_ad_accounts meta_ad_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_ad_accounts
    ADD CONSTRAINT meta_ad_accounts_pkey PRIMARY KEY (id);


--
-- Name: meta_ad_dimensions meta_ad_dimensions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_ad_dimensions
    ADD CONSTRAINT meta_ad_dimensions_pkey PRIMARY KEY (id);


--
-- Name: meta_ad_dimensions meta_ad_dimensions_uk; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_ad_dimensions
    ADD CONSTRAINT meta_ad_dimensions_uk UNIQUE (organization_id, level, object_id);


--
-- Name: meta_ads_spend meta_ads_spend_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_ads_spend
    ADD CONSTRAINT meta_ads_spend_pkey PRIMARY KEY (id);


--
-- Name: meta_ads_spend meta_ads_spend_uk; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_ads_spend
    ADD CONSTRAINT meta_ads_spend_uk UNIQUE (organization_id, ad_account_id, campaign_id, adset_id, ad_id, date);


--
-- Name: meta_conversoes meta_conversoes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_conversoes
    ADD CONSTRAINT meta_conversoes_pkey PRIMARY KEY (id);


--
-- Name: meta_conversoes meta_conversoes_uk; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_conversoes
    ADD CONSTRAINT meta_conversoes_uk UNIQUE (lead_id, evento);


--
-- Name: meta_forms meta_forms_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_forms
    ADD CONSTRAINT meta_forms_pkey PRIMARY KEY (id);


--
-- Name: meta_forms meta_forms_uk; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_forms
    ADD CONSTRAINT meta_forms_uk UNIQUE (organization_id, form_id);


--
-- Name: meta_integrations meta_integrations_dono_uk; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_integrations
    ADD CONSTRAINT meta_integrations_dono_uk UNIQUE (organization_id, owner_id);


--
-- Name: meta_integrations meta_integrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_integrations
    ADD CONSTRAINT meta_integrations_pkey PRIMARY KEY (id);


--
-- Name: meta_lead_submissions meta_lead_submissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_lead_submissions
    ADD CONSTRAINT meta_lead_submissions_pkey PRIMARY KEY (id);


--
-- Name: meta_lead_submissions meta_lead_submissions_uk; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_lead_submissions
    ADD CONSTRAINT meta_lead_submissions_uk UNIQUE (organization_id, leadgen_id);


--
-- Name: meta_pages meta_pages_page_uk; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_pages
    ADD CONSTRAINT meta_pages_page_uk UNIQUE (page_id);


--
-- Name: meta_pages meta_pages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_pages
    ADD CONSTRAINT meta_pages_pkey PRIMARY KEY (id);


--
-- Name: meta_sync_runs meta_sync_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_sync_runs
    ADD CONSTRAINT meta_sync_runs_pkey PRIMARY KEY (id);


--
-- Name: meta_webhook_inbox meta_webhook_inbox_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_webhook_inbox
    ADD CONSTRAINT meta_webhook_inbox_pkey PRIMARY KEY (id);


--
-- Name: meta_webhook_inbox meta_webhook_inbox_uk; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_webhook_inbox
    ADD CONSTRAINT meta_webhook_inbox_uk UNIQUE (organization_id, leadgen_id);


--
-- Name: notification_preferences notification_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_preferences
    ADD CONSTRAINT notification_preferences_pkey PRIMARY KEY (profile_id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: organizations organizations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_pkey PRIMARY KEY (id);


--
-- Name: organizations organizations_slug_uk; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_slug_uk UNIQUE (slug);


--
-- Name: pipeline_stages pipeline_stages_key_uk; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pipeline_stages
    ADD CONSTRAINT pipeline_stages_key_uk UNIQUE (organization_id, key);


--
-- Name: pipeline_stages pipeline_stages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pipeline_stages
    ADD CONSTRAINT pipeline_stages_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: properties properties_code_uk; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.properties
    ADD CONSTRAINT properties_code_uk UNIQUE (organization_id, public_code);


--
-- Name: properties properties_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.properties
    ADD CONSTRAINT properties_pkey PRIMARY KEY (id);


--
-- Name: property_media property_media_path_uk; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.property_media
    ADD CONSTRAINT property_media_path_uk UNIQUE (storage_path);


--
-- Name: property_media property_media_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.property_media
    ADD CONSTRAINT property_media_pkey PRIMARY KEY (id);


--
-- Name: property_slug_history property_slug_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.property_slug_history
    ADD CONSTRAINT property_slug_history_pkey PRIMARY KEY (id);


--
-- Name: property_slug_history property_slug_history_uk; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.property_slug_history
    ADD CONSTRAINT property_slug_history_uk UNIQUE (organization_id, old_slug);


--
-- Name: push_outbox push_outbox_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_outbox
    ADD CONSTRAINT push_outbox_pkey PRIMARY KEY (id);


--
-- Name: push_subscriptions push_subscriptions_endpoint_uk; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_endpoint_uk UNIQUE (endpoint);


--
-- Name: push_subscriptions push_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_uk; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_uk UNIQUE (user_id, organization_id, role);


--
-- Name: visits visits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visits
    ADD CONSTRAINT visits_pkey PRIMARY KEY (id);


--
-- Name: visits visits_sem_sobreposicao; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visits
    ADD CONSTRAINT visits_sem_sobreposicao EXCLUDE USING gist (assigned_to WITH =, tstzrange(starts_at, ends_at) WITH &&) WHERE (((status = ANY (ARRAY['agendada'::text, 'confirmada'::text])) AND (assigned_to IS NOT NULL)));


--
-- Name: whatsapp_conversations whatsapp_conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_conversations
    ADD CONSTRAINT whatsapp_conversations_pkey PRIMARY KEY (id);


--
-- Name: whatsapp_inbox whatsapp_inbox_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_inbox
    ADD CONSTRAINT whatsapp_inbox_pkey PRIMARY KEY (id);


--
-- Name: whatsapp_instances whatsapp_instances_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_instances
    ADD CONSTRAINT whatsapp_instances_pkey PRIMARY KEY (id);


--
-- Name: whatsapp_messages whatsapp_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_messages
    ADD CONSTRAINT whatsapp_messages_pkey PRIMARY KEY (id);


--
-- Name: whatsapp_outbox whatsapp_outbox_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_outbox
    ADD CONSTRAINT whatsapp_outbox_pkey PRIMARY KEY (id);


--
-- Name: availability_blocks_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX availability_blocks_idx ON public.availability_blocks USING btree (organization_id, starts_at, ends_at);


--
-- Name: document_templates_ordem_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX document_templates_ordem_idx ON public.document_templates USING btree (is_active, display_order);


--
-- Name: document_templates_sistema_uk; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX document_templates_sistema_uk ON public.document_templates USING btree (key) WHERE (organization_id IS NULL);


--
-- Name: documents_lead_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX documents_lead_idx ON public.documents USING btree (lead_id);


--
-- Name: documents_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX documents_org_idx ON public.documents USING btree (organization_id, created_at DESC);


--
-- Name: error_reports_orfaos_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX error_reports_orfaos_idx ON public.error_reports USING btree (created_at DESC) WHERE (organization_id IS NULL);


--
-- Name: error_reports_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX error_reports_org_idx ON public.error_reports USING btree (organization_id, created_at DESC);


--
-- Name: landing_cidades_ix; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX landing_cidades_ix ON public.landing_cidades USING btree (organization_id, lower(cidade), estado, locale);


--
-- Name: landing_page_daily_ix; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX landing_page_daily_ix ON public.landing_page_daily USING btree (organization_id, date);


--
-- Name: landing_pages_imovel_ix; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX landing_pages_imovel_ix ON public.landing_pages USING btree (organization_id, property_id);


--
-- Name: landing_pontos_ix; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX landing_pontos_ix ON public.landing_pontos USING btree (organization_id, lower(cidade), estado, locale, posicao);


--
-- Name: lead_exportacoes_org_ix; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lead_exportacoes_org_ix ON public.lead_exportacoes USING btree (organization_id, exportado_em DESC);


--
-- Name: lead_interests_property_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lead_interests_property_idx ON public.lead_property_interests USING btree (organization_id, property_id);


--
-- Name: lead_reminders_lead_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lead_reminders_lead_idx ON public.lead_reminders USING btree (lead_id, remind_at DESC);


--
-- Name: lead_reminders_meus_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lead_reminders_meus_idx ON public.lead_reminders USING btree (assigned_to, remind_at) WHERE (status = 'pendente'::text);


--
-- Name: lead_reminders_vencidos_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lead_reminders_vencidos_idx ON public.lead_reminders USING btree (remind_at) WHERE (status = 'pendente'::text);


--
-- Name: lead_timeline_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lead_timeline_idx ON public.lead_timeline_events USING btree (lead_id, occurred_at DESC);


--
-- Name: leads_assigned_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX leads_assigned_idx ON public.leads USING btree (organization_id, assigned_to) WHERE (assigned_to IS NOT NULL);


--
-- Name: leads_ativos_ix; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX leads_ativos_ix ON public.leads USING btree (organization_id, created_at) WHERE (excluded_at IS NULL);


--
-- Name: leads_board_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX leads_board_idx ON public.leads USING btree (organization_id, stage_id, stage_changed_at DESC);


--
-- Name: leads_email_uk; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX leads_email_uk ON public.leads USING btree (organization_id, lower(email)) WHERE (email IS NOT NULL);


--
-- Name: leads_esperando_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX leads_esperando_idx ON public.leads USING btree (organization_id, esperando_desde) WHERE (esperando_desde IS NOT NULL);


--
-- Name: leads_ft_ad_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX leads_ft_ad_idx ON public.leads USING btree (organization_id, ft_meta_ad_id) WHERE (ft_meta_ad_id IS NOT NULL);


--
-- Name: leads_ft_variant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX leads_ft_variant_idx ON public.leads USING btree (organization_id, ft_landing_page_id, ft_variant) WHERE (ft_variant IS NOT NULL);


--
-- Name: leads_phone_uk; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX leads_phone_uk ON public.leads USING btree (organization_id, phone_e164) WHERE (phone_e164 IS NOT NULL);


--
-- Name: leads_recent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX leads_recent_idx ON public.leads USING btree (organization_id, created_at DESC);


--
-- Name: leads_search_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX leads_search_idx ON public.leads USING gin ((((((COALESCE(full_name, ''::text) || ' '::text) || COALESCE(phone, ''::text)) || ' '::text) || COALESCE(email, ''::text))) extensions.gin_trgm_ops);


--
-- Name: leads_silencio_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX leads_silencio_idx ON public.leads USING btree (organization_id, silencio_desde) WHERE (silencio_desde IS NOT NULL);


--
-- Name: leads_temperatura_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX leads_temperatura_idx ON public.leads USING btree (organization_id, stage_id, temperatura);


--
-- Name: meta_ad_accounts_conexao_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX meta_ad_accounts_conexao_idx ON public.meta_ad_accounts USING btree (integration_id);


--
-- Name: meta_ad_accounts_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX meta_ad_accounts_org_idx ON public.meta_ad_accounts USING btree (organization_id);


--
-- Name: meta_ad_dimensions_conta_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX meta_ad_dimensions_conta_idx ON public.meta_ad_dimensions USING btree (ad_account_id, level);


--
-- Name: meta_ad_dimensions_estado_ix; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX meta_ad_dimensions_estado_ix ON public.meta_ad_dimensions USING btree (organization_id, level, effective_status);


--
-- Name: meta_ad_dimensions_imovel_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX meta_ad_dimensions_imovel_idx ON public.meta_ad_dimensions USING btree (organization_id, property_id) WHERE (property_id IS NOT NULL);


--
-- Name: meta_ads_spend_anuncio_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX meta_ads_spend_anuncio_idx ON public.meta_ads_spend USING btree (organization_id, ad_id) WHERE (ad_id <> ''::text);


--
-- Name: meta_ads_spend_conta_data_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX meta_ads_spend_conta_data_idx ON public.meta_ads_spend USING btree (ad_account_id, date DESC);


--
-- Name: meta_ads_spend_janela_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX meta_ads_spend_janela_idx ON public.meta_ads_spend USING btree (organization_id, date DESC);


--
-- Name: meta_conversoes_fila_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX meta_conversoes_fila_idx ON public.meta_conversoes USING btree (proxima_em) WHERE (estado = 'pendente'::text);


--
-- Name: meta_conversoes_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX meta_conversoes_org_idx ON public.meta_conversoes USING btree (organization_id, criado_em DESC);


--
-- Name: meta_forms_conexao_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX meta_forms_conexao_idx ON public.meta_forms USING btree (integration_id);


--
-- Name: meta_integrations_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX meta_integrations_org_idx ON public.meta_integrations USING btree (organization_id);


--
-- Name: meta_pages_conexao_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX meta_pages_conexao_idx ON public.meta_pages USING btree (integration_id);


--
-- Name: meta_pages_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX meta_pages_org_idx ON public.meta_pages USING btree (organization_id);


--
-- Name: meta_sync_runs_conexao_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX meta_sync_runs_conexao_idx ON public.meta_sync_runs USING btree (integration_id);


--
-- Name: meta_sync_runs_recentes_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX meta_sync_runs_recentes_idx ON public.meta_sync_runs USING btree (organization_id, kind, started_at DESC);


--
-- Name: meta_sync_runs_uma_por_vez; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX meta_sync_runs_uma_por_vez ON public.meta_sync_runs USING btree (organization_id, COALESCE(ad_account_id, ''::text), kind) WHERE (status = 'running'::text);


--
-- Name: meta_webhook_inbox_fila_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX meta_webhook_inbox_fila_idx ON public.meta_webhook_inbox USING btree (next_attempt_at) WHERE (status = 'pendente'::text);


--
-- Name: notifications_caixa_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notifications_caixa_idx ON public.notifications USING btree (recipient_id, last_event_at DESC);


--
-- Name: notifications_group_uk; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX notifications_group_uk ON public.notifications USING btree (recipient_id, group_key) WHERE (NOT is_read);


--
-- Name: notifications_nao_lidas_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notifications_nao_lidas_idx ON public.notifications USING btree (recipient_id) WHERE (NOT is_read);


--
-- Name: organizations_custom_domain_uk; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX organizations_custom_domain_uk ON public.organizations USING btree (lower(custom_domain)) WHERE (custom_domain IS NOT NULL);


--
-- Name: pipeline_stages_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pipeline_stages_order_idx ON public.pipeline_stages USING btree (organization_id, "position") WHERE is_active;


--
-- Name: profiles_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX profiles_org_idx ON public.profiles USING btree (organization_id) WHERE is_active;


--
-- Name: properties_list_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX properties_list_idx ON public.properties USING btree (organization_id, created_at DESC);


--
-- Name: properties_published_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX properties_published_idx ON public.properties USING btree (organization_id, is_published, status) WHERE is_published;


--
-- Name: properties_search_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX properties_search_idx ON public.properties USING gin ((((((COALESCE(title, ''::text) || ' '::text) || COALESCE(neighborhood, ''::text)) || ' '::text) || COALESCE(city, ''::text))) extensions.gin_trgm_ops);


--
-- Name: properties_slug_uk; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX properties_slug_uk ON public.properties USING btree (organization_id, slug) WHERE (slug IS NOT NULL);


--
-- Name: property_media_one_cover_uk; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX property_media_one_cover_uk ON public.property_media USING btree (property_id) WHERE is_cover;


--
-- Name: property_media_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX property_media_order_idx ON public.property_media USING btree (property_id, kind, "position");


--
-- Name: push_outbox_pendente_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX push_outbox_pendente_idx ON public.push_outbox USING btree (available_at) WHERE (status = 'pendente'::text);


--
-- Name: push_subscriptions_pessoa_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX push_subscriptions_pessoa_idx ON public.push_subscriptions USING btree (profile_id);


--
-- Name: user_roles_lookup_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_roles_lookup_idx ON public.user_roles USING btree (user_id, organization_id);


--
-- Name: visits_agenda_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX visits_agenda_idx ON public.visits USING btree (organization_id, starts_at) WHERE (status = ANY (ARRAY['agendada'::text, 'confirmada'::text]));


--
-- Name: visits_corretor_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX visits_corretor_idx ON public.visits USING btree (assigned_to, starts_at) WHERE (assigned_to IS NOT NULL);


--
-- Name: visits_lead_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX visits_lead_idx ON public.visits USING btree (lead_id, starts_at DESC);


--
-- Name: visits_property_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX visits_property_idx ON public.visits USING btree (property_id, starts_at DESC) WHERE (property_id IS NOT NULL);


--
-- Name: whatsapp_conversas_agente_ix; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX whatsapp_conversas_agente_ix ON public.whatsapp_conversations USING btree (agente_responder_em) WHERE (agente_responder_em IS NOT NULL);


--
-- Name: whatsapp_conversations_caixa_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX whatsapp_conversations_caixa_idx ON public.whatsapp_conversations USING btree (organization_id, last_message_at DESC);


--
-- Name: whatsapp_conversations_contato_uk; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX whatsapp_conversations_contato_uk ON public.whatsapp_conversations USING btree (organization_id, instance_id, contact_e164) WHERE ((contact_e164 IS NOT NULL) AND (NOT is_group));


--
-- Name: whatsapp_conversations_grupo_uk; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX whatsapp_conversations_grupo_uk ON public.whatsapp_conversations USING btree (organization_id, instance_id, group_jid) WHERE (is_group AND (group_jid IS NOT NULL));


--
-- Name: INDEX whatsapp_conversations_grupo_uk; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON INDEX public.whatsapp_conversations_grupo_uk IS 'Uma conversa por grupo. Faltava, e cada mensagem de grupo criava uma linha nova.';


--
-- Name: whatsapp_conversations_lead_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX whatsapp_conversations_lead_idx ON public.whatsapp_conversations USING btree (lead_id) WHERE (lead_id IS NOT NULL);


--
-- Name: whatsapp_conversations_lid_uk; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX whatsapp_conversations_lid_uk ON public.whatsapp_conversations USING btree (organization_id, instance_id, contact_lid) WHERE ((contact_lid IS NOT NULL) AND (contact_e164 IS NULL));


--
-- Name: whatsapp_inbox_evento_uk; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX whatsapp_inbox_evento_uk ON public.whatsapp_inbox USING btree (organization_id, event_type, provider_event_id) WHERE (provider_event_id IS NOT NULL);


--
-- Name: whatsapp_inbox_pendentes_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX whatsapp_inbox_pendentes_idx ON public.whatsapp_inbox USING btree (received_at) WHERE (status = 'pendente'::text);


--
-- Name: whatsapp_instances_label_uk; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX whatsapp_instances_label_uk ON public.whatsapp_instances USING btree (organization_id, lower(label));


--
-- Name: whatsapp_instances_pareadas_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX whatsapp_instances_pareadas_idx ON public.whatsapp_instances USING btree (last_seen_at) WHERE (status = ANY (ARRAY['conectada'::text, 'credenciada_offline'::text]));


--
-- Name: whatsapp_instances_provider_uk; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX whatsapp_instances_provider_uk ON public.whatsapp_instances USING btree (organization_id, provider, provider_instance_id) WHERE (provider_instance_id IS NOT NULL);


--
-- Name: whatsapp_messages_ack_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX whatsapp_messages_ack_idx ON public.whatsapp_messages USING btree (organization_id, provider_message_id) WHERE (provider_message_id IS NOT NULL);


--
-- Name: whatsapp_messages_dedupe_uk; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX whatsapp_messages_dedupe_uk ON public.whatsapp_messages USING btree (organization_id, dedupe_key);


--
-- Name: whatsapp_messages_midia_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX whatsapp_messages_midia_idx ON public.whatsapp_messages USING btree (created_at) WHERE (media_status = 'pendente'::text);


--
-- Name: whatsapp_messages_thread_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX whatsapp_messages_thread_idx ON public.whatsapp_messages USING btree (conversation_id, occurred_at DESC);


--
-- Name: whatsapp_outbox_conversa_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX whatsapp_outbox_conversa_idx ON public.whatsapp_outbox USING btree (conversation_id, created_at DESC);


--
-- Name: whatsapp_outbox_fila_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX whatsapp_outbox_fila_idx ON public.whatsapp_outbox USING btree (next_attempt_at) WHERE (status = ANY (ARRAY['pendente'::text, 'enviando'::text]));


--
-- Name: broker_availability broker_availability_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER broker_availability_updated_at BEFORE UPDATE ON public.broker_availability FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: meta_integrations conexao_meta_ganha_nome; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER conexao_meta_ganha_nome BEFORE INSERT OR UPDATE OF owner_id, label ON public.meta_integrations FOR EACH ROW EXECUTE FUNCTION public.tg_conexao_meta_ganha_nome();


--
-- Name: whatsapp_conversations conversa_da_o_lead_ao_dono; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER conversa_da_o_lead_ao_dono AFTER INSERT ON public.whatsapp_conversations FOR EACH ROW WHEN ((new.lead_id IS NOT NULL)) EXECUTE FUNCTION public.tg_lead_do_dono_do_numero();


--
-- Name: whatsapp_conversations conversa_mudou_de_lead; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER conversa_mudou_de_lead AFTER UPDATE OF lead_id ON public.whatsapp_conversations FOR EACH ROW WHEN (((new.lead_id IS NOT NULL) AND (new.lead_id IS DISTINCT FROM old.lead_id))) EXECUTE FUNCTION public.tg_lead_do_dono_do_numero();


--
-- Name: whatsapp_conversations conversas_so_o_dono_classifica; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER conversas_so_o_dono_classifica BEFORE UPDATE ON public.whatsapp_conversations FOR EACH ROW EXECUTE FUNCTION public.tg_so_o_dono_torna_pessoal();


--
-- Name: whatsapp_conversations conversas_virou_lead_pega_midia; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER conversas_virou_lead_pega_midia AFTER UPDATE OF lead_id ON public.whatsapp_conversations FOR EACH ROW EXECUTE FUNCTION public.tg_conversa_virou_lead_pega_midia();


--
-- Name: document_templates document_templates_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER document_templates_touch BEFORE UPDATE ON public.document_templates FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: meta_ads_spend gasto_adota_lead_orfao; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER gasto_adota_lead_orfao AFTER INSERT ON public.meta_ads_spend REFERENCING NEW TABLE AS novo FOR EACH STATEMENT EXECUTE FUNCTION public.tg_gasto_adota_lead_orfao();


--
-- Name: landing_cidades landing_cidades_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER landing_cidades_touch BEFORE UPDATE ON public.landing_cidades FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: landing_pages landing_pages_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER landing_pages_touch BEFORE UPDATE ON public.landing_pages FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: landing_pontos landing_pontos_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER landing_pontos_touch BEFORE UPDATE ON public.landing_pontos FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: lead_reminders lead_reminders_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER lead_reminders_updated_at BEFORE UPDATE ON public.lead_reminders FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: leads leads_atribuido; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER leads_atribuido AFTER UPDATE OF assigned_to ON public.leads FOR EACH ROW EXECUTE FUNCTION public.tg_lead_atribuido();


--
-- Name: leads leads_conversao_etapa; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER leads_conversao_etapa AFTER UPDATE OF stage_id ON public.leads FOR EACH ROW EXECUTE FUNCTION public.tg_lead_conversao_etapa();


--
-- Name: leads leads_conversao_nova; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER leads_conversao_nova AFTER INSERT ON public.leads FOR EACH ROW EXECUTE FUNCTION public.tg_lead_conversao_nova();


--
-- Name: leads leads_conversao_origem; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER leads_conversao_origem AFTER UPDATE OF fbclid, ft_meta_ad_id ON public.leads FOR EACH ROW EXECUTE FUNCTION public.tg_lead_conversao_origem();


--
-- Name: leads leads_marca_avanco; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER leads_marca_avanco BEFORE INSERT OR UPDATE OF stage_id ON public.leads FOR EACH ROW EXECUTE FUNCTION public.tg_lead_marca_avanco();


--
-- Name: leads leads_nasce_com_dono; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER leads_nasce_com_dono BEFORE INSERT ON public.leads FOR EACH ROW EXECUTE FUNCTION public.tg_lead_nasce_com_dono();


--
-- Name: leads leads_notifica_novo; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER leads_notifica_novo AFTER INSERT ON public.leads FOR EACH ROW EXECUTE FUNCTION public.tg_notify_lead_novo();


--
-- Name: leads leads_qualificacao; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER leads_qualificacao AFTER UPDATE OF finalidade, prazo_compra, encaixe_financeiro, temperatura_manual ON public.leads FOR EACH ROW EXECUTE FUNCTION public.tg_lead_qualificacao();


--
-- Name: leads leads_stage_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER leads_stage_change BEFORE UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION public.tg_lead_stage_change();


--
-- Name: leads leads_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER leads_updated_at BEFORE UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: meta_integrations meta_integrations_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER meta_integrations_touch BEFORE UPDATE ON public.meta_integrations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: notification_preferences notification_preferences_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER notification_preferences_updated_at BEFORE UPDATE ON public.notification_preferences FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: notifications notifications_enfileira_push; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER notifications_enfileira_push AFTER INSERT ON public.notifications FOR EACH ROW EXECUTE FUNCTION public.tg_enfileirar_push();


--
-- Name: organizations organizations_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER organizations_updated_at BEFORE UPDATE ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: whatsapp_outbox outbox_automatico_so_lead; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER outbox_automatico_so_lead BEFORE INSERT ON public.whatsapp_outbox FOR EACH ROW EXECUTE FUNCTION public.tg_saida_automatica_so_para_lead();


--
-- Name: pipeline_stages pipeline_stages_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER pipeline_stages_updated_at BEFORE UPDATE ON public.pipeline_stages FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: notification_preferences prefs_limita_alcance; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER prefs_limita_alcance BEFORE INSERT OR UPDATE OF lead_scope ON public.notification_preferences FOR EACH ROW EXECUTE FUNCTION public.tg_prefs_limita_alcance();


--
-- Name: profiles profiles_desativado_solta_lembretes; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER profiles_desativado_solta_lembretes AFTER UPDATE OF is_active ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.tg_desativado_solta_lembretes();


--
-- Name: profiles profiles_mantem_um_admin; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER profiles_mantem_um_admin BEFORE UPDATE OF is_active ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.tg_mantem_um_admin();


--
-- Name: profiles profiles_nao_desativa_a_si; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER profiles_nao_desativa_a_si BEFORE UPDATE OF is_active ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.tg_nao_desativa_a_si();


--
-- Name: profiles profiles_nao_troca_de_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER profiles_nao_troca_de_org BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.tg_perfil_nao_troca_de_org();


--
-- Name: profiles profiles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: properties properties_slug; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER properties_slug BEFORE INSERT OR UPDATE ON public.properties FOR EACH ROW EXECUTE FUNCTION public.tg_property_slug();


--
-- Name: properties properties_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER properties_updated_at BEFORE UPDATE ON public.properties FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: user_roles user_roles_preferencia_ao_nascer; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER user_roles_preferencia_ao_nascer AFTER INSERT ON public.user_roles FOR EACH ROW EXECUTE FUNCTION public.tg_preferencia_ao_nascer();


--
-- Name: user_roles user_roles_so_admin_cria_admin; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER user_roles_so_admin_cria_admin BEFORE INSERT OR UPDATE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION public.tg_so_admin_cria_admin();


--
-- Name: visits visits_carimbos; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER visits_carimbos BEFORE UPDATE ON public.visits FOR EACH ROW EXECUTE FUNCTION public.tg_visit_carimbos();


--
-- Name: visits visits_cria_lembrete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER visits_cria_lembrete AFTER INSERT ON public.visits FOR EACH ROW EXECUTE FUNCTION public.tg_visit_cria_lembrete();


--
-- Name: visits visits_timeline; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER visits_timeline AFTER INSERT OR UPDATE ON public.visits FOR EACH ROW EXECUTE FUNCTION public.tg_visit_timeline();


--
-- Name: visits visits_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER visits_updated_at BEFORE UPDATE ON public.visits FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: whatsapp_conversations whatsapp_conversations_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER whatsapp_conversations_updated_at BEFORE UPDATE ON public.whatsapp_conversations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: whatsapp_inbox whatsapp_inbox_sem_credencial; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER whatsapp_inbox_sem_credencial BEFORE INSERT OR UPDATE OF payload ON public.whatsapp_inbox FOR EACH ROW EXECUTE FUNCTION public.tg_inbox_sem_credencial();


--
-- Name: whatsapp_instances whatsapp_instances_teto; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER whatsapp_instances_teto BEFORE INSERT ON public.whatsapp_instances FOR EACH ROW EXECUTE FUNCTION public.tg_whatsapp_respeita_teto();


--
-- Name: whatsapp_instances whatsapp_instances_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER whatsapp_instances_updated_at BEFORE UPDATE ON public.whatsapp_instances FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: whatsapp_messages whatsapp_messages_agente; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER whatsapp_messages_agente AFTER INSERT ON public.whatsapp_messages FOR EACH ROW EXECUTE FUNCTION public.tg_agente_agenda_resposta();


--
-- Name: whatsapp_messages whatsapp_messages_espera; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER whatsapp_messages_espera AFTER INSERT ON public.whatsapp_messages FOR EACH ROW EXECUTE FUNCTION public.tg_lead_espera();


--
-- Name: whatsapp_messages whatsapp_messages_foto; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER whatsapp_messages_foto AFTER INSERT ON public.whatsapp_messages FOR EACH ROW WHEN ((new.raw IS NOT NULL)) EXECUTE FUNCTION public.tg_conversa_foto();


--
-- Name: whatsapp_messages whatsapp_messages_landing; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER whatsapp_messages_landing AFTER INSERT ON public.whatsapp_messages FOR EACH ROW WHEN ((new.lead_id IS NOT NULL)) EXECUTE FUNCTION public.tg_lead_landing_do_ref();


--
-- Name: whatsapp_messages whatsapp_messages_primeiro_contato; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER whatsapp_messages_primeiro_contato AFTER INSERT ON public.whatsapp_messages FOR EACH ROW EXECUTE FUNCTION public.tg_lead_primeiro_contato();


--
-- Name: whatsapp_messages whatsapp_messages_qualifica; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER whatsapp_messages_qualifica AFTER INSERT ON public.whatsapp_messages FOR EACH ROW WHEN (((new.direction = 'entrada'::text) AND (new.body IS NOT NULL))) EXECUTE FUNCTION public.tg_mensagem_qualifica();


--
-- Name: whatsapp_messages whatsapp_messages_sem_credencial; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER whatsapp_messages_sem_credencial BEFORE INSERT OR UPDATE OF raw ON public.whatsapp_messages FOR EACH ROW EXECUTE FUNCTION public.tg_mensagem_sem_credencial();


--
-- Name: leads zz_lead_do_dono_do_anuncio; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER zz_lead_do_dono_do_anuncio BEFORE INSERT ON public.leads FOR EACH ROW WHEN (((new.assigned_to IS NULL) AND (new.ft_meta_ad_id IS NOT NULL))) EXECUTE FUNCTION public.tg_lead_do_dono_do_anuncio();


--
-- Name: whatsapp_instances zz_whatsapp_um_por_corretor; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER zz_whatsapp_um_por_corretor BEFORE INSERT ON public.whatsapp_instances FOR EACH ROW EXECUTE FUNCTION public.tg_whatsapp_um_por_corretor();


--
-- Name: availability_blocks availability_blocks_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.availability_blocks
    ADD CONSTRAINT availability_blocks_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: availability_blocks availability_blocks_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.availability_blocks
    ADD CONSTRAINT availability_blocks_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: availability_blocks availability_blocks_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.availability_blocks
    ADD CONSTRAINT availability_blocks_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: broker_availability broker_availability_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.broker_availability
    ADD CONSTRAINT broker_availability_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: broker_availability broker_availability_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.broker_availability
    ADD CONSTRAINT broker_availability_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: document_templates document_templates_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_templates
    ADD CONSTRAINT document_templates_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: documents documents_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: documents documents_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE SET NULL;


--
-- Name: documents documents_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: documents documents_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE SET NULL;


--
-- Name: documents documents_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.document_templates(id) ON DELETE SET NULL;


--
-- Name: error_reports error_reports_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.error_reports
    ADD CONSTRAINT error_reports_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: error_reports error_reports_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.error_reports
    ADD CONSTRAINT error_reports_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: landing_cidades landing_cidades_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.landing_cidades
    ADD CONSTRAINT landing_cidades_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: landing_page_daily landing_page_daily_landing_page_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.landing_page_daily
    ADD CONSTRAINT landing_page_daily_landing_page_id_fkey FOREIGN KEY (landing_page_id) REFERENCES public.landing_pages(id) ON DELETE CASCADE;


--
-- Name: landing_page_daily landing_page_daily_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.landing_page_daily
    ADD CONSTRAINT landing_page_daily_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: landing_pages landing_pages_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.landing_pages
    ADD CONSTRAINT landing_pages_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: landing_pages landing_pages_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.landing_pages
    ADD CONSTRAINT landing_pages_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE CASCADE;


--
-- Name: landing_pontos landing_pontos_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.landing_pontos
    ADD CONSTRAINT landing_pontos_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: lead_exportacoes lead_exportacoes_etapa_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_exportacoes
    ADD CONSTRAINT lead_exportacoes_etapa_fkey FOREIGN KEY (etapa) REFERENCES public.pipeline_stages(id) ON DELETE SET NULL;


--
-- Name: lead_exportacoes lead_exportacoes_exportado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_exportacoes
    ADD CONSTRAINT lead_exportacoes_exportado_por_fkey FOREIGN KEY (exportado_por) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: lead_exportacoes lead_exportacoes_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_exportacoes
    ADD CONSTRAINT lead_exportacoes_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: lead_exportacoes lead_exportacoes_responsavel_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_exportacoes
    ADD CONSTRAINT lead_exportacoes_responsavel_fkey FOREIGN KEY (responsavel) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: lead_property_interests lead_property_interests_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_property_interests
    ADD CONSTRAINT lead_property_interests_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;


--
-- Name: lead_property_interests lead_property_interests_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_property_interests
    ADD CONSTRAINT lead_property_interests_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: lead_property_interests lead_property_interests_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_property_interests
    ADD CONSTRAINT lead_property_interests_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE CASCADE;


--
-- Name: lead_reminders lead_reminders_assigned_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_reminders
    ADD CONSTRAINT lead_reminders_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: lead_reminders lead_reminders_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_reminders
    ADD CONSTRAINT lead_reminders_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: lead_reminders lead_reminders_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_reminders
    ADD CONSTRAINT lead_reminders_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;


--
-- Name: lead_reminders lead_reminders_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_reminders
    ADD CONSTRAINT lead_reminders_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: lead_reminders lead_reminders_visit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_reminders
    ADD CONSTRAINT lead_reminders_visit_id_fkey FOREIGN KEY (visit_id) REFERENCES public.visits(id) ON DELETE CASCADE;


--
-- Name: lead_timeline_events lead_timeline_events_actor_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_timeline_events
    ADD CONSTRAINT lead_timeline_events_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: lead_timeline_events lead_timeline_events_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_timeline_events
    ADD CONSTRAINT lead_timeline_events_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;


--
-- Name: lead_timeline_events lead_timeline_events_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_timeline_events
    ADD CONSTRAINT lead_timeline_events_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: leads leads_assigned_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: leads leads_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: leads leads_stage_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_stage_id_fkey FOREIGN KEY (stage_id) REFERENCES public.pipeline_stages(id) ON DELETE RESTRICT;


--
-- Name: meta_ad_accounts meta_ad_accounts_integration_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_ad_accounts
    ADD CONSTRAINT meta_ad_accounts_integration_id_fkey FOREIGN KEY (integration_id) REFERENCES public.meta_integrations(id) ON DELETE CASCADE;


--
-- Name: meta_ad_accounts meta_ad_accounts_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_ad_accounts
    ADD CONSTRAINT meta_ad_accounts_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: meta_ad_dimensions meta_ad_dimensions_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_ad_dimensions
    ADD CONSTRAINT meta_ad_dimensions_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: meta_ad_dimensions meta_ad_dimensions_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_ad_dimensions
    ADD CONSTRAINT meta_ad_dimensions_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE SET NULL;


--
-- Name: meta_ads_spend meta_ads_spend_import_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_ads_spend
    ADD CONSTRAINT meta_ads_spend_import_run_id_fkey FOREIGN KEY (import_run_id) REFERENCES public.meta_sync_runs(id) ON DELETE SET NULL;


--
-- Name: meta_ads_spend meta_ads_spend_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_ads_spend
    ADD CONSTRAINT meta_ads_spend_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: meta_conversoes meta_conversoes_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_conversoes
    ADD CONSTRAINT meta_conversoes_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;


--
-- Name: meta_conversoes meta_conversoes_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_conversoes
    ADD CONSTRAINT meta_conversoes_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: meta_forms meta_forms_integration_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_forms
    ADD CONSTRAINT meta_forms_integration_id_fkey FOREIGN KEY (integration_id) REFERENCES public.meta_integrations(id) ON DELETE CASCADE;


--
-- Name: meta_forms meta_forms_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_forms
    ADD CONSTRAINT meta_forms_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: meta_integrations meta_integrations_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_integrations
    ADD CONSTRAINT meta_integrations_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: meta_integrations meta_integrations_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_integrations
    ADD CONSTRAINT meta_integrations_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;


--
-- Name: meta_lead_submissions meta_lead_submissions_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_lead_submissions
    ADD CONSTRAINT meta_lead_submissions_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE SET NULL;


--
-- Name: meta_lead_submissions meta_lead_submissions_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_lead_submissions
    ADD CONSTRAINT meta_lead_submissions_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: meta_pages meta_pages_integration_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_pages
    ADD CONSTRAINT meta_pages_integration_id_fkey FOREIGN KEY (integration_id) REFERENCES public.meta_integrations(id) ON DELETE CASCADE;


--
-- Name: meta_pages meta_pages_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_pages
    ADD CONSTRAINT meta_pages_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: meta_sync_runs meta_sync_runs_integration_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_sync_runs
    ADD CONSTRAINT meta_sync_runs_integration_id_fkey FOREIGN KEY (integration_id) REFERENCES public.meta_integrations(id) ON DELETE SET NULL;


--
-- Name: meta_sync_runs meta_sync_runs_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_sync_runs
    ADD CONSTRAINT meta_sync_runs_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: meta_webhook_inbox meta_webhook_inbox_integration_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_webhook_inbox
    ADD CONSTRAINT meta_webhook_inbox_integration_id_fkey FOREIGN KEY (integration_id) REFERENCES public.meta_integrations(id) ON DELETE SET NULL;


--
-- Name: meta_webhook_inbox meta_webhook_inbox_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_webhook_inbox
    ADD CONSTRAINT meta_webhook_inbox_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE SET NULL;


--
-- Name: meta_webhook_inbox meta_webhook_inbox_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_webhook_inbox
    ADD CONSTRAINT meta_webhook_inbox_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: notification_preferences notification_preferences_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_preferences
    ADD CONSTRAINT notification_preferences_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: notification_preferences notification_preferences_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_preferences
    ADD CONSTRAINT notification_preferences_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_recipient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_recipient_id_fkey FOREIGN KEY (recipient_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: pipeline_stages pipeline_stages_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pipeline_stages
    ADD CONSTRAINT pipeline_stages_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: properties properties_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.properties
    ADD CONSTRAINT properties_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: properties properties_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.properties
    ADD CONSTRAINT properties_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: property_media property_media_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.property_media
    ADD CONSTRAINT property_media_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: property_media property_media_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.property_media
    ADD CONSTRAINT property_media_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE CASCADE;


--
-- Name: property_slug_history property_slug_history_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.property_slug_history
    ADD CONSTRAINT property_slug_history_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: property_slug_history property_slug_history_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.property_slug_history
    ADD CONSTRAINT property_slug_history_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE CASCADE;


--
-- Name: push_outbox push_outbox_notification_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_outbox
    ADD CONSTRAINT push_outbox_notification_id_fkey FOREIGN KEY (notification_id) REFERENCES public.notifications(id) ON DELETE CASCADE;


--
-- Name: push_outbox push_outbox_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_outbox
    ADD CONSTRAINT push_outbox_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: push_outbox push_outbox_subscription_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_outbox
    ADD CONSTRAINT push_outbox_subscription_id_fkey FOREIGN KEY (subscription_id) REFERENCES public.push_subscriptions(id) ON DELETE CASCADE;


--
-- Name: push_subscriptions push_subscriptions_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: push_subscriptions push_subscriptions_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: user_roles user_roles_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: user_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: visits visits_assigned_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visits
    ADD CONSTRAINT visits_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: visits visits_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visits
    ADD CONSTRAINT visits_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: visits visits_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visits
    ADD CONSTRAINT visits_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;


--
-- Name: visits visits_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visits
    ADD CONSTRAINT visits_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: visits visits_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visits
    ADD CONSTRAINT visits_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE SET NULL;


--
-- Name: whatsapp_conversations whatsapp_conversations_agente_pausado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_conversations
    ADD CONSTRAINT whatsapp_conversations_agente_pausado_por_fkey FOREIGN KEY (agente_pausado_por) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: whatsapp_conversations whatsapp_conversations_instance_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_conversations
    ADD CONSTRAINT whatsapp_conversations_instance_id_fkey FOREIGN KEY (instance_id) REFERENCES public.whatsapp_instances(id) ON DELETE SET NULL;


--
-- Name: whatsapp_conversations whatsapp_conversations_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_conversations
    ADD CONSTRAINT whatsapp_conversations_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE SET NULL;


--
-- Name: whatsapp_conversations whatsapp_conversations_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_conversations
    ADD CONSTRAINT whatsapp_conversations_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: whatsapp_conversations whatsapp_conversations_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_conversations
    ADD CONSTRAINT whatsapp_conversations_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE SET NULL;


--
-- Name: whatsapp_inbox whatsapp_inbox_instance_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_inbox
    ADD CONSTRAINT whatsapp_inbox_instance_id_fkey FOREIGN KEY (instance_id) REFERENCES public.whatsapp_instances(id) ON DELETE CASCADE;


--
-- Name: whatsapp_inbox whatsapp_inbox_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_inbox
    ADD CONSTRAINT whatsapp_inbox_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: whatsapp_instances whatsapp_instances_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_instances
    ADD CONSTRAINT whatsapp_instances_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: whatsapp_instances whatsapp_instances_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_instances
    ADD CONSTRAINT whatsapp_instances_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: whatsapp_instances whatsapp_instances_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_instances
    ADD CONSTRAINT whatsapp_instances_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: whatsapp_messages whatsapp_messages_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_messages
    ADD CONSTRAINT whatsapp_messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.whatsapp_conversations(id) ON DELETE CASCADE;


--
-- Name: whatsapp_messages whatsapp_messages_instance_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_messages
    ADD CONSTRAINT whatsapp_messages_instance_id_fkey FOREIGN KEY (instance_id) REFERENCES public.whatsapp_instances(id) ON DELETE SET NULL;


--
-- Name: whatsapp_messages whatsapp_messages_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_messages
    ADD CONSTRAINT whatsapp_messages_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE SET NULL;


--
-- Name: whatsapp_messages whatsapp_messages_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_messages
    ADD CONSTRAINT whatsapp_messages_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: whatsapp_messages whatsapp_messages_sent_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_messages
    ADD CONSTRAINT whatsapp_messages_sent_by_fkey FOREIGN KEY (sent_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: whatsapp_outbox whatsapp_outbox_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_outbox
    ADD CONSTRAINT whatsapp_outbox_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.whatsapp_conversations(id) ON DELETE CASCADE;


--
-- Name: whatsapp_outbox whatsapp_outbox_instance_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_outbox
    ADD CONSTRAINT whatsapp_outbox_instance_id_fkey FOREIGN KEY (instance_id) REFERENCES public.whatsapp_instances(id) ON DELETE RESTRICT;


--
-- Name: whatsapp_outbox whatsapp_outbox_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_outbox
    ADD CONSTRAINT whatsapp_outbox_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.whatsapp_messages(id) ON DELETE CASCADE;


--
-- Name: whatsapp_outbox whatsapp_outbox_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_outbox
    ADD CONSTRAINT whatsapp_outbox_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: whatsapp_outbox whatsapp_outbox_requested_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_outbox
    ADD CONSTRAINT whatsapp_outbox_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: availability_blocks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.availability_blocks ENABLE ROW LEVEL SECURITY;

--
-- Name: availability_blocks availability_blocks_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY availability_blocks_all ON public.availability_blocks TO authenticated USING ((organization_id = ( SELECT public.current_org_id() AS current_org_id))) WITH CHECK ((organization_id = ( SELECT public.current_org_id() AS current_org_id)));


--
-- Name: broker_availability; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.broker_availability ENABLE ROW LEVEL SECURITY;

--
-- Name: broker_availability broker_availability_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY broker_availability_all ON public.broker_availability TO authenticated USING ((organization_id = ( SELECT public.current_org_id() AS current_org_id))) WITH CHECK ((organization_id = ( SELECT public.current_org_id() AS current_org_id)));


--
-- Name: document_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.document_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: document_templates document_templates_apagar; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY document_templates_apagar ON public.document_templates FOR DELETE TO authenticated USING (((organization_id = ( SELECT public.current_org_id() AS current_org_id)) AND ( SELECT public.is_admin_or_above(document_templates.organization_id) AS is_admin_or_above) AND (NOT is_system)));


--
-- Name: document_templates document_templates_criar; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY document_templates_criar ON public.document_templates FOR INSERT TO authenticated WITH CHECK (((organization_id = ( SELECT public.current_org_id() AS current_org_id)) AND ( SELECT public.is_admin_or_above(document_templates.organization_id) AS is_admin_or_above) AND (NOT is_system)));


--
-- Name: document_templates document_templates_editar; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY document_templates_editar ON public.document_templates FOR UPDATE TO authenticated USING (((organization_id = ( SELECT public.current_org_id() AS current_org_id)) AND ( SELECT public.is_admin_or_above(document_templates.organization_id) AS is_admin_or_above))) WITH CHECK (((organization_id = ( SELECT public.current_org_id() AS current_org_id)) AND (NOT is_system)));


--
-- Name: document_templates document_templates_ler; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY document_templates_ler ON public.document_templates FOR SELECT TO authenticated USING (((organization_id IS NULL) OR (organization_id = ( SELECT public.current_org_id() AS current_org_id))));


--
-- Name: documents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

--
-- Name: documents documents_apagar; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY documents_apagar ON public.documents FOR DELETE TO authenticated USING (((organization_id = ( SELECT public.current_org_id() AS current_org_id)) AND ( SELECT public.is_admin_or_above(documents.organization_id) AS is_admin_or_above)));


--
-- Name: documents documents_emitir; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY documents_emitir ON public.documents FOR INSERT TO authenticated WITH CHECK (((organization_id = ( SELECT public.current_org_id() AS current_org_id)) AND (created_by = ( SELECT auth.uid() AS uid))));


--
-- Name: documents documents_ler; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY documents_ler ON public.documents FOR SELECT TO authenticated USING (((organization_id = ( SELECT public.current_org_id() AS current_org_id)) AND (( SELECT public.is_admin_or_above(documents.organization_id) AS is_admin_or_above) OR (created_by = ( SELECT auth.uid() AS uid)) OR (lead_id IN ( SELECT l.id
   FROM public.leads l
  WHERE ((l.organization_id = ( SELECT public.current_org_id() AS current_org_id)) AND (l.assigned_to = ( SELECT auth.uid() AS uid))))))));


--
-- Name: error_reports; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.error_reports ENABLE ROW LEVEL SECURITY;

--
-- Name: error_reports error_reports_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY error_reports_read ON public.error_reports FOR SELECT TO authenticated USING (((organization_id = ( SELECT public.current_org_id() AS current_org_id)) AND ( SELECT public.is_admin_or_above(error_reports.organization_id) AS is_admin_or_above)));


--
-- Name: landing_cidades; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.landing_cidades ENABLE ROW LEVEL SECURITY;

--
-- Name: landing_cidades landing_cidades_rw; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY landing_cidades_rw ON public.landing_cidades TO authenticated USING ((organization_id = ( SELECT public.current_org_id() AS current_org_id))) WITH CHECK ((organization_id = ( SELECT public.current_org_id() AS current_org_id)));


--
-- Name: landing_page_daily; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.landing_page_daily ENABLE ROW LEVEL SECURITY;

--
-- Name: landing_page_daily landing_page_daily_rw; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY landing_page_daily_rw ON public.landing_page_daily TO authenticated USING ((organization_id = ( SELECT public.current_org_id() AS current_org_id))) WITH CHECK ((organization_id = ( SELECT public.current_org_id() AS current_org_id)));


--
-- Name: landing_pages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.landing_pages ENABLE ROW LEVEL SECURITY;

--
-- Name: landing_pages landing_pages_rw; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY landing_pages_rw ON public.landing_pages TO authenticated USING ((organization_id = ( SELECT public.current_org_id() AS current_org_id))) WITH CHECK ((organization_id = ( SELECT public.current_org_id() AS current_org_id)));


--
-- Name: landing_pontos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.landing_pontos ENABLE ROW LEVEL SECURITY;

--
-- Name: landing_pontos landing_pontos_rw; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY landing_pontos_rw ON public.landing_pontos TO authenticated USING ((organization_id = ( SELECT public.current_org_id() AS current_org_id))) WITH CHECK ((organization_id = ( SELECT public.current_org_id() AS current_org_id)));


--
-- Name: lead_exportacoes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lead_exportacoes ENABLE ROW LEVEL SECURITY;

--
-- Name: lead_exportacoes lead_exportacoes_gestao_le; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lead_exportacoes_gestao_le ON public.lead_exportacoes FOR SELECT TO authenticated USING (((organization_id = ( SELECT public.current_org_id() AS current_org_id)) AND ( SELECT public.is_admin_or_above(( SELECT public.current_org_id() AS current_org_id)) AS is_admin_or_above)));


--
-- Name: lead_property_interests lead_interests_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lead_interests_all ON public.lead_property_interests TO authenticated USING (((organization_id = ( SELECT public.current_org_id() AS current_org_id)) AND public.lead_e_meu(lead_id))) WITH CHECK (((organization_id = ( SELECT public.current_org_id() AS current_org_id)) AND public.lead_e_meu(lead_id)));


--
-- Name: lead_property_interests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lead_property_interests ENABLE ROW LEVEL SECURITY;

--
-- Name: lead_reminders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lead_reminders ENABLE ROW LEVEL SECURITY;

--
-- Name: lead_timeline_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lead_timeline_events ENABLE ROW LEVEL SECURITY;

--
-- Name: lead_timeline_events lead_timeline_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lead_timeline_read ON public.lead_timeline_events FOR SELECT TO authenticated USING (((organization_id = ( SELECT public.current_org_id() AS current_org_id)) AND public.lead_e_meu(lead_id)));


--
-- Name: lead_timeline_events lead_timeline_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lead_timeline_write ON public.lead_timeline_events FOR INSERT TO authenticated WITH CHECK (((organization_id = ( SELECT public.current_org_id() AS current_org_id)) AND public.lead_e_meu(lead_id)));


--
-- Name: leads; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

--
-- Name: leads leads_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY leads_delete ON public.leads FOR DELETE TO authenticated USING (((organization_id = ( SELECT public.current_org_id() AS current_org_id)) AND ((assigned_to = ( SELECT auth.uid() AS uid)) OR ( SELECT public.ve_a_carteira_toda() AS ve_a_carteira_toda))));


--
-- Name: leads leads_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY leads_insert ON public.leads FOR INSERT TO authenticated WITH CHECK (((organization_id = ( SELECT public.current_org_id() AS current_org_id)) AND ((assigned_to = ( SELECT auth.uid() AS uid)) OR ( SELECT public.ve_a_carteira_toda() AS ve_a_carteira_toda))));


--
-- Name: leads leads_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY leads_read ON public.leads FOR SELECT TO authenticated USING (((organization_id = ( SELECT public.current_org_id() AS current_org_id)) AND ((assigned_to = ( SELECT auth.uid() AS uid)) OR ( SELECT public.ve_a_carteira_toda() AS ve_a_carteira_toda))));


--
-- Name: leads leads_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY leads_update ON public.leads FOR UPDATE TO authenticated USING (((organization_id = ( SELECT public.current_org_id() AS current_org_id)) AND ((assigned_to = ( SELECT auth.uid() AS uid)) OR ( SELECT public.ve_a_carteira_toda() AS ve_a_carteira_toda)))) WITH CHECK ((organization_id = ( SELECT public.current_org_id() AS current_org_id)));


--
-- Name: lead_reminders lembretes_da_org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lembretes_da_org ON public.lead_reminders TO authenticated USING ((organization_id = ( SELECT public.current_org_id() AS current_org_id))) WITH CHECK ((organization_id = ( SELECT public.current_org_id() AS current_org_id)));


--
-- Name: limite_acessos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.limite_acessos ENABLE ROW LEVEL SECURITY;

--
-- Name: meta_ad_accounts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.meta_ad_accounts ENABLE ROW LEVEL SECURITY;

--
-- Name: meta_ad_accounts meta_ad_accounts_le; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY meta_ad_accounts_le ON public.meta_ad_accounts FOR SELECT TO authenticated USING (((organization_id = ( SELECT public.current_org_id() AS current_org_id)) AND public.meta_conexao_e_minha(integration_id)));


--
-- Name: meta_ad_accounts meta_ad_accounts_liga; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY meta_ad_accounts_liga ON public.meta_ad_accounts FOR UPDATE TO authenticated USING (((organization_id = ( SELECT public.current_org_id() AS current_org_id)) AND public.meta_conexao_e_minha(integration_id))) WITH CHECK ((organization_id = ( SELECT public.current_org_id() AS current_org_id)));


--
-- Name: meta_ad_dimensions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.meta_ad_dimensions ENABLE ROW LEVEL SECURITY;

--
-- Name: meta_ad_dimensions meta_ad_dimensions_le; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY meta_ad_dimensions_le ON public.meta_ad_dimensions FOR SELECT TO authenticated USING (((organization_id = ( SELECT public.current_org_id() AS current_org_id)) AND public.meta_conta_e_minha(ad_account_id)));


--
-- Name: meta_ad_dimensions meta_ad_dimensions_liga; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY meta_ad_dimensions_liga ON public.meta_ad_dimensions FOR UPDATE TO authenticated USING (((organization_id = ( SELECT public.current_org_id() AS current_org_id)) AND public.meta_conta_e_minha(ad_account_id))) WITH CHECK ((organization_id = ( SELECT public.current_org_id() AS current_org_id)));


--
-- Name: meta_ads_spend; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.meta_ads_spend ENABLE ROW LEVEL SECURITY;

--
-- Name: meta_ads_spend meta_ads_spend_le; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY meta_ads_spend_le ON public.meta_ads_spend FOR SELECT TO authenticated USING (((organization_id = ( SELECT public.current_org_id() AS current_org_id)) AND public.meta_conta_e_minha(ad_account_id)));


--
-- Name: meta_conversoes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.meta_conversoes ENABLE ROW LEVEL SECURITY;

--
-- Name: meta_forms; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.meta_forms ENABLE ROW LEVEL SECURITY;

--
-- Name: meta_forms meta_forms_le; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY meta_forms_le ON public.meta_forms FOR SELECT TO authenticated USING (((organization_id = ( SELECT public.current_org_id() AS current_org_id)) AND public.meta_conexao_e_minha(integration_id)));


--
-- Name: meta_integrations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.meta_integrations ENABLE ROW LEVEL SECURITY;

--
-- Name: meta_integrations meta_integrations_le; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY meta_integrations_le ON public.meta_integrations FOR SELECT TO authenticated USING (((organization_id = ( SELECT public.current_org_id() AS current_org_id)) AND ((owner_id = ( SELECT auth.uid() AS uid)) OR ( SELECT public.ve_a_carteira_toda() AS ve_a_carteira_toda))));


--
-- Name: meta_lead_submissions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.meta_lead_submissions ENABLE ROW LEVEL SECURITY;

--
-- Name: meta_pages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.meta_pages ENABLE ROW LEVEL SECURITY;

--
-- Name: meta_pages meta_pages_le; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY meta_pages_le ON public.meta_pages FOR SELECT TO authenticated USING (((organization_id = ( SELECT public.current_org_id() AS current_org_id)) AND public.meta_conexao_e_minha(integration_id)));


--
-- Name: meta_sync_runs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.meta_sync_runs ENABLE ROW LEVEL SECURITY;

--
-- Name: meta_sync_runs meta_sync_runs_le; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY meta_sync_runs_le ON public.meta_sync_runs FOR SELECT TO authenticated USING (((organization_id = ( SELECT public.current_org_id() AS current_org_id)) AND public.meta_conexao_e_minha(integration_id)));


--
-- Name: meta_webhook_inbox; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.meta_webhook_inbox ENABLE ROW LEVEL SECURITY;

--
-- Name: notification_preferences; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications notifications_marca_lida; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notifications_marca_lida ON public.notifications FOR UPDATE TO authenticated USING ((recipient_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((recipient_id = ( SELECT auth.uid() AS uid)));


--
-- Name: notifications notifications_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notifications_read ON public.notifications FOR SELECT TO authenticated USING ((recipient_id = ( SELECT auth.uid() AS uid)));


--
-- Name: organizations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

--
-- Name: organizations organizations_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organizations_read ON public.organizations FOR SELECT TO authenticated USING ((id = ( SELECT public.current_org_id() AS current_org_id)));


--
-- Name: organizations organizations_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organizations_write ON public.organizations FOR UPDATE TO authenticated USING (((id = ( SELECT public.current_org_id() AS current_org_id)) AND ( SELECT public.is_admin_or_above(organizations.id) AS is_admin_or_above))) WITH CHECK ((id = ( SELECT public.current_org_id() AS current_org_id)));


--
-- Name: pipeline_stages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pipeline_stages ENABLE ROW LEVEL SECURITY;

--
-- Name: pipeline_stages pipeline_stages_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pipeline_stages_read ON public.pipeline_stages FOR SELECT TO authenticated USING ((organization_id = ( SELECT public.current_org_id() AS current_org_id)));


--
-- Name: pipeline_stages pipeline_stages_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pipeline_stages_write ON public.pipeline_stages TO authenticated USING (((organization_id = ( SELECT public.current_org_id() AS current_org_id)) AND ( SELECT public.is_admin_or_above(pipeline_stages.organization_id) AS is_admin_or_above))) WITH CHECK ((organization_id = ( SELECT public.current_org_id() AS current_org_id)));


--
-- Name: notification_preferences prefs_proprias; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY prefs_proprias ON public.notification_preferences TO authenticated USING ((profile_id = ( SELECT auth.uid() AS uid))) WITH CHECK (((profile_id = ( SELECT auth.uid() AS uid)) AND (organization_id = ( SELECT public.current_org_id() AS current_org_id))));


--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles profiles_admin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_admin_write ON public.profiles TO authenticated USING (((organization_id = ( SELECT public.current_org_id() AS current_org_id)) AND ( SELECT public.is_admin_or_above(profiles.organization_id) AS is_admin_or_above))) WITH CHECK ((organization_id = ( SELECT public.current_org_id() AS current_org_id)));


--
-- Name: profiles profiles_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_read ON public.profiles FOR SELECT TO authenticated USING ((organization_id = ( SELECT public.current_org_id() AS current_org_id)));


--
-- Name: profiles profiles_self_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_self_update ON public.profiles FOR UPDATE TO authenticated USING ((id = auth.uid())) WITH CHECK ((id = auth.uid()));


--
-- Name: properties; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;

--
-- Name: properties properties_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY properties_read ON public.properties FOR SELECT TO authenticated USING ((organization_id = ( SELECT public.current_org_id() AS current_org_id)));


--
-- Name: properties properties_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY properties_write ON public.properties TO authenticated USING ((organization_id = ( SELECT public.current_org_id() AS current_org_id))) WITH CHECK ((organization_id = ( SELECT public.current_org_id() AS current_org_id)));


--
-- Name: property_media; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.property_media ENABLE ROW LEVEL SECURITY;

--
-- Name: property_media property_media_manage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY property_media_manage ON public.property_media TO authenticated USING ((organization_id = ( SELECT public.current_org_id() AS current_org_id))) WITH CHECK ((organization_id = ( SELECT public.current_org_id() AS current_org_id)));


--
-- Name: property_media property_media_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY property_media_read ON public.property_media FOR SELECT TO authenticated USING ((organization_id = ( SELECT public.current_org_id() AS current_org_id)));


--
-- Name: property_slug_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.property_slug_history ENABLE ROW LEVEL SECURITY;

--
-- Name: property_slug_history property_slug_history_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY property_slug_history_read ON public.property_slug_history FOR SELECT TO authenticated USING ((organization_id = ( SELECT public.current_org_id() AS current_org_id)));


--
-- Name: push_outbox; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.push_outbox ENABLE ROW LEVEL SECURITY;

--
-- Name: push_subscriptions push_subs_apagar; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY push_subs_apagar ON public.push_subscriptions FOR DELETE TO authenticated USING ((profile_id = ( SELECT auth.uid() AS uid)));


--
-- Name: push_subscriptions push_subs_proprias; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY push_subs_proprias ON public.push_subscriptions FOR SELECT TO authenticated USING ((profile_id = ( SELECT auth.uid() AS uid)));


--
-- Name: push_subscriptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

--
-- Name: user_roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

--
-- Name: user_roles user_roles_admin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_roles_admin_write ON public.user_roles TO authenticated USING (((organization_id = ( SELECT public.current_org_id() AS current_org_id)) AND ( SELECT public.is_admin_or_above(user_roles.organization_id) AS is_admin_or_above))) WITH CHECK (((organization_id = ( SELECT public.current_org_id() AS current_org_id)) AND ( SELECT public.is_admin_or_above(user_roles.organization_id) AS is_admin_or_above)));


--
-- Name: user_roles user_roles_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_roles_read ON public.user_roles FOR SELECT TO authenticated USING ((organization_id = ( SELECT public.current_org_id() AS current_org_id)));


--
-- Name: visits; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.visits ENABLE ROW LEVEL SECURITY;

--
-- Name: visits visits_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY visits_all ON public.visits TO authenticated USING ((organization_id = ( SELECT public.current_org_id() AS current_org_id))) WITH CHECK ((organization_id = ( SELECT public.current_org_id() AS current_org_id)));


--
-- Name: whatsapp_conversations wa_conversas_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY wa_conversas_read ON public.whatsapp_conversations FOR SELECT TO authenticated USING (((organization_id = ( SELECT public.current_org_id() AS current_org_id)) AND public.pode_ver_conversa(id)));


--
-- Name: whatsapp_conversations wa_conversas_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY wa_conversas_update ON public.whatsapp_conversations FOR UPDATE TO authenticated USING (public.pode_ver_conversa(id)) WITH CHECK ((organization_id = ( SELECT public.current_org_id() AS current_org_id)));


--
-- Name: whatsapp_messages wa_mensagens_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY wa_mensagens_delete ON public.whatsapp_messages FOR DELETE TO authenticated USING (((organization_id = ( SELECT public.current_org_id() AS current_org_id)) AND ( SELECT public.is_admin_or_above(whatsapp_messages.organization_id) AS is_admin_or_above)));


--
-- Name: whatsapp_messages wa_mensagens_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY wa_mensagens_read ON public.whatsapp_messages FOR SELECT TO authenticated USING (public.pode_ver_conversa(conversation_id));


--
-- Name: whatsapp_conversations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.whatsapp_conversations ENABLE ROW LEVEL SECURITY;

--
-- Name: whatsapp_inbox; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.whatsapp_inbox ENABLE ROW LEVEL SECURITY;

--
-- Name: whatsapp_instances; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.whatsapp_instances ENABLE ROW LEVEL SECURITY;

--
-- Name: whatsapp_instances whatsapp_instances_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY whatsapp_instances_read ON public.whatsapp_instances FOR SELECT TO authenticated USING (((organization_id = ( SELECT public.current_org_id() AS current_org_id)) AND ((owner_id = ( SELECT auth.uid() AS uid)) OR ( SELECT public.ve_a_carteira_toda() AS ve_a_carteira_toda))));


--
-- Name: whatsapp_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: whatsapp_outbox; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.whatsapp_outbox ENABLE ROW LEVEL SECURITY;

--
-- Privilégios: zera o que os padrões do Supabase deram na criação e aplica
-- só os finais da origem, logo abaixo.
--

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated, service_role;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated, service_role;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated, service_role;


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- Name: FUNCTION agente_pegar_tarefas(_limite integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.agente_pegar_tarefas(_limite integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.agente_pegar_tarefas(_limite integer) TO service_role;


--
-- Name: FUNCTION avisar_espera_longa(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.avisar_espera_longa() FROM PUBLIC;
GRANT ALL ON FUNCTION public.avisar_espera_longa() TO service_role;


--
-- Name: FUNCTION cc_from_e164(_e164 text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.cc_from_e164(_e164 text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.cc_from_e164(_e164 text) TO service_role;
GRANT ALL ON FUNCTION public.cc_from_e164(_e164 text) TO authenticated;


--
-- Name: FUNCTION create_notification(_org uuid, _recipients uuid[], _type text, _title text, _body text, _link_path text, _entity_type text, _entity_id uuid, _actor uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.create_notification(_org uuid, _recipients uuid[], _type text, _title text, _body text, _link_path text, _entity_type text, _entity_id uuid, _actor uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_notification(_org uuid, _recipients uuid[], _type text, _title text, _body text, _link_path text, _entity_type text, _entity_id uuid, _actor uuid) TO service_role;


--
-- Name: FUNCTION current_org_id(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.current_org_id() TO anon;
GRANT ALL ON FUNCTION public.current_org_id() TO authenticated;
GRANT ALL ON FUNCTION public.current_org_id() TO service_role;


--
-- Name: FUNCTION dono_do_anuncio(_org uuid, _ad_id text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.dono_do_anuncio(_org uuid, _ad_id text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.dono_do_anuncio(_org uuid, _ad_id text) TO service_role;


--
-- Name: FUNCTION e_admin(_org uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.e_admin(_org uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.e_admin(_org uuid) TO service_role;
GRANT ALL ON FUNCTION public.e_admin(_org uuid) TO authenticated;


--
-- Name: FUNCTION encaixe_do_texto(_texto text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.encaixe_do_texto(_texto text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.encaixe_do_texto(_texto text) TO service_role;


--
-- Name: FUNCTION enfileirar_mensagem(_conversation_id uuid, _body text, _autor uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.enfileirar_mensagem(_conversation_id uuid, _body text, _autor uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.enfileirar_mensagem(_conversation_id uuid, _body text, _autor uuid) TO authenticated;
GRANT ALL ON FUNCTION public.enfileirar_mensagem(_conversation_id uuid, _body text, _autor uuid) TO service_role;


--
-- Name: FUNCTION finalidade_do_texto(_texto text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.finalidade_do_texto(_texto text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.finalidade_do_texto(_texto text) TO service_role;


--
-- Name: FUNCTION find_or_create_lead(_org uuid, _full_name text, _phone text, _phone_cc character, _email text, _source text, _entry_point text, _property_id uuid, _attribution jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.find_or_create_lead(_org uuid, _full_name text, _phone text, _phone_cc character, _email text, _source text, _entry_point text, _property_id uuid, _attribution jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.find_or_create_lead(_org uuid, _full_name text, _phone text, _phone_cc character, _email text, _source text, _entry_point text, _property_id uuid, _attribution jsonb) TO service_role;


--
-- Name: FUNCTION fuso_da_org(_org uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.fuso_da_org(_org uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.fuso_da_org(_org uuid) TO authenticated;
GRANT ALL ON FUNCTION public.fuso_da_org(_org uuid) TO service_role;


--
-- Name: FUNCTION has_role_in_org(_role public.app_role, _org uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.has_role_in_org(_role public.app_role, _org uuid) TO anon;
GRANT ALL ON FUNCTION public.has_role_in_org(_role public.app_role, _org uuid) TO authenticated;
GRANT ALL ON FUNCTION public.has_role_in_org(_role public.app_role, _org uuid) TO service_role;


--
-- Name: FUNCTION incrementar_falha_push(_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.incrementar_falha_push(_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.incrementar_falha_push(_id uuid) TO service_role;


--
-- Name: FUNCTION inicio_do_dia(_dia date, _tz text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.inicio_do_dia(_dia date, _tz text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.inicio_do_dia(_dia date, _tz text) TO authenticated;
GRANT ALL ON FUNCTION public.inicio_do_dia(_dia date, _tz text) TO service_role;


--
-- Name: FUNCTION instante_do_provedor(_bruto text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.instante_do_provedor(_bruto text) TO anon;
GRANT ALL ON FUNCTION public.instante_do_provedor(_bruto text) TO authenticated;
GRANT ALL ON FUNCTION public.instante_do_provedor(_bruto text) TO service_role;


--
-- Name: FUNCTION is_admin_or_above(_org uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.is_admin_or_above(_org uuid) TO anon;
GRANT ALL ON FUNCTION public.is_admin_or_above(_org uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_admin_or_above(_org uuid) TO service_role;


--
-- Name: FUNCTION landing_do_ref(_org uuid, _public_code text, _market text, _variant text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.landing_do_ref(_org uuid, _public_code text, _market text, _variant text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.landing_do_ref(_org uuid, _public_code text, _market text, _variant text) TO service_role;


--
-- Name: TABLE landing_pages; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.landing_pages TO anon;
GRANT ALL ON TABLE public.landing_pages TO authenticated;
GRANT ALL ON TABLE public.landing_pages TO service_role;


--
-- Name: FUNCTION landing_gerar(_property_id uuid, _mercado text, _layout text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.landing_gerar(_property_id uuid, _mercado text, _layout text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.landing_gerar(_property_id uuid, _mercado text, _layout text) TO authenticated;
GRANT ALL ON FUNCTION public.landing_gerar(_property_id uuid, _mercado text, _layout text) TO service_role;


--
-- Name: FUNCTION landing_marco(_pagina uuid, _marco text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.landing_marco(_pagina uuid, _marco text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.landing_marco(_pagina uuid, _marco text) TO anon;
GRANT ALL ON FUNCTION public.landing_marco(_pagina uuid, _marco text) TO authenticated;
GRANT ALL ON FUNCTION public.landing_marco(_pagina uuid, _marco text) TO service_role;


--
-- Name: FUNCTION landing_placar(_property_id uuid, _mercado text, _since date, _until date); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.landing_placar(_property_id uuid, _mercado text, _since date, _until date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.landing_placar(_property_id uuid, _mercado text, _since date, _until date) TO authenticated;
GRANT ALL ON FUNCTION public.landing_placar(_property_id uuid, _mercado text, _since date, _until date) TO service_role;


--
-- Name: FUNCTION landing_publica(_org_slug text, _mercado text, _slug text, _variante text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.landing_publica(_org_slug text, _mercado text, _slug text, _variante text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.landing_publica(_org_slug text, _mercado text, _slug text, _variante text) TO anon;
GRANT ALL ON FUNCTION public.landing_publica(_org_slug text, _mercado text, _slug text, _variante text) TO authenticated;
GRANT ALL ON FUNCTION public.landing_publica(_org_slug text, _mercado text, _slug text, _variante text) TO service_role;


--
-- Name: FUNCTION landing_ref_code(_public_code text, _market text, _variant text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.landing_ref_code(_public_code text, _market text, _variant text) TO anon;
GRANT ALL ON FUNCTION public.landing_ref_code(_public_code text, _market text, _variant text) TO authenticated;
GRANT ALL ON FUNCTION public.landing_ref_code(_public_code text, _market text, _variant text) TO service_role;


--
-- Name: FUNCTION landing_visita(_pagina uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.landing_visita(_pagina uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.landing_visita(_pagina uuid) TO anon;
GRANT ALL ON FUNCTION public.landing_visita(_pagina uuid) TO authenticated;
GRANT ALL ON FUNCTION public.landing_visita(_pagina uuid) TO service_role;


--
-- Name: FUNCTION lead_e_meu(_lead_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.lead_e_meu(_lead_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.lead_e_meu(_lead_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.lead_e_meu(_lead_id uuid) TO service_role;


--
-- Name: FUNCTION lead_origem_meta(_lead uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.lead_origem_meta(_lead uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.lead_origem_meta(_lead uuid) TO service_role;
GRANT ALL ON FUNCTION public.lead_origem_meta(_lead uuid) TO authenticated;


--
-- Name: FUNCTION lead_preencher_qualificacao(_lead uuid, _origem text, _finalidade text, _prazo text, _encaixe text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.lead_preencher_qualificacao(_lead uuid, _origem text, _finalidade text, _prazo text, _encaixe text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.lead_preencher_qualificacao(_lead uuid, _origem text, _finalidade text, _prazo text, _encaixe text) TO service_role;


--
-- Name: FUNCTION temperatura_pela_regra(_prazo text, _encaixe text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.temperatura_pela_regra(_prazo text, _encaixe text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.temperatura_pela_regra(_prazo text, _encaixe text) TO service_role;
GRANT ALL ON FUNCTION public.temperatura_pela_regra(_prazo text, _encaixe text) TO authenticated;


--
-- Name: FUNCTION to_e164(_raw text, _cc character); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.to_e164(_raw text, _cc character) TO anon;
GRANT ALL ON FUNCTION public.to_e164(_raw text, _cc character) TO authenticated;
GRANT ALL ON FUNCTION public.to_e164(_raw text, _cc character) TO service_role;


--
-- Name: TABLE leads; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.leads TO anon;
GRANT ALL ON TABLE public.leads TO authenticated;
GRANT ALL ON TABLE public.leads TO service_role;


--
-- Name: FUNCTION leads_da_exportacao(_org uuid, _ini timestamp with time zone, _fim timestamp with time zone, _responsavel uuid, _etapa uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.leads_da_exportacao(_org uuid, _ini timestamp with time zone, _fim timestamp with time zone, _responsavel uuid, _etapa uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.leads_da_exportacao(_org uuid, _ini timestamp with time zone, _fim timestamp with time zone, _responsavel uuid, _etapa uuid) TO service_role;


--
-- Name: FUNCTION leads_de_qual_pagina(_leads uuid[]); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.leads_de_qual_pagina(_leads uuid[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.leads_de_qual_pagina(_leads uuid[]) TO service_role;
GRANT ALL ON FUNCTION public.leads_de_qual_pagina(_leads uuid[]) TO authenticated;


--
-- Name: FUNCTION leads_etiquetas(_leads uuid[]); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.leads_etiquetas(_leads uuid[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.leads_etiquetas(_leads uuid[]) TO service_role;
GRANT ALL ON FUNCTION public.leads_etiquetas(_leads uuid[]) TO authenticated;


--
-- Name: FUNCTION leads_exportar(_de date, _ate date, _responsavel uuid, _etapa uuid, _so_contar boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.leads_exportar(_de date, _ate date, _responsavel uuid, _etapa uuid, _so_contar boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.leads_exportar(_de date, _ate date, _responsavel uuid, _etapa uuid, _so_contar boolean) TO service_role;
GRANT ALL ON FUNCTION public.leads_exportar(_de date, _ate date, _responsavel uuid, _etapa uuid, _so_contar boolean) TO authenticated;


--
-- Name: FUNCTION limitar(_chave text, _teto integer, _janela interval); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.limitar(_chave text, _teto integer, _janela interval) FROM PUBLIC;
GRANT ALL ON FUNCTION public.limitar(_chave text, _teto integer, _janela interval) TO service_role;


--
-- Name: FUNCTION limpar_credencial_do_passado(_lote integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.limpar_credencial_do_passado(_lote integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.limpar_credencial_do_passado(_lote integer) TO service_role;


--
-- Name: FUNCTION log_timeline_event(_lead_id uuid, _category text, _event_type text, _title text, _description text, _metadata jsonb, _actor uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.log_timeline_event(_lead_id uuid, _category text, _event_type text, _title text, _description text, _metadata jsonb, _actor uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.log_timeline_event(_lead_id uuid, _category text, _event_type text, _title text, _description text, _metadata jsonb, _actor uuid) TO authenticated;
GRANT ALL ON FUNCTION public.log_timeline_event(_lead_id uuid, _category text, _event_type text, _title text, _description text, _metadata jsonb, _actor uuid) TO service_role;


--
-- Name: FUNCTION marcar_conversa_lida(_conversation_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.marcar_conversa_lida(_conversation_id uuid) TO anon;
GRANT ALL ON FUNCTION public.marcar_conversa_lida(_conversation_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.marcar_conversa_lida(_conversation_id uuid) TO service_role;


--
-- Name: FUNCTION meta_cobertura_atribuicao(_since date, _until date); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.meta_cobertura_atribuicao(_since date, _until date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.meta_cobertura_atribuicao(_since date, _until date) TO authenticated;
GRANT ALL ON FUNCTION public.meta_cobertura_atribuicao(_since date, _until date) TO service_role;


--
-- Name: FUNCTION meta_conexao_e_minha(_integracao uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.meta_conexao_e_minha(_integracao uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.meta_conexao_e_minha(_integracao uuid) TO authenticated;
GRANT ALL ON FUNCTION public.meta_conexao_e_minha(_integracao uuid) TO service_role;


--
-- Name: FUNCTION meta_conta_e_minha(_ad_account_id text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.meta_conta_e_minha(_ad_account_id text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.meta_conta_e_minha(_ad_account_id text) TO authenticated;
GRANT ALL ON FUNCTION public.meta_conta_e_minha(_ad_account_id text) TO service_role;


--
-- Name: FUNCTION meta_conversao_descartar(_id uuid, _motivo text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.meta_conversao_descartar(_id uuid, _motivo text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.meta_conversao_descartar(_id uuid, _motivo text) TO service_role;


--
-- Name: FUNCTION meta_conversao_enfileirar(_lead uuid, _evento text, _quando timestamp with time zone, _valor bigint); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.meta_conversao_enfileirar(_lead uuid, _evento text, _quando timestamp with time zone, _valor bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.meta_conversao_enfileirar(_lead uuid, _evento text, _quando timestamp with time zone, _valor bigint) TO service_role;


--
-- Name: FUNCTION meta_conversao_enviada(_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.meta_conversao_enviada(_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.meta_conversao_enviada(_id uuid) TO service_role;


--
-- Name: FUNCTION meta_conversao_falhou(_id uuid, _codigo integer, _motivo text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.meta_conversao_falhou(_id uuid, _codigo integer, _motivo text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.meta_conversao_falhou(_id uuid, _codigo integer, _motivo text) TO service_role;


--
-- Name: FUNCTION meta_conversoes_drenar(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.meta_conversoes_drenar() FROM PUBLIC;
GRANT ALL ON FUNCTION public.meta_conversoes_drenar() TO service_role;


--
-- Name: FUNCTION meta_conversoes_expirar(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.meta_conversoes_expirar() FROM PUBLIC;
GRANT ALL ON FUNCTION public.meta_conversoes_expirar() TO service_role;


--
-- Name: FUNCTION meta_conversoes_pendencia(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.meta_conversoes_pendencia() FROM PUBLIC;
GRANT ALL ON FUNCTION public.meta_conversoes_pendencia() TO service_role;
GRANT ALL ON FUNCTION public.meta_conversoes_pendencia() TO authenticated;


--
-- Name: FUNCTION meta_conversoes_reenfileirar(_limite integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.meta_conversoes_reenfileirar(_limite integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.meta_conversoes_reenfileirar(_limite integer) TO service_role;


--
-- Name: FUNCTION meta_conversoes_reivindicar(_limite integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.meta_conversoes_reivindicar(_limite integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.meta_conversoes_reivindicar(_limite integer) TO service_role;


--
-- Name: FUNCTION meta_conversoes_resumo(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.meta_conversoes_resumo() FROM PUBLIC;
GRANT ALL ON FUNCTION public.meta_conversoes_resumo() TO service_role;
GRANT ALL ON FUNCTION public.meta_conversoes_resumo() TO authenticated;


--
-- Name: FUNCTION meta_drenar(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.meta_drenar() FROM PUBLIC;
GRANT ALL ON FUNCTION public.meta_drenar() TO service_role;


--
-- Name: FUNCTION meta_evento_falhou(_id uuid, _codigo integer, _motivo text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.meta_evento_falhou(_id uuid, _codigo integer, _motivo text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.meta_evento_falhou(_id uuid, _codigo integer, _motivo text) TO service_role;


--
-- Name: FUNCTION meta_fora_do_painel_anuncios(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.meta_fora_do_painel_anuncios() FROM PUBLIC;
GRANT ALL ON FUNCTION public.meta_fora_do_painel_anuncios() TO authenticated;
GRANT ALL ON FUNCTION public.meta_fora_do_painel_anuncios() TO service_role;


--
-- Name: FUNCTION meta_fora_do_painel_campanhas(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.meta_fora_do_painel_campanhas() FROM PUBLIC;
GRANT ALL ON FUNCTION public.meta_fora_do_painel_campanhas() TO authenticated;
GRANT ALL ON FUNCTION public.meta_fora_do_painel_campanhas() TO service_role;


--
-- Name: FUNCTION meta_gasto_agregado(_since date, _until date, _nivel text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.meta_gasto_agregado(_since date, _until date, _nivel text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.meta_gasto_agregado(_since date, _until date, _nivel text) TO authenticated;
GRANT ALL ON FUNCTION public.meta_gasto_agregado(_since date, _until date, _nivel text) TO service_role;


--
-- Name: FUNCTION meta_importar_gasto(_modo text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.meta_importar_gasto(_modo text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.meta_importar_gasto(_modo text) TO service_role;


--
-- Name: FUNCTION meta_reivindicar_conta(_integracao uuid, _ad_account_id text, _nome text, _moeda text, _fuso text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.meta_reivindicar_conta(_integracao uuid, _ad_account_id text, _nome text, _moeda text, _fuso text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.meta_reivindicar_conta(_integracao uuid, _ad_account_id text, _nome text, _moeda text, _fuso text) TO service_role;


--
-- Name: TABLE meta_webhook_inbox; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.meta_webhook_inbox TO service_role;


--
-- Name: FUNCTION meta_reivindicar_eventos(_limit integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.meta_reivindicar_eventos(_limit integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.meta_reivindicar_eventos(_limit integer) TO service_role;


--
-- Name: FUNCTION meta_reivindicar_pagina(_integracao uuid, _page_id text, _nome text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.meta_reivindicar_pagina(_integracao uuid, _page_id text, _nome text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.meta_reivindicar_pagina(_integracao uuid, _page_id text, _nome text) TO service_role;


--
-- Name: FUNCTION meta_saude(_integracao uuid, _saude text, _codigo integer, _msg text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.meta_saude(_integracao uuid, _saude text, _codigo integer, _msg text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.meta_saude(_integracao uuid, _saude text, _codigo integer, _msg text) TO service_role;


--
-- Name: FUNCTION meta_soltar_presas(_minutos integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.meta_soltar_presas(_minutos integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.meta_soltar_presas(_minutos integer) TO service_role;


--
-- Name: FUNCTION meta_ultima_sincronizacao(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.meta_ultima_sincronizacao() FROM PUBLIC;
GRANT ALL ON FUNCTION public.meta_ultima_sincronizacao() TO service_role;
GRANT ALL ON FUNCTION public.meta_ultima_sincronizacao() TO authenticated;


--
-- Name: FUNCTION meta_verificar_presos(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.meta_verificar_presos() FROM PUBLIC;
GRANT ALL ON FUNCTION public.meta_verificar_presos() TO service_role;


--
-- Name: FUNCTION meta_zerar_ausentes(_org uuid, _conta text, _since date, _until date, _run uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.meta_zerar_ausentes(_org uuid, _conta text, _since date, _until date, _run uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.meta_zerar_ausentes(_org uuid, _conta text, _since date, _until date, _run uuid) TO service_role;


--
-- Name: FUNCTION mkt_cadeia_por_anuncio(_since date, _until date); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.mkt_cadeia_por_anuncio(_since date, _until date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.mkt_cadeia_por_anuncio(_since date, _until date) TO service_role;
GRANT ALL ON FUNCTION public.mkt_cadeia_por_anuncio(_since date, _until date) TO authenticated;


--
-- Name: FUNCTION mkt_inteligencia(_since date, _until date); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.mkt_inteligencia(_since date, _until date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.mkt_inteligencia(_since date, _until date) TO service_role;
GRANT ALL ON FUNCTION public.mkt_inteligencia(_since date, _until date) TO authenticated;


--
-- Name: FUNCTION mkt_por_angulo(_since date, _until date); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.mkt_por_angulo(_since date, _until date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.mkt_por_angulo(_since date, _until date) TO authenticated;
GRANT ALL ON FUNCTION public.mkt_por_angulo(_since date, _until date) TO service_role;


--
-- Name: FUNCTION nome_curto_do_imovel(_titulo text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.nome_curto_do_imovel(_titulo text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.nome_curto_do_imovel(_titulo text) TO authenticated;
GRANT ALL ON FUNCTION public.nome_curto_do_imovel(_titulo text) TO service_role;


--
-- Name: FUNCTION notification_audience(_org uuid, _lead_id uuid, _dono uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.notification_audience(_org uuid, _lead_id uuid, _dono uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.notification_audience(_org uuid, _lead_id uuid, _dono uuid) TO service_role;


--
-- Name: FUNCTION painel_funil(_org uuid, _de date, _ate date); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.painel_funil(_org uuid, _de date, _ate date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.painel_funil(_org uuid, _de date, _ate date) TO authenticated;
GRANT ALL ON FUNCTION public.painel_funil(_org uuid, _de date, _ate date) TO service_role;


--
-- Name: FUNCTION painel_indicadores(_since date, _until date); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.painel_indicadores(_since date, _until date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.painel_indicadores(_since date, _until date) TO authenticated;
GRANT ALL ON FUNCTION public.painel_indicadores(_since date, _until date) TO service_role;


--
-- Name: FUNCTION painel_janela(_org uuid, _de date, _ate date); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.painel_janela(_org uuid, _de date, _ate date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.painel_janela(_org uuid, _de date, _ate date) TO authenticated;
GRANT ALL ON FUNCTION public.painel_janela(_org uuid, _de date, _ate date) TO service_role;


--
-- Name: FUNCTION painel_origens(_org uuid, _de date, _ate date); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.painel_origens(_org uuid, _de date, _ate date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.painel_origens(_org uuid, _de date, _ate date) TO authenticated;
GRANT ALL ON FUNCTION public.painel_origens(_org uuid, _de date, _ate date) TO service_role;


--
-- Name: FUNCTION painel_serie(_org uuid, _de date, _ate date); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.painel_serie(_org uuid, _de date, _ate date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.painel_serie(_org uuid, _de date, _ate date) TO authenticated;
GRANT ALL ON FUNCTION public.painel_serie(_org uuid, _de date, _ate date) TO service_role;


--
-- Name: FUNCTION pais_da_discagem(_e164 text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.pais_da_discagem(_e164 text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.pais_da_discagem(_e164 text) TO service_role;
GRANT ALL ON FUNCTION public.pais_da_discagem(_e164 text) TO authenticated;


--
-- Name: FUNCTION parse_ref_code(_texto text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.parse_ref_code(_texto text) TO anon;
GRANT ALL ON FUNCTION public.parse_ref_code(_texto text) TO authenticated;
GRANT ALL ON FUNCTION public.parse_ref_code(_texto text) TO service_role;


--
-- Name: FUNCTION pessoais_contagem(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.pessoais_contagem() FROM PUBLIC;
GRANT ALL ON FUNCTION public.pessoais_contagem() TO authenticated;
GRANT ALL ON FUNCTION public.pessoais_contagem() TO service_role;


--
-- Name: FUNCTION pode_ver_conversa(_conv_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.pode_ver_conversa(_conv_id uuid) TO anon;
GRANT ALL ON FUNCTION public.pode_ver_conversa(_conv_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.pode_ver_conversa(_conv_id uuid) TO service_role;


--
-- Name: FUNCTION pode_ver_documento(_doc_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.pode_ver_documento(_doc_id uuid) TO anon;
GRANT ALL ON FUNCTION public.pode_ver_documento(_doc_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.pode_ver_documento(_doc_id uuid) TO service_role;


--
-- Name: FUNCTION pode_ver_pasta_de_lead(_lead text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.pode_ver_pasta_de_lead(_lead text) TO anon;
GRANT ALL ON FUNCTION public.pode_ver_pasta_de_lead(_lead text) TO authenticated;
GRANT ALL ON FUNCTION public.pode_ver_pasta_de_lead(_lead text) TO service_role;


--
-- Name: FUNCTION porta_da_mensagem(_raw jsonb, _ref_code text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.porta_da_mensagem(_raw jsonb, _ref_code text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.porta_da_mensagem(_raw jsonb, _ref_code text) TO service_role;


--
-- Name: FUNCTION prazo_do_texto(_texto text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.prazo_do_texto(_texto text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.prazo_do_texto(_texto text) TO service_role;


--
-- Name: FUNCTION processar_inbox(_limit integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.processar_inbox(_limit integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.processar_inbox(_limit integer) TO service_role;


--
-- Name: FUNCTION push_drenar(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.push_drenar() FROM PUBLIC;
GRANT ALL ON FUNCTION public.push_drenar() TO service_role;


--
-- Name: FUNCTION push_verificar_atraso(_minutos integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.push_verificar_atraso(_minutos integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.push_verificar_atraso(_minutos integer) TO service_role;


--
-- Name: FUNCTION quem_ve_a_conversa(_conv uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.quem_ve_a_conversa(_conv uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.quem_ve_a_conversa(_conv uuid) TO service_role;


--
-- Name: FUNCTION rls_auto_enable(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.rls_auto_enable() TO anon;
GRANT ALL ON FUNCTION public.rls_auto_enable() TO authenticated;
GRANT ALL ON FUNCTION public.rls_auto_enable() TO service_role;


--
-- Name: FUNCTION run_due_reminders(_limit integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.run_due_reminders(_limit integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.run_due_reminders(_limit integer) TO service_role;


--
-- Name: FUNCTION sem_credencial(_payload jsonb); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.sem_credencial(_payload jsonb) TO anon;
GRANT ALL ON FUNCTION public.sem_credencial(_payload jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.sem_credencial(_payload jsonb) TO service_role;


--
-- Name: FUNCTION set_updated_at(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.set_updated_at() TO anon;
GRANT ALL ON FUNCTION public.set_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.set_updated_at() TO service_role;


--
-- Name: FUNCTION slugify(_txt text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.slugify(_txt text) TO anon;
GRANT ALL ON FUNCTION public.slugify(_txt text) TO authenticated;
GRANT ALL ON FUNCTION public.slugify(_txt text) TO service_role;


--
-- Name: FUNCTION snooze_reminder(_id uuid, _minutos integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.snooze_reminder(_id uuid, _minutos integer) TO anon;
GRANT ALL ON FUNCTION public.snooze_reminder(_id uuid, _minutos integer) TO authenticated;
GRANT ALL ON FUNCTION public.snooze_reminder(_id uuid, _minutos integer) TO service_role;


--
-- Name: FUNCTION tg_agente_agenda_resposta(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.tg_agente_agenda_resposta() TO anon;
GRANT ALL ON FUNCTION public.tg_agente_agenda_resposta() TO authenticated;
GRANT ALL ON FUNCTION public.tg_agente_agenda_resposta() TO service_role;


--
-- Name: FUNCTION tg_conexao_meta_ganha_nome(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.tg_conexao_meta_ganha_nome() TO anon;
GRANT ALL ON FUNCTION public.tg_conexao_meta_ganha_nome() TO authenticated;
GRANT ALL ON FUNCTION public.tg_conexao_meta_ganha_nome() TO service_role;


--
-- Name: FUNCTION tg_conversa_foto(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.tg_conversa_foto() TO anon;
GRANT ALL ON FUNCTION public.tg_conversa_foto() TO authenticated;
GRANT ALL ON FUNCTION public.tg_conversa_foto() TO service_role;


--
-- Name: FUNCTION tg_conversa_virou_lead_pega_midia(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.tg_conversa_virou_lead_pega_midia() TO anon;
GRANT ALL ON FUNCTION public.tg_conversa_virou_lead_pega_midia() TO authenticated;
GRANT ALL ON FUNCTION public.tg_conversa_virou_lead_pega_midia() TO service_role;


--
-- Name: FUNCTION tg_desativado_solta_lembretes(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.tg_desativado_solta_lembretes() TO anon;
GRANT ALL ON FUNCTION public.tg_desativado_solta_lembretes() TO authenticated;
GRANT ALL ON FUNCTION public.tg_desativado_solta_lembretes() TO service_role;


--
-- Name: FUNCTION tg_enfileirar_push(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.tg_enfileirar_push() TO anon;
GRANT ALL ON FUNCTION public.tg_enfileirar_push() TO authenticated;
GRANT ALL ON FUNCTION public.tg_enfileirar_push() TO service_role;


--
-- Name: FUNCTION tg_gasto_adota_lead_orfao(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.tg_gasto_adota_lead_orfao() TO anon;
GRANT ALL ON FUNCTION public.tg_gasto_adota_lead_orfao() TO authenticated;
GRANT ALL ON FUNCTION public.tg_gasto_adota_lead_orfao() TO service_role;


--
-- Name: FUNCTION tg_inbox_sem_credencial(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.tg_inbox_sem_credencial() TO anon;
GRANT ALL ON FUNCTION public.tg_inbox_sem_credencial() TO authenticated;
GRANT ALL ON FUNCTION public.tg_inbox_sem_credencial() TO service_role;


--
-- Name: FUNCTION tg_lead_atribuido(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.tg_lead_atribuido() TO anon;
GRANT ALL ON FUNCTION public.tg_lead_atribuido() TO authenticated;
GRANT ALL ON FUNCTION public.tg_lead_atribuido() TO service_role;


--
-- Name: FUNCTION tg_lead_conversao_etapa(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.tg_lead_conversao_etapa() TO anon;
GRANT ALL ON FUNCTION public.tg_lead_conversao_etapa() TO authenticated;
GRANT ALL ON FUNCTION public.tg_lead_conversao_etapa() TO service_role;


--
-- Name: FUNCTION tg_lead_conversao_nova(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.tg_lead_conversao_nova() TO anon;
GRANT ALL ON FUNCTION public.tg_lead_conversao_nova() TO authenticated;
GRANT ALL ON FUNCTION public.tg_lead_conversao_nova() TO service_role;


--
-- Name: FUNCTION tg_lead_conversao_origem(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.tg_lead_conversao_origem() TO anon;
GRANT ALL ON FUNCTION public.tg_lead_conversao_origem() TO authenticated;
GRANT ALL ON FUNCTION public.tg_lead_conversao_origem() TO service_role;


--
-- Name: FUNCTION tg_lead_do_dono_do_anuncio(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.tg_lead_do_dono_do_anuncio() TO anon;
GRANT ALL ON FUNCTION public.tg_lead_do_dono_do_anuncio() TO authenticated;
GRANT ALL ON FUNCTION public.tg_lead_do_dono_do_anuncio() TO service_role;


--
-- Name: FUNCTION tg_lead_do_dono_do_numero(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.tg_lead_do_dono_do_numero() TO anon;
GRANT ALL ON FUNCTION public.tg_lead_do_dono_do_numero() TO authenticated;
GRANT ALL ON FUNCTION public.tg_lead_do_dono_do_numero() TO service_role;


--
-- Name: FUNCTION tg_lead_espera(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.tg_lead_espera() TO anon;
GRANT ALL ON FUNCTION public.tg_lead_espera() TO authenticated;
GRANT ALL ON FUNCTION public.tg_lead_espera() TO service_role;


--
-- Name: FUNCTION tg_lead_landing_do_ref(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.tg_lead_landing_do_ref() TO anon;
GRANT ALL ON FUNCTION public.tg_lead_landing_do_ref() TO authenticated;
GRANT ALL ON FUNCTION public.tg_lead_landing_do_ref() TO service_role;


--
-- Name: FUNCTION tg_lead_marca_avanco(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.tg_lead_marca_avanco() TO anon;
GRANT ALL ON FUNCTION public.tg_lead_marca_avanco() TO authenticated;
GRANT ALL ON FUNCTION public.tg_lead_marca_avanco() TO service_role;


--
-- Name: FUNCTION tg_lead_nasce_com_dono(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.tg_lead_nasce_com_dono() TO anon;
GRANT ALL ON FUNCTION public.tg_lead_nasce_com_dono() TO authenticated;
GRANT ALL ON FUNCTION public.tg_lead_nasce_com_dono() TO service_role;


--
-- Name: FUNCTION tg_lead_primeiro_contato(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.tg_lead_primeiro_contato() TO anon;
GRANT ALL ON FUNCTION public.tg_lead_primeiro_contato() TO authenticated;
GRANT ALL ON FUNCTION public.tg_lead_primeiro_contato() TO service_role;


--
-- Name: FUNCTION tg_lead_qualificacao(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.tg_lead_qualificacao() TO anon;
GRANT ALL ON FUNCTION public.tg_lead_qualificacao() TO authenticated;
GRANT ALL ON FUNCTION public.tg_lead_qualificacao() TO service_role;


--
-- Name: FUNCTION tg_lead_stage_change(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.tg_lead_stage_change() TO anon;
GRANT ALL ON FUNCTION public.tg_lead_stage_change() TO authenticated;
GRANT ALL ON FUNCTION public.tg_lead_stage_change() TO service_role;


--
-- Name: FUNCTION tg_mantem_um_admin(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.tg_mantem_um_admin() TO anon;
GRANT ALL ON FUNCTION public.tg_mantem_um_admin() TO authenticated;
GRANT ALL ON FUNCTION public.tg_mantem_um_admin() TO service_role;


--
-- Name: FUNCTION tg_mensagem_qualifica(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.tg_mensagem_qualifica() TO anon;
GRANT ALL ON FUNCTION public.tg_mensagem_qualifica() TO authenticated;
GRANT ALL ON FUNCTION public.tg_mensagem_qualifica() TO service_role;


--
-- Name: FUNCTION tg_mensagem_sem_credencial(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.tg_mensagem_sem_credencial() TO anon;
GRANT ALL ON FUNCTION public.tg_mensagem_sem_credencial() TO authenticated;
GRANT ALL ON FUNCTION public.tg_mensagem_sem_credencial() TO service_role;


--
-- Name: FUNCTION tg_nao_desativa_a_si(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.tg_nao_desativa_a_si() TO anon;
GRANT ALL ON FUNCTION public.tg_nao_desativa_a_si() TO authenticated;
GRANT ALL ON FUNCTION public.tg_nao_desativa_a_si() TO service_role;


--
-- Name: FUNCTION tg_notify_lead_novo(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.tg_notify_lead_novo() TO anon;
GRANT ALL ON FUNCTION public.tg_notify_lead_novo() TO authenticated;
GRANT ALL ON FUNCTION public.tg_notify_lead_novo() TO service_role;


--
-- Name: FUNCTION tg_perfil_nao_troca_de_org(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.tg_perfil_nao_troca_de_org() TO anon;
GRANT ALL ON FUNCTION public.tg_perfil_nao_troca_de_org() TO authenticated;
GRANT ALL ON FUNCTION public.tg_perfil_nao_troca_de_org() TO service_role;


--
-- Name: FUNCTION tg_preferencia_ao_nascer(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.tg_preferencia_ao_nascer() TO anon;
GRANT ALL ON FUNCTION public.tg_preferencia_ao_nascer() TO authenticated;
GRANT ALL ON FUNCTION public.tg_preferencia_ao_nascer() TO service_role;


--
-- Name: FUNCTION tg_prefs_limita_alcance(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.tg_prefs_limita_alcance() TO anon;
GRANT ALL ON FUNCTION public.tg_prefs_limita_alcance() TO authenticated;
GRANT ALL ON FUNCTION public.tg_prefs_limita_alcance() TO service_role;


--
-- Name: FUNCTION tg_property_slug(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.tg_property_slug() TO anon;
GRANT ALL ON FUNCTION public.tg_property_slug() TO authenticated;
GRANT ALL ON FUNCTION public.tg_property_slug() TO service_role;


--
-- Name: FUNCTION tg_saida_automatica_so_para_lead(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.tg_saida_automatica_so_para_lead() TO anon;
GRANT ALL ON FUNCTION public.tg_saida_automatica_so_para_lead() TO authenticated;
GRANT ALL ON FUNCTION public.tg_saida_automatica_so_para_lead() TO service_role;


--
-- Name: FUNCTION tg_so_admin_cria_admin(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.tg_so_admin_cria_admin() TO anon;
GRANT ALL ON FUNCTION public.tg_so_admin_cria_admin() TO authenticated;
GRANT ALL ON FUNCTION public.tg_so_admin_cria_admin() TO service_role;


--
-- Name: FUNCTION tg_so_o_dono_torna_pessoal(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.tg_so_o_dono_torna_pessoal() TO anon;
GRANT ALL ON FUNCTION public.tg_so_o_dono_torna_pessoal() TO authenticated;
GRANT ALL ON FUNCTION public.tg_so_o_dono_torna_pessoal() TO service_role;


--
-- Name: FUNCTION tg_visit_carimbos(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.tg_visit_carimbos() TO anon;
GRANT ALL ON FUNCTION public.tg_visit_carimbos() TO authenticated;
GRANT ALL ON FUNCTION public.tg_visit_carimbos() TO service_role;


--
-- Name: FUNCTION tg_visit_cria_lembrete(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.tg_visit_cria_lembrete() TO anon;
GRANT ALL ON FUNCTION public.tg_visit_cria_lembrete() TO authenticated;
GRANT ALL ON FUNCTION public.tg_visit_cria_lembrete() TO service_role;


--
-- Name: FUNCTION tg_visit_timeline(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.tg_visit_timeline() TO anon;
GRANT ALL ON FUNCTION public.tg_visit_timeline() TO authenticated;
GRANT ALL ON FUNCTION public.tg_visit_timeline() TO service_role;


--
-- Name: FUNCTION tg_whatsapp_respeita_teto(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.tg_whatsapp_respeita_teto() TO anon;
GRANT ALL ON FUNCTION public.tg_whatsapp_respeita_teto() TO authenticated;
GRANT ALL ON FUNCTION public.tg_whatsapp_respeita_teto() TO service_role;


--
-- Name: FUNCTION tg_whatsapp_um_por_corretor(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.tg_whatsapp_um_por_corretor() TO anon;
GRANT ALL ON FUNCTION public.tg_whatsapp_um_por_corretor() TO authenticated;
GRANT ALL ON FUNCTION public.tg_whatsapp_um_por_corretor() TO service_role;


--
-- Name: FUNCTION tipo_da_mensagem(_msg jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.tipo_da_mensagem(_msg jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.tipo_da_mensagem(_msg jsonb) TO service_role;


--
-- Name: FUNCTION titulo_publico(_public_title text, _tipo text, _quartos integer, _bairro text, _cidade text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.titulo_publico(_public_title text, _tipo text, _quartos integer, _bairro text, _cidade text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.titulo_publico(_public_title text, _tipo text, _quartos integer, _bairro text, _cidade text) TO anon;
GRANT ALL ON FUNCTION public.titulo_publico(_public_title text, _tipo text, _quartos integer, _bairro text, _cidade text) TO authenticated;
GRANT ALL ON FUNCTION public.titulo_publico(_public_title text, _tipo text, _quartos integer, _bairro text, _cidade text) TO service_role;


--
-- Name: FUNCTION to_base36(_n bigint); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.to_base36(_n bigint) TO anon;
GRANT ALL ON FUNCTION public.to_base36(_n bigint) TO authenticated;
GRANT ALL ON FUNCTION public.to_base36(_n bigint) TO service_role;


--
-- Name: FUNCTION touch_lead_attribution(_lead_id uuid, _attr jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.touch_lead_attribution(_lead_id uuid, _attr jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.touch_lead_attribution(_lead_id uuid, _attr jsonb) TO service_role;


--
-- Name: FUNCTION vault_apagar(_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.vault_apagar(_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.vault_apagar(_id uuid) TO service_role;


--
-- Name: FUNCTION vault_guardar(_nome text, _valor text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.vault_guardar(_nome text, _valor text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.vault_guardar(_nome text, _valor text) TO service_role;


--
-- Name: FUNCTION vault_ler(_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.vault_ler(_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.vault_ler(_id uuid) TO service_role;


--
-- Name: FUNCTION ve_a_carteira_toda(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.ve_a_carteira_toda() FROM PUBLIC;
GRANT ALL ON FUNCTION public.ve_a_carteira_toda() TO authenticated;
GRANT ALL ON FUNCTION public.ve_a_carteira_toda() TO service_role;


--
-- Name: FUNCTION visit_conflicts(_assigned_to uuid, _starts_at timestamp with time zone, _ends_at timestamp with time zone, _ignore_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.visit_conflicts(_assigned_to uuid, _starts_at timestamp with time zone, _ends_at timestamp with time zone, _ignore_id uuid) TO anon;
GRANT ALL ON FUNCTION public.visit_conflicts(_assigned_to uuid, _starts_at timestamp with time zone, _ends_at timestamp with time zone, _ignore_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.visit_conflicts(_assigned_to uuid, _starts_at timestamp with time zone, _ends_at timestamp with time zone, _ignore_id uuid) TO service_role;


--
-- Name: FUNCTION wa_classificar_conversa(_conversa uuid, _classificacao text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.wa_classificar_conversa(_conversa uuid, _classificacao text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.wa_classificar_conversa(_conversa uuid, _classificacao text) TO authenticated;
GRANT ALL ON FUNCTION public.wa_classificar_conversa(_conversa uuid, _classificacao text) TO service_role;


--
-- Name: FUNCTION wa_e_pessoal(_classification text, _is_group boolean); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.wa_e_pessoal(_classification text, _is_group boolean) TO anon;
GRANT ALL ON FUNCTION public.wa_e_pessoal(_classification text, _is_group boolean) TO authenticated;
GRANT ALL ON FUNCTION public.wa_e_pessoal(_classification text, _is_group boolean) TO service_role;


--
-- Name: FUNCTION wa_estado_da_conversa(_conv uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.wa_estado_da_conversa(_conv uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.wa_estado_da_conversa(_conv uuid) TO authenticated;
GRANT ALL ON FUNCTION public.wa_estado_da_conversa(_conv uuid) TO service_role;


--
-- Name: FUNCTION wa_numero_resumo(_instancia uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.wa_numero_resumo(_instancia uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.wa_numero_resumo(_instancia uuid) TO authenticated;
GRANT ALL ON FUNCTION public.wa_numero_resumo(_instancia uuid) TO service_role;


--
-- Name: FUNCTION wa_tem_origem(_source text, _ft_meta_ad_id text, _ft_landing_page_id uuid, _ft_utm_source text, _ref_code text, _property_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.wa_tem_origem(_source text, _ft_meta_ad_id text, _ft_landing_page_id uuid, _ft_utm_source text, _ref_code text, _property_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.wa_tem_origem(_source text, _ft_meta_ad_id text, _ft_landing_page_id uuid, _ft_utm_source text, _ref_code text, _property_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.wa_tem_origem(_source text, _ft_meta_ad_id text, _ft_landing_page_id uuid, _ft_utm_source text, _ref_code text, _property_id uuid) TO service_role;


--
-- Name: FUNCTION whatsapp_alarmes(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.whatsapp_alarmes() FROM PUBLIC;
GRANT ALL ON FUNCTION public.whatsapp_alarmes() TO service_role;
GRANT ALL ON FUNCTION public.whatsapp_alarmes() TO authenticated;


--
-- Name: FUNCTION whatsapp_drenar_saida(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.whatsapp_drenar_saida() FROM PUBLIC;
GRANT ALL ON FUNCTION public.whatsapp_drenar_saida() TO service_role;


--
-- Name: FUNCTION whatsapp_fotos_pendentes(_limite integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.whatsapp_fotos_pendentes(_limite integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.whatsapp_fotos_pendentes(_limite integer) TO service_role;


--
-- Name: FUNCTION whatsapp_quem_avisar(_org uuid, _dono uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.whatsapp_quem_avisar(_org uuid, _dono uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.whatsapp_quem_avisar(_org uuid, _dono uuid) TO service_role;


--
-- Name: FUNCTION whatsapp_saude(_minutos integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.whatsapp_saude(_minutos integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.whatsapp_saude(_minutos integer) TO service_role;


--
-- Name: TABLE availability_blocks; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.availability_blocks TO anon;
GRANT ALL ON TABLE public.availability_blocks TO authenticated;
GRANT ALL ON TABLE public.availability_blocks TO service_role;


--
-- Name: TABLE broker_availability; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.broker_availability TO anon;
GRANT ALL ON TABLE public.broker_availability TO authenticated;
GRANT ALL ON TABLE public.broker_availability TO service_role;


--
-- Name: TABLE document_templates; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.document_templates TO anon;
GRANT ALL ON TABLE public.document_templates TO authenticated;
GRANT ALL ON TABLE public.document_templates TO service_role;


--
-- Name: TABLE documents; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.documents TO anon;
GRANT ALL ON TABLE public.documents TO authenticated;
GRANT ALL ON TABLE public.documents TO service_role;


--
-- Name: TABLE error_reports; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.error_reports TO anon;
GRANT ALL ON TABLE public.error_reports TO authenticated;
GRANT ALL ON TABLE public.error_reports TO service_role;


--
-- Name: TABLE landing_cidades; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.landing_cidades TO anon;
GRANT ALL ON TABLE public.landing_cidades TO authenticated;
GRANT ALL ON TABLE public.landing_cidades TO service_role;


--
-- Name: TABLE landing_page_daily; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.landing_page_daily TO anon;
GRANT ALL ON TABLE public.landing_page_daily TO authenticated;
GRANT ALL ON TABLE public.landing_page_daily TO service_role;


--
-- Name: TABLE landing_pontos; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.landing_pontos TO anon;
GRANT ALL ON TABLE public.landing_pontos TO authenticated;
GRANT ALL ON TABLE public.landing_pontos TO service_role;


--
-- Name: TABLE lead_exportacoes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.lead_exportacoes TO service_role;
GRANT SELECT ON TABLE public.lead_exportacoes TO authenticated;


--
-- Name: TABLE lead_property_interests; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.lead_property_interests TO anon;
GRANT ALL ON TABLE public.lead_property_interests TO authenticated;
GRANT ALL ON TABLE public.lead_property_interests TO service_role;


--
-- Name: TABLE lead_reminders; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.lead_reminders TO anon;
GRANT ALL ON TABLE public.lead_reminders TO authenticated;
GRANT ALL ON TABLE public.lead_reminders TO service_role;


--
-- Name: TABLE lead_timeline_events; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.lead_timeline_events TO anon;
GRANT ALL ON TABLE public.lead_timeline_events TO authenticated;
GRANT ALL ON TABLE public.lead_timeline_events TO service_role;


--
-- Name: TABLE limite_acessos; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.limite_acessos TO anon;
GRANT ALL ON TABLE public.limite_acessos TO authenticated;
GRANT ALL ON TABLE public.limite_acessos TO service_role;


--
-- Name: TABLE meta_ad_accounts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.meta_ad_accounts TO service_role;
GRANT SELECT ON TABLE public.meta_ad_accounts TO authenticated;


--
-- Name: COLUMN meta_ad_accounts.enabled; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(enabled) ON TABLE public.meta_ad_accounts TO authenticated;


--
-- Name: TABLE meta_ad_dimensions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.meta_ad_dimensions TO service_role;
GRANT SELECT ON TABLE public.meta_ad_dimensions TO authenticated;


--
-- Name: COLUMN meta_ad_dimensions.conta_no_painel; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(conta_no_painel) ON TABLE public.meta_ad_dimensions TO authenticated;


--
-- Name: COLUMN meta_ad_dimensions.property_id; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(property_id) ON TABLE public.meta_ad_dimensions TO authenticated;


--
-- Name: COLUMN meta_ad_dimensions.angulo; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(angulo) ON TABLE public.meta_ad_dimensions TO authenticated;


--
-- Name: TABLE meta_ads_spend; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.meta_ads_spend TO service_role;
GRANT SELECT ON TABLE public.meta_ads_spend TO authenticated;


--
-- Name: TABLE meta_conversoes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.meta_conversoes TO service_role;


--
-- Name: TABLE meta_forms; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.meta_forms TO anon;
GRANT ALL ON TABLE public.meta_forms TO authenticated;
GRANT ALL ON TABLE public.meta_forms TO service_role;


--
-- Name: TABLE meta_integrations; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.meta_integrations TO service_role;


--
-- Name: COLUMN meta_integrations.id; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(id) ON TABLE public.meta_integrations TO authenticated;


--
-- Name: COLUMN meta_integrations.organization_id; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(organization_id) ON TABLE public.meta_integrations TO authenticated;


--
-- Name: COLUMN meta_integrations.app_id; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(app_id) ON TABLE public.meta_integrations TO authenticated;


--
-- Name: COLUMN meta_integrations.token_type; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(token_type) ON TABLE public.meta_integrations TO authenticated;


--
-- Name: COLUMN meta_integrations.token_expires_at; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(token_expires_at) ON TABLE public.meta_integrations TO authenticated;


--
-- Name: COLUMN meta_integrations.scopes; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(scopes) ON TABLE public.meta_integrations TO authenticated;


--
-- Name: COLUMN meta_integrations.health; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(health) ON TABLE public.meta_integrations TO authenticated;


--
-- Name: COLUMN meta_integrations.health_error_code; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(health_error_code) ON TABLE public.meta_integrations TO authenticated;


--
-- Name: COLUMN meta_integrations.health_message; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(health_message) ON TABLE public.meta_integrations TO authenticated;


--
-- Name: COLUMN meta_integrations.health_changed_at; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(health_changed_at) ON TABLE public.meta_integrations TO authenticated;


--
-- Name: COLUMN meta_integrations.created_at; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(created_at) ON TABLE public.meta_integrations TO authenticated;


--
-- Name: COLUMN meta_integrations.updated_at; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(updated_at) ON TABLE public.meta_integrations TO authenticated;


--
-- Name: COLUMN meta_integrations.owner_id; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(owner_id) ON TABLE public.meta_integrations TO authenticated;


--
-- Name: COLUMN meta_integrations.label; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(label) ON TABLE public.meta_integrations TO authenticated;


--
-- Name: TABLE meta_lead_submissions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.meta_lead_submissions TO service_role;


--
-- Name: TABLE meta_pages; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.meta_pages TO service_role;


--
-- Name: COLUMN meta_pages.id; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(id) ON TABLE public.meta_pages TO authenticated;


--
-- Name: COLUMN meta_pages.organization_id; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(organization_id) ON TABLE public.meta_pages TO authenticated;


--
-- Name: COLUMN meta_pages.page_id; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(page_id) ON TABLE public.meta_pages TO authenticated;


--
-- Name: COLUMN meta_pages.page_name; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(page_name) ON TABLE public.meta_pages TO authenticated;


--
-- Name: COLUMN meta_pages.granted_at; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(granted_at) ON TABLE public.meta_pages TO authenticated;


--
-- Name: COLUMN meta_pages.created_at; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(created_at) ON TABLE public.meta_pages TO authenticated;


--
-- Name: COLUMN meta_pages.subscribed_at; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(subscribed_at) ON TABLE public.meta_pages TO authenticated;


--
-- Name: COLUMN meta_pages.subscribe_error; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(subscribe_error) ON TABLE public.meta_pages TO authenticated;


--
-- Name: COLUMN meta_pages.integration_id; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(integration_id) ON TABLE public.meta_pages TO authenticated;


--
-- Name: TABLE meta_sync_runs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.meta_sync_runs TO anon;
GRANT ALL ON TABLE public.meta_sync_runs TO authenticated;
GRANT ALL ON TABLE public.meta_sync_runs TO service_role;


--
-- Name: TABLE notification_preferences; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.notification_preferences TO anon;
GRANT ALL ON TABLE public.notification_preferences TO authenticated;
GRANT ALL ON TABLE public.notification_preferences TO service_role;


--
-- Name: TABLE notifications; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.notifications TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.notifications TO authenticated;
GRANT ALL ON TABLE public.notifications TO service_role;


--
-- Name: COLUMN notifications.is_read; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(is_read) ON TABLE public.notifications TO authenticated;


--
-- Name: COLUMN notifications.read_at; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(read_at) ON TABLE public.notifications TO authenticated;


--
-- Name: TABLE organizations; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.organizations TO anon;
GRANT ALL ON TABLE public.organizations TO authenticated;
GRANT ALL ON TABLE public.organizations TO service_role;


--
-- Name: TABLE pipeline_stages; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.pipeline_stages TO anon;
GRANT ALL ON TABLE public.pipeline_stages TO authenticated;
GRANT ALL ON TABLE public.pipeline_stages TO service_role;


--
-- Name: TABLE profiles; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.profiles TO anon;
GRANT ALL ON TABLE public.profiles TO authenticated;
GRANT ALL ON TABLE public.profiles TO service_role;


--
-- Name: COLUMN profiles.theme_color; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(theme_color) ON TABLE public.profiles TO authenticated;


--
-- Name: SEQUENCE property_code_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.property_code_seq TO anon;
GRANT ALL ON SEQUENCE public.property_code_seq TO authenticated;
GRANT ALL ON SEQUENCE public.property_code_seq TO service_role;


--
-- Name: TABLE properties; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.properties TO anon;
GRANT ALL ON TABLE public.properties TO authenticated;
GRANT ALL ON TABLE public.properties TO service_role;


--
-- Name: TABLE property_media; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.property_media TO anon;
GRANT ALL ON TABLE public.property_media TO authenticated;
GRANT ALL ON TABLE public.property_media TO service_role;


--
-- Name: TABLE property_slug_history; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.property_slug_history TO anon;
GRANT ALL ON TABLE public.property_slug_history TO authenticated;
GRANT ALL ON TABLE public.property_slug_history TO service_role;


--
-- Name: TABLE push_outbox; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.push_outbox TO anon;
GRANT ALL ON TABLE public.push_outbox TO service_role;


--
-- Name: TABLE push_subscriptions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.push_subscriptions TO anon;
GRANT ALL ON TABLE public.push_subscriptions TO service_role;
GRANT DELETE ON TABLE public.push_subscriptions TO authenticated;


--
-- Name: COLUMN push_subscriptions.id; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(id) ON TABLE public.push_subscriptions TO authenticated;


--
-- Name: COLUMN push_subscriptions.profile_id; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(profile_id) ON TABLE public.push_subscriptions TO authenticated;


--
-- Name: COLUMN push_subscriptions.user_agent; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(user_agent) ON TABLE public.push_subscriptions TO authenticated;


--
-- Name: COLUMN push_subscriptions.created_at; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(created_at) ON TABLE public.push_subscriptions TO authenticated;


--
-- Name: COLUMN push_subscriptions.last_seen_at; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(last_seen_at) ON TABLE public.push_subscriptions TO authenticated;


--
-- Name: COLUMN push_subscriptions.last_success_at; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(last_success_at) ON TABLE public.push_subscriptions TO authenticated;


--
-- Name: COLUMN push_subscriptions.failure_count; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(failure_count) ON TABLE public.push_subscriptions TO authenticated;


--
-- Name: TABLE user_roles; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.user_roles TO anon;
GRANT ALL ON TABLE public.user_roles TO authenticated;
GRANT ALL ON TABLE public.user_roles TO service_role;


--
-- Name: TABLE visits; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.visits TO anon;
GRANT ALL ON TABLE public.visits TO authenticated;
GRANT ALL ON TABLE public.visits TO service_role;


--
-- Name: TABLE whatsapp_conversations; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.whatsapp_conversations TO service_role;
GRANT SELECT ON TABLE public.whatsapp_conversations TO authenticated;


--
-- Name: COLUMN whatsapp_conversations.lead_id; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(lead_id) ON TABLE public.whatsapp_conversations TO authenticated;


--
-- Name: COLUMN whatsapp_conversations.unread_count; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(unread_count) ON TABLE public.whatsapp_conversations TO authenticated;


--
-- Name: COLUMN whatsapp_conversations.archived_at; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(archived_at) ON TABLE public.whatsapp_conversations TO authenticated;


--
-- Name: COLUMN whatsapp_conversations.classification; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(classification) ON TABLE public.whatsapp_conversations TO authenticated;


--
-- Name: TABLE whatsapp_conversas_v; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.whatsapp_conversas_v TO authenticated;
GRANT ALL ON TABLE public.whatsapp_conversas_v TO service_role;


--
-- Name: TABLE whatsapp_inbox; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.whatsapp_inbox TO service_role;


--
-- Name: TABLE whatsapp_instances; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.whatsapp_instances TO anon;
GRANT ALL ON TABLE public.whatsapp_instances TO service_role;


--
-- Name: COLUMN whatsapp_instances.id; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(id) ON TABLE public.whatsapp_instances TO authenticated;


--
-- Name: COLUMN whatsapp_instances.organization_id; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(organization_id) ON TABLE public.whatsapp_instances TO authenticated;


--
-- Name: COLUMN whatsapp_instances.label; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(label) ON TABLE public.whatsapp_instances TO authenticated;


--
-- Name: COLUMN whatsapp_instances.owner_id; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(owner_id) ON TABLE public.whatsapp_instances TO authenticated;


--
-- Name: COLUMN whatsapp_instances.provider; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(provider) ON TABLE public.whatsapp_instances TO authenticated;


--
-- Name: COLUMN whatsapp_instances.provider_instance_name; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(provider_instance_name) ON TABLE public.whatsapp_instances TO authenticated;


--
-- Name: COLUMN whatsapp_instances.status; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(status) ON TABLE public.whatsapp_instances TO authenticated;


--
-- Name: COLUMN whatsapp_instances.connected_phone_e164; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(connected_phone_e164) ON TABLE public.whatsapp_instances TO authenticated;


--
-- Name: COLUMN whatsapp_instances.connected_name; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(connected_name) ON TABLE public.whatsapp_instances TO authenticated;


--
-- Name: COLUMN whatsapp_instances.webhook_rotated_at; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(webhook_rotated_at) ON TABLE public.whatsapp_instances TO authenticated;


--
-- Name: COLUMN whatsapp_instances.webhook_configured_at; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(webhook_configured_at) ON TABLE public.whatsapp_instances TO authenticated;


--
-- Name: COLUMN whatsapp_instances.last_seen_at; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(last_seen_at) ON TABLE public.whatsapp_instances TO authenticated;


--
-- Name: COLUMN whatsapp_instances.last_error; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(last_error) ON TABLE public.whatsapp_instances TO authenticated;


--
-- Name: COLUMN whatsapp_instances.created_by; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(created_by) ON TABLE public.whatsapp_instances TO authenticated;


--
-- Name: COLUMN whatsapp_instances.created_at; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(created_at) ON TABLE public.whatsapp_instances TO authenticated;


--
-- Name: COLUMN whatsapp_instances.updated_at; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(updated_at) ON TABLE public.whatsapp_instances TO authenticated;


--
-- Name: TABLE whatsapp_messages; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.whatsapp_messages TO service_role;
GRANT DELETE ON TABLE public.whatsapp_messages TO authenticated;


--
-- Name: COLUMN whatsapp_messages.id; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(id) ON TABLE public.whatsapp_messages TO authenticated;


--
-- Name: COLUMN whatsapp_messages.organization_id; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(organization_id) ON TABLE public.whatsapp_messages TO authenticated;


--
-- Name: COLUMN whatsapp_messages.conversation_id; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(conversation_id) ON TABLE public.whatsapp_messages TO authenticated;


--
-- Name: COLUMN whatsapp_messages.lead_id; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(lead_id) ON TABLE public.whatsapp_messages TO authenticated;


--
-- Name: COLUMN whatsapp_messages.instance_id; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(instance_id) ON TABLE public.whatsapp_messages TO authenticated;


--
-- Name: COLUMN whatsapp_messages.direction; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(direction) ON TABLE public.whatsapp_messages TO authenticated;


--
-- Name: COLUMN whatsapp_messages.provider_message_id; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(provider_message_id) ON TABLE public.whatsapp_messages TO authenticated;


--
-- Name: COLUMN whatsapp_messages.dedupe_key; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(dedupe_key) ON TABLE public.whatsapp_messages TO authenticated;


--
-- Name: COLUMN whatsapp_messages.kind; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(kind) ON TABLE public.whatsapp_messages TO authenticated;


--
-- Name: COLUMN whatsapp_messages.body; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(body) ON TABLE public.whatsapp_messages TO authenticated;


--
-- Name: COLUMN whatsapp_messages.transcript; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(transcript) ON TABLE public.whatsapp_messages TO authenticated;


--
-- Name: COLUMN whatsapp_messages.ref_code; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(ref_code) ON TABLE public.whatsapp_messages TO authenticated;


--
-- Name: COLUMN whatsapp_messages.media_path; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(media_path) ON TABLE public.whatsapp_messages TO authenticated;


--
-- Name: COLUMN whatsapp_messages.media_status; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(media_status) ON TABLE public.whatsapp_messages TO authenticated;


--
-- Name: COLUMN whatsapp_messages.media_mime; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(media_mime) ON TABLE public.whatsapp_messages TO authenticated;


--
-- Name: COLUMN whatsapp_messages.media_bytes; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(media_bytes) ON TABLE public.whatsapp_messages TO authenticated;


--
-- Name: COLUMN whatsapp_messages.media_filename; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(media_filename) ON TABLE public.whatsapp_messages TO authenticated;


--
-- Name: COLUMN whatsapp_messages.status; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(status) ON TABLE public.whatsapp_messages TO authenticated;


--
-- Name: COLUMN whatsapp_messages.status_at; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(status_at) ON TABLE public.whatsapp_messages TO authenticated;


--
-- Name: COLUMN whatsapp_messages.error; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(error) ON TABLE public.whatsapp_messages TO authenticated;


--
-- Name: COLUMN whatsapp_messages.sent_by; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(sent_by) ON TABLE public.whatsapp_messages TO authenticated;


--
-- Name: COLUMN whatsapp_messages.revoked_at; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(revoked_at) ON TABLE public.whatsapp_messages TO authenticated;


--
-- Name: COLUMN whatsapp_messages.occurred_at; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(occurred_at) ON TABLE public.whatsapp_messages TO authenticated;


--
-- Name: COLUMN whatsapp_messages.created_at; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(created_at) ON TABLE public.whatsapp_messages TO authenticated;


--
-- Name: COLUMN whatsapp_messages.automatica; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(automatica) ON TABLE public.whatsapp_messages TO authenticated;


--
-- Name: TABLE whatsapp_outbox; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.whatsapp_outbox TO service_role;








--
-- PostgreSQL database dump complete
--


-- =============================================================================
-- Modelos de documento do sistema (de todas as organizações)
-- =============================================================================

INSERT INTO public.document_templates (id, organization_id, key, name, description, icon, body_html, fields, is_active, is_system, display_order, created_at, updated_at) VALUES ('fe5358f1-c20f-4b79-aae1-c0f71d86bc2c', NULL, 'termo_visita', 'Termo de Visita', 'Registra a visita ao imóvel e o vínculo com o corretor que a intermediou.', 'DoorOpen', '<h1>Termo de Visita</h1>
<p>Eu, <b>{{visitante_nome}}</b>, inscrito(a) no CPF sob o nº <b>{{visitante_cpf}}</b>, telefone {{visitante_telefone}}, declaro que visitei nesta data o imóvel situado em <b>{{imovel_endereco}}</b>, acompanhado(a) do(a) corretor(a) {{corretor_nome}}, CRECI {{corretor_creci}}, da {{imobiliaria_nome}}.</p>
<p>Declaro que tomei conhecimento do imóvel por intermédio da referida imobiliária e reconheço a sua intermediação para todos os fins, comprometendo-me a tratar por meio dela qualquer negociação envolvendo este imóvel, inclusive com terceiros a quem eu venha a indicá-lo.</p>
<p>Data da visita: <b>{{data_visita}}</b> às {{hora_visita}}.</p>
<div class="assinaturas">
  <div class="linha">{{visitante_nome}}<br><small>Visitante</small></div>
  <div class="linha">{{corretor_nome}}<br><small>CRECI {{corretor_creci}}</small></div>
</div>', '[{"k": "visitante_nome", "r": "Nome do visitante", "t": "texto", "obrig": true}, {"k": "visitante_cpf", "r": "CPF", "t": "cpf", "obrig": true}, {"k": "visitante_telefone", "r": "Telefone", "t": "telefone"}, {"k": "imovel_endereco", "r": "Endereço do imóvel", "t": "texto", "obrig": true}, {"k": "data_visita", "r": "Data da visita", "t": "data", "obrig": true}, {"k": "hora_visita", "r": "Hora", "t": "hora"}]', true, true, 10, '2026-09-24 22:34:55.417-03', '2026-09-24 22:34:55.417-03');
INSERT INTO public.document_templates (id, organization_id, key, name, description, icon, body_html, fields, is_active, is_system, display_order, created_at, updated_at) VALUES ('d71f7553-ee9b-4369-a6ae-bf1fc95d0787', NULL, 'autorizacao_venda', 'Autorização de Venda', 'Autoriza a imobiliária a intermediar a venda do imóvel, com prazo e comissão.', 'FileSignature', '<h1>Autorização de Venda</h1>
<p><b>{{proprietario_nome}}</b>, CPF/CNPJ nº <b>{{proprietario_cpf}}</b>, na qualidade de proprietário(a), autoriza a <b>{{imobiliaria_nome}}</b>, CNPJ {{imobiliaria_cnpj}}, a intermediar a venda do imóvel situado em <b>{{imovel_endereco}}</b>, matrícula nº {{imovel_matricula}}.</p>
<h2>Condições</h2>
<ul>
  <li>Valor pedido: <b>{{valor_pedido}}</b>.</li>
  <li>Comissão de intermediação: <b>{{comissao_percent}}%</b> sobre o valor efetivo da venda, devida na assinatura do instrumento de compra e venda.</li>
  <li>Prazo desta autorização: <b>{{prazo_meses}} meses</b>, contados desta data.</li>
  <li>Exclusividade: <b>{{exclusividade}}</b>.</li>
</ul>
<p>O proprietário declara que o imóvel está livre e desembaraçado de ônus que impeçam a venda, e compromete-se a comunicar à imobiliária qualquer proposta recebida diretamente durante a vigência desta autorização.</p>
<div class="assinaturas">
  <div class="linha">{{proprietario_nome}}<br><small>Proprietário(a)</small></div>
  <div class="linha">{{imobiliaria_nome}}<br><small>CRECI {{corretor_creci}}</small></div>
</div>', '[{"k": "proprietario_nome", "r": "Nome do proprietário", "t": "texto", "obrig": true}, {"k": "proprietario_cpf", "r": "CPF/CNPJ", "t": "cpf", "obrig": true}, {"k": "imovel_endereco", "r": "Endereço do imóvel", "t": "texto", "obrig": true}, {"k": "imovel_matricula", "r": "Matrícula", "t": "texto"}, {"k": "valor_pedido", "r": "Valor pedido", "t": "dinheiro", "obrig": true}, {"k": "comissao_percent", "r": "Comissão (%)", "t": "numero", "obrig": true}, {"k": "prazo_meses", "r": "Prazo (meses)", "t": "numero", "obrig": true}, {"k": "exclusividade", "r": "Com exclusividade?", "t": "opcao", "obrig": true, "opcoes": ["Sim", "Não"]}]', true, true, 20, '2026-09-24 22:34:55.417-03', '2026-09-24 22:34:55.417-03');
INSERT INTO public.document_templates (id, organization_id, key, name, description, icon, body_html, fields, is_active, is_system, display_order, created_at, updated_at) VALUES ('40bb5e4f-6bf7-4c0b-a941-149421d8da18', NULL, 'proposta_compra', 'Proposta de Compra', 'Proposta formal do comprador, com valor, forma de pagamento e prazo de validade.', 'HandCoins', '<h1>Proposta de Compra</h1>
<p><b>{{comprador_nome}}</b>, CPF nº <b>{{comprador_cpf}}</b>, apresenta proposta de compra do imóvel situado em <b>{{imovel_endereco}}</b>, nas condições abaixo.</p>
<h2>Proposta</h2>
<ul>
  <li>Valor proposto: <b>{{valor_proposto}}</b>.</li>
  <li>Forma de pagamento: {{forma_pagamento}}</li>
  <li>Validade desta proposta: <b>{{validade_dias}} dias</b> a partir desta data.</li>
</ul>
<p>{{condicoes}}</p>
<p>Esta proposta não constitui contrato de compra e venda e não gera obrigação de aceitação pelo proprietário. Aceita a proposta, as partes firmarão o instrumento próprio.</p>
<div class="assinaturas">
  <div class="linha">{{comprador_nome}}<br><small>Proponente</small></div>
  <div class="linha">{{corretor_nome}}<br><small>CRECI {{corretor_creci}}</small></div>
</div>', '[{"k": "comprador_nome", "r": "Nome do proponente", "t": "texto", "obrig": true}, {"k": "comprador_cpf", "r": "CPF", "t": "cpf", "obrig": true}, {"k": "imovel_endereco", "r": "Endereço do imóvel", "t": "texto", "obrig": true}, {"k": "valor_proposto", "r": "Valor proposto", "t": "dinheiro", "obrig": true}, {"k": "forma_pagamento", "r": "Forma de pagamento", "t": "longo", "obrig": true}, {"k": "validade_dias", "r": "Validade (dias)", "t": "numero", "obrig": true}, {"k": "condicoes", "r": "Condições adicionais", "t": "longo"}]', true, true, 30, '2026-09-24 22:34:55.417-03', '2026-09-24 22:34:55.417-03');
INSERT INTO public.document_templates (id, organization_id, key, name, description, icon, body_html, fields, is_active, is_system, display_order, created_at, updated_at) VALUES ('993cc6a8-8b6e-4ee2-a1d0-25413dd1dd6d', NULL, 'recibo_sinal', 'Recibo de Sinal (Arras)', 'Comprova o sinal pago pelo comprador e o efeito dele em caso de desistência.', 'Receipt', '<h1>Recibo de Sinal (Arras)</h1>
<p><b>{{vendedor_nome}}</b> declara ter recebido de <b>{{comprador_nome}}</b>, CPF nº {{comprador_cpf}}, a quantia de <b>{{valor_sinal}}</b>, paga por {{forma_pagamento}}, a título de <b>sinal e princípio de pagamento</b> pela aquisição do imóvel situado em <b>{{imovel_endereco}}</b>, cujo valor total ajustado é de <b>{{valor_total}}</b>.</p>
<p>O valor ora recebido constitui arras confirmatórias, na forma dos artigos 417 a 420 do Código Civil: desfeito o negócio por culpa de quem pagou, o valor fica em favor de quem recebeu; desfeito por culpa de quem recebeu, este devolverá o valor em dobro.</p>
<div class="assinaturas">
  <div class="linha">{{vendedor_nome}}<br><small>Recebedor</small></div>
  <div class="linha">{{comprador_nome}}<br><small>Pagador</small></div>
</div>', '[{"k": "comprador_nome", "r": "Quem pagou", "t": "texto", "obrig": true}, {"k": "comprador_cpf", "r": "CPF", "t": "cpf", "obrig": true}, {"k": "vendedor_nome", "r": "Quem recebeu", "t": "texto", "obrig": true}, {"k": "imovel_endereco", "r": "Endereço do imóvel", "t": "texto", "obrig": true}, {"k": "valor_sinal", "r": "Valor do sinal", "t": "dinheiro", "obrig": true}, {"k": "valor_total", "r": "Valor total do negócio", "t": "dinheiro", "obrig": true}, {"k": "forma_pagamento", "r": "Forma de pagamento do sinal", "t": "texto"}]', true, true, 40, '2026-09-24 22:34:55.417-03', '2026-09-24 22:34:55.417-03');
INSERT INTO public.document_templates (id, organization_id, key, name, description, icon, body_html, fields, is_active, is_system, display_order, created_at, updated_at) VALUES ('7b18402f-a6d4-4dac-be5b-4942a16a331b', NULL, 'contrato_compra_venda', 'Contrato de Compra e Venda', 'Instrumento particular de compra e venda de imóvel.', 'FileText', '<h1>Instrumento Particular de Compra e Venda</h1>
<p><b>VENDEDOR:</b> {{vendedor_nome}}, CPF/CNPJ nº {{vendedor_cpf}}.</p>
<p><b>COMPRADOR:</b> {{comprador_nome}}, CPF/CNPJ nº {{comprador_cpf}}.</p>
<p>As partes acima ajustam a compra e venda do imóvel situado em <b>{{imovel_endereco}}</b>, matrícula nº <b>{{imovel_matricula}}</b>, nas cláusulas seguintes.</p>
<h2>Cláusula 1ª — Do preço</h2>
<p>O preço certo e ajustado é de <b>{{valor_total}}</b>, pago da seguinte forma: {{forma_pagamento}}</p>
<h2>Cláusula 2ª — Da posse</h2>
<p>A posse do imóvel será transmitida ao comprador em <b>{{data_posse}}</b>, livre de pessoas e coisas.</p>
<h2>Cláusula 3ª — Dos encargos</h2>
<p>Correm por conta do vendedor os débitos de IPTU, condomínio e consumo até a data da posse; a partir dela, por conta do comprador. As despesas de escritura e registro correm por conta do comprador, salvo ajuste diverso.</p>
<h2>Cláusula 4ª — Da intermediação</h2>
<p>As partes reconhecem a intermediação da <b>{{imobiliaria_nome}}</b>, CNPJ {{imobiliaria_cnpj}}, por meio do(a) corretor(a) {{corretor_nome}}, CRECI {{corretor_creci}}.</p>
<h2>Cláusula 5ª — Disposições finais</h2>
<p>{{condicoes}}</p>
<div class="assinaturas">
  <div class="linha">{{vendedor_nome}}<br><small>Vendedor</small></div>
  <div class="linha">{{comprador_nome}}<br><small>Comprador</small></div>
</div>
<div class="assinaturas">
  <div class="linha">Testemunha 1<br><small>CPF</small></div>
  <div class="linha">Testemunha 2<br><small>CPF</small></div>
</div>', '[{"k": "vendedor_nome", "r": "Nome do vendedor", "t": "texto", "obrig": true}, {"k": "vendedor_cpf", "r": "CPF/CNPJ do vendedor", "t": "cpf", "obrig": true}, {"k": "comprador_nome", "r": "Nome do comprador", "t": "texto", "obrig": true}, {"k": "comprador_cpf", "r": "CPF/CNPJ do comprador", "t": "cpf", "obrig": true}, {"k": "imovel_endereco", "r": "Endereço do imóvel", "t": "texto", "obrig": true}, {"k": "imovel_matricula", "r": "Matrícula", "t": "texto", "obrig": true}, {"k": "valor_total", "r": "Valor total", "t": "dinheiro", "obrig": true}, {"k": "forma_pagamento", "r": "Forma de pagamento", "t": "longo", "obrig": true}, {"k": "data_posse", "r": "Data da posse", "t": "data", "obrig": true}, {"k": "condicoes", "r": "Cláusulas adicionais", "t": "longo"}]', true, true, 50, '2026-09-24 22:34:55.417-03', '2026-09-24 22:34:55.417-03');
INSERT INTO public.document_templates (id, organization_id, key, name, description, icon, body_html, fields, is_active, is_system, display_order, created_at, updated_at) VALUES ('046284e6-3ec4-4c36-957d-4a5836c08aec', NULL, 'contrato_locacao', 'Contrato de Locação Residencial', 'Locação residencial, com prazo, aluguel, reajuste e garantia.', 'KeyRound', '<h1>Contrato de Locação Residencial</h1>
<p><b>LOCADOR:</b> {{locador_nome}}, CPF/CNPJ nº {{locador_cpf}}.</p>
<p><b>LOCATÁRIO:</b> {{locatario_nome}}, CPF nº {{locatario_cpf}}.</p>
<p>Objeto: locação para fins residenciais do imóvel situado em <b>{{imovel_endereco}}</b>, regida pela Lei nº 8.245/91.</p>
<h2>Cláusula 1ª — Do prazo</h2>
<p>O prazo é de <b>{{prazo_meses}} meses</b>, com início em <b>{{data_inicio}}</b>.</p>
<h2>Cláusula 2ª — Do aluguel</h2>
<p>O aluguel mensal é de <b>{{valor_aluguel}}</b>, vencível todo dia <b>{{dia_vencimento}}</b>, reajustado anualmente pela variação do IGP-M/FGV ou, na sua falta, por índice que o substitua.</p>
<h2>Cláusula 3ª — Dos encargos</h2>
<p>Correm por conta do locatário o IPTU, o condomínio ordinário e as contas de consumo, além dos reparos decorrentes do uso.</p>
<h2>Cláusula 4ª — Da garantia</h2>
<p>Modalidade contratada: <b>{{garantia}}</b>. {{fiador_nome}}</p>
<h2>Cláusula 5ª — Da devolução</h2>
<p>Ao fim da locação o imóvel será devolvido no estado em que foi recebido, conforme laudo de vistoria, salvo desgaste natural.</p>
<div class="assinaturas">
  <div class="linha">{{locador_nome}}<br><small>Locador</small></div>
  <div class="linha">{{locatario_nome}}<br><small>Locatário</small></div>
</div>', '[{"k": "locador_nome", "r": "Nome do locador", "t": "texto", "obrig": true}, {"k": "locador_cpf", "r": "CPF/CNPJ do locador", "t": "cpf", "obrig": true}, {"k": "locatario_nome", "r": "Nome do locatário", "t": "texto", "obrig": true}, {"k": "locatario_cpf", "r": "CPF do locatário", "t": "cpf", "obrig": true}, {"k": "imovel_endereco", "r": "Endereço do imóvel", "t": "texto", "obrig": true}, {"k": "valor_aluguel", "r": "Aluguel mensal", "t": "dinheiro", "obrig": true}, {"k": "dia_vencimento", "r": "Dia do vencimento", "t": "numero", "obrig": true}, {"k": "prazo_meses", "r": "Prazo (meses)", "t": "numero", "obrig": true}, {"k": "data_inicio", "r": "Início da locação", "t": "data", "obrig": true}, {"k": "garantia", "r": "Garantia", "t": "opcao", "obrig": true, "opcoes": ["Caução", "Fiador", "Seguro-fiança", "Sem garantia"]}, {"k": "fiador_nome", "r": "Nome do fiador (se houver)", "t": "texto"}]', true, true, 60, '2026-09-24 22:34:55.417-03', '2026-09-24 22:34:55.417-03');
INSERT INTO public.document_templates (id, organization_id, key, name, description, icon, body_html, fields, is_active, is_system, display_order, created_at, updated_at) VALUES ('2edd2b44-d1cd-4026-8676-4f506e196714', NULL, 'proposta_construtora', 'Proposta para Construtora', 'Apresenta a imobiliária e propõe condições de parceria em um empreendimento.', 'Building2', '<h1>Proposta de Parceria</h1>
<p>À <b>{{construtora_nome}}</b>,</p>
<p>A <b>{{imobiliaria_nome}}</b>, CNPJ {{imobiliaria_cnpj}}, apresenta proposta de parceria para a comercialização das unidades do empreendimento <b>{{empreendimento_nome}}</b>.</p>
<h2>Condições propostas</h2>
<p>{{condicoes}}</p>
<p>Comissão de intermediação: <b>{{comissao_percent}}%</b> sobre o valor de cada unidade vendida, devida na assinatura do respectivo contrato.</p>
<p>Colocamo-nos à disposição para ajustar as condições acima.</p>
<div class="assinaturas">
  <div class="linha">{{corretor_nome}}<br><small>{{imobiliaria_nome}} — CRECI {{corretor_creci}}</small></div>
</div>', '[{"k": "construtora_nome", "r": "Construtora", "t": "texto", "obrig": true}, {"k": "empreendimento_nome", "r": "Empreendimento", "t": "texto", "obrig": true}, {"k": "comissao_percent", "r": "Comissão (%)", "t": "numero", "obrig": true}, {"k": "condicoes", "r": "Condições da parceria", "t": "longo", "obrig": true}]', true, true, 70, '2026-09-24 22:34:55.417-03', '2026-09-24 22:34:55.417-03');

-- =============================================================================
-- Storage
-- =============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('documentos', 'documentos', false, 26214400, ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('property-media', 'property-media', true, 26214400, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'video/mp4', 'video/webm'])
ON CONFLICT (id) DO UPDATE SET public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('whatsapp-media', 'whatsapp-media', false, 26214400, NULL)
ON CONFLICT (id) DO UPDATE SET public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- As policies documentos_read e documentos_write da origem ficaram de fora: a
-- migration que as trocava pelas versões por lead (documentos_select e
-- documentos_insert) apagou pelo nome errado, e as duas antigas continuaram
-- valendo. Policies permissivas se somam, então qualquer corretor da
-- organização lia e gravava documento de lead que não é dele.

DROP POLICY IF EXISTS documentos_delete ON storage.objects;
CREATE POLICY documentos_delete ON storage.objects AS PERMISSIVE FOR DELETE TO authenticated
  USING (((bucket_id = 'documentos'::text) AND ((storage.foldername(name))[1] = (( SELECT public.current_org_id() AS current_org_id))::text) AND ( SELECT public.is_admin_or_above(( SELECT public.current_org_id() AS current_org_id)) AS is_admin_or_above)));

DROP POLICY IF EXISTS documentos_insert ON storage.objects;
CREATE POLICY documentos_insert ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((bucket_id = 'documentos'::text) AND ((storage.foldername(name))[1] = (( SELECT public.current_org_id() AS current_org_id))::text) AND ( SELECT public.pode_ver_pasta_de_lead((storage.foldername(objects.name))[2]) AS pode_ver_pasta_de_lead)));

DROP POLICY IF EXISTS documentos_select ON storage.objects;
CREATE POLICY documentos_select ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated
  USING (((bucket_id = 'documentos'::text) AND ((storage.foldername(name))[1] = (( SELECT public.current_org_id() AS current_org_id))::text) AND ( SELECT public.pode_ver_pasta_de_lead((storage.foldername(objects.name))[2]) AS pode_ver_pasta_de_lead)));

DROP POLICY IF EXISTS property_media_delete ON storage.objects;
CREATE POLICY property_media_delete ON storage.objects AS PERMISSIVE FOR DELETE TO authenticated
  USING (((bucket_id = 'property-media'::text) AND ((storage.foldername(name))[1] = (( SELECT public.current_org_id() AS current_org_id))::text)));

DROP POLICY IF EXISTS property_media_public_read ON storage.objects;
CREATE POLICY property_media_public_read ON storage.objects AS PERMISSIVE FOR SELECT TO PUBLIC
  USING ((bucket_id = 'property-media'::text));

DROP POLICY IF EXISTS property_media_update ON storage.objects;
CREATE POLICY property_media_update ON storage.objects AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((bucket_id = 'property-media'::text) AND ((storage.foldername(name))[1] = (( SELECT public.current_org_id() AS current_org_id))::text)));

DROP POLICY IF EXISTS property_media_write ON storage.objects;
CREATE POLICY property_media_write ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((bucket_id = 'property-media'::text) AND ((storage.foldername(name))[1] = (( SELECT public.current_org_id() AS current_org_id))::text)));

DROP POLICY IF EXISTS whatsapp_media_read ON storage.objects;
CREATE POLICY whatsapp_media_read ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated
  USING (((bucket_id = 'whatsapp-media'::text) AND ((storage.foldername(name))[1] = (( SELECT public.current_org_id() AS current_org_id))::text)));

-- =============================================================================
-- Realtime
-- =============================================================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_messages (id, organization_id, conversation_id, direction, kind, occurred_at);

-- =============================================================================
-- Tarefas agendadas (pg_cron)
--
-- As funções chamadas aqui leem do Vault o endereço das edge functions e os
-- segredos dos crons (ver supabase/README.md). Sem eles, rodam e não fazem nada.
-- =============================================================================

DO $agenda$
BEGIN
  PERFORM cron.schedule('lembretes-vencidos', '* * * * *', $cron$ select public.run_due_reminders(); $cron$);
  PERFORM cron.schedule('whatsapp-saude', '*/5 * * * *', $cron$ select public.whatsapp_saude(); $cron$);
  PERFORM cron.schedule('whatsapp-inbox', '* * * * *', $cron$ select public.processar_inbox(); $cron$);
  PERFORM cron.schedule('whatsapp-saida', '* * * * *', $cron$ select public.whatsapp_drenar_saida(); $cron$);
  PERFORM cron.schedule('push-atraso', '0 * * * *', $cron$ select public.push_verificar_atraso(); $cron$);
  PERFORM cron.schedule('push-envio', '* * * * *', $cron$ select public.push_drenar(); $cron$);
  PERFORM cron.schedule('meta-fila', '* * * * *', $cron$ select public.meta_drenar(); $cron$);
  PERFORM cron.schedule('meta-presos', '17 * * * *', $cron$ select public.meta_verificar_presos(); $cron$);
  PERFORM cron.schedule('meta-gasto-quente', '7 * * * *', $cron$ select public.meta_importar_gasto('quente'); $cron$);
  PERFORM cron.schedule('meta-gasto-reconciliar', '40 5 * * *', $cron$ select public.meta_importar_gasto('reconciliar'); $cron$);
  PERFORM cron.schedule('fila-sem-resposta', '2,17,32,47 * * * *', $cron$ select public.avisar_espera_longa(); $cron$);
  PERFORM cron.schedule('meta-conversoes', '* * * * *', $cron$ select public.meta_conversoes_drenar(); $cron$);
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'Sem privilégio para agendar: rode os cron.schedule deste arquivo à mão.';
END $agenda$;

-- =============================================================================
-- Gatilho de evento: liga a RLS sozinho em toda tabela nova do public. Se o
-- papel que aplica a migration não puder criar event trigger, fica só o aviso.
-- =============================================================================

DO $gatilhos_de_evento$
BEGIN
  DROP EVENT TRIGGER IF EXISTS rls_auto_enable_trg;
  CREATE EVENT TRIGGER rls_auto_enable_trg ON ddl_command_end WHEN TAG IN ('CREATE TABLE') EXECUTE FUNCTION public.rls_auto_enable();
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'Sem privilégio para criar event trigger: o resto está aplicado.';
END $gatilhos_de_evento$;

-- =============================================================================
-- Fim: devolve a sessão como estava. O pg_dump liga estes ajustes no começo do
-- arquivo; sem desligar, a migration seguinte (e, num SQL Editor, o resto da
-- sessão) herdaria search_path vazio e RLS desligado.
-- =============================================================================

RESET statement_timeout;
RESET lock_timeout;
RESET idle_in_transaction_session_timeout;
RESET transaction_timeout;
RESET search_path;
RESET check_function_bodies;
RESET xmloption;
RESET client_min_messages;
RESET row_security;
RESET default_tablespace;
RESET default_table_access_method;
