-- =============================================================================
-- TROCAR O "NOME NO SITE" DE UM IMÓVEL JÁ CADASTRADO
--
-- O gatilho `tg_property_slug` (da base) guarda o endereço antigo em
-- `property_slug_history` quando o nome público muda, para o link que já
-- circula continuar abrindo. Ele rodava com o papel de quem salvou, e a tabela
-- só tem policy de leitura: a gravação era recusada e o imóvel inteiro não
-- salvava ("new row violates row-level security policy for table
-- property_slug_history"). Aconteceu em 25/09/2026, no segundo imóvel da
-- Juliana. O CRM de origem tem o mesmo gatilho e a mesma policy.
--
-- Rodar como dono da função resolve sem abrir a tabela: ela continua sem
-- policy de escrita, então endereço antigo só entra pelo gatilho, e o gatilho
-- só grava o endereço do próprio imóvel que a pessoa já podia editar. O
-- `search_path` já está fixo na função.
-- =============================================================================

alter function public.tg_property_slug() security definer;

-- Função de gatilho não se chama direto, e privilégio de execução só é
-- conferido ao criar o gatilho. Tirar o EXECUTE de quem usa a API é higiene de
-- função `security definer`, sem efeito no gatilho.
revoke all on function public.tg_property_slug() from public, anon, authenticated;
