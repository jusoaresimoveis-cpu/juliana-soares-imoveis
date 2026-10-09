import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import {
  RETOMADA_APOS_HORAS,
  RETOMADA_TOQUES_MAXIMO,
  PESO_DA_TEMPERATURA,
  type Temperatura,
} from '@contracts';

export interface JanelaDoPainel {
  leads: number;
  leads_meta: number;
  investido_menor: number;
  /** Quantas moedas entraram na soma. Mais de uma torna o total sem sentido. */
  moedas: number;
  vendas: number;
  vgv_centavos: number;
  propostas: number;
  visitas: number;
  minutos_ate_contato: number | null;
  contatados: number;
  /*
   * O que ainda VAI acontecer, sem filtro de período.
   *
   * `visitas` conta o que foi MARCADO na janela — trabalho feito, como os
   * cartões ao lado. Este conta o que está pela frente, que é a resposta certa
   * para a pergunta que a saudação faz. Contar visita futura dentro de uma
   * janela que termina hoje dava sempre zero: a visita marcada para 5 de
   * setembro não cabe em nenhum período retrospectivo.
   */
  visitas_proximas: number;
}

export interface EtapaDoPainel {
  key: string;
  label: string;
  total: number;
}

export interface SerieDoPainel {
  /** Acima de 92 dias a série vira semanal — 2.400 pontos não são um gráfico. */
  passo: 'dia' | 'semana';
  /** Já vem com os dias vazios preenchidos com zero, direto do banco. */
  pontos: { dia: string; n: number }[];
}

export interface OrigemDoPainel {
  source: string;
  n: number;
}

/**
 * De quem sao os numeros que este painel esta mostrando.
 *
 * Quem decide e o BANCO, e nao a tela: `painel_indicadores` compara o papel de
 * quem chamou e ja devolve os totais recortados. O front recebe isto pronto
 * para poder ser honesto sobre o que esta exibindo — e para tirar do ar os dois
 * cartoes de midia, que o corretor nao pode ler e que apareceriam zerados.
 */
export type EscopoDoPainel = 'meus' | 'todos';

export interface Painel {
  periodo: { de: string; ate: string; dias: number };
  /** 'meus' para o corretor; 'todos' para gerente e administrador. */
  escopo: EscopoDoPainel;
  /*
   * Existe verba que ESTA pessoa pode ler?
   *
   * Era o `escopo` que decidia isso, e ele responde outra pergunta: de quem são
   * os LEADS. As duas andavam juntas enquanto verba era coisa só da gestão. Com
   * a corretora tendo a BM dela, elas se separam — os leads dela são dela, e o
   * dinheiro dela também.
   *
   * Quem responde é o banco, pela policy: "existe conta de anúncio que você
   * enxerga?". Assim a tela não tem como discordar de quem manda.
   */
  ve_verba: boolean;
  atual: JanelaDoPainel;
  anterior: JanelaDoPainel;
  funil: EtapaDoPainel[];
  serie: SerieDoPainel;
  origens: OrigemDoPainel[];
}

export const PERIODOS = [
  /*
   * "Hoje" com `dias: 1` cai na mesma conta dos outros.
   *
   * `janelaDe` subtrai `dias - 1` da data de hoje porque o período INCLUI o dia
   * corrente. Com 1, a subtração é zero e a janela vira hoje..hoje — sem
   * nenhum caso especial. É o mesmo motivo de "7 dias" ser hoje e os seis
   * anteriores.
   */
  /*
   * QUATRO atalhos, e o quarto abre uma janela qualquer.
   *
   * Eram seis — hoje, 7, 30, 90, este mês, máximo — e três deles respondiam
   * quase a mesma pergunta. Seis pastilhas também quebravam em duas linhas num
   * celular, e havia um mecanismo (`curto`) só para esconder duas delas ali; com
   * quatro, todas cabem e o mecanismo deixa de existir.
   *
   * `personalizado` não tem janela própria: quem a define são as duas datas que
   * a tela mostra quando ele é escolhido. `dias: 0` aqui é só para a lista ter
   * um formato só.
   */
  { key: 'hoje', rotulo: 'Hoje', dias: 1 },
  { key: '7', rotulo: '7 dias', dias: 7 },
  { key: 'max', rotulo: 'Máximo', dias: 0 },
  { key: 'personalizado', rotulo: 'Personalizado', dias: 0 },
] as const;

