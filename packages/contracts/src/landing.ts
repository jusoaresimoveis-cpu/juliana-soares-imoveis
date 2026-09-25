/**
 * Landing pages — os três eixos de uma página, e o que cada um significa.
 *
 * Estes valores já existiam em CHECK no banco desde a 034 e nunca subiram para
 * o dicionário: a tela do CRM ainda não existia, então ninguém precisava deles
 * do lado de cá. Agora precisa — e a regra da casa é que valor repetido em duas
 * camadas mora aqui ou não existe.
 *
 * Os três eixos são independentes de propósito, e a separação custou uma
 * migração para acontecer (045):
 *
 *   ÂNGULO   o ARGUMENTO que a página defende
 *   LAYOUT   o DESENHO em que ela é servida
 *   CTA      COMO a pessoa fala com o corretor
 *
 * Enquanto ângulo e layout eram um campo só, acrescentar um desenho novo
 * custava um argumento: a página nova nascia sem defender nada.
 */

export const ANGULOS = ['experiencia', 'investimento', 'oportunidade'] as const;
export type Angulo = (typeof ANGULOS)[number];

export const LAYOUTS = ['padrao', 'proposta', 'lancamento', 'vitrine', 'orla', 'direto'] as const;
export type Layout = (typeof LAYOUTS)[number];

export const CTA_KINDS = ['whatsapp', 'formulario', 'ambos', 'quiz'] as const;
export type CtaKind = (typeof CTA_KINDS)[number];

/**
 * O que cada eixo quer dizer, escrito para o CORRETOR.
 *
 * `nota` não é ajuda de tela opcional: quem escolhe a variante que vai receber
 * verba precisa saber o que está escolhendo. "Ângulo: oportunidade" não informa
 * nada; "vender a condição — entrada, parcela, o que está aberto agora" informa.
 */
export const ANGULO_META: Record<Angulo, { label: string; nota: string }> = {
  experiencia: {
    label: 'Experiência',
    nota: 'Vende o viver aqui — a praia, a cidade, o dia a dia. Para quem imagina a família no lugar.',
  },
  investimento: {
    label: 'Investimento',
    nota: 'Vende o retorno — valorização da região, locação fora do verão, patrimônio em moeda forte.',
  },
  oportunidade: {
    label: 'Oportunidade',
    nota: 'Vende a condição — entrada, parcela, o que está aberto agora. Para quem já decidiu comprar.',
  },
};

export const LAYOUT_META: Record<Layout, { label: string; nota: string }> = {
  padrao: {
    label: 'Imóvel primeiro',
    nota: 'Abre com as fotos do imóvel. Funciona para quem já conhece a região.',
  },
  proposta: {
    label: 'Cidade primeiro',
    nota: 'Abre com a foto da cidade e a proposta fixa ao lado. Para quem ainda está escolhendo o lugar.',
  },
  lancamento: {
    label: 'Lançamento',
    nota: 'Página longa: cidade e prédio dividindo o herói, e o formulário só no fim. Para ticket alto e decisão demorada.',
  },
  vitrine: {
    label: 'Vitrine',
    nota: 'O prédio recortado rompe a moldura e os números ficam à frente. Responde o que é, onde fica e quanto custa sem rolar a página.',
  },
  orla: {
    label: 'Orla',
    nota: 'Cartões empilhados sobre fundo escuro, vendendo o lugar antes do imóvel. Nasceu de celular e põe o WhatsApp ao alcance do polegar em toda dobra.',
  },
  /*
   * O sexto, e o único que começa PERGUNTANDO.
   *
   * Os outros cinco defendem o imóvel e pedem o dado depois — o `lancamento`
   * leva onze blocos até o formulário. A medição de 24/09 mostrou o que isso
   * rende no tráfego que a casa compra: de 163 visitas, 8 passaram da metade da
   * página e NENHUMA converteu. Quem não age na primeira tela não age.
   *
   * Aqui a primeira pergunta do quiz está na primeira tela, tocável, sem rolar.
   * Um toque é o pedido mais barato que existe para quem chegou frio no
   * celular — mais barato que ler, mais barato que digitar.
   */
  direto: {
    label: 'Direto',
    nota: 'Abre com a pergunta, não com o argumento. Uma tela para decidir, quatro no total. Para tráfego frio de celular, onde quem rola já desistiu.',
  },
};

