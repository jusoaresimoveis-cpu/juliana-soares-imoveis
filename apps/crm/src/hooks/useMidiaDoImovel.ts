import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { exigir } from '@/lib/exigir';
import { prepararFoto } from '@/lib/fotos';
import type { Json } from '@/lib/database.types';

/** O arquivo de antes da marca, guardado para desfazer (migration 20260926000100). */
export interface OriginalSemMarca {
  storage_path: string;
  bytes: number | null;
  width: number | null;
  height: number | null;
  mime_type: string | null;
}

export interface PropertyMedia {
  id: string;
  property_id: string;
  kind: 'image' | 'video' | 'document' | 'tour';
  storage_path: string;
  position: number;
  is_cover: boolean;
  caption: string | null;
  alt_text: string | null;
  bytes: number | null;
  width: number | null;
  height: number | null;
  mime_type: string | null;
  /** A foto no ar tem a marca d'água. */
  marca_dagua: boolean;
  /** Render ou decorado: o site avisa "Imagem ilustrativa" na foto. */
  is_illustrative: boolean;
  original_sem_marca: OriginalSemMarca | null;
}

export const BUCKET = 'property-media';

export function urlPublica(storagePath: string): string {
  return supabase.storage.from(BUCKET).getPublicUrl(storagePath).data.publicUrl;
}

/** Capa de cada imóvel da página, numa consulta só — não uma por card. */
export function useCovers(ids: string[]) {
  const chave = ids.slice().sort().join(',');
  return useQuery({
    queryKey: ['property-covers', chave],
    enabled: ids.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('property_media')
        .select('property_id, storage_path')
        .in('property_id', ids)
        .eq('is_cover', true);
      if (error) throw error;
      const mapa: Record<string, string> = {};
      for (const m of (data ?? []) as { property_id: string; storage_path: string }[]) {
        mapa[m.property_id] = urlPublica(m.storage_path);
      }
      return mapa;
    },
  });
}

export function usePropertyMedia(propertyId: string | null) {
  return useQuery({
    queryKey: ['property-media', propertyId],
    enabled: !!propertyId,
    queryFn: async (): Promise<PropertyMedia[]> => {
      const { data, error } = await supabase
        .from('property_media')
        .select(
          'id, property_id, kind, storage_path, position, is_cover, caption, alt_text, bytes, width, height, mime_type, marca_dagua, original_sem_marca, is_illustrative',
        )
        .eq('property_id', exigir(propertyId, 'o imóvel'))
        // A ordem do site (`site_imoveis`): a capa primeiro, depois a posição.
        // Fotos de antes de `ordenar_midia` podem ter a capa no meio.
        .order('is_cover', { ascending: false })
        .order('position')
        .order('created_at');
      if (error) throw error;
      return (data ?? []) as unknown as PropertyMedia[];
    },
  });
}

