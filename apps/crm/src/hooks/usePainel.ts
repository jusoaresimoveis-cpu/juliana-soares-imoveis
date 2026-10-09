import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import {
  RETOMADA_APOS_HORAS,
  RETOMADA_TOQUES_MAXIMO,
  PESO_DA_TEMPERATURA,
  type Temperatura,
} from '@contracts';
import type { Painel } from '@/types/painel';

// Os tipos do painel, a conta do período e o formato dos números moram em
// types/painel.ts, lib/periodo.ts e lib/formatosDoPainel.ts; daqui seguem com o
// mesmo nome, para quem já importava de '@/hooks/usePainel'.
export type {
  JanelaDoPainel,
  EtapaDoPainel,
  SerieDoPainel,
  OrigemDoPainel,
  EscopoDoPainel,
  Painel,
} from '@/types/painel';
export {
  PERIODOS,
  periodoInicial,
  hojeISO,
  janelaPersonalizada,
  janelaDe,
  janelaDeDias,
  PERIODOS_DE_JANELA,
  janelaDoPeriodo,
  type ChaveDePeriodo,
  type PeriodoDeJanela,
} from '@/lib/periodo';
export {
  dinheiro,
  duracao,
  investimento,
  custoPorLeadMeta,
  variacao,
  type Variacao,
  desde,
} from '@/lib/formatosDoPainel';

/**
 * Todos os indicadores numa ida só ao banco.
 *
 * O painel de referência baixava a tabela de leads inteira e a de gasto inteira
 * e somava no navegador. Além do tráfego, o PostgREST corta em 1000 linhas sem
 * avisar: passando disso, os números paravam de crescer e continuavam
 * plausíveis — que é a pior forma de errar.
 */
export function usePainel(de: string, ate: string) {
  return useQuery({
    queryKey: ['painel', de, ate],
    queryFn: async (): Promise<Painel | null> => {
      const { data, error } = await supabase.rpc('painel_indicadores', {
        _since: de,
        _until: ate,
      });
      if (error) throw error;
      const p = data as unknown as Painel & { erro?: string };
      return p?.erro ? null : p;
    },
  });
}

export interface LeadRecente {
  id: string;
  full_name: string;
  source: string;
  created_at: string;
  etapa: string | null;
  ultima_mensagem: string | null;
  nao_lidas: number;
  /**
   * De qual PÁGINA o lead veio — "C", "B/AR", conforme o mercado.
   *
   * `source` diz o canal e para por aí: dois leads marcados "WhatsApp" podem ter
   * vindo de páginas diferentes, e é a página que está sendo testada. Sem isto,
   * a lista da primeira dobra mostra o meio e esconde a mensagem.
   */
  pagina: string | null;
  /**
   * A foto do contato, quando existe. Duas fontes, nesta ordem:
   *
   *   foto_path  — a cópia guardada no bucket. Vale para sempre, mas precisa
   *                de link assinado (ver `useFotosGuardadas`).
   *   foto_url   — o link vivo que chega em cada mensagem. Não precisa assinar,
   *                mas vence em ~2 dias.
   *
   * Nesta lista os dois quase sempre existem, porque "últimos leads" são
   * recentes. A cópia ganha porque não vence.
   */
  foto_path: string | null;
  foto_url: string | null;
}

/*
 * O dicionário de origens saiu daqui.
 *
 * Existiam três cópias — esta, a do cartão de lead e a do painel — e elas já
 * tinham divergido: aqui `meta_ads` era "Meta", no cartão de lead era "Meta
 * Ads". Duas telas com rótulos diferentes para o mesmo canal parecem falar de
 * canais diferentes. Agora é `LEAD_SOURCE_LABEL`, em `@contracts`, do lado da
 * lista que o banco valida.
 */

/**
 * Os últimos leads que entraram.
 *
 * Esta lista era CINCO NOMES ESCRITOS NO CÓDIGO — Camila Duarte, Ricardo
 * Menezes e companhia. Com o banco zerado eles continuariam na tela, e nome
 * inventado na primeira dobra do painel ensina a desconfiar de tudo que vem
 * depois.
 *
 * A prévia da conversa vem do WhatsApp quando existe; quando não existe, a
 * linha mostra a etapa. Inventar uma frase seria repetir o problema.
 */
/** Um lead que escreveu e está sem resposta. */
export interface LeadEsperando {
  id: string;
  full_name: string;
  esperando_desde: string;
  temperatura: Temperatura | null;
  etapa: string | null;
  ultima_mensagem: string | null;
  foto_path: string | null;
  foto_url: string | null;
}

