import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

/** O link assinado vale uma hora; revalidamos antes, com folga. */
const VALIDADE_S = 60 * 60;

/**
 * Os links para as fotos que estão guardadas no bucket.
 *
 * `whatsapp-media` é PRIVADO — e é privado por um motivo que não tem a ver com
 * avatar: é o mesmo balde onde caem RG, comprovante de renda e contrato que o
 * cliente manda no WhatsApp. Nada ali pode ter URL aberta.
 *
 * Consequência prática: não dá para pôr o caminho num `<img src>`. O navegador
 * não manda cabeçalho de autenticação em imagem, então cada foto precisa de um
 * link assinado, pedido a quem tem sessão. A policy `whatsapp_media_read` já
 * recorta por pasta da organização, então a assinatura só sai para quem
 * poderia ver o arquivo de qualquer forma.
 *
 * Assina em LOTE de propósito: uma lista de cinco leads pediria cinco viagens
 * ao servidor, e o painel é a primeira tela que abre no dia.
 */
export function useFotosGuardadas(caminhos: (string | null | undefined)[]) {
  const chaves = [...new Set(caminhos.filter((c): c is string => !!c))].sort();

  return useQuery({
    queryKey: ['fotos-guardadas', chaves.join('|')],
    enabled: chaves.length > 0,
    /*
     * 45 min para um link de 60. A folga existe porque o React Query pode
     * servir do cache logo antes de expirar — e um avatar que vence enquanto a
     * pessoa olha a tela vira imagem quebrada sem motivo aparente.
     */
    staleTime: 45 * 60_000,
    queryFn: async (): Promise<Record<string, string>> => {
      const { data, error } = await supabase.storage
        .from('whatsapp-media')
        .createSignedUrls(chaves, VALIDADE_S);
      if (error) throw error;

      const mapa: Record<string, string> = {};
      for (const item of data ?? []) {
        // Caminho que falhou vem com `error` preenchido e sem link: fica de
        // fora do mapa, e o `<Avatar>` cai para as iniciais sozinho.
        if (item.path && item.signedUrl) mapa[item.path] = item.signedUrl;
      }
      return mapa;
    },
  });
}