export function useMediaActions(orgId: string | undefined, propertyId: string | null) {
  const qc = useQueryClient();
  const invalidar = () => {
    void qc.invalidateQueries({ queryKey: ['property-media', propertyId] });
    void qc.invalidateQueries({ queryKey: ['property-covers'] });
  };

  const enviar = useMutation({
    // `marcaDagua` vem de quem chama, e não de uma consulta aqui dentro: a foto
    // sai com a marca que a tela MOSTRAVA ligada na hora do envio.
    mutationFn: async ({ arquivos, marcaDagua }: { arquivos: File[]; marcaDagua: boolean }) => {
      if (!orgId || !propertyId) throw new Error('Salve o imóvel antes de enviar mídia.');

      const { data: atuais } = await supabase
        .from('property_media')
        .select('id, position, is_cover')
        .eq('property_id', propertyId);

      let posicao = (atuais ?? []).reduce((m, x) => Math.max(m, (x as { position: number }).position), -1) + 1;
      const jaTemCapa = (atuais ?? []).some((x) => (x as { is_cover: boolean }).is_cover);

      for (const arquivo of arquivos) {
        // Foto sobe reduzida e, com a chave ligada, com a marca d'água (ver
        // `lib/fotos.ts`); vídeo sobe como veio.
        const foto = arquivo.type.startsWith('image/') ? await prepararFoto(arquivo, { marcaDagua }) : null;
        const corpo = foto?.arquivo ?? arquivo;
        const ext = foto?.extensao ?? arquivo.name.split('.').pop()?.toLowerCase() ?? 'bin';
        // Pasta por organização: é o primeiro segmento que a política do
        // storage confere. Depois por imóvel, para apagar em bloco.
        const caminho = `${orgId}/${propertyId}/${crypto.randomUUID()}.${ext}`;

        const { error: upErro } = await supabase.storage
          .from(BUCKET)
          .upload(caminho, corpo, {
            cacheControl: '31536000',
            upsert: false,
            contentType: foto?.tipo ?? arquivo.type,
          });
        if (upErro) throw upErro;

        const kind = arquivo.type.startsWith('video/')
          ? 'video'
          : arquivo.type === 'application/pdf'
            ? 'document'
            : 'image';

        const { error: insErro } = await supabase.from('property_media').insert({
          organization_id: orgId,
          property_id: propertyId,
          kind,
          storage_path: caminho,
          position: posicao,
          is_cover: kind === 'image' && !jaTemCapa && posicao === 0,
          mime_type: foto?.tipo ?? arquivo.type,
          bytes: corpo.size,
          // O site usa as dimensões na prévia do link (WhatsApp, Facebook).
          width: foto?.largura ?? null,
          height: foto?.altura ?? null,
          marca_dagua: kind === 'image' && marcaDagua,
        });
        if (insErro) throw insErro;
        posicao += 1;
      }
    },
    onSuccess: invalidar,
  });

  /*
   * A ordem nova, inteira, numa chamada só ao banco (`ordenar_midia`, migration
   * 20261006000100), que também faz da primeira foto a capa.
   *
   * `scope`: uma gravação por vez, na ordem em que a pessoa soltou. Duas
   * arrastadas rápidas não podem chegar trocadas, senão a penúltima vence.
   */
  const ordenar = useMutation({
    scope: { id: `ordenar-midia-${propertyId}` },
    mutationFn: async (ids: string[]) => {
      if (!propertyId) return;
      const { error } = await supabase.rpc('ordenar_midia', { _imovel: propertyId, _ordem: ids });
      if (error) throw error;
    },
    // Recusado: a tela volta a mostrar a ordem que o banco tem.
    onError: invalidar,
    // A capa pode ter mudado, e a lista de imóveis mostra a capa.
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['property-covers'] }),
  });

  /**
   * Põe as mídias nesta ordem. A tela muda NA HORA, sem esperar o banco: a foto
   * fica onde a pessoa soltou, em vez de voltar ao lugar antigo até a resposta.
   */
  function reordenar(lista: PropertyMedia[]) {
    const chave = ['property-media', propertyId];
    // Uma leitura em andamento traria a ordem antiga por cima desta. Cancelar
    // é síncrono (devolve o estado de antes da leitura), então o que vale é o
    // que se grava logo abaixo.
    void qc.cancelQueries({ queryKey: chave });
    const capa = lista.find((m) => m.kind === 'image')?.id;
    qc.setQueryData<PropertyMedia[]>(
      chave,
      lista.map((m, i) => ({ ...m, position: i, is_cover: m.id === capa })),
    );
    ordenar.mutate(lista.map((m) => m.id));
  }

  const remover = useMutation({
    mutationFn: async (media: PropertyMedia) => {
      const { error } = await supabase.from('property_media').delete().eq('id', media.id);
      if (error) throw error;
      // O arquivo sai junto. O sistema atual só apaga a linha e deixa o
      // arquivo órfão no bucket para sempre.
      await supabase.storage.from(BUCKET).remove([media.storage_path]);
      // Sem a capa, a primeira foto que sobrou vira a capa (lista vazia: o
      // banco só arruma a ordem que já existe). Se falhar, a foto já saiu, e a
      // capa se acerta na próxima vez que alguém mexer na ordem.
      if (media.is_cover && propertyId) {
        await supabase.rpc('ordenar_midia', { _imovel: propertyId, _ordem: [] });
      }
    },
    onSuccess: invalidar,
  });

  /*
   * Põe a marca nas fotos que subiram antes dela.
   *
   * Cada foto é baixada, redesenhada com a marca e sobe num arquivo NOVO. No
   * mesmo arquivo, o site e o navegador continuariam mostrando a versão sem
   * marca que guardaram (o cache das fotos é de um ano). A linha passa a
   * apontar para o arquivo novo, e o antigo fica no Storage, anotado em
   * `original_sem_marca`, para desfazer.
   *
   * Uma foto por vez, e cada uma inteira ou nada: se a gravação da linha
   * falhar, o arquivo novo sai do Storage. O `eq('marca_dagua', false)` impede
   * a marca dupla quando o botão roda em duas abas ao mesmo tempo.
   */
  const porMarca = useMutation({
    mutationFn: async ({
      fotos,
      aoAvancar,
    }: {
      fotos: PropertyMedia[];
      aoAvancar?: (feitas: number, total: number) => void;
    }) => {
      if (!orgId || !propertyId) throw new Error('Salve o imóvel antes.');
      const alvo = fotos.filter((f) => f.kind === 'image' && !f.marca_dagua);

      for (const [i, foto] of alvo.entries()) {
        const resposta = await fetch(urlPublica(foto.storage_path));
        if (!resposta.ok) throw new Error(`Não deu para baixar a foto ${i + 1} de ${alvo.length}.`);
        const corpo = await resposta.blob();
        const pronta = await prepararFoto(
          new File([corpo], foto.storage_path.split('/').pop() ?? 'foto.jpg', { type: corpo.type || 'image/jpeg' }),
          { marcaDagua: true },
        );

        const caminho = `${orgId}/${propertyId}/${crypto.randomUUID()}.${pronta.extensao}`;
        const { error: upErro } = await supabase.storage.from(BUCKET).upload(caminho, pronta.arquivo, {
          cacheControl: '31536000',
          upsert: false,
          contentType: pronta.tipo,
        });
        if (upErro) throw upErro;

        const original: OriginalSemMarca = {
          storage_path: foto.storage_path,
          bytes: foto.bytes,
          width: foto.width,
          height: foto.height,
          mime_type: foto.mime_type,
        };
        const { data, error } = await supabase
          .from('property_media')
          .update({
            storage_path: caminho,
            bytes: pronta.arquivo.size,
            width: pronta.largura,
            height: pronta.altura,
            mime_type: pronta.tipo,
            marca_dagua: true,
            original_sem_marca: original as unknown as Json,
          })
          .eq('id', foto.id)
          .eq('marca_dagua', false)
          .select('id');
        if (error || !data?.length) {
          await supabase.storage.from(BUCKET).remove([caminho]);
          if (error) throw error;
        }
        aoAvancar?.(i + 1, alvo.length);
      }
    },
    onSettled: invalidar,
  });

  /* Volta as fotos ao arquivo sem marca e apaga a cópia com marca, que se refaz com um clique. */
  const tirarMarca = useMutation({
    mutationFn: async ({ fotos }: { fotos: PropertyMedia[] }) => {
      for (const foto of fotos) {
        const o = foto.original_sem_marca;
        if (!o) continue;
        const { data, error } = await supabase
          .from('property_media')
          .update({
            storage_path: o.storage_path,
            bytes: o.bytes,
            width: o.width,
            height: o.height,
            mime_type: o.mime_type,
            marca_dagua: false,
            original_sem_marca: null,
          })
          .eq('id', foto.id)
          .eq('storage_path', foto.storage_path)
          .select('id');
        if (error) throw error;
        if (data?.length) await supabase.storage.from(BUCKET).remove([foto.storage_path]);
      }
    },
    onSettled: invalidar,
  });

  /*
   * "Imagem ilustrativa": o empreendimento na planta mostra render, e o site
   * avisa na foto (nada inventado no site). Uma foto ou várias numa gravação.
   */
  const ilustrativa = useMutation({
    mutationFn: async ({ ids, valor }: { ids: string[]; valor: boolean }) => {
      if (!ids.length) return;
      const { error } = await supabase.from('property_media').update({ is_illustrative: valor }).in('id', ids);
      if (error) throw error;
    },
    onSettled: invalidar,
  });

  return { enviar, reordenar, ordenar, remover, porMarca, tirarMarca, ilustrativa };
}