/**
 * O período em que o painel abre.
 *
 * Era diferente por tamanho de tela — um remendo para o celular não abrir num
 * período cujo botão estava escondido. Com quatro pastilhas não há botão
 * escondido, e a resposta volta a ser uma só.
 *
 * Sete dias: é a janela em que uma decisão de tráfego ainda cabe. "Hoje" varia
 * demais para servir de padrão, e "Máximo" mistura o mês passado com o começo do
 * projeto.
 */
export function periodoInicial(): ChaveDePeriodo {
  return '7';
}

export type ChaveDePeriodo = (typeof PERIODOS)[number]['key'];

/** Data local em YYYY-MM-DD. `toISOString` daria o dia errado à noite, no fuso. */
function dia(d: Date): string {
  const z = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}

/**
 * Hoje, em `YYYY-MM-DD` local.
 *
 * É o teto dos dois campos de data do período personalizado. `toISOString()`
 * daria o dia errado à noite, no nosso fuso — o mesmo motivo pelo qual `dia()`
 * existe logo acima.
 */
export function hojeISO(): string {
  return dia(new Date());
}

/**
 * A janela que as duas datas escolhidas à mão descrevem.
 *
 * Normaliza em vez de recusar: data invertida vira intervalo na ordem certa, e
 * data no futuro é aparada em hoje. Recusar exigiria uma mensagem de erro para
 * um engano que o próprio campo já torna óbvio — e um painel que fica vazio
 * enquanto a pessoa termina de digitar parece quebrado.
 *
 * Comparação de texto funciona porque o formato é `YYYY-MM-DD`, que ordena
 * igual à data.
 */
export function janelaPersonalizada(de: string, ate: string): { de: string; ate: string } {
  const limite = dia(new Date());
  const a = de || limite;
  const b = ate || limite;
  const ini = a <= b ? a : b;
  const fim = a <= b ? b : a;
  return { de: ini > limite ? limite : ini, ate: fim > limite ? limite : fim };
}

export function janelaDe(chave: ChaveDePeriodo): { de: string; ate: string } {
  const hoje = new Date();
  const ate = dia(hoje);

  if (chave === 'max') {
    // Antes de existir CRM não há dado. Uma data fixa é mais honesta do que
    // uma consulta a mais só para descobrir o primeiro lead.
    return { de: '2020-01-01', ate };
  }

  /*
   * `personalizado` cai no padrão de sete dias.
   *
   * Ele não tem janela própria — quem a define são as duas datas da tela. Esta
   * função existe para os atalhos, e devolver algo válido aqui é o que impede a
   * tela de pedir um período inválido no instante entre escolher
   * "Personalizado" e escolher as datas.
   */
  const dias = PERIODOS.find((p) => p.key === chave)?.dias || 7;
  return janelaDeDias(dias);
}

/**
 * Os últimos N dias, INCLUINDO hoje, em datas locais.
 *
 * Separada de `janelaDe` porque cada tela tem os seus atalhos — o painel tem
 * Hoje, 7 dias e Máximo; Anúncios tem Hoje, 7, 30 e 90. A conta de data é uma
 * só e mora aqui, com o fuso local e o `dias - 1` que o teste guarda.
 *
 * Anúncios tinha a própria, e errava nas duas coisas: usava `toISOString()`,
 * que é UTC e à noite devolve o dia seguinte, e subtraía `dias` em vez de
 * `dias - 1`, então "7 dias" cobria oito.
 */
export function janelaDeDias(dias: number): { de: string; ate: string } {
  const hoje = new Date();
  const inicio = new Date(hoje);
  // `dias - 1` porque o período INCLUI hoje: "7 dias" é hoje e os seis
  // anteriores, não hoje e os sete. Menos de um dia não existe.
  inicio.setDate(inicio.getDate() - (Math.max(1, dias) - 1));
  return { de: dia(inicio), ate: dia(hoje) };
}

/**
 * Os atalhos das telas que leem JANELAS — Anúncios e a exportação de leads.
 *
 * Não são os do painel, e é de propósito. O painel responde "como está a
 * operação" e mora em Hoje, 7 dias e Máximo. Verba e lista de contatos se leem
 * em janelas de mídia — 7, 30, 90 —, que é também como o gerenciador da Meta as
 * oferece. Moravam dentro de Anúncios; a exportação precisou dos mesmos, e
 * copiar a lista seria o começo de duas telas com atalhos diferentes para a
 * mesma pergunta.
 *
 * "Hoje" é parcial por natureza: o dia ainda está acontecendo.
 */
