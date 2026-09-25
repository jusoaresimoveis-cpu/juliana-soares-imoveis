import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { ConversaoDevolvida } from '@contracts';
import type { CadeiaPorAnuncio, Inteligencia, InteligenciaPorAngulo } from '@/inteligencia';

/**
 * A mesa de decisão de verba, numa ida só ao banco.
 *
 * Tudo vem junto de propósito: gasto, lead, funil, cobertura e faixa de
 * confiança nascem da mesma pergunta, e chegando em requisições separadas o
 * cartão do topo somaria 32 enquanto a tabela ainda mostrava 28 — uma
 * discordância que dura um instante e destrói a confiança na tela inteira.
 */
export function useInteligencia(de: string, ate: string) {
  return useQuery({
    queryKey: ['inteligencia', de, ate],
    queryFn: async (): Promise<Inteligencia | null> => {
      const { data, error } = await supabase.rpc('mkt_inteligencia', { _since: de, _until: ate });
      if (error) throw error;
      return (data as unknown as Inteligencia) ?? null;
    },
    /*
     * Cinco minutos, e não os 30 segundos do padrão.
     *
     * Estes números mudam de HORA em hora — o cron de gasto roda aos 7 minutos
     * de cada hora e é a única coisa que os move. Revalidar a cada meio minuto
     * pagaria a consulta mais pesada deste banco dezenas de vezes para devolver
     * exatamente o mesmo resultado.
     */
    staleTime: 5 * 60_000,
  });
}

/**
 * As DUAS linhas de custo por lead da casa.
 *
 * `teto` é o máximo que se aceita pagar — é ele que produz o vermelho, e sem
 * ele não há semáforo nenhum. `alvo` é onde a casa quer chegar, e ele só
 * destrava o verde; nulo é um estado legítimo, e melhor do que um alvo em que
 * ninguém acredita.
 *
 * Guardadas em centavos, como todo dinheiro deste banco. O `check` da 108
 * recusa alvo acima do teto — um estado sem sentido que quebraria o verde em
 * silêncio, porque nenhuma campanha satisfaria as duas condições ao mesmo
 * tempo e nada na tela explicaria por quê.
 */
export function useSalvarMetaCpl() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      org,
      alvo,
      teto,
    }: {
      org: string;
      alvo: number | null;
      teto: number | null;
    }) => {
      const { error } = await supabase
        .from('organizations')
        .update({ cpl_alvo_minor: alvo, cpl_teto_minor: teto })
        .eq('id', org);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['inteligencia'] }),
  });
}

/**
 * O empreendimento que a campanha anuncia — digitado, nunca adivinhado.
 *
 * A tentação é inferir do nome ("se contém o nome do prédio, é ele"), e o projeto
 * fechou essa porta de propósito: nome de campanha é texto que o gestor
 * reescreve no meio do mês, e uma chave que muda sozinha faz o histórico partir
 * em dois sem ninguém perceber.
 *
 * Escreve só esta coluna. A 105 concedeu `update (property_id)` depois do
 * `revoke all` da 094 — o resto da linha, inclusive o nome da campanha e o id
 * da conta, continua fora do alcance da tela.
 */
export function useVincularImovel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ campanha, imovel }: { campanha: string; imovel: string | null }) => {
      const { error } = await supabase
        .from('meta_ad_dimensions')
        .update({ property_id: imovel })
        .eq('level', 'campaign')
        .eq('object_id', campanha);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['inteligencia'] }),
  });
}

/**
 * A leitura por ângulo de criativo — a 134.
 *
 * Consulta PRÓPRIA, e não mais um pedaço da `mkt_inteligencia`. Aquela devolve
 * a mesa inteira de campanhas e custa caro; esta responde uma pergunta só, e
 * quem abre a tela nem sempre está fazendo essa pergunta.
 */
export function useInteligenciaPorAngulo(de: string, ate: string) {
  return useQuery({
    queryKey: ['inteligencia-angulo', de, ate],
    queryFn: async (): Promise<InteligenciaPorAngulo | null> => {
      const { data, error } = await supabase.rpc('mkt_por_angulo', { _since: de, _until: ate });
      if (error) throw error;
      return (data as unknown as InteligenciaPorAngulo) ?? null;
    },
    // O mesmo motivo da tela de campanhas: estes números só se movem quando o
    // cron de gasto roda, aos 7 minutos de cada hora.
    staleTime: 5 * 60_000,
  });
}

/**
 * O ângulo do criativo — marcado por gente, nunca deduzido do nome.
 *
 * Escreve só esta coluna: a 134 concedeu `update (angulo)` sobre a mesma policy
 * da 093, que recorta pela conexão. O nome do anúncio, o estado e a conta
 * continuam fora do alcance da tela.
 */
