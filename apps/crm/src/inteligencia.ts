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

  if (c.veredito === 'sem_leitura') {
    const falta = c.faltam;
    // O custo médio observado é a melhor estimativa que existe do que falta
    // gastar. Não é promessa: é a conta que a própria campanha vem fazendo.
    const previsto = c.cpl != null ? ` (cerca de ${$(c.cpl * falta)} no ritmo atual)` : '';
    return c.leads === 0
      ? `Nenhum lead ainda. Faltam ${falta} para uma leitura confiável.`
      : `${leads} — faltam ${falta}${previsto} para o custo sair do ruído.`;
  }

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

/* -------------------------------------------------------------------------- */
/* Os achados                                                                  */
/* -------------------------------------------------------------------------- */

export interface Achado {
  chave: string;
  gravidade: 'alta' | 'media' | 'baixa';
  titulo: string;
  detalhe: string;
  /** Nomes das campanhas envolvidas, quando o achado é sobre algumas delas. */
  quais?: string[];
}

/**
 * Quantos eventos de conversão por semana a Meta precisa para sair da fase de
 * aprendizado.
 *
 * Cinquenta é o número que a própria documentação da Meta usa. Abaixo disso o
 * conjunto fica em "aprendizado limitado": o algoritmo continua entregando, mas
 * sem otimizar de verdade, e o custo por resultado oscila muito mais do que
 * oscilaria com volume.
 *
 * É o número mais importante desta tela inteira para uma conta pequena, porque
 * ele explica de uma vez por que nada estabiliza.
 */
export const EVENTOS_PARA_APRENDER = 50;

/** Só o que está no ar de verdade. `PAUSED` e `ARCHIVED` são história. */
function ativa(c: CampanhaInteligencia): boolean {
  return (c.status ?? '').toUpperCase() === 'ACTIVE';
}

function nome(c: CampanhaInteligencia): string {
  return c.nome ?? `#${c.id}`;
}

function mediana(ns: number[]): number | null {
  if (ns.length === 0) return null;
  const s = [...ns].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : Math.round(((s[m - 1] ?? 0) + (s[m] ?? 0)) / 2);
}

/**
 * O que a conta inteira está dizendo.
 *
 * Ordenado por gravidade, e cada achado carrega o número que o produziu. Nunca
 * inventa: achado que depende de dado ausente simplesmente não é emitido — a
 * tela lista o que não foi possível avaliar num rodapé próprio, o que é mais
 * útil que um falso positivo e é a regra que o próprio pedido impôs.
 */
