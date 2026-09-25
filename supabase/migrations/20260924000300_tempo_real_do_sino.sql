-- =============================================================================
-- O SINO EM TEMPO REAL, E UM PRIVILÉGIO A MENOS
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1 · O sino
--
-- `useNotificacoesAoVivo` assina `notifications` filtrando por `recipient_id`,
-- mas nenhuma migration da origem publicou a tabela no Realtime: lá ela foi
-- posta à mão, pelo painel. Num banco novo o sino só mudaria ao recarregar.
--
-- Com lista de colunas, como `whatsapp_messages`: título e corpo do aviso (nome
-- de cliente) não saem para o navegador. A tela só precisa saber o tipo, para o
-- som, e se virou lida; o resto ela busca de novo, pela RLS. `recipient_id` vai
-- porque é nele que a policy de leitura decide quem recebe o evento.
-- -----------------------------------------------------------------------------
do $publicar$
begin
  if exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
  ) then
    -- Tira e põe de novo: é o jeito de a lista de colunas valer se alguém já
    -- tiver publicado a tabela inteira pelo painel.
    alter publication supabase_realtime drop table public.notifications;
  end if;

  alter publication supabase_realtime add table public.notifications
    (id, organization_id, recipient_id, type, is_read, event_count, last_event_at);
end $publicar$;

-- -----------------------------------------------------------------------------
-- 2 · O visitante e o número de WhatsApp
--
-- `whatsapp_instances` guarda a referência do token no Vault e o hash do segredo
-- do webhook. A origem tirou o privilégio de tabela do `authenticated` e liberou
-- só as colunas seguras, mas o `anon` ficou com tudo. A RLS já barra as linhas;
-- sem o privilégio, o visitante nem chega a elas.
-- -----------------------------------------------------------------------------
revoke all on public.whatsapp_instances from anon;
