import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { WaInstanceStatus } from '@contracts';

/**
 * Os três estados de uma conversa.
 *
 * `sem_origem` não é um estado provisório de segunda classe: é a resposta
 * honesta para quem chegou sem rastro. Lead de indicação, de placa e de portal
 * cai aqui, e é por isso que ele não pode ser tratado como pessoal — descartar
 * cliente por engano é o erro caro; ter conversa a mais na lista é o barato.
 */
export const ESTADOS_DE_CONVERSA = ['lead', 'sem_origem', 'pessoal'] as const;
export type EstadoDeConversa = (typeof ESTADOS_DE_CONVERSA)[number];

export const ESTADO_META: Record<
  EstadoDeConversa,
  { rotulo: string; explicacao: string }
> = {
  lead: {
    rotulo: 'Leads',
    explicacao:
      'Chegaram por anúncio, landing page, link com UTM ou código de imóvel — ou já eram lead de outra origem.',
  },
  sem_origem: {
    rotulo: 'Sem origem',
    explicacao:
      'Mandaram mensagem sem nenhum rastro. Pode ser cliente de indicação ou de placa, pode ser conversa pessoal. Só você sabe.',
  },
  pessoal: {
    rotulo: 'Pessoais',
    /*
     * O texto anterior dizia "marcadas por você como não-lead" e era mentira em
     * duas frentes: grupo cai aqui sem ninguém marcar nada, e a consequência
     * que MAIS importa — que ninguém mais enxerga — não estava escrita em lugar
     * nenhum. Quem lê isto está decidindo sobre a própria privacidade.
     */
    explicacao:
      'Suas conversas particulares e os grupos. Só quem conectou o número enxerga — nem o gestor da imobiliária, nem quem administra o sistema. Ficam fora de toda contagem do painel.',
  },
};

export interface Conversa {
  id: string;
  instance_id: string | null;
  lead_id: string | null;
  contact_e164: string | null;
  contact_lid: string | null;
  /** Grupo é pessoal por definição — a volta dele exige forçar 'lead'. */
  is_group: boolean;
  contact_name: string | null;
  ref_code: string | null;
  property_id: string | null;
  unread_count: number;
  last_message_at: string | null;
  last_message_body: string | null;
  /** O que a pessoa decidiu. Nulo = ninguém decidiu, vale o automático. */
  classification: 'lead' | 'pessoal' | null;
  estado: EstadoDeConversa;
  lead_source: string | null;
  /**
   * Link da foto do contato, renovado a cada mensagem que chega.
   *
   * Vence em ~2 dias: é para MOSTRAR, nunca para guardar. Quando envelhece, o
   * `<Avatar>` cai para as iniciais e volta sozinho na mensagem seguinte.
   */
  foto_url: string | null;
  /*
   * O NÚMERO por onde a conversa entrou, junto da conversa.
   *
   * Antes a tela cruzava `instance_id` com a lista de números da organização.
   * Isso parou de funcionar quando a 080 recortou a lista por dono: o corretor
   * abre um lead que o gerente repassou — conversa que entrou pelo número DELE
   * — e não acha o número em lista nenhuma. A tela dizia "número removido" e
   * travava a resposta.
   *
   * Vem da view, por uma função `security definer` que só devolve rótulo e
   * estado (nunca o telefone) e só dentro da própria imobiliária.
   */
  numero_rotulo: string | null;
  numero_estado: WaInstanceStatus | null;
  /** Sou eu quem conectou este número? É o que libera marcar como pessoal. */
  numero_e_meu: boolean;
}

export interface Mensagem {
  id: string;
  direction: 'entrada' | 'saida';
  kind: string;
  body: string | null;
  ref_code: string | null;
  media_status: string;
  media_path: string | null;
  media_mime: string | null;
  media_filename: string | null;
  status: string;
  error: string | null;
  sent_by: string | null;
  occurred_at: string;
}

const COLUNAS =
  'id, instance_id, lead_id, contact_e164, contact_lid, is_group, contact_name, ref_code, property_id, unread_count, last_message_at, last_message_body, classification, estado, lead_source, numero_rotulo, numero_estado, numero_e_meu, foto_url';

/**
 * As conversas de um estado.
 *
 * Lê da view, e não da tabela: é lá que o estado é calculado, junto do lead, e
 * assim a regra de "o que é lead" existe num lugar só. Calcular isso aqui
 * exigiria trazer os leads inteiros para o navegador e refazer a conta — que é
 * exatamente o desenho que fez o painel de referência parar de somar aos 1000
 * registros.
 */
export function useConversas(estado: EstadoDeConversa | 'todas' = 'lead') {
  return useQuery({
    queryKey: ['conversas', estado],
    staleTime: 15_000,
    queryFn: async (): Promise<Conversa[]> => {
      let q = supabase
        .from('whatsapp_conversas_v')
        .select(COLUNAS)
        .is('archived_at', null)
        .order('last_message_at', { ascending: false, nullsFirst: false })
        .limit(60);

      if (estado !== 'todas') q = q.eq('estado', estado);

      const { data, error } = await q;
      if (error) throw error;
      return data as unknown as Conversa[];
    },
  });
}

/**
 * Quantas conversas em cada estado.
 *
 * Três contagens `head`, em paralelo: o servidor devolve só o número, sem
 * linha nenhuma. Trazer as conversas para contar no navegador esbarraria no
 * corte de 1000 linhas do PostgREST — que não avisa, e faz o número parar de
 * crescer parecendo certo.
 */
