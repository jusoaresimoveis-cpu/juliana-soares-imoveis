import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { prepararFoto } from '@/lib/fotos';
import type { Json } from '@/lib/database.types';
import { BUCKET, urlPublica } from '@/lib/midiaNoStorage';
import type { OriginalSemMarca, PropertyMedia } from './useMidiaDoImovel';

// As mutações da marca d'água e da imagem ilustrativa, fora de
// useMidiaDoImovel.ts pelo teto de linhas do arquivo. useMediaActions chama
// este hook no mesmo lugar em que as três ficavam: a ordem dos hooks não muda.

function arquivoDaFoto(corpo: Blob, foto: PropertyMedia) {
  return new File([corpo], foto.storage_path.split('/').pop() ?? 'foto.jpg', { type: corpo.type || 'image/jpeg' });
}

export function useMutacoesDaMarca(orgId: string | undefined, propertyId: string | null, invalidar: () => void) {
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
        const pronta = await prepararFoto(arquivoDaFoto(corpo, foto), { marcaDagua: true });

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

  return { porMarca, tirarMarca, ilustrativa };
}