export function acharProblemas(d: Inteligencia): Achado[] {
  const a: Achado[] = [];
  const moeda = d.resumo.moeda ?? 'BRL';
  const $ = (v: number | null | undefined) =>
    v == null ? '—' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: moeda }).format(v / 100);

  const ativas = d.campanhas.filter(ativa);

  /* --- 1. Sem meta, o semáforo inteiro está desligado --------------------- */
  if (d.teto_cpl == null) {
    a.push({
      chave: 'sem_meta',
      gravidade: 'alta',
      titulo: 'O semáforo está desligado',
      detalhe:
        'Nenhum teto de custo por lead foi declarado. Sem um limite externo, a única comparação ' +
        'possível é entre as próprias campanhas — e num mês inteiro ruim alguma delas ficaria verde e ' +
        'receberia mais verba. Escalar o menos ruim é o erro mais caro que uma ferramenta destas comete.',
    });
  } else if (d.meta_cpl == null) {
    a.push({
      chave: 'sem_alvo',
      gravidade: 'media',
      titulo: 'O verde não acende sem um alvo',
      detalhe:
        `O teto está em ${$(d.teto_cpl)} — é ele que produz o vermelho. Falta dizer onde a casa QUER ` +
        'chegar, que é uma pergunta diferente: o teto é o preço que ainda dá para pagar, o alvo é o ' +
        'preço que faz a operação render. Sem ele nenhuma campanha pode ser chamada de boa, só de ' +
        'aceitável.',
    });
  }

  /* --- 2. Verba pulverizada: o achado principal de conta pequena ---------- */
  const comOrcamento = ativas.filter((c) => c.orcamento != null && c.orcamento_tipo === 'diario');
  if (comOrcamento.length >= 3) {
    const soma = comOrcamento.reduce((t, c) => t + (c.orcamento ?? 0), 0);
    const med = mediana(comOrcamento.map((c) => c.orcamento!));
    /*
     * O custo por lead da CONTA, não o da campanha: é o único com volume para
     * sustentar a projeção. Só existe se houve gasto e lead no período.
     */
    const gastoTotal = ativas.reduce((t, c) => t + c.gasto, 0);
    const leadsTotal = ativas.reduce((t, c) => t + c.leads, 0);
    const cplConta = leadsTotal > 0 ? gastoTotal / leadsTotal : null;

    if (cplConta != null && med != null) {
      const porSemana = (med * 7) / cplConta;
      if (porSemana < EVENTOS_PARA_APRENDER) {
        a.push({
          chave: 'verba_pulverizada',
          gravidade: 'alta',
          titulo: `${comOrcamento.length} campanhas dividindo ${$(soma)} por dia`,
          detalhe:
            `A mediana é ${$(med)} por dia por campanha. Ao custo de ${$(Math.round(cplConta))} por lead da ` +
            `própria conta, isso dá cerca de ${porSemana.toFixed(0)} resultados por semana em cada uma — e a Meta ` +
            `precisa de ${EVENTOS_PARA_APRENDER} por semana para sair da fase de aprendizado. Nenhuma delas sai. ` +
            `A mesma verba em menos campanhas otimiza; espalhada, ela paga o aprendizado ${comOrcamento.length} vezes ` +
            `e não termina nenhum.`,
          quais: comOrcamento.map(nome),
        });
      }
    }
  }

  /* --- 3. Gasto sem rastro: o dinheiro que some da contabilidade ---------- */
  const semRastro = ativas.filter((c) => c.resultados_meta > 0 && c.leads === 0 && c.gasto > 0);
  if (semRastro.length > 0) {
    a.push({
      chave: 'sem_rastro',
      gravidade: 'alta',
      titulo: `${semRastro.length} ${semRastro.length === 1 ? 'campanha entregou resultado' : 'campanhas entregaram resultado'} que não chegou ao CRM`,
      detalhe:
        `A Meta contou ${semRastro.reduce((t, c) => t + c.resultados_meta, 0)} ${'resultados'} e o CRM não recebeu ` +
        `nenhum lead correspondente, sobre ${$(semRastro.reduce((t, c) => t + c.gasto, 0))} de gasto. ` +
        'Em campanha de mensagem isso costuma ser a conversa que começou e morreu antes de virar contato; ' +
        'em campanha de site, é a macro {{ad.id}} faltando na URL do anúncio. Nos dois casos é verba ' +
        'saindo sem deixar rastro, e é o único item desta lista que se resolve com uma configuração.',
      quais: semRastro.map(nome),
    });
  }

  /* --- 4. Cobertura da atribuição ---------------------------------------- */
  const cob = d.cobertura;
  if (cob.leads > 0) {
    const pct = Math.round((cob.na_tela / cob.leads) * 100);
    if (pct < 70) {
      a.push({
        chave: 'cobertura_baixa',
        gravidade: 'alta',
        titulo: `Só ${pct}% dos leads têm anúncio identificado`,
        detalhe:
          `${cob.na_tela} de ${cob.leads} leads do período casam com uma linha de gasto. O custo por lead ` +
          `desta tela é calculado sobre esses, então ele aparece mais caro do que a realidade — e o erro é ` +
          'sistemático, não some com mais dados. Os outros vieram de origem sem anúncio (indicação, portal, ' +
          'orgânico) ou perderam a identificação no caminho.',
      });
    }
  }

  /* --- 5. Objetivos misturados no mesmo ranking --------------------------- */
  const objetivos = new Set(ativas.map((c) => c.objetivo ?? '?').filter((o) => o !== '?'));
  if (objetivos.size > 1) {
    a.push({
      chave: 'objetivos_misturados',
      gravidade: 'media',
      titulo: 'Campanhas de objetivos diferentes na mesma lista',
      detalhe:
        `Há ${objetivos.size} objetivos rodando ao mesmo tempo: ${[...objetivos].map((o) => o.replace('OUTCOME_', '')).join(', ')}. ` +
        'Elas não compartilham denominador — uma campanha de engajamento nunca vai ter o custo por lead de ' +
        'uma de cadastro, porque não é isso que ela otimiza. Comparar as duas na mesma coluna faz a melhor ' +
        'delas parecer a pior. Ordene dentro de cada objetivo, nunca entre eles.',
    });
  }

  /* --- 6. Atendimento lento trava o julgamento da mídia ------------------- */
  if (d.resposta_casa != null) {
    const lentas = ativas.filter(
      (c) => c.resposta_min != null && c.leads > 0 && c.resposta_min > 2 * d.resposta_casa!,
    );
    if (lentas.length > 0) {
      a.push({
        chave: 'atendimento_lento',
        gravidade: 'media',
        titulo: `${lentas.length} ${lentas.length === 1 ? 'campanha tem' : 'campanhas têm'} lead esperando muito mais que a média`,
        detalhe:
          `A casa responde em ${d.resposta_casa} min na mediana. Nestas o lead espera mais que o dobro. ` +
          'Como cada campanha cai sempre na mesma carteira, "qualidade da campanha" e "velocidade do corretor" ' +
          'ficam confundidas — e o semáforo não pode culpar a mídia enquanto isso não for separado. ' +
          'Por isso nenhuma delas recebe vermelho aqui.',
        quais: lentas.map(nome),
      });
    }
  }

  /* --- 7. CTR de link ainda não coletado ---------------------------------- */
  const semLink = d.campanhas.filter((c) => c.cliques_link == null && (c.impressoes ?? 0) > 0);
  if (semLink.length > 0) {
    a.push({
      chave: 'ctr_sem_coleta',
      gravidade: 'baixa',
      titulo: `${semLink.length} ${semLink.length === 1 ? 'campanha ainda sem' : 'campanhas ainda sem'} clique de link coletado`,
      detalhe:
        'A coleta de cliques no link começou agora, e dia anterior a ela fica sem CTR — em branco, não em zero. ' +
        'O clique total continua na tabela ao lado, mas ele conta curtida, comentário e expandir foto: em ' +
        'criativo de imóvel costuma ser o triplo do clique de link, e usar um no lugar do outro absolve ' +
        'exatamente o criativo que precisa ser trocado.',
      quais: semLink.map(nome),
    });
  }

  /* --- 8. Campanha ativa sem orçamento conhecido -------------------------- */
  const semOrc = ativas.filter((c) => c.orcamento == null);
  if (semOrc.length > 0) {
    a.push({
      chave: 'sem_orcamento',
      gravidade: 'baixa',
      titulo: `${semOrc.length} ${semOrc.length === 1 ? 'campanha ativa sem' : 'campanhas ativas sem'} orçamento identificado`,
      detalhe:
        'O orçamento não foi encontrado nem na campanha nem nos conjuntos dela. Sem esse número não dá para ' +
        'dizer "de quanto para quanto" numa recomendação de escala, nem para saber se a campanha sequer gasta ' +
        'o que já tem — campanha limitada por entrega recebe mais verba e não muda nada.',
      quais: semOrc.map(nome),
    });
  }

  const peso = { alta: 0, media: 1, baixa: 2 } as const;
  return a.sort((x, y) => peso[x.gravidade] - peso[y.gravidade]);
}

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

