import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export interface AlarmeWhatsapp {
  id: string;
  label: string;
  telefone: string | null;
  status: string;
  desde: string;
  e_meu: boolean;
}

/**
 * Números fora do ar que ESTA pessoa pode ver. Lista vazia é o estado bom.
 *
 * O recorte de quem vê o quê é do banco, não daqui: `whatsapp_alarmes` devolve
 * o número para o dono dele e para a gestão, e nada para o corretor do lado. A
 * tela só desenha o que chegou.
 *
 * POR QUE ISTO EXISTE, se já existe notificação
 *
 * Porque notificação afunda. Um número caiu às 22h31 e ninguém soube por
 * dezessete horas — nesse tempo a Meta entregou dois leads que evaporaram na
 * entrada, e a conta continuou gastando. Uma linha na caixa de avisos, entre
 * trinta "mensagem recebida", não é alarme: é arquivo.
 *
 * O aviso avisa uma vez. A faixa fica de pé enquanto o problema durar.
 */
export function useAlarmesWhatsapp() {
  return useQuery({
    queryKey: ['alarmes-whatsapp'],
    queryFn: async (): Promise<AlarmeWhatsapp[]> => {
      const { data, error } = await supabase.rpc('whatsapp_alarmes');
      if (error) throw error;
      return (data ?? []) as AlarmeWhatsapp[];
    },
    /*
     * Um minuto, e revalidando com a janela em foco.
     *
     * O intervalo tem de ser curto nos DOIS sentidos. Caiu: quanto antes a
     * faixa subir, menos lead se perde. Reconectou: a faixa precisa SUMIR
     * rápido, porque alarme que continua de pé depois de resolvido é a maneira
     * mais rápida de ensinar alguém a ignorar alarme.
     */
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    /*
     * Falhou a consulta, não desenha nada.
     *
     * Uma faixa vermelha por erro de rede diria "seu WhatsApp caiu" quando o
     * que caiu foi a conexão de quem olha — e a pessoa iria mexer no que estava
     * funcionando.
     */
    retry: 1,
  });
}
