/**
 * Qualificação do lead — o que a pessoa DISSE, e a temperatura que sai disso.
 *
 * Nasceu de dois documentos que o dono trouxe (um método de tráfego e uma ideia
 * de "score de intenção") e da medição da casa: em 30 dias, 138 leads, todos
 * por clique-para-WhatsApp, 97 parados em "Novo". O corretor recebia nome e
 * telefone, e a fila não tinha ordem nenhuma.
 *
 * TRÊS PERGUNTAS, E NÃO UM FORMULÁRIO
 *
 * Finalidade, prazo e se a entrada e as parcelas cabem. São as que o corretor
 * já faz na primeira conversa, e as únicas que mudam a ordem da fila. Faixa de
 * investimento ficou de fora: a página já diz o preço. "Tem financiamento
 * aprovado?" também — a maioria dos imóveis da casa está na planta, e na planta
 * o pagamento é direto com a construtora. Banco só entra em imóvel pronto. Por
 * isso `depende_banco` existe como RESPOSTA: quem depende de banco está dizendo
 * que precisa de imóvel pronto, e o corretor tem de saber disso antes de
 * mandar a tabela.
 *
 * TEMPERATURA É REGRA, NÃO SOMA DE PONTOS
 *
 * A ideia original somava pontos: +20 por investir, +2 por rolar 25% da página,
 * +10 por mexer num simulador. Pesos escolhidos à mão produzem um número com
 * cara de preciso, e a tela de Inteligência já tinha recusado esse tipo de
 * semáforo uma vez. Regra escrita se explica ("quer comprar em até 3 meses e a
 * entrada cabe"), se testa, e se troca quando o dado mostrar que está errada.
 *
 * A REGRA MORA NO BANCO — `temperatura_pela_regra`, na 120 — porque quem
 * precisa dela é SQL: o filtro do quadro, a exportação, o aviso de lead quente.
 * Aqui ficam as listas, os rótulos e a frase que explica. Esta camada descreve
 * as respostas; nunca recalcula o selo.
 */

export const FINALIDADES = ['morar', 'investir', 'segunda_residencia', 'avaliando'] as const;
export type Finalidade = (typeof FINALIDADES)[number];

export const FINALIDADE_LABEL: Record<Finalidade, string> = {
  morar: 'Morar',
  investir: 'Investir',
  segunda_residencia: 'Segunda residência',
  avaliando: 'Ainda avaliando',
};

export const PRAZOS_DE_COMPRA = [
  'ate_30_dias',
  'de_1_a_3_meses',
  'de_3_a_6_meses',
  'mais_de_6_meses',
  'pesquisando',
] as const;
export type PrazoDeCompra = (typeof PRAZOS_DE_COMPRA)[number];

export const PRAZO_DE_COMPRA_LABEL: Record<PrazoDeCompra, string> = {
  ate_30_dias: 'Nos próximos 30 dias',
  de_1_a_3_meses: 'De 1 a 3 meses',
  de_3_a_6_meses: 'De 3 a 6 meses',
  mais_de_6_meses: 'Daqui a mais de 6 meses',
  pesquisando: 'Só pesquisando',
};

export const ENCAIXES_FINANCEIROS = ['cabe', 'precisa_prazo', 'depende_banco'] as const;
export type EncaixeFinanceiro = (typeof ENCAIXES_FINANCEIROS)[number];

export const ENCAIXE_FINANCEIRO_LABEL: Record<EncaixeFinanceiro, string> = {
  cabe: 'Entrada e parcelas cabem',
  precisa_prazo: 'Precisa de mais prazo',
  depende_banco: 'Depende de financiamento bancário',
};

export const TEMPERATURAS = ['quente', 'morno', 'frio'] as const;
export type Temperatura = (typeof TEMPERATURAS)[number];

export const TEMPERATURA_LABEL: Record<Temperatura, string> = {
  quente: 'Quente',
  morno: 'Morno',
  frio: 'Frio',
};

/**
 * Matiz de cada temperatura.
 *
 * Só o matiz, como em `LEAD_SOURCE_HUE`: a luminosidade fica com a tela, que
 * sabe se o fundo é claro ou escuro. Vermelho-alaranjado, âmbar e azul — a
 * leitura que todo termômetro já ensinou.
 */
export const TEMPERATURA_MATIZ: Record<Temperatura, number> = {
  quente: 12,
  morno: 38,
  frio: 205,
};

/** O que o quadro oferece no filtro. `sem` é o lead que ninguém qualificou. */
export const FILTROS_DE_TEMPERATURA = ['todas', ...TEMPERATURAS, 'sem'] as const;
export type FiltroDeTemperatura = (typeof FILTROS_DE_TEMPERATURA)[number];

export const FILTRO_DE_TEMPERATURA_LABEL: Record<FiltroDeTemperatura, string> = {
  todas: 'Todas',
  ...TEMPERATURA_LABEL,
  sem: 'Sem qualificação',
};

export function isFiltroDeTemperatura(valor: unknown): valor is FiltroDeTemperatura {
  return typeof valor === 'string' && (FILTROS_DE_TEMPERATURA as readonly string[]).includes(valor);
}

/** As respostas do lead, como o banco as devolve. */
export interface RespostasDeQualificacao {
  finalidade: string | null;
  prazo_compra: string | null;
  encaixe_financeiro: string | null;
  /** O que o corretor marcou à mão. Ganha da regra. */
  temperatura_manual: string | null;
  /** O que a regra diz, com ou sem marcação manual. Vem do banco. */
  temperatura_regra: string | null;
  /** O selo que vale: a marcação manual ou, sem ela, a regra. Vem do banco. */
  temperatura: string | null;
}