export const PERIODOS_DE_JANELA = [
  { key: 'hoje', rotulo: 'Hoje', dias: 1 },
  { key: '7', rotulo: '7 dias', dias: 7 },
  { key: '30', rotulo: '30 dias', dias: 30 },
  { key: '90', rotulo: '90 dias', dias: 90 },
  { key: 'personalizado', rotulo: 'Personalizado', dias: 0 },
] as const;

export type PeriodoDeJanela = (typeof PERIODOS_DE_JANELA)[number]['key'];

/**
 * A janela que um desses atalhos pede ao banco.
 *
 * A versão original, dentro de Anúncios, subtraía `dias` em vez de `dias - 1` —
 * "7 dias" cobria oito — e usava `toISOString()`, que à noite, no nosso fuso,
 * já é o dia seguinte. O teste guarda as duas coisas.
 */
export function janelaDoPeriodo(
  periodo: PeriodoDeJanela,
  aMao: { de: string; ate: string },
): { de: string; ate: string } {
  if (periodo === 'personalizado') return janelaPersonalizada(aMao.de, aMao.ate);
  return janelaDeDias(PERIODOS_DE_JANELA.find((p) => p.key === periodo)?.dias ?? 30);
}

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

/* -------------------------------------------------------------------------- */
/* Como cada número vira texto                                                */
/* -------------------------------------------------------------------------- */

export function dinheiro(menor: number | null | undefined): string {
  if (menor == null) return '—';
  return (menor / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/**
 * Minutos viram "126h 40m", não "7600 minutos".
 *
 * Tempo de atendimento é lido de relance para saber se está bom ou ruim; em
 * minutos, ninguém converte de cabeça.
 */
export function duracao(minutos: number | null | undefined): string {
  if (minutos == null) return '—';
  if (minutos < 60) return `${Math.round(minutos)}min`;
  const h = Math.floor(minutos / 60);
  const m = Math.round(minutos % 60);
  if (h < 48) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

/**
 * O investimento, só quando ele significa alguma coisa.
 *
 * Com mais de uma moeda no período, a soma junta real com dólar e produz um
 * número com toda a cara de estar certo. Devolver nulo faz a tela escrever '—',
 * que é a verdade: não dá para somar isso.
 */
export function investimento(j: JanelaDoPainel): number | null {
  return j.moedas > 1 ? null : j.investido_menor;
}

/**
 * Custo por lead — dividido só pelos leads que a META trouxe.
 *
 * O painel de referência dividia o gasto de anúncio pelo total de leads,
 * indicação e placa na rua incluídas. O custo saía barato e a decisão de verba
 * era tomada em cima disso.
 */
export function custoPorLeadMeta(j: JanelaDoPainel): number | null {
  /*
   * Sem gasto registrado o custo é NULO, não zero.
   *
   * "R$ 0,00" num card de custo por lead lê como "os leads saíram de graça",
   * que é uma afirmação. A verdade é outra: ou a integração não trouxe o gasto
   * ainda, ou não houve investimento no período. Nos dois casos, não se sabe —
   * e '—' é como se escreve não saber.
   */
  // Moedas misturadas invalidam o custo pelo mesmo motivo que invalidam a soma.
  if (j.moedas > 1 || j.investido_menor <= 0 || j.leads_meta <= 0) return null;
  return Math.round(j.investido_menor / j.leads_meta);
}

export interface Variacao {
  pct: number | null;
  /** `true` quando subir é bom. Custo e tempo sobem para o lado errado. */
  subirEBom: boolean;
}

/**
 * A variação entre os dois períodos.
 *
 * Devolve `null` quando o período anterior é zero: "de 0 para 8" não é +800%,
 * não é +100%, é simplesmente uma comparação que não existe. O painel auditado
 * mostrava `+∞%` e `NaN%` nesse caso.
 */
export function variacao(agora: number, antes: number): number | null {
  if (antes === 0) return null;
  return Math.round(((agora - antes) / antes) * 100);
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

/** "agora", "12 min", "3 h", "2 d" — como se lê uma lista de recentes. */
export function desde(iso: string): string {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h`;
  return `${Math.floor(h / 24)} d`;
}