export const CTA_META: Record<CtaKind, { label: string; nota: string }> = {
  whatsapp: {
    label: 'WhatsApp',
    nota: 'Menor atrito possível. Cai direto na conversa, com o código de referência na mensagem.',
  },
  formulario: {
    label: 'Formulário',
    nota: 'Filtra quem está disposto a preencher. Chega com nome e telefone já digitados.',
  },
  ambos: {
    label: 'Os dois',
    nota: 'Captura quem hesita entre um e outro. Mais opções, mais chance de nenhuma ser escolhida.',
  },
  quiz: {
    label: 'Quiz',
    nota: 'Três perguntas de um toque antes do contato. Chega qualificado — e quem não responde às três também não responderia ao corretor.',
  },
};

/**
 * Quem desenha a página pergunta duas coisas ao `cta_kind`, e as duas têm mais
 * de uma resposta certa desde que o quiz existe.
 *
 * Antes eram comparações soltas espalhadas pelos modelos (`=== 'formulario' ||
 * === 'ambos'`), e cada modelo novo copiava a sua. Um mecanismo novo obrigava a
 * achar todas — e a que ficasse para trás não daria erro: a página simplesmente
 * não mostraria como conversar.
 */
export function mostraFormulario(cta: CtaKind): boolean {
  return cta === 'formulario' || cta === 'ambos' || cta === 'quiz';
}

export function mostraWhatsapp(cta: CtaKind): boolean {
  return cta === 'whatsapp' || cta === 'ambos' || cta === 'quiz';
}

/** O quiz é o formulário em três passos: a página só precisa saber disso. */
export function ehQuiz(cta: CtaKind): boolean {
  return cta === 'quiz';
}

/**
 * O pareamento que `landing_gerar` cria.
 *
 * Fica aqui para a tela poder EXPLICAR o que o botão vai fazer antes de alguém
 * clicar — e para o teste comparar contra o `insert` da função, que é quem
 * decide de verdade.
 */
export const VARIANTES_GERADAS: readonly { variant: string; angulo: Angulo; cta: CtaKind }[] = [
  { variant: 'a', angulo: 'experiencia', cta: 'whatsapp' },
  { variant: 'b', angulo: 'investimento', cta: 'formulario' },
  { variant: 'c', angulo: 'oportunidade', cta: 'ambos' },
] as const;

/**
 * Visitas por variante abaixo das quais a taxa não quer dizer nada.
 *
 * Trinta é pouco para estatística séria e é MUITO para a realidade de um
 * imóvel: a operação toda tem cinco mercados e verba dividida. O número existe
 * para impedir a decisão que custa dinheiro — desligar a variante que fez 0 de
 * 3 e manter a que fez 1 de 2, que é ruído puro sendo lido como resultado.
 */
export const MIN_VISITAS_CONFIAVEL = 30;

/**
 * A taxa de conversão de uma variante, e se dá para acreditar nela.
 *
 * Sem visita, a taxa é NULA e não zero: zero afirma "ninguém converteu", nulo
 * diz "ninguém entrou ainda". A diferença decide se o corretor desliga a página
 * ou espera — e é a mesma escolha que `custoPorLead` faz do lado da Meta.
 */
export function conversaoDaVariante(
  visitas: number | null | undefined,
  leads: number | null | undefined,
): { taxa: number | null; confiavel: boolean } {
  const v = Number(visitas ?? 0);
  const l = Number(leads ?? 0);
  if (!Number.isFinite(v) || v <= 0) return { taxa: null, confiavel: false };
  return { taxa: l / v, confiavel: v >= MIN_VISITAS_CONFIAVEL };
}
