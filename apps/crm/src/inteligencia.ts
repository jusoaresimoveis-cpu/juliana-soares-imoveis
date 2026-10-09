/**
 * A LEITURA da mesa de decisão de verba.
 *
 * A função `mkt_inteligencia` do banco devolve FATO: quanto se gastou, quantos
 * leads chegaram, até onde eles foram no funil, qual a faixa de confiança do
 * custo. Este módulo transforma fato em LEITURA — o que isso quer dizer e o que
 * fazer a respeito.
 *
 * A divisão é de propósito. Fato tem que vir do banco, porque é lá que estão as
 * junções e a RLS. Leitura tem que vir daqui, porque é ela que muda de opinião
 * quando aprendemos algo — e mudar de opinião num arquivo TypeScript custa um
 * teste, enquanto mudar de opinião dentro de uma função SQL custa uma migração
 * e uma janela de manutenção.
 *
 * ---------------------------------------------------------------------------
 * POR QUE OS ACHADOS VALEM MAIS QUE O SEMÁFORO
 * ---------------------------------------------------------------------------
 *
 * O semáforo compara UMA campanha com uma meta, e para isso precisa de volume:
 * dez resultados para dizer qualquer coisa, vinte e cinco para dizer algo
 * forte. Numa imobiliária que faz de um a cinco leads por dia espalhados por
 * doze campanhas, quase nenhuma linha chega lá — e é por isso que `sem_leitura`
 * é o estado mais comum, e está certo que seja.
 *
 * Os achados olham a CONTA INTEIRA, e a conta inteira tem volume. "Doze
 * campanhas ativas somando R$ 150 por dia" é um fato sobre 150 reais, não sobre
 * 9 leads — não precisa de intervalo de confiança, e é uma afirmação que
 * sustenta decisão hoje.
 *
 * Na prática é o inverso do que o semáforo sugere: com verba pequena, a decisão
 * que importa quase nunca é "qual campanha desligar". É "por que há doze".
 */

/* -------------------------------------------------------------------------- */
/* O que o banco devolve                                                       */
/* -------------------------------------------------------------------------- */

export type Veredito = 'rende' | 'observar' | 'revisar' | 'sem_leitura' | 'sem_meta' | 'parada';

export interface CampanhaInteligencia {
  id: string;
  nome: string | null;
  status: string | null;
  objetivo: string | null;
  destino: string | null;
  conta: string;
  conta_nome: string | null;
  moeda: string | null;
  imovel: string | null;
  imovel_id: string | null;
  lance: string | null;
  orcamento: number | null;
  orcamento_tipo: 'diario' | 'total' | null;
  orcamento_nivel: 'campanha' | 'conjuntos' | null;
  conjuntos: number | null;
  gasto: number;
  dias: number;
  ultimo_dia: string | null;
  impressoes: number | null;
  cliques: number | null;
  cliques_link: number | null;
  ctr: number | null;
  cpc: number | null;
  cpm: number | null;
  resultados_meta: number;
  leads: number;
  atendidos: number;
  qualificados: number;
  propostas: number;
  vendas: number;
  vgv: number | null;
  visitas_agendadas: number;
  visitas_realizadas: number;
  cpl: number | null;
  cpl_piso: number | null;
  cpl_teto: number | null;
  cpql: number | null;
  custo_visita: number | null;
  resposta_min: number | null;
  veredito: Veredito;
  faltam: number;
  moedas: number;
}

export interface Inteligencia {
  erro?: string;
  periodo: { de: string; ate: string; dias: number };
  provisorio_desde: string;
  /** Onde a casa QUER chegar. Opcional — sem ele o verde não acende. */
  meta_cpl: number | null;
  /** O MÁXIMO que a casa aceita pagar. Sem ele não há semáforo nenhum. */
  teto_cpl: number | null;
  resposta_casa: number | null;
  sincronizacao: { ok: boolean; quando: string | null };
  etapas: { visita: number | null; proposta: number | null; venda: number | null; primeira: number | null };
  cobertura: { leads: number; com_ad: number; na_tela: number; por_origem: Record<string, number> };
  resumo: {
    gasto: number | null;
    moedas: number;
    moeda: string | null;
    impressoes: number | null;
    cliques: number | null;
    cliques_link: number | null;
    campanhas: number;
    contas: number;
  };
  campanhas: CampanhaInteligencia[];
}

/* -------------------------------------------------------------------------- */
/* O semáforo                                                                  */
/* -------------------------------------------------------------------------- */

