import type { EncaixeFinanceiro, Finalidade, PrazoDeCompra } from './qualificacao';

/**
 * O leitor da mensagem: as frases que dizem finalidade, prazo e encaixe, o
 * texto normalizado em que elas são procuradas e a frase que cada resposta
 * escreve. É a especificação dos leitores do banco (a 121 e a 135), e
 * `qualificacao.ts` reexporta tudo daqui.
 */

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
  return achadas.size === 1 ? ([...achadas][0] ?? null) : null;
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
  return achados.size === 1 ? ([...achados][0] ?? null) : null;
}

export function encaixeDoTexto(texto: string | null | undefined): EncaixeFinanceiro | null {
  const t = textoNormalizado(texto);
  if (!t) return null;
  const achados = new Set<EncaixeFinanceiro>();
  for (const { frase, encaixe } of FRASES_DE_ENCAIXE) {
    if (t.includes(frase)) achados.add(encaixe);
  }
  return achados.size === 1 ? ([...achados][0] ?? null) : null;
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