/* -------------------------------------------------------------------------- */
/* O ângulo do criativo — a 134                                                */
/* -------------------------------------------------------------------------- */

/**
 * Uma linha por ARGUMENTO, e não por anúncio.
 *
 * O motivo é de amostra, e a medição de 23/09 diz tudo: 145 leads divididos por
 * 51 anúncios dão menos de três cada, e o semáforo desta casa precisa de dez
 * para abrir a boca. Cinco ângulos chegam lá; cinquenta e um anúncios, nunca.
 */
export interface AnguloInteligencia {
  angulo: string;
  anuncios: number;
  ativos: number;
  gasto: number;
  leads: number;
  atendidos: number;
  quentes: number;
  visitas: number;
  cpl: number | null;
  cpl_piso: number | null;
  cpl_teto: number | null;
  veredito: Veredito;
  faltam: number;
}

/** Um anúncio, com o ângulo que alguém marcou nele (ou a falta dele). */
export interface AnuncioInteligencia {
  ad_id: string;
  nome: string | null;
  estado: string | null;
  angulo: string | null;
  campanha: string | null;
  gasto: number;
  leads: number;
  atendidos: number;
  quentes: number;
  visitas: number;
  ultimo_dia: string | null;
  dias: number;
}

export interface InteligenciaPorAngulo {
  erro?: string;
  periodo: { de: string; ate: string };
  meta_cpl: number | null;
  teto_cpl: number | null;
  sincronizacao: { ok: boolean };
  angulos: AnguloInteligencia[];
  anuncios: AnuncioInteligencia[];
}