export type CorDoVeredito = 'ok' | 'dng' | 'warn' | 'neutro';

export const VEREDITO_META: Record<
  Veredito,
  { rotulo: string; cor: CorDoVeredito; ordem: number; explica: string }
> = {
  revisar: {
    rotulo: 'Revisar',
    cor: 'dng',
    ordem: 0,
    explica: 'Mesmo no melhor caso da faixa, esta campanha custa mais que o teto.',
  },
  rende: {
    rotulo: 'Rende',
    cor: 'ok',
    ordem: 1,
    explica: 'O custo bate o alvo, e mesmo no pior caso da faixa ainda cabe no teto.',
  },
  observar: {
    rotulo: 'Observar',
    cor: 'warn',
    ordem: 2,
    explica: 'Volume suficiente para acompanhar, insuficiente para decidir.',
  },
  sem_leitura: {
    rotulo: 'Sem leitura',
    cor: 'neutro',
    ordem: 3,
    explica: 'Poucos resultados. Qualquer veredito aqui seria sorte, não análise.',
  },
  sem_meta: {
    rotulo: 'Sem meta',
    cor: 'neutro',
    ordem: 4,
    explica: 'Declare o máximo que a casa aceita pagar por lead para o semáforo ligar.',
  },
  /*
   * Parada não é um veredito ruim — é a AUSÊNCIA de veredito, com nome.
   *
   * Veredito é recomendação de ação, e campanha que não entrega não tem ação
   * possível: o dinheiro já saiu. Mandar "revisar" uma campanha pausada é
   * recomendar algo que já foi feito.
   */
  parada: {
    rotulo: 'Parada',
    cor: 'neutro',
    ordem: 5,
    explica: 'Não está entregando. Aparece para o total fechar, e não recebe veredito.',
  },
};

/**
 * A frase que acompanha o veredito de uma campanha.
 *
 * Sempre com o NÚMERO que a sustenta. Um semáforo que diz "desempenho
 * intermediário" não é uma análise — é uma opinião sem endereço, e a pessoa que
 * lê não tem como discordar dela.
 */
export function motivoDo(
  c: CampanhaInteligencia,
  alvo: number | null,
  teto: number | null,
  moeda: string,
): string {
  const $ = (v: number | null | undefined) =>
    v == null ? '—' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: moeda }).format(v / 100);

  const leads = `${c.leads} ${c.leads === 1 ? 'lead' : 'leads'}`;

  if (c.veredito === 'parada') {
    return c.leads > 0
      ? `${$(c.gasto)} gastos enquanto rodava, ${leads}. Está parada — não há ação aqui.`
      : `${$(c.gasto)} gastos enquanto rodava, sem lead atribuído. Está parada — não há ação aqui.`;
  }

  if (c.veredito === 'sem_meta') {
    return `${leads} por ${$(c.gasto)}. Sem um teto declarado não há contra o que comparar.`;
  }

  if (c.veredito === 'revisar' && c.leads === 0) {
    return `${$(c.gasto)} gastos e nenhum lead no CRM. Se o custo real fosse o teto de ${$(teto)}, a chance de não ter saído nada seria de 2%.`;
  }

  if (c.veredito === 'sem_leitura') return motivoSemLeitura(c, leads, $);

  /*
   * A faixa por extenso, e ela é o sujeito de toda frase daqui para baixo.
   *
   * O veredito NÃO compara o custo medido com um limiar — compara as PONTAS da
   * faixa com as duas linhas. Escrever a conclusão sem mostrar as pontas
   * deixaria a afirmação sem como ser conferida.
   */
  const faixa =
    c.cpl_teto != null
      ? `${$(c.cpl_piso)} a ${$(c.cpl_teto)}`
      : `acima de ${$(c.cpl_piso)}, sem teto estimável`;

  if (c.veredito === 'revisar') {
    return `Mesmo no melhor caso esta campanha custa ${$(c.cpl_piso)} por lead — acima do teto de ${$(teto)}. Medido: ${$(c.cpl)} sobre ${leads}, faixa ${faixa}.`;
  }

  if (c.veredito === 'rende') {
    return `${$(c.cpl)} por lead, abaixo do alvo de ${$(alvo)} — e no pior caso da faixa (${faixa}) ainda cabe no teto de ${$(teto)}. Sobre ${leads}.`;
  }

  // Observar: a faixa atravessa uma das linhas, ou o atendimento trava o
  // julgamento. Em ambos, o que a tela pode fazer é mostrar onde ela está.
  const contra =
    alvo != null ? `entre o alvo de ${$(alvo)} e o teto de ${$(teto)}` : `contra o teto de ${$(teto)}`;
  return `${$(c.cpl)} por lead sobre ${leads}, mas a faixa vai de ${faixa}. Ela ainda atravessa a linha ${contra} — não dá para afirmar de que lado está.`;
}