/**
 * A fila do dia: quem falou por último e está esperando a casa.
 *
 * `esperando_desde` é mantido pela 124, na chegada da mensagem — a pergunta
 * "quem falou por último" custaria uma varredura de quarenta mil linhas a cada
 * abertura de painel. Nulo quer dizer que a casa respondeu; o índice parcial é
 * feito para esta consulta.
 *
 * Quem vê o quê é a RLS: o corretor recebe a própria carteira, a gestão recebe
 * a casa inteira. Nada a filtrar aqui.
 *
 * Etapa de ganho ou de perda fica DE FORA. Um lead marcado como perdido que
 * mandou mensagem depois não é fila de atendimento — e cobrar resposta para
 * quem já foi encerrado é o jeito mais rápido de a lista virar ruído.
 */
export interface LeadParaRetomar {
  id: string;
  full_name: string;
  silencio_desde: string;
  toques_sem_resposta: number;
  temperatura: Temperatura | null;
  etapa: string | null;
  ultima_mensagem: string | null;
  foto_path: string | null;
  foto_url: string | null;
}

/**
 * A FILA DE RETOMADA: quem parou de responder e ainda vale um toque.
 *
 * Duas medições de 24/09 desenharam esta lista, e as duas contrariam o
 * instinto de esperar:
 *
 *   dos 645 retornos, 97,8% aconteceram no MESMO DIA. Passado um dia, só 2,2%
 *   voltam sozinhos — a conversa parada não está amadurecendo, ela acabou;
 *
 *   e das 1.771 vezes em que a casa mandou uma segunda mensagem sem ter sido
 *   respondida, 385 trouxeram o cliente de volta. Uma em cada cinco.
 *
 * O corte de três toques é o freio: insistir com quem não responde é o caminho
 * mais curto para o número ser denunciado. Passou de três, a fila cala a boca —
 * o corretor continua livre para escrever pela ficha, se conhecer o caso.
 *
 * Ordem: temperatura primeiro (quando existir), depois quem esfriou há MENOS
 * tempo — é quem tem mais chance de voltar.
 */
export function useParaRetomar(quantos = 8) {
  return useQuery({
    queryKey: ['para-retomar', quantos],
    staleTime: 60_000,
    queryFn: async (): Promise<LeadParaRetomar[]> => {
      const corte = new Date(Date.now() - RETOMADA_APOS_HORAS * 3_600_000).toISOString();

      const { data, error } = await supabase
        .from('leads')
        /* Uma linha só: a inferência de tipos do cliente lê o literal. */
        .select('id, full_name, silencio_desde, toques_sem_resposta, temperatura, pipeline_stages!inner(label, is_won, is_lost), whatsapp_conversations(last_message_body, foto_path, foto_url)')
        .not('silencio_desde', 'is', null)
        .lt('silencio_desde', corte)
        .lt('toques_sem_resposta', RETOMADA_TOQUES_MAXIMO)
        .is('excluded_at', null)
        .eq('pipeline_stages.is_won', false)
        .eq('pipeline_stages.is_lost', false)
        .order('silencio_desde', { ascending: false })
        .limit(quantos * 3);
      if (error) throw error;

      const lista = (data ?? []).map((l) => {
        const conversa = Array.isArray(l.whatsapp_conversations)
          ? l.whatsapp_conversations[0]
          : l.whatsapp_conversations;
        const etapa: unknown = Array.isArray(l.pipeline_stages) ? l.pipeline_stages[0] : l.pipeline_stages;
        return {
          id: l.id as string,
          full_name: l.full_name as string,
          silencio_desde: l.silencio_desde as string,
          toques_sem_resposta: (l.toques_sem_resposta as number) ?? 0,
          temperatura: (l.temperatura as Temperatura | null) ?? null,
          etapa: (etapa as { label?: string } | null)?.label ?? null,
          ultima_mensagem: (conversa as { last_message_body?: string } | null)?.last_message_body ?? null,
          foto_path: (conversa as { foto_path?: string } | null)?.foto_path ?? null,
          foto_url: (conversa as { foto_url?: string } | null)?.foto_url ?? null,
        };
      });

      /*
       * A ordem final sai daqui, e não do banco.
       *
       * Ordenar por temperatura no PostgREST exigiria uma expressão que ele não
       * aceita, e ordenar só por data poria um curioso de ontem à frente de um
       * lead quente de anteontem. Com o corte de três toques a lista é curta —
       * ordenar no navegador custa nada.
       */
      return lista
        .sort((a, b) => {
          const pa = a.temperatura ? PESO_DA_TEMPERATURA[a.temperatura] : 9;
          const pb = b.temperatura ? PESO_DA_TEMPERATURA[b.temperatura] : 9;
          if (pa !== pb) return pa - pb;
          return b.silencio_desde.localeCompare(a.silencio_desde);
        })
        .slice(0, quantos);
    },
  });
}