/** A chave que o banco usa para "ainda não marcado". */
export const SEM_ANGULO = 'sem_angulo';

/* -------------------------------------------------------------------------- */
/* A cadeia inteira, por anúncio — a 150                                       */
/* -------------------------------------------------------------------------- */

/** Um degrau do funil, como a organização o tem hoje. Vem do banco. */
export interface DegrauDaCadeia {
  key: string;
  label: string;
  position: number;
}

export interface AnuncioDaCadeia {
  ad_id: string;
  nome: string | null;
  estado: string | null;
  angulo: string | null;
  campanha: string | null;
  gasto: number;
  cliques: number;
  /** O que a META conta de conversa iniciada — não o que o CRM fichou. */
  conversas: number;
  leads: number;
  atendidos: number;
  /** Soma do valor dos negócios de quem chegou à etapa de ganho. */
  valor: number;
  /** Quantos leads desta coorte chegaram a cada degrau, por chave. */
  passos: Record<string, number>;
  cpl: number | null;
  cpl_piso: number | null;
  cpl_teto: number | null;
  ultimo_dia: string | null;
  dias: number;
}

export interface CadeiaPorAnuncio {
  erro?: string;
  periodo: { de: string; ate: string };
  meta_cpl: number | null;
  teto_cpl: number | null;
  sincronizacao: { ok: boolean };
  degraus: DegrauDaCadeia[];
  total: {
    gasto: number;
    cliques: number;
    conversas: number;
    leads: number;
    valor: number;
    anuncios: number;
    passos: Record<string, number>;
  };
  anuncios: AnuncioDaCadeia[];
}

/**
 * A DISTÂNCIA ENTRE A CONVERSA E A FICHA.
 *
 * A Meta conta quantas conversas o anúncio abriu; o CRM conta quantas viraram
 * lead com origem provada. Medido em 24/09, num mês: **288 conversas, 154
 * fichas**. Quase metade das conversas não vira nada — é engano, é "oi" que
 * some, é quem queria emprego.
 *
 * Esse número não existe em nenhuma outra tela, e é o único lugar onde a
 * qualidade do tráfego aparece antes do custo por lead. Um anúncio com
 * conversa barata e ficha cara está comprando conversa errada.
 *
 * Nulo quando a Meta não reportou conversa nenhuma — dividir por zero daria
 * `Infinity`, que na tela vira "∞%" e parece defeito.
 */
export function aproveitamentoDaConversa(a: {
  conversas: number;
  leads: number;
}): number | null {
  if (!a.conversas) return null;
  return a.leads / a.conversas;
}

/**
 * QUANTOS LEADS FALTAM PARA O PRÓXIMO DEGRAU TER LEITURA.
 *
 * Não é enfeite: com 1 visita em 154 leads, qualquer "custo por visita" que a
 * tela mostrasse seria um número inventado com cara de precisão. A tela diz
 * quantos faltam em vez de mostrar a conta.
 */
export const CADEIA_MINIMO_PARA_LER = 10;