function motivoSemLeitura(
  c: CampanhaInteligencia,
  leads: string,
  $: (v: number | null | undefined) => string,
): string {
  const falta = c.faltam;
  // O custo médio observado é a melhor estimativa que existe do que falta
  // gastar. Não é promessa: é a conta que a própria campanha vem fazendo.
  const previsto = c.cpl != null ? ` (cerca de ${$(c.cpl * falta)} no ritmo atual)` : '';
  return c.leads === 0
    ? `Nenhum lead ainda. Faltam ${falta} para uma leitura confiável.`
    : `${leads} — faltam ${falta}${previsto} para o custo sair do ruído.`;
}

// Os achados da conta moram em achados.ts; quem já os importava daqui
// (pages/Inteligencia.tsx, inteligencia.test.ts) continua sem mudar nada.
export { acharProblemas, EVENTOS_PARA_APRENDER, type Achado } from './achados';

/* -------------------------------------------------------------------------- */
/* O link para o gerenciador                                                   */
/* -------------------------------------------------------------------------- */

/**
 * "Ver no Meta" — montado com o id REAL, nunca com URL fixa.
 *
 * `act_` é removido do identificador da conta porque o gerenciador espera o
 * número puro no parâmetro `act`. Manter o prefixo abre a conta errada ou uma
 * tela de "sem permissão", e o erro é silencioso: a página carrega.
 */
export function linkDoGerenciador(conta: string, campanha: string): string {
  const numero = conta.replace(/^act_/, '');
  const filtro = encodeURIComponent(
    JSON.stringify([{ field: 'campaign.id', operator: 'IN', value: [campanha] }]),
  );
  return `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${numero}&filter_set=${filtro}`;
}

/* -------------------------------------------------------------------------- */
/* Rótulos                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * O destino do anúncio, em português.
 *
 * É ele que separa clique-para-WhatsApp de formulário nativo dentro do mesmo
 * objetivo — e as duas coisas produzem "lead" com significados diferentes:
 * conversa iniciada de um lado, cadastro preenchido do outro.
 */
export function rotuloDoDestino(d: string | null): string | null {
  if (!d) return null;
  const t = d.toUpperCase();
  if (t.includes('WHATSAPP')) return 'WhatsApp';
  if (t.includes('MESSENGER')) return 'Messenger';
  if (t.includes('INSTAGRAM')) return 'Instagram Direct';
  if (t === 'WEBSITE') return 'Site';
  if (t === 'ON_AD') return 'Formulário';
  if (t === 'PHONE_CALL') return 'Ligação';
  if (t === 'UNDEFINED') return null;
  return null;
}

/** O objetivo da campanha sem o prefixo que a Meta põe em tudo. */
export function rotuloDoObjetivo(o: string | null): string | null {
  if (!o) return null;
  const m: Record<string, string> = {
    OUTCOME_LEADS: 'Cadastros',
    OUTCOME_ENGAGEMENT: 'Engajamento',
    OUTCOME_TRAFFIC: 'Tráfego',
    OUTCOME_SALES: 'Vendas',
    OUTCOME_AWARENESS: 'Reconhecimento',
    OUTCOME_APP_PROMOTION: 'Aplicativo',
    LINK_CLICKS: 'Cliques no link',
    MESSAGES: 'Mensagens',
    LEAD_GENERATION: 'Cadastros',
    CONVERSIONS: 'Conversões',
  };
  return m[o.toUpperCase()] ?? o.replace(/^OUTCOME_/, '');
}

// O ângulo do criativo e a cadeia por anúncio moram em inteligencia-por-anuncio.ts;
// quem já os importava daqui (os componentes, o hook, cadeia.test.ts) continua
// sem mudar nada.
export {
  SEM_ANGULO,
  CADEIA_MINIMO_PARA_LER,
  aproveitamentoDaConversa,
  type AnguloInteligencia,
  type AnuncioInteligencia,
  type InteligenciaPorAngulo,
  type DegrauDaCadeia,
  type AnuncioDaCadeia,
  type CadeiaPorAnuncio,
} from './inteligencia-por-anuncio';