/** O prazo no meio de uma frase: "nos próximos 30 dias", "daqui a mais de 6 meses". */
const PRAZO_NA_FRASE: Record<PrazoDeCompra, string> = {
  ate_30_dias: 'nos próximos 30 dias',
  de_1_a_3_meses: 'em 1 a 3 meses',
  de_3_a_6_meses: 'em 3 a 6 meses',
  mais_de_6_meses: 'daqui a mais de 6 meses',
  pesquisando: '',
};

function rotuloDaTemperatura(valor: string | null): string | null {
  return valor && valor in TEMPERATURA_LABEL ? TEMPERATURA_LABEL[valor as Temperatura] : null;
}

/**
 * "Por que este lead está quente?" — em uma ou duas frases.
 *
 * DESCREVE as respostas; não decide o selo. O selo vem pronto do banco, e esta
 * função só conta o que a pessoa disse e o que ainda falta perguntar. Se ela
 * recalculasse a temperatura, haveria duas regras — e no dia em que uma mudasse
 * a ficha passaria a explicar um selo que não é o que está na tela.
 */
export function explicarTemperatura(r: RespostasDeQualificacao): string {
  const prazo = r.prazo_compra as PrazoDeCompra | null;
  const partes: string[] = [];

  if (!prazo || !(prazo in PRAZO_NA_FRASE)) {
    partes.push('Falta saber quando a pessoa pretende comprar.');
  } else if (prazo === 'pesquisando') {
    partes.push('Disse que está só pesquisando.');
  } else {
    const quando = `Quer comprar ${PRAZO_NA_FRASE[prazo]}`;
    if (r.encaixe_financeiro === 'cabe') {
      partes.push(`${quando}, e a entrada e as parcelas cabem.`);
    } else if (r.encaixe_financeiro === 'precisa_prazo') {
      partes.push(`${quando}, mas precisa de mais prazo para a entrada.`);
    } else if (r.encaixe_financeiro === 'depende_banco') {
      partes.push(`${quando}, mas depende de financiamento bancário.`);
    } else {
      partes.push(`${quando}. Falta saber se a entrada e as parcelas cabem.`);
    }
  }

  const manual = rotuloDaTemperatura(r.temperatura_manual);
  if (manual) {
    const regra = rotuloDaTemperatura(r.temperatura_regra);
    partes.push(
      regra && regra !== manual
        ? `Marcada à mão como ${manual.toLowerCase()}; pelas respostas seria ${regra.toLowerCase()}.`
        : `Marcada à mão como ${manual.toLowerCase()}.`,
    );
  }

  return partes.join(' ');
}

/**
 * O aviso que acompanha `depende_banco`.
 *
 * Fica no contrato porque é regra do negócio, não enfeite de tela: o corretor
 * que lê "depende de financiamento" precisa saber o que fazer com isso.
 */
export const AVISO_DEPENDE_DE_BANCO =
  'Financiamento bancário só vale para imóvel pronto. Na planta o pagamento é direto com a construtora. Se houver um pronto que sirva, vale oferecer.';

// -----------------------------------------------------------------------------
// As portas automáticas
// -----------------------------------------------------------------------------

/**
 * De onde veio a resposta.
 *
 * `ficha` é o corretor anotando o que ouviu. As outras três são a pessoa
 * respondendo sozinha, e o histórico diz qual — porque "investir" escrito pelo
 * corretor depois de dez minutos de conversa e "investir" de um toque num botão
 * do anúncio não valem a mesma coisa.
 */
export const ORIGENS_DA_QUALIFICACAO = ['ficha', 'whatsapp', 'landing', 'formulario_meta', 'sistema'] as const;
export type OrigemDaQualificacao = (typeof ORIGENS_DA_QUALIFICACAO)[number];

/** As portas que gravam SEM ser a ficha. É o que `lead_preencher_qualificacao` aceita. */
export const PORTAS_AUTOMATICAS = ['whatsapp', 'landing', 'formulario_meta'] as const;
export type PortaAutomatica = (typeof PORTAS_AUTOMATICAS)[number];

/** Como o histórico conta de onde veio. Minúscula: entra no fim de uma linha. */
export const PORTA_AUTOMATICA_LABEL: Record<PortaAutomatica, string> = {
  whatsapp: 'lido da mensagem do WhatsApp',
  landing: 'respondido na landing page',
  formulario_meta: 'respondido no formulário da Meta',
};

/** "Investir · De 1 a 3 meses · Entrada e parcelas cabem" — para lista e prévia. */
export function resumoDaQualificacao(
  r: Pick<RespostasDeQualificacao, 'finalidade' | 'prazo_compra' | 'encaixe_financeiro'>,
): string | null {
  const partes = [
    r.finalidade && r.finalidade in FINALIDADE_LABEL ? FINALIDADE_LABEL[r.finalidade as Finalidade] : null,
    r.prazo_compra && r.prazo_compra in PRAZO_DE_COMPRA_LABEL
      ? PRAZO_DE_COMPRA_LABEL[r.prazo_compra as PrazoDeCompra]
      : null,
    r.encaixe_financeiro && r.encaixe_financeiro in ENCAIXE_FINANCEIRO_LABEL
      ? ENCAIXE_FINANCEIRO_LABEL[r.encaixe_financeiro as EncaixeFinanceiro]
      : null,
  ].filter((p): p is string => Boolean(p));
  return partes.length ? partes.join(' · ') : null;
}

// O leitor da mensagem e a retomada moram em arquivos próprios. Ficam
// reexportados daqui para que `index.ts`, e quem mais importava deste módulo,
// continue vendo os mesmos nomes.
export * from './qualificacao-leitor';
export * from './retomada';