export function useEsperando(quantos = 8) {
  return useQuery({
    queryKey: ['esperando', quantos],
    staleTime: 30_000,
    queryFn: async (): Promise<LeadEsperando[]> => {
      const { data, error } = await supabase
        .from('leads')
        /* O `select` em UMA linha, e não concatenado: a inferência de tipos do
           cliente do Supabase lê o literal da string. Quebrado em `+`, o tipo
           vira `string`, a projeção inteira cai para `GenericStringError` e o
           `tsc` reclama de cada campo. */
        .select('id, full_name, esperando_desde, temperatura, pipeline_stages!inner(label, is_won, is_lost), whatsapp_conversations(last_message_body, foto_path, foto_url)')
        .not('esperando_desde', 'is', null)
        .is('excluded_at', null)
        .eq('pipeline_stages.is_won', false)
        .eq('pipeline_stages.is_lost', false)
        .order('esperando_desde', { ascending: true })
        .limit(quantos);
      if (error) throw error;

      return (data ?? []).map((l) => {
        const conversa = Array.isArray(l.whatsapp_conversations)
          ? l.whatsapp_conversations[0]
          : l.whatsapp_conversations;
        const etapa: unknown = Array.isArray(l.pipeline_stages) ? l.pipeline_stages[0] : l.pipeline_stages;
        return {
          id: l.id as string,
          full_name: l.full_name as string,
          esperando_desde: l.esperando_desde as string,
          temperatura: (l.temperatura as Temperatura | null) ?? null,
          etapa: (etapa as { label?: string } | null)?.label ?? null,
          ultima_mensagem: (conversa as { last_message_body?: string } | null)?.last_message_body ?? null,
          foto_path: (conversa as { foto_path?: string } | null)?.foto_path ?? null,
          foto_url: (conversa as { foto_url?: string } | null)?.foto_url ?? null,
        };
      });
    },
  });
}

export function useUltimosLeads(quantos = 5) {
  return useQuery({
    queryKey: ['ultimos-leads', quantos],
    queryFn: async (): Promise<LeadRecente[]> => {
      const { data, error } = await supabase
        .from('leads')
        .select('id, full_name, source, created_at, ft_variant, pipeline_stages(label), whatsapp_conversations(last_message_body, unread_count, foto_path, foto_url)')
        .order('created_at', { ascending: false })
        .limit(quantos);
      if (error) throw error;

      return (data ?? []).map((l) => {
        const conversa = Array.isArray(l.whatsapp_conversations)
          ? l.whatsapp_conversations[0]
          : l.whatsapp_conversations;
        const etapa: unknown = Array.isArray(l.pipeline_stages) ? l.pipeline_stages[0] : l.pipeline_stages;
        const variante = (l.ft_variant as string | null)?.toUpperCase() ?? null;

        return {
          id: l.id,
          full_name: l.full_name,
          source: l.source,
          /*
           * Sai do PRÓPRIO lead, e não de um embed da página.
           *
           * A primeira versão pedia `landing_pages(market)` junto — e não existe
           * chave estrangeira de `leads.ft_landing_page_id` para `landing_pages`.
           * O PostgREST recusaria o embed e a lista inteira de últimos leads
           * quebraria na primeira dobra do painel. O `tsc` não pega: a string do
           * select não é verificada em profundidade.
           *
           * A chave faltar é provavelmente decisão, não esquecimento: atribuição
           * é fato histórico, e amarrá-la à página faria apagar uma página ou
           * apagar a origem do lead, ou travar a exclusão. O mercado, quando
           * fizer falta, sai de uma consulta própria — não do caminho quente da
           * primeira tela.
           */
          pagina: variante ? `LP ${variante}` : null,
          created_at: l.created_at,
          etapa: (etapa as { label?: string } | null)?.label ?? null,
          ultima_mensagem: (conversa as { last_message_body?: string } | null)?.last_message_body ?? null,
          nao_lidas: (conversa as { unread_count?: number } | null)?.unread_count ?? 0,
          foto_path: (conversa as { foto_path?: string | null } | null)?.foto_path ?? null,
          foto_url: (conversa as { foto_url?: string | null } | null)?.foto_url ?? null,
        };
      });
    },
  });
}
