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

/**
 * As frases que dizem a finalidade.
 *
 * São o MIOLO das perguntas pré-preenchidas dos anúncios de WhatsApp ("Quero
 * investir", "Quero morar em Porto Belo", "Quero um apartamento para veraneio")
 * e das versões em espanhol. O miolo, e não a frase inteira, porque a cidade
 * muda de campanha para campanha e o leitor não pode depender dela.
 *
 * Só FINALIDADE, de propósito. Prazo e entrada ficaram de fora: "será que a
 * entrada cabe?" é pergunta, e o leitor gravaria como resposta. "Quero
 * investir" digitado à mão continua querendo dizer investir.
 *
 * Já normalizadas: minúsculas e sem acento, como `textoNormalizado` devolve. A
 * mesma lista está em SQL na 121, e o teste compara as duas.
 */
export const FRASES_DE_FINALIDADE: readonly { frase: string; finalidade: Finalidade }[] = [
  { frase: 'quero investir', finalidade: 'investir' },
  { frase: 'quiero invertir', finalidade: 'investir' },
  { frase: 'quero morar', finalidade: 'morar' },
  { frase: 'quiero vivir', finalidade: 'morar' },
  { frase: 'para veraneio', finalidade: 'segunda_residencia' },
  { frase: 'para vacaciones', finalidade: 'segunda_residencia' },
  /*
   * O inglês entrou com o quiz (a 135). Antes a lista tinha só português e
   * espanhol, que são os idiomas das perguntas pré-preenchidas do anúncio — e
   * uma página em inglês escreveria uma frase que o leitor do banco não
   * reconhece, gravando nada e sem erro nenhum.
   */
  { frase: 'i want to invest', finalidade: 'investir' },
  { frase: 'i want to live there', finalidade: 'morar' },
  { frase: 'holiday home', finalidade: 'segunda_residencia' },
];

/** Quem nega não quer. "Não quero investir agora" contém "quero investir". */
export const NEGACOES_DE_FINALIDADE = ['nao quero', 'no quiero'] as const;

