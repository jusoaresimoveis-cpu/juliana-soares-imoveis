-- =============================================================================
-- A COR DA MARCA DA JULIANA
--
-- O CRM deixa cada pessoa escolher a cor do sistema, e o padrão da origem era o
-- roxo da marca dela. Aqui o padrão é o bronze do site da Juliana
-- (`apps/crm/src/lib/cores.ts`); as outras cores continuam à escolha.
-- =============================================================================

alter table public.profiles drop constraint if exists profiles_theme_color_ck;
alter table public.profiles
  add constraint profiles_theme_color_ck
  check (theme_color in ('bronze', 'roxo', 'azul', 'verde', 'vermelho', 'laranja'));

alter table public.profiles alter column theme_color set default 'bronze';
