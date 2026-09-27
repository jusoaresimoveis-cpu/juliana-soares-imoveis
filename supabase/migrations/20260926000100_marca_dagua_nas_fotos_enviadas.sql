/*
 * A marca d'água nas fotos que JÁ estavam no CRM (decisão de 26/09).
 *
 * A marca entra na foto na hora de subir (migration 20260926000000). Para as
 * fotos enviadas antes dela, a aba de fotos do imóvel ganha um botão que baixa
 * cada foto, desenha a marca e sobe de novo, sem ninguém precisar reenviar.
 *
 * `marca_dagua` diz se a foto NO AR tem a marca. É o que impede o botão de
 * pôr a marca duas vezes na mesma foto, uma por cima da outra.
 *
 * `original_sem_marca` guarda o arquivo de antes (caminho, tamanho, dimensões)
 * quando o botão põe a marca numa foto já enviada. O arquivo original fica no
 * Storage, e é isso que permite desfazer: a primeira aplicação é justamente
 * para ver como fica. Foto que já sobe com a marca não tem original guardado,
 * porque o original nunca saiu do aparelho.
 *
 * As permissões de `property_media` já cobrem as colunas novas.
 */

alter table public.property_media
  add column marca_dagua boolean not null default false,
  add column original_sem_marca jsonb;

comment on column public.property_media.marca_dagua is
  'A foto no ar tem a marca d''água. Impede pôr a marca duas vezes.';
comment on column public.property_media.original_sem_marca is
  'O arquivo sem marca (storage_path, bytes, width, height, mime_type), guardado quando a marca foi posta numa foto já enviada. Serve para desfazer.';