/** Minúsculas, sem acento, espaços colapsados. */
export function textoNormalizado(texto: string | null | undefined): string {
  return (texto ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * A finalidade que um texto afirma — ou nulo.
 *
 * É a especificação executável do leitor que roda no banco (a 121). Três
 * recusas, todas para o mesmo lado — na dúvida, não grava:
 *
 *   - negação em qualquer lugar do texto;
 *   - duas finalidades diferentes na mesma mensagem ("morar ou investir");
 *   - nenhuma frase conhecida.
 *
 * Campo vazio o corretor preenche na primeira conversa. Campo ERRADO ele não
 * confere, e a fila passa a mentir.
 */
export function finalidadeDoTexto(texto: string | null | undefined): Finalidade | null {
  const t = textoNormalizado(texto);
  if (!t) return null;
  if (NEGACOES_DE_FINALIDADE.some((n) => t.includes(n))) return null;

  const achadas = new Set<Finalidade>();
  for (const { frase, finalidade } of FRASES_DE_FINALIDADE) {
    if (t.includes(frase)) achadas.add(finalidade);
  }
  return achadas.size === 1 ? [...achadas][0]! : null;
}

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

/* -------------------------------------------------------------------------- */
/* O quiz da landing — a 135                                                   */
/* -------------------------------------------------------------------------- */

/**
 * As frases que a MENSAGEM do quiz escreve, e que o banco lê de volta.
 *
 * O quiz termina de dois jeitos: formulário (e aí as respostas viajam como
 * campos, sem ambiguidade nenhuma) ou WhatsApp — e neste a resposta viaja
 * dentro do texto que a PESSOA envia. Não há outro caminho: disparar mensagem
 * em nome dela é o que leva número a bloqueio.
 *
 * Por isso as frases são fechadas e escritas aqui: quem monta o texto e quem o
 * relê usam a mesma lista, e há teste comparando esta tabela com a do SQL. É o
 * mesmo desenho de `FRASES_DE_FINALIDADE`, que já valia para as perguntas
 * pré-preenchidas do anúncio.
 *
 * Se a pessoa APAGAR a frase antes de enviar, o campo fica vazio — e vazio é o
 * estado honesto. O que não pode acontecer é gravar o que ela não disse.
 */
export const FRASES_DE_PRAZO: readonly { frase: string; prazo: PrazoDeCompra }[] = [
  { frase: 'comprar nos proximos 30 dias', prazo: 'ate_30_dias' },
  { frase: 'comprar en los proximos 30 dias', prazo: 'ate_30_dias' },
  { frase: 'buying within 30 days', prazo: 'ate_30_dias' },
  // Português e espanhol escrevem a MESMA frase aqui; uma linha basta.
  { frase: 'comprar de 1 a 3 meses', prazo: 'de_1_a_3_meses' },
  { frase: 'buying in 1 to 3 months', prazo: 'de_1_a_3_meses' },
  { frase: 'comprar de 3 a 6 meses', prazo: 'de_3_a_6_meses' },
  { frase: 'buying in 3 to 6 months', prazo: 'de_3_a_6_meses' },
  { frase: 'comprar daqui a mais de 6 meses', prazo: 'mais_de_6_meses' },
  { frase: 'comprar en mas de 6 meses', prazo: 'mais_de_6_meses' },
  { frase: 'buying in more than 6 months', prazo: 'mais_de_6_meses' },
  { frase: 'so pesquisando por enquanto', prazo: 'pesquisando' },
  { frase: 'solo investigando por ahora', prazo: 'pesquisando' },
  { frase: 'just looking for now', prazo: 'pesquisando' },
];

export const FRASES_DE_ENCAIXE: readonly { frase: string; encaixe: EncaixeFinanceiro }[] = [
  { frase: 'a entrada e as parcelas cabem', encaixe: 'cabe' },
  { frase: 'la entrada y las cuotas caben', encaixe: 'cabe' },
  { frase: 'the down payment fits', encaixe: 'cabe' },
  { frase: 'preciso de mais prazo na entrada', encaixe: 'precisa_prazo' },
  { frase: 'necesito mas plazo en la entrada', encaixe: 'precisa_prazo' },
  { frase: 'i need more time on the down payment', encaixe: 'precisa_prazo' },
  { frase: 'dependo de financiamento bancario', encaixe: 'depende_banco' },
  { frase: 'dependo de financiacion bancaria', encaixe: 'depende_banco' },
  { frase: 'i depend on bank financing', encaixe: 'depende_banco' },
];

/**
 * O prazo que um texto afirma — ou nulo. Mesma disciplina da finalidade: duas
 * respostas diferentes na mesma mensagem não afirmam nada.
 */
export function prazoDoTexto(texto: string | null | undefined): PrazoDeCompra | null {
  const t = textoNormalizado(texto);
  if (!t) return null;
  const achados = new Set<PrazoDeCompra>();
  for (const { frase, prazo } of FRASES_DE_PRAZO) {
    if (t.includes(frase)) achados.add(prazo);
  }
  return achados.size === 1 ? [...achados][0]! : null;
}

export function encaixeDoTexto(texto: string | null | undefined): EncaixeFinanceiro | null {
  const t = textoNormalizado(texto);
  if (!t) return null;
  const achados = new Set<EncaixeFinanceiro>();
  for (const { frase, encaixe } of FRASES_DE_ENCAIXE) {
    if (t.includes(frase)) achados.add(encaixe);
  }
  return achados.size === 1 ? [...achados][0]! : null;
}

/**
 * A frase que cada resposta escreve na mensagem, por idioma.
 *
 * Devolve a frase EXATA que os leitores acima reconhecem. Quem monta a mensagem
 * não escolhe palavra nenhuma: pede a frase e concatena.
 */
export function fraseDoPrazo(prazo: PrazoDeCompra, locale: string): string {
  const pt: Record<PrazoDeCompra, string> = {
    ate_30_dias: 'Pretendo comprar nos próximos 30 dias',
    de_1_a_3_meses: 'Pretendo comprar de 1 a 3 meses',
    de_3_a_6_meses: 'Pretendo comprar de 3 a 6 meses',
    mais_de_6_meses: 'Pretendo comprar daqui a mais de 6 meses',
    pesquisando: 'Estou só pesquisando por enquanto',
  };
  const es: Record<PrazoDeCompra, string> = {
    ate_30_dias: 'Pienso comprar en los próximos 30 días',
    de_1_a_3_meses: 'Pienso comprar de 1 a 3 meses',
    de_3_a_6_meses: 'Pienso comprar de 3 a 6 meses',
    mais_de_6_meses: 'Pienso comprar en más de 6 meses',
    pesquisando: 'Estoy solo investigando por ahora',
  };
  const en: Record<PrazoDeCompra, string> = {
    ate_30_dias: "I'm buying within 30 days",
    de_1_a_3_meses: "I'm buying in 1 to 3 months",
    de_3_a_6_meses: "I'm buying in 3 to 6 months",
    mais_de_6_meses: "I'm buying in more than 6 months",
    pesquisando: "I'm just looking for now",
  };
  return locale === 'es' ? es[prazo] : locale === 'en' ? en[prazo] : pt[prazo];
}

export function fraseDoEncaixe(encaixe: EncaixeFinanceiro, locale: string): string {
  const pt: Record<EncaixeFinanceiro, string> = {
    cabe: 'A entrada e as parcelas cabem',
    precisa_prazo: 'Preciso de mais prazo na entrada',
    depende_banco: 'Dependo de financiamento bancário',
  };
  const es: Record<EncaixeFinanceiro, string> = {
    cabe: 'La entrada y las cuotas caben',
    precisa_prazo: 'Necesito más plazo en la entrada',
    depende_banco: 'Dependo de financiación bancaria',
  };
  const en: Record<EncaixeFinanceiro, string> = {
    cabe: 'The down payment fits',
    precisa_prazo: 'I need more time on the down payment',
    depende_banco: 'I depend on bank financing',
  };
  return locale === 'es' ? es[encaixe] : locale === 'en' ? en[encaixe] : pt[encaixe];
}

/** A frase da finalidade, escrita para casar com `FRASES_DE_FINALIDADE`. */
export function fraseDaFinalidade(finalidade: Finalidade, locale: string): string | null {
  const pt: Record<Finalidade, string | null> = {
    investir: 'Quero investir',
    morar: 'Quero morar',
    segunda_residencia: 'Procuro um apartamento para veraneio',
    // "Ainda avaliando" não afirma nada, e escrever isso na mensagem só faria a
    // pessoa parecer indecisa para quem vai atendê-la.
    avaliando: null,
  };
  const es: Record<Finalidade, string | null> = {
    investir: 'Quiero invertir',
    morar: 'Quiero vivir',
    segunda_residencia: 'Busco un apartamento para vacaciones',
    avaliando: null,
  };
  const en: Record<Finalidade, string | null> = {
    investir: 'I want to invest',
    morar: 'I want to live there',
    segunda_residencia: 'I am looking for a holiday home',
    avaliando: null,
  };
  return locale === 'es' ? es[finalidade] : locale === 'en' ? en[finalidade] : pt[finalidade];
}

/* -------------------------------------------------------------------------- */
/* A retomada — a 140                                                          */
/* -------------------------------------------------------------------------- */

/**
 * DEPOIS DE QUANTO TEMPO DE SILÊNCIO VALE CUTUCAR.
 *
 * Vinte e quatro horas, e o número saiu de 645 retornos medidos em 24/09:
 *
 *   menos de 1 hora .... 88,8%
 *   no mesmo dia ....... 97,8% acumulado
 *   depois disso ....... 2,2%
 *
 * Quem ia voltar sozinho já voltou no primeiro dia. Uma conversa parada há três
 * dias não está "amadurecendo" — ela acabou, e só recomeça se alguém recomeçar.
 *
 * Esperar mais não é prudência, é desistência com outro nome.
 */
export const RETOMADA_APOS_HORAS = 24;

/**
 * E DEPOIS DE QUANTOS TOQUES PARAR DE OFERECER.
 *
 * Três. A casa mandou segunda mensagem sem resposta 1.771 vezes e 385
 * trouxeram o cliente de volta — 21,7%, uma em cada cinco. O que a medição NÃO
 * diz é quantas dessas vieram na quinta tentativa, e é por isso que o limite
 * existe: insistir com quem não responde é o caminho mais curto para o número
 * ser denunciado, e um número denunciado leva junto os leads de todo mundo.
 *
 * Três é o que a fila oferece. Ninguém impede o corretor de escrever de novo
 * na ficha — o limite é da SUGESTÃO, não da pessoa.
 */
export const RETOMADA_TOQUES_MAXIMO = 3;

/** A ordem da fila: quente primeiro, depois quem esfriou há menos tempo. */
export const PESO_DA_TEMPERATURA: Record<Temperatura, number> = {
  quente: 0,
  morno: 1,
  frio: 2,
};

/**
 * Este lead merece uma retomada?
 *
 * Especificação executável da fila — a tela e o teste leem daqui, e no dia em
 * que o número mudar, muda num lugar só.
 */
export function podeRetomar(lead: {
  silencio_desde: string | null;
  toques_sem_resposta: number;
}): boolean {
  if (!lead.silencio_desde) return false;
  if (lead.toques_sem_resposta >= RETOMADA_TOQUES_MAXIMO) return false;
  const horas = (Date.now() - new Date(lead.silencio_desde).getTime()) / 3_600_000;
  return horas >= RETOMADA_APOS_HORAS;
}

/**
 * Por que este lead está na fila — a frase que a tela mostra.
 *
 * Diz o FATO ("sem resposta há 9 dias"), e não uma recomendação ("ligue
 * agora!"). Quem decide se vale a pena é quem conhece a conversa.
 */
export function motivoDaRetomada(dias: number, toques: number): string {
  const tempo =
    dias < 2 ? 'Sem resposta desde ontem' : `Sem resposta há ${Math.floor(dias)} dias`;
  if (toques <= 1) return tempo;
  return `${tempo} · ${toques} mensagens nossas sem retorno`;
}
