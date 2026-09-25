-- =============================================================================
-- O NÚMERO QUE TAMBÉM É PESSOAL
--
-- O WhatsApp da Juliana é o celular dela: o mesmo número atende cliente e fala
-- com família, amigos e grupos. Decisão de 24/09/2026: conversa pessoal nunca
-- entra no CRM. Só entra conversa de cliente, e só vira lead sozinho o que
-- chega com prova de origem (anúncio de clique para WhatsApp ou o código de um
-- link rastreado); cliente orgânico ela cadastra à mão, e dali em diante as
-- mensagens daquele número entram.
--
-- A origem já não criava lead sem prova, mas guardava TODA conversa (inclusive
-- grupo) na tela de Conversas: lá o número é da empresa. Aqui isso vira uma
-- marca por organização, desligada por padrão, para o mesmo código servir aos
-- dois casos. O seed da Juliana liga a marca.
--
-- `processar_inbox` é a da base, inteira, com duas mudanças: lê a marca a cada
-- volta e, com ela ligada, descarta antes de gravar o que não é de negócio.
-- =============================================================================

alter table public.organizations
  add column whatsapp_numero_pessoal boolean not null default false;

comment on column public.organizations.whatsapp_numero_pessoal is
  'O número de WhatsApp também é pessoal: só entra no CRM conversa de lead ou com prova de origem; o resto é descartado sem gravar.';

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
  v_numero_pessoal boolean;
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

      -- Lida a cada volta: o lote pode trazer eventos de mais de uma casa.
      select o.whatsapp_numero_pessoal into v_numero_pessoal
        from public.organizations o
       where o.id = r.organization_id;

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

      /*
       * O NÚMERO QUE TAMBÉM É PESSOAL (organizations.whatsapp_numero_pessoal).
       *
       * Na origem o número é da empresa, e toda conversa entra na tela de
       * Conversas, com lead ou sem. Quando o número é o celular da própria
       * corretora, família, amigos e grupos passam por ele, e isso não pode
       * entrar no CRM. Com a marca ligada, só vira linha a conversa que é de
       * NEGÓCIO:
       *
       *   - tem lead: a mensagem provou a origem (anúncio, código) ou o número
       *     já estava cadastrado, inclusive à mão;
       *   - traz prova de origem mesmo sem lead possível (contato só com LID,
       *     sem telefone): é um cliente, e a corretora liga à mão depois;
       *   - continua uma conversa que já entrou por um dos dois caminhos.
       *
       * O resto não vira conversa, nem mensagem, nem aviso, e o conteúdo bruto
       * sai da fila (`payload` vazio). Grupo nunca entra.
       *
       * O que SAI do celular dela não passou pela busca de lead acima (lá só
       * entra o que chega): escrever para um cliente cadastrado continua
       * valendo, e escrever para qualquer outra pessoa não.
       */
      if v_numero_pessoal then
        if v_lead is null and not v_grupo and v_e164 is not null then
          select id into v_lead
            from public.leads
           where organization_id = r.organization_id
             and phone_e164 = public.to_e164(v_e164, public.pais_da_discagem(v_e164))
           order by created_at
           limit 1;
        end if;

        if v_grupo or not (
             v_lead is not null
             or v_anuncio is not null
             or v_ctwa_clid is not null
             or v_ref.o_public_code is not null
             or exists (
               select 1 from public.whatsapp_conversations c
                where c.organization_id = r.organization_id
                  and c.instance_id = r.instance_id
                  and not c.is_group
                  and (c.contact_e164 = v_e164
                       or (v_e164 is null and c.contact_lid = v_lid)))
           ) then
          update public.whatsapp_inbox
             set status = 'ignorado',
                 processed_at = now(),
                 payload = '{}'::jsonb,
                 error = 'numero pessoal: conversa fora do CRM'
           where id = r.id;
          v_n := v_n + 1;
          continue;
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