export function useMarcarAngulo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ anuncio, angulo }: { anuncio: string; angulo: string | null }) => {
      const { error } = await supabase
        .from('meta_ad_dimensions')
        .update({ angulo })
        .eq('level', 'ad')
        .eq('object_id', anuncio);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['inteligencia-angulo'] }),
  });
}

/** Uma linha do resumo da fila de volta: um evento, e onde ele parou. */
export interface ConversaoDevolvidaResumo {
  evento: ConversaoDevolvida;
  enviados: number;
  na_fila: number;
  falhou: number;
  expirou: number;
}

/**
 * O QUE O CRM JÁ CONSEGUIU CONTAR DE VOLTA PARA A META.
 *
 * A pergunta que esta tela responde não é de marketing, é de encanamento:
 * o cano está passando? Até 24/09 ele não passava — a API de Conversões existia
 * desde agosto dentro da função do FORMULÁRIO, e o formulário nunca recebeu um
 * envio sequer. Os 187 leads todos entraram pela conversa do WhatsApp.
 *
 * Por isso a leitura é por FUNÇÃO e não pela tabela: `meta_conversoes` é do
 * servidor, e a 141 revogou `anon` e `authenticated` nela. O que a gestão
 * precisa saber é a CONTAGEM; a lista de quem foi devolvido não é assunto de
 * tela nenhuma.
 */
export function useConversoesDevolvidas() {
  return useQuery({
    queryKey: ['conversoes-devolvidas'],
    queryFn: async (): Promise<ConversaoDevolvidaResumo[]> => {
      const { data, error } = await supabase.rpc('meta_conversoes_resumo');
      if (error) throw error;
      return ((data ?? []) as Record<string, unknown>[]).map((l) => ({
        evento: l.o_evento as ConversaoDevolvida,
        enviados: Number(l.o_enviados ?? 0),
        na_fila: Number(l.o_na_fila ?? 0),
        falhou: Number(l.o_falhou ?? 0),
        expirou: Number(l.o_expirou ?? 0),
      }));
    },
    /*
     * Um minuto, que é a cadência do cron que drena a fila. Revalidar mais
     * rápido mostraria o mesmo número de novo; mais devagar faria alguém achar
     * que o cano entupiu quando ele já tinha destravado.
     */
    staleTime: 60_000,
  });
}

/** O que a Meta está dizendo que falta, nas palavras dela. Nulo quando nada falta. */
export interface PendenciaDaVolta {
  titulo: string;
  detalhe: string | null;
  quantos: number;
}

/**
 * POR QUE A FILA PAROU — e por que isto não podia ficar só no banco.
 *
 * A API de Conversões recusou cinco vezes seguidas durante a construção, cada
 * vez por um motivo diferente e nenhum deles documentado junto: o vocabulário
 * da conversa, o `page_id`, o `ctwa_clid`, o par página-clique, e por fim o
 * conjunto de dados sem Página associada — que é o único que não se resolve
 * escrevendo código.
 *
 * Uma fila parada sem explicação é indistinguível de uma fila funcionando mal,
 * e as duas somem da cabeça de quem olha a tela em uma semana. Aqui o motivo
 * sobe com o texto da própria Meta, que é quem sabe o que está errado.
 */
export function usePendenciaDaVolta() {
  return useQuery({
    queryKey: ['conversoes-pendencia'],
    staleTime: 60_000,
    queryFn: async (): Promise<PendenciaDaVolta | null> => {
      const { data, error } = await supabase.rpc('meta_conversoes_pendencia');
      if (error) throw error;
      const l = ((data ?? []) as Record<string, unknown>[])[0];
      if (!l) return null;
      return {
        titulo: String(l.o_titulo ?? ''),
        detalhe: (l.o_detalhe as string | null) ?? null,
        quantos: Number(l.o_quantos ?? 0),
      };
    },
  });
}

/**
 * A CADEIA INTEIRA, POR ANÚNCIO — gasto → conversa → lead → cada degrau.
 *
 * A última linha da tabela do método que estava pela metade. As outras duas
 * telas param em "lead", que é o número que já se sabe barato: na conta de
 * origem, o anúncio de lead mais barato não levou ninguém à visita.
 *
 * Mesma cadência das outras: estes números só se movem quando o cron de gasto
 * roda, aos 7 minutos de cada hora.
 */
export function useCadeiaPorAnuncio(de: string, ate: string) {
  return useQuery({
    queryKey: ['cadeia-anuncio', de, ate],
    queryFn: async (): Promise<CadeiaPorAnuncio | null> => {
      const { data, error } = await supabase.rpc('mkt_cadeia_por_anuncio', {
        _since: de,
        _until: ate,
      });
      if (error) throw error;
      return (data as unknown as CadeiaPorAnuncio) ?? null;
    },
    staleTime: 5 * 60_000,
  });
}