export function useContagemDeConversas() {
  return useQuery({
    queryKey: ['conversas-contagem'],
    staleTime: 15_000,
    queryFn: async (): Promise<Record<EstadoDeConversa, number>> => {
      const contagens = await Promise.all(
        ESTADOS_DE_CONVERSA.map(async (estado) => {
          const { count, error } = await supabase
            .from('whatsapp_conversas_v')
            .select('id', { count: 'exact', head: true })
            .is('archived_at', null)
            .eq('estado', estado);
          if (error) throw error;
          return [estado, count ?? 0] as const;
        }),
      );
      return Object.fromEntries(contagens) as Record<EstadoDeConversa, number>;
    },
  });
}

/**
 * Marca a conversa como lead ou como pessoal — ou devolve ao automático.
 *
 * Uma chamada só, porque no servidor a conversa e o lead são atualizados na
 * mesma transação. Fossem dois pedidos daqui, uma falha de rede no meio
 * deixaria a conversa escondida da lista e o lead ainda contando no painel.
 */
export function useClassificarConversa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { conversaId: string; classificacao: 'lead' | 'pessoal' | null }) => {
      /*
       * Voltar ao automático OMITE o argumento, em vez de mandar `null`.
       *
       * A função tem `default null`, então omitir e mandar nulo são a mesma
       * coisa para o Postgres. A diferença é aqui: o tipo gerado não consegue
       * expressar "aceita nulo", e mandar nulo exigiria um `as` — um cast que
       * esconderia justamente o comportamento que a gente quer.
       */
      const { error } = await supabase.rpc(
        'wa_classificar_conversa',
        p.classificacao === null
          ? { _conversa: p.conversaId }
          : { _conversa: p.conversaId, _classificacao: p.classificacao },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['conversas'] });
      void qc.invalidateQueries({ queryKey: ['conversas-contagem'] });
      // O painel conta leads, e acabou de mudar quantos existem.
      void qc.invalidateQueries({ queryKey: ['painel'] });
      void qc.invalidateQueries({ queryKey: ['ultimos-leads'] });
    },
  });
}

/**
 * A janela de mensagens vem das MAIS RECENTES e é invertida no cliente.
 *
 * A referência trazia as 200 mais antigas com `order asc + limit`, então a
 * conversa abria no começo de tudo e escondia justamente o que acabou de
 * chegar — que é o único motivo de alguém abrir a tela.
 */
export function useMensagens(conversaId: string | null) {
  return useQuery({
    queryKey: ['mensagens', conversaId],
    enabled: !!conversaId,
    queryFn: async (): Promise<Mensagem[]> => {
      const { data, error } = await supabase
        .from('whatsapp_messages')
        .select(
          'id, direction, kind, body, ref_code, media_status, media_path, media_mime, media_filename, status, error, sent_by, occurred_at',
        )
        .eq('conversation_id', conversaId!)
        .order('occurred_at', { ascending: false })
        .limit(60);
      if (error) throw error;
      return (data as Mensagem[]).reverse();
    },
  });
}

export function useEnviar(conversaId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (texto: string) => {
      const { error } = await supabase.rpc('enfileirar_mensagem', {
        _conversation_id: conversaId!,
        _body: texto,
      });
      // As três recusas do banco chegam legíveis: número desconectado, conversa
      // sem telefone identificado, mensagem vazia.
      if (error) throw new Error(error.message.replace(/^.*?:\s*/, ''));
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['mensagens', conversaId] });
      void qc.invalidateQueries({ queryKey: ['conversas'] });
    },
  });
}

export function useMarcarLida() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (conversaId: string) => {
      await supabase.rpc('marcar_conversa_lida', { _conversation_id: conversaId });
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['conversas'] }),
  });
}

/** Vincular a conversa a um lead — o caminho manual quando o número veio anônimo. */
export function useVincularLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { conversaId: string; leadId: string }) => {
      const { error } = await supabase
        .from('whatsapp_conversations')
        .update({ lead_id: p.leadId })
        .eq('id', p.conversaId);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['conversas'] }),
  });
}

/** Mensagem nova chegando sem recarregar. O filtro é por organização no servidor. */
export function useConversasAoVivo() {
  const qc = useQueryClient();
  useEffect(() => {
    const canal = supabase
      .channel('conversas')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_messages' }, () => {
        void qc.invalidateQueries({ queryKey: ['conversas'] });
        void qc.invalidateQueries({ queryKey: ['mensagens'] });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(canal);
    };
  }, [qc]);
}

/**
 * URL assinada para a mídia recebida.
 *
 * O bucket `whatsapp-media` é PRIVADO — cliente manda RG, comprovante de renda
 * e contrato, e nada disso pode ter endereço aberto. Cada exibição pede uma URL
 * temporária, que expira sozinha. Na referência o bucket era público, e o link
 * do documento continuava válido para sempre, para qualquer um.
 *
 * A validade é curta de propósito: se o corretor deixar a aba aberta a tarde
 * inteira, a imagem some e recarrega — melhor do que um endereço que sobrevive
 * ao vínculo dele com a imobiliária.
 */
export function useMidiaAssinada(caminho: string | null) {
  return useQuery({
    queryKey: ['midia', caminho],
    enabled: !!caminho,
    staleTime: 4 * 60_000,
    gcTime: 5 * 60_000,
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await supabase.storage
        .from('whatsapp-media')
        .createSignedUrl(caminho!, 300);
      if (error) return null;
      return data.signedUrl;
    },
  });
}
