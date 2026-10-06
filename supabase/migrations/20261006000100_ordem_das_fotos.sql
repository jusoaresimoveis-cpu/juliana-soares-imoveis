-- =============================================================================
-- A ORDEM DAS FOTOS, DE UMA VEZ
--
-- Pedido do usuário em 06/10/2026: segurar a foto e arrastar para o lugar, no
-- lugar das setinhas que andavam uma casa por clique. Uma arrastada muda a
-- posição de muitas fotos, e gravar foto por foto (um UPDATE por linha, como as
-- setinhas faziam) tem três defeitos: metade da ordem fica gravada se a rede
-- cair no meio, duas arrastadas seguidas podem chegar fora de ordem, e cada
-- UPDATE avisa o site (`property_media_avisa_site`), que se refazia uma vez por
-- foto.
--
-- E a primeira foto passa a ser a capa, como a tela do CRM sempre disse ("A
-- primeira imagem é a capa"). Antes a capa era uma marca à parte: a foto
-- marcada abria o site mesmo estando no meio da lista do CRM. Agora a lista do
-- CRM é a ordem do site, e quem vai para o primeiro lugar vira a capa.
-- =============================================================================

/*
 * Grava a ordem das mídias de um imóvel: cada id vai para o lugar em que está
 * na lista (0, 1, 2…), e a primeira FOTO vira a capa.
 *
 * Mídia do imóvel que não veio na lista (subiu em outra aba enquanto esta
 * arrastava) vai para o fim, na ordem em que estava; id de outro imóvel é
 * ignorado. Com a lista vazia a função só arruma: refaz as posições na ordem
 * de hoje (a do site) e garante a capa, que é o que se quer depois de apagar a
 * foto da capa.
 *
 * `security invoker`: vale a RLS de sempre, a mesma que deixava o CRM mudar a
 * posição foto por foto. Quem é de outra casa não enxerga as fotos, e a função
 * não faz nada.
 */
create or replace function public.ordenar_midia(_imovel uuid, _ordem uuid[])
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_ids  uuid[];
  v_capa uuid;
begin
  select array_agg(m.id order by o.lugar nulls last, m.is_cover desc, m.position, m.created_at, m.id),
         (array_agg(m.id order by o.lugar nulls last, m.is_cover desc, m.position, m.created_at, m.id)
            filter (where m.kind = 'image'))[1]
    into v_ids, v_capa
    from public.property_media m
    left join (select u.id, min(u.lugar) as lugar
                 from unnest(coalesce(_ordem, '{}'::uuid[])) with ordinality as u(id, lugar)
                group by u.id) o on o.id = m.id
   where m.property_id = _imovel;

  -- Posições e a saída da capa antiga num UPDATE só: desligar capa nunca esbarra
  -- no índice de uma capa por imóvel (`property_media_one_cover_uk`). Ligar a
  -- nova vem depois, sozinho; numa troca dentro do mesmo UPDATE, o índice
  -- poderia ver as duas ligadas no meio da varredura.
  update public.property_media m
     set position = (n.lugar - 1)::int,
         is_cover = m.is_cover and m.id is not distinct from v_capa
    from unnest(v_ids) with ordinality as n(id, lugar)
   where m.id = n.id
     and (m.position <> n.lugar - 1 or (m.is_cover and m.id is distinct from v_capa));

  update public.property_media
     set is_cover = true
   where id = v_capa
     and not is_cover;
end $$;

revoke all on function public.ordenar_midia(uuid, uuid[]) from public, anon;
grant execute on function public.ordenar_midia(uuid, uuid[]) to authenticated, service_role;
