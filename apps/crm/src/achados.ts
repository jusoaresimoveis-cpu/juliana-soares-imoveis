// O porquê dos achados (a conta inteira contra o semáforo de uma campanha)
// está no cabeçalho de inteligencia.ts, que continua sendo a porta de entrada.
import type { CampanhaInteligencia, Inteligencia } from './inteligencia';

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
  return s.length % 2 ? (s[m] ?? null) : Math.round(((s[m - 1] ?? 0) + (s[m] ?? 0)) / 2);
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

  acharFaltaDeMeta(d, $, a);
  acharVerbaPulverizada(ativas, $, a);
  acharFurosDaAtribuicao(d, ativas, $, a);
  acharComparacoesConfundidas(d, ativas, a);
  acharDadosQueFaltam(d, ativas, a);

  const peso = { alta: 0, media: 1, baixa: 2 } as const;
  return a.sort((x, y) => peso[x.gravidade] - peso[y.gravidade]);
}

type FormatarDinheiro = (v: number | null | undefined) => string;

function acharFaltaDeMeta(d: Inteligencia, $: FormatarDinheiro, a: Achado[]): void {
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
}

function acharVerbaPulverizada(
  ativas: CampanhaInteligencia[],
  $: FormatarDinheiro,
  a: Achado[],
): void {
  /* --- 2. Verba pulverizada: o achado principal de conta pequena ---------- */
  const comOrcamento = ativas.filter(
    (c): c is CampanhaInteligencia & { orcamento: number } =>
      c.orcamento != null && c.orcamento_tipo === 'diario',
  );
  if (comOrcamento.length >= 3) {
    const soma = comOrcamento.reduce((t, c) => t + (c.orcamento ?? 0), 0);
    const med = mediana(comOrcamento.map((c) => c.orcamento));
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
}

function acharFurosDaAtribuicao(
  d: Inteligencia,
  ativas: CampanhaInteligencia[],
  $: FormatarDinheiro,
  a: Achado[],
): void {
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
}

function acharComparacoesConfundidas(
  d: Inteligencia,
  ativas: CampanhaInteligencia[],
  a: Achado[],
): void {
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
    const casa = d.resposta_casa;
    const lentas = ativas.filter(
      (c) => c.resposta_min != null && c.leads > 0 && c.resposta_min > 2 * casa,
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
}

function acharDadosQueFaltam(d: Inteligencia, ativas: CampanhaInteligencia[], a: Achado[]): void {
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
}
