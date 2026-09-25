/**
 * Integração com a Meta (Facebook/Instagram Ads).
 *
 * Duas coisas entram por aqui: o LEAD do formulário de anúncio, que chega por
 * webhook, e o GASTO por anúncio por dia, que a gente vai buscar. As duas se
 * encontram na tela de atribuição, e é esse encontro que produz custo por lead.
 *
 * O sistema de referência tem 3.145 linhas disso, e uma auditoria adversarial
 * confirmou defeitos em todas as seis dimensões examinadas. Os valores abaixo
 * existem porque cada um fecha um deles — o comentário diz qual.
 */

/**
 * Versão da Graph API, em UM lugar.
 *
 * O sistema auditado espalhou `v18.0`, `v19.0` e `v21.0` por arquivos
 * diferentes. A v18 já estava fora de suporte, e a chamada que a usava falhava
 * em silêncio — o lead simplesmente não chegava, sem erro em lugar nenhum.
 */
export const GRAPH_VERSION = 'v21.0';
export const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

/**
 * Saúde da integração.
 *
 * Não é enfeite de tela: é o que decide se o cron continua tentando. Sem isso,
 * token revogado vira uma chamada falhando de hora em hora para sempre, e a
 * única pessoa que descobre é quem pergunta por que parou de entrar lead.
 */
export const META_HEALTH = [
  'ok',
  'precisa_reconectar', // token revogado ou expirado (erro 190)
  'sem_permissao', // o token vale, mas falta acesso ao objeto (erro 200/10)
  'throttled', // limite da Graph API (erro 4/17/32/613)
  'erro',
] as const;
export type MetaHealth = (typeof META_HEALTH)[number];

/** Cada estado pede uma frase e uma ação diferentes de quem está olhando. */
export const META_HEALTH_META: Record<
  MetaHealth,
  { rotulo: string; instrucao: string; grave: boolean }
> = {
  ok: { rotulo: 'Conectado', instrucao: 'Sincronizando normalmente.', grave: false },
  precisa_reconectar: {
    rotulo: 'Precisa reconectar',
    instrucao: 'O acesso da Meta expirou ou foi revogado. Reconecte para voltar a receber leads e gasto.',
    grave: true,
  },
  sem_permissao: {
    rotulo: 'Falta permissão',
    instrucao:
      'O token vale, mas a Meta negou acesso a um objeto. Confira se a Página está atribuída ao usuário do sistema com controle total — reconectar não resolve isto.',
    grave: true,
  },
  throttled: {
    rotulo: 'Aguardando a Meta',
    instrucao: 'Limite de consultas atingido. A sincronização recomeça sozinha em alguns minutos.',
    grave: false,
  },
  erro: {
    rotulo: 'Com erro',
    instrucao: 'A última sincronização falhou. O detalhe está no histórico abaixo.',
    grave: true,
  },
};

/** Estado de um evento recebido do webhook. */
export const META_INBOX_STATUSES = [
  'pendente',
  'processando',
  'processado',
  'erro',
  'descartado', // fora da janela de tempo, teste, ou orgânico
] as const;
export type MetaInboxStatus = (typeof META_INBOX_STATUSES)[number];

/** O que uma execução de sincronização foi buscar. */
export const META_SYNC_KINDS = ['insights', 'leads', 'forms', 'account_info'] as const;
export type MetaSyncKind = (typeof META_SYNC_KINDS)[number];

/**
 * Como ela terminou.
 *
 * `parcial` existe porque o sistema auditado gravava `success` mesmo quando
 * TODAS as chamadas à Graph falhavam. Quem olhava o histórico via uma coluna
 * verde e concluía que o gasto na tela estava completo.
 */
export const META_SYNC_STATUSES = ['running', 'ok', 'parcial', 'erro'] as const;
export type MetaSyncStatus = (typeof META_SYNC_STATUSES)[number];

/** Nível da hierarquia de anúncios. */
export const META_AD_LEVELS = ['campaign', 'adset', 'ad'] as const;
export type MetaAdLevel = (typeof META_AD_LEVELS)[number];

export const META_AD_LEVEL_LABEL: Record<MetaAdLevel, string> = {
  campaign: 'Campanha',
  adset: 'Conjunto',
  ad: 'Anúncio',
};

/* -------------------------------------------------------------------------- */
/* Está entregando agora?                                                     */
/* -------------------------------------------------------------------------- */

/**
 * O que a Meta chama de `effective_status`, traduzido para cinco situações.
 *
 * EFETIVO, e não o botão do próprio objeto. A diferença é a razão de este campo
 * existir: um anúncio com `status` ACTIVE dentro de uma campanha pausada tem
 * `effective_status` = CAMPAIGN_PAUSED. Filtrar pelo `status` diria que ele está
 * no ar — e ele não gasta um centavo desde que alguém pausou a campanha acima.
 *
 * A Meta devolve mais de uma dúzia de valores crus, e a maioria diz a mesma
 * coisa para quem decide verba. Aqui eles viram as cinco perguntas que a tela
 * responde: está rodando, alguém parou, foi arquivado, está em análise, ou
 * quebrou.
 */
export const META_ENTREGAS = [
  'ativo',
  'pausado',
  'arquivado',
  'em_analise',
  'com_problema',
  'desconhecido',
] as const;
export type MetaEntrega = (typeof META_ENTREGAS)[number];

const POR_STATUS: Record<string, MetaEntrega> = {
  ACTIVE: 'ativo',

  // Pausado em qualquer degrau da hierarquia. Os três significam a mesma coisa
  // para quem olha o gasto: não está entregando.
  PAUSED: 'pausado',
  CAMPAIGN_PAUSED: 'pausado',
  ADSET_PAUSED: 'pausado',

  ARCHIVED: 'arquivado',
  DELETED: 'arquivado',

  IN_PROCESS: 'em_analise',
  PENDING_REVIEW: 'em_analise',
  PREAPPROVED: 'em_analise',
  PENDING_BILLING_INFO: 'em_analise',

  // Estes DOIS não são "pausado". Ninguém escolheu parar — a Meta parou, e há o
  // que fazer a respeito. Somá-los aos pausados esconderia justamente a linha
  // que precisa de alguém hoje.
  DISAPPROVED: 'com_problema',
  WITH_ISSUES: 'com_problema',
  ADSET_WITH_ISSUES: 'com_problema',
  CAMPAIGN_WITH_ISSUES: 'com_problema',
};

export function entregaDoStatus(status: string | null | undefined): MetaEntrega {
  if (!status) return 'desconhecido';
  return POR_STATUS[status.trim().toUpperCase()] ?? 'desconhecido';
}

/**
 * Está no ar, agora, no gerenciador.
 *
 * Só `ativo`. "Em análise" ainda não entrega e "com problema" parou de
 * entregar — chamar qualquer um dos dois de ativo faria a tela afirmar que a
 * verba está rodando quando não está.
 */
export function estaEntregando(status: string | null | undefined): boolean {
  return entregaDoStatus(status) === 'ativo';
}

export const META_ENTREGA_META: Record<MetaEntrega, { rotulo: string; atencao: boolean }> = {
  ativo: { rotulo: 'No ar', atencao: false },
  pausado: { rotulo: 'Pausado', atencao: false },
  arquivado: { rotulo: 'Arquivado', atencao: false },
  em_analise: { rotulo: 'Em análise', atencao: true },
  // O único que a tela precisa gritar: gastou, parou de entregar, e ninguém
  // mandou parar.
  com_problema: { rotulo: 'Com problema', atencao: true },
  /*
   * Nunca sincronizado — e é DIFERENTE de pausado.
   *
   * Enquanto a importação de estado não roda, todo objeto cai aqui. Tratar
   * ausência como "pausado" esvaziaria a tela inteira no primeiro filtro, e o
   * corretor concluiria que não há nada rodando.
   */
  desconhecido: { rotulo: 'Sem estado', atencao: false },
};

/* -------------------------------------------------------------------------- */
/* O que cada campanha produz                                                 */
/* -------------------------------------------------------------------------- */

/**
 * O resultado não é o mesmo em toda campanha.
 *
 * Uma de formulário produz CADASTRO; uma de mensagem produz CONVERSA. Mostrar
 * "leads" nas duas faz a de mensagem parecer um fracasso permanente — 21 dos 31
 * anúncios desta conta são de mensagem, e todos apareceriam com zero para
 * sempre, marcados em vermelho como desperdício.
 *
 * E a soma dos dois não existe: "8 resultados" onde 5 são cadastro e 3 são
 * conversa é um número que não responde a pergunta nenhuma.
 */
export const RESULTADO_TIPOS = ['cadastro', 'conversa', 'clique'] as const;
export type TipoDeResultado = (typeof RESULTADO_TIPOS)[number];

export const RESULTADO_META: Record<
  TipoDeResultado,
  { singular: string; plural: string; custo: string; coluna: string }
> = {
  cadastro: {
    singular: 'cadastro',
    plural: 'cadastros',
    custo: 'Custo por cadastro',
    coluna: 'Cadastros',
  },
  conversa: {
    singular: 'conversa',
    plural: 'conversas',
    custo: 'Custo por conversa',
    coluna: 'Conversas',
  },
  clique: { singular: 'clique', plural: 'cliques', custo: 'Custo por clique', coluna: 'Cliques' },
};

/** Objetivos que geram formulário — os novos (OUTCOME_) e os herdados. */
export const OBJETIVOS_DE_CADASTRO = ['OUTCOME_LEADS', 'LEAD_GENERATION'] as const;
/** E os que geram conversa por mensagem. */
export const OBJETIVOS_DE_CONVERSA = ['MESSAGES', 'OUTCOME_MESSAGES', 'CONVERSATIONS'] as const;

/**
 * Que resultado esta linha realmente produziu.
 *
 * O objetivo NÃO basta, e a conta de origem é a prova: as 9 campanhas de
 * `OUTCOME_LEADS` dela não geraram um único cadastro de formulário — geraram 37
 * conversas. `OUTCOME_LEADS` cobre quatro destinos diferentes (formulário
 * instantâneo, mensagem, ligação e site), e a Meta não os separa no objetivo.
 * Uma tabela que fosse só de objetivo → tipo marcaria esses nove anúncios como
 * "sem cadastro", em vermelho, para sempre — errando exatamente sobre os
 * anúncios que estavam funcionando.
 *
 * Então: o que foi MEDIDO manda; o objetivo entra como desempate e, quando não
 * houve resultado nenhum, como rótulo — é ele que faz a linha vazia dizer "sem
 * cadastro" em vez de "sem clique".
 */
export function tipoDeResultado(
  objective: string | null | undefined,
  cadastros: number | null | undefined,
  conversas: number | null | undefined,
): TipoDeResultado {
  const obj = (objective ?? '').toUpperCase();
  const esperado: TipoDeResultado | null = (
    OBJETIVOS_DE_CADASTRO as readonly string[]
  ).includes(obj)
    ? 'cadastro'
    : (OBJETIVOS_DE_CONVERSA as readonly string[]).includes(obj)
      ? 'conversa'
      : null;

  const temCadastro = (cadastros ?? 0) > 0;
  const temConversa = (conversas ?? 0) > 0;

  // Produziu o que se esperava dela: nada a discutir.
  if (esperado === 'cadastro' && temCadastro) return 'cadastro';
  if (esperado === 'conversa' && temConversa) return 'conversa';

  // Produziu só uma coisa: é essa, independente do que o objetivo prometia.
  if (temConversa && !temCadastro) return 'conversa';
  if (temCadastro && !temConversa) return 'cadastro';
  // As duas, e o objetivo desempata.
  if (temCadastro && temConversa) return esperado ?? 'cadastro';

  // Não produziu nada. O objetivo diz o que ERA para produzir.
  return esperado ?? 'clique';
}

/**
 * Quantos resultados, do tipo que aquela linha realmente produz.
 *
 * Devolve `null` quando o número não foi importado ainda — e `null` vira '—' na
 * tela, não zero. "0 cadastros" é uma afirmação sobre a campanha; "—" é a
 * verdade sobre o que sabemos dela.
 */
export function resultadoDaLinha(
  tipo: TipoDeResultado,
  linha: { cadastros?: number | null; conversas?: number | null; clicks?: number | null },
): number | null {
  if (tipo === 'cadastro') return linha.cadastros ?? null;
  if (tipo === 'conversa') return linha.conversas ?? null;
  return linha.clicks ?? null;
}

/**
 * Sentinela para id ausente na chave do gasto.
 *
 * No Postgres, `null` nunca é igual a `null` numa constraint única. A tabela do
 * sistema auditado usava `unique(org, campaign_id, adset_id, ad_id, date)` com
 * as três últimas anuláveis — qualquer linha sem `ad_id` escapava da restrição
 * e era inserida DE NOVO a cada importação. O gasto do dia dobrava, e o número
 * continuava plausível na tela.
 */
export const SEM_ID = '';

/**
 * O token morreu. Só reconectar resolve.
 *
 * Só o 190 mora aqui. Os códigos 200 e 10 estavam nesta lista e NÃO deviam:
 * eles não falam do token, falam do objeto. Um token perfeitamente válido leva
 * 200 ao pedir os formulários de uma Página em que o usuário do sistema não tem
 * cargo — foi exatamente o que aconteceu na primeira busca de leads desta
 * instalação. Com os dois juntos, a tela mandava reconectar, reconectar não
 * mudava nada, e o erro real (falta de acesso à Página) nunca era dito.
 */
export const META_ERROS_DE_TOKEN = [190] as const;
/** O token vale; falta acesso ao objeto. Reconectar não muda nada. */
export const META_ERROS_DE_PERMISSAO = [10, 200] as const;
/** E os que significam "tente de novo mais tarde". */
export const META_ERROS_DE_LIMITE = [4, 17, 32, 613] as const;

export function saudeDoErro(codigo: number | null | undefined): MetaHealth {
  if (codigo == null) return 'erro';
  if ((META_ERROS_DE_TOKEN as readonly number[]).includes(codigo)) return 'precisa_reconectar';
  if ((META_ERROS_DE_PERMISSAO as readonly number[]).includes(codigo)) return 'sem_permissao';
  if ((META_ERROS_DE_LIMITE as readonly number[]).includes(codigo)) return 'throttled';
  return 'erro';
}

/**
 * O erro da Graph em português, para quem está olhando a tela.
 *
 * "Graph 200" foi o que a tela mostrou quando a busca de leads falhou — um
 * número que não diz nem o que houve nem o que fazer, e que ainda por cima se
 * parece com o status HTTP de sucesso. Quem lê precisa saber se a bola está com
 * ele, com a Meta, ou com o tempo.
 */
export function mensagemDoErro(codigo: number | null | undefined, status?: number): string {
  switch (codigo) {
    case 190:
      return 'o acesso da Meta expirou ou foi revogado — reconecte';
    case 200:
    case 10:
      return 'a Meta negou acesso: a Página precisa estar atribuída ao usuário do sistema com controle total';
    case 4:
    case 17:
    case 32:
    case 613:
      return 'limite de consultas da Meta atingido — tente de novo mais tarde';
    case 100:
      return 'a Meta não reconheceu o pedido (campo ou id inválido)';
    case 803:
      return 'a Meta não encontrou este objeto, ou o acesso a ele não foi concedido';
    default:
      return codigo != null ? `erro ${codigo} da Meta` : `a Meta respondeu ${status ?? '?'}`;
  }
}

/**
 * Dinheiro em unidade mínima, sempre.
 *
 * A Meta devolve `spend` como STRING ("12.34"). O sistema auditado fazia
 * `parseFloat(insight.spend) || 0` — e `|| 0` transforma tanto o campo ausente
 * quanto o NaN em gasto zero, gravando por cima do valor correto do dia. Aqui,
 * valor que não converte ABORTA a linha em vez de virar zero.
 */
export function gastoParaMenor(valor: unknown, casas = 2): number | null {
  if (typeof valor === 'number') {
    return Number.isFinite(valor) && valor >= 0 ? Math.round(valor * 10 ** casas) : null;
  }
  if (typeof valor !== 'string') return null;

  /*
   * String vazia NÃO é zero.
   *
   * `Number('')` devolve 0, e aceitar isso seria repetir o defeito de cabeça
   * para baixo: o campo ausente vira um zero legítimo que depois é gravado por
   * cima do gasto correto do dia. Campo em branco significa "a Meta não
   * respondeu", e quem não respondeu não gastou zero — não se sabe.
   */
  const texto = valor.trim();
  if (texto === '') return null;

  const n = Number(texto);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 10 ** casas);
}

export function formatarGasto(menor: number | null | undefined, moeda: string): string {
  if (menor == null) return '—';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: moeda }).format(menor / 100);
}

/**
 * Custo por lead — e a razão de ele receber o denominador junto.
 *
 * Só entra no denominador o lead que TEM `ft_meta_ad_id`. O sistema auditado
 * dividia o gasto pelo total de leads da organização, incluindo os que vieram
 * de indicação e de placa na rua: o custo por lead saía barato e a decisão de
 * verba era tomada em cima disso.
 *
 * Devolver `null` quando não há lead atribuído é deliberado: a tela mostra "—",
 * nunca "R$ 0,00", que leria como anúncio de graça.
 */
export function custoPorLead(
  gastoMenor: number,
  leadsAtribuidos: number,
): { valor: number | null; confiavel: boolean } {
  if (leadsAtribuidos <= 0) return { valor: null, confiavel: false };
  return { valor: Math.round(gastoMenor / leadsAtribuidos), confiavel: leadsAtribuidos >= 5 };
}

/**
 * A mesma conta, para o resultado que a linha realmente produz.
 *
 * Existe separada porque o número de resultados pode ser NULO — a linha foi
 * importada antes de pedirmos `actions` à Meta. Nulo dividindo vira `Infinity`
 * em JavaScript, e `Infinity` formatado em real sai como "R$ ∞".
 */
export function custoPorResultado(
  gastoMenor: number,
  resultados: number | null | undefined,
): { valor: number | null; confiavel: boolean } {
  if (resultados == null || resultados <= 0) return { valor: null, confiavel: false };
  return { valor: Math.round(gastoMenor / resultados), confiavel: resultados >= 5 };
}

/**
 * Telefone da Meta para E.164.
 *
 * A lista de DDDs vem do sistema de referência — é conhecimento acumulado sobre
 * formulário brasileiro de verdade e vale portar. O que não vale é a regra
 * aplicada sem olhar o DDI: lá, um número português apanhava a regra do nono
 * dígito e virava outro número.
 */
const DDD_VALIDOS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35, 37, 38, 41, 42, 43,
  44, 45, 46, 47, 48, 49, 51, 53, 54, 55, 61, 62, 63, 64, 65, 66, 67, 68, 69, 71, 73, 74, 75, 77,
  79, 81, 82, 83, 84, 85, 86, 87, 88, 89, 91, 92, 93, 94, 95, 96, 97, 98, 99,
]);

export function telefoneE164(bruto: string | null | undefined): string | null {
  if (!bruto) return null;
  const d = bruto.replace(/\D/g, '');
  if (d.length < 8) return null;

  // Só mexe no formato brasileiro quando o número REALMENTE é brasileiro.
  const comDDI = d.startsWith('55') ? d.slice(2) : d;
  const pareceBR = (d.startsWith('55') && comDDI.length >= 10) || d.length === 10 || d.length === 11;

  if (!pareceBR) return `+${d}`;

  const ddd = Number(comDDI.slice(0, 2));
  if (!DDD_VALIDOS.has(ddd)) return `+${d}`;

  let resto = comDDI.slice(2);
  // Celular brasileiro tem 9 dígitos desde 2016; fixo continua com 8.
  if (resto.length === 8 && /^[6-9]/.test(resto)) resto = `9${resto}`;
  return `+55${ddd}${resto}`;
}

/**
 * Id da Meta que pode virar URL.
 *
 * O sistema auditado validava `^\d+$` em quatro ids e ESQUECIA do `leadgen_id`,
 * que era interpolado cru no caminho da Graph API junto com o token da
 * organização. Aqui não há id privilegiado: ou passa por esta função, ou não
 * toca em URL.
 */
export function idDaMeta(valor: unknown): string | null {
  return typeof valor === 'string' && /^\d{1,20}$/.test(valor) ? valor : null;
}

/* -------------------------------------------------------------------------- */
/* A volta — a 141 e a 142                                                     */
/* -------------------------------------------------------------------------- */

/**
 * O QUE O CRM DEVOLVE À META.
 *
 * Todo o resto deste arquivo é a Meta contando coisas para o CRM: o lead do
 * formulário, o gasto por anúncio. Esta lista é o caminho contrário, e ela
 * existe porque a medição de 24/09 encontrou um silêncio completo: dos 187
 * leads vivos, TODOS vieram do anúncio que abre o WhatsApp, e nenhum deles
 * jamais foi contado de volta.
 *
 * O que a Meta sabia até aqui era "176 pessoas clicaram e abriram conversa".
 * Conversa inclui o "oi" que sumiu, o engano e quem queria emprego — e era com
 * esse público que o algoritmo estava aprendendo a procurar mais gente
 * parecida.
 *
 * SÃO OS FATOS DO CRM, e não os nomes da Meta. A diferença custou uma migração
 * inteira: a API de Conversões tem DOIS vocabulários, um para evento de site e
 * outro para evento de conversa, e `Lead` só existe no primeiro. Guardar o nome
 * da Meta faria a mesma linha estar certa para uma porta e errada para a outra.
 * Quem traduz é o trabalhador, que sabe por onde o lead entrou.
 */
export const CONVERSOES_DEVOLVIDAS = [
  'lead',
  'visita_agendada',
  'visita_realizada',
  'proposta',
  'venda',
] as const;
export type ConversaoDevolvida = (typeof CONVERSOES_DEVOLVIDAS)[number];

/** Como cada uma se chama para quem lê, e o fato do CRM que a dispara. */
export const CONVERSAO_META: Record<ConversaoDevolvida, { label: string; fato: string }> = {
  lead: {
    label: 'Virou lead',
    fato: 'o clique no anúncio virou ficha no CRM',
  },
  visita_agendada: {
    label: 'Visita agendada',
    fato: 'o cartão entrou na etapa de visita agendada',
  },
  visita_realizada: {
    label: 'Visita realizada',
    fato: 'o cliente esteve no imóvel — o sinal mais forte que a casa produz',
  },
  proposta: {
    label: 'Proposta',
    fato: 'o cliente ofereceu um preço',
  },
  venda: {
    label: 'Fechado',
    fato: 'a venda aconteceu — vai com o valor do negócio',
  },
};

/**
 * OS DOIS VOCABULÁRIOS DA META, E POR QUE ELES EXISTEM.
 *
 * O evento que nasce num site aceita `Lead`, `Schedule`, `Purchase`. O que
 * nasce numa CONVERSA aceita outra lista, de gosto mais comercial —
 * `LeadSubmitted`, `QualifiedLead`, `InitiateCheckout`, `Purchase` — e recusa
 * `Lead` com um 400 seco. Foi assim que os 42 primeiros eventos voltaram.
 *
 * As escolhas do lado da conversa, uma por uma:
 *
 *   `LeadSubmitted` para a ficha — é o nome dela mesma;
 *   `QualifiedLead` para a visita agendada — marcar visita É o critério de
 *     qualificação da casa, então o nome diz a verdade;
 *   `InitiateCheckout` para a proposta — não é sinônimo, é a mesma POSIÇÃO:
 *     o degrau imediatamente antes da compra, dos dois lados;
 *   `Purchase` para a venda, com o valor do negócio.
 */
export const CONVERSAO_NA_CONVERSA: Partial<Record<ConversaoDevolvida, string>> = {
  lead: 'LeadSubmitted',
  visita_agendada: 'QualifiedLead',
  proposta: 'InitiateCheckout',
  venda: 'Purchase',
  /*
   * `visita_realizada` NÃO TEM ENTRADA AQUI, e o `Partial` existe por ela.
   *
   * A lista da conversa não tem nada que queira dizer "o cliente entrou no
   * apartamento". O mais parecido é `ViewContent`, que para a Meta é alguém
   * olhando uma página de produto — barato, abundante, de intenção baixa.
   *
   * Fora da conversa o problema some: `CONVERSAO_NO_SITE` usa um nome NOSSO,
   * que a Meta aceita em qualquer origem que não seja `business_messaging`.
   * Então este é o único evento que existe numa rota e não na outra, e o
   * trabalhador o descarta dizendo por quê se a rota virar conversa.
   */
};

/**
 * O VOCABULÁRIO COMUM — vale para `website`, `chat` e qualquer origem que não
 * seja `business_messaging`.
 *
 * É mais largo de propósito: aqui a Meta aceita nome PRÓPRIO, e é por isso que
 * `VisitaRealizada` cabe. A restrição que obrigou a inventar equivalências
 * existe só do lado do CTWA.
 */
export const CONVERSAO_NO_SITE: Record<ConversaoDevolvida, string> = {
  lead: 'Lead',
  visita_agendada: 'Schedule',
  visita_realizada: 'VisitaRealizada',
  proposta: 'InitiateCheckout',
  venda: 'Purchase',
};

/**
 * A ETAPA QUE NÃO VIRA EVENTO, e é metade da decisão.
 *
 * `em_atendimento` anda sozinha desde a 122, no instante em que um humano
 * responde. Em 24/09 isso era 158 das 179 mudanças de etapa de toda a história
 * do CRM, e 156 dos 187 leads vivos estavam parados nela. Um evento que
 * acontece com quase todo mundo não separa ninguém de ninguém — seria o lead de
 * novo com outro nome, abafando os poucos que realmente distinguem.
 *
 * `perdido` também não vai: a Meta não tem o que fazer com derrota.
 *
 * `visita_realizada` VOLTOU, depois de ter saído por um motivo que deixou de
 * valer. Ela foi cortada quando a única rota era a da conversa, onde a lista da
 * Meta não tem nome para "o cliente entrou no apartamento". Pela rota comum o
 * nome pode ser NOSSO, então ela volta sendo o que é — e é o sinal mais forte
 * que uma imobiliária produz.
 */
export const ETAPAS_QUE_NAO_VOLTAM: readonly string[] = ['novo', 'em_atendimento', 'perdido'];

/** De que etapa nasce cada evento. O banco repete isto no gatilho da 142. */
export const CONVERSAO_DA_ETAPA: Record<string, ConversaoDevolvida> = {
  visita_agendada: 'visita_agendada',
  visita_realizada: 'visita_realizada',
  proposta: 'proposta',
  fechado: 'venda',
};

/**
 * QUANTO TEMPO A META ACEITA OLHAR PARA TRÁS.
 *
 * Sete dias, e é o limite dela. Quem envelhece na fila — porque o token caiu,
 * porque a Graph ficou fora — é marcado `expirado` em vez de ser retentado para
 * sempre. Foi o defeito da 133: uma fila que se reporta ocupada para sempre
 * porque o critério de saída nunca chega.
 *
 * É também por isso que não houve recuperação de histórico: dos 187 leads, 145
 * são mais velhos que isto. Carimbá-los com a data de hoje seria inventar 145
 * conversões num dia em que elas não aconteceram.
 */
export const CONVERSAO_JANELA_DIAS = 7;

/**
 * QUANTAS CONVERSÕES POR SEMANA A META PRECISA PARA APRENDER.
 *
 * Cinquenta é o número que a própria Meta publica para uma campanha sair da
 * fase de aprendizado. Ele está aqui para a tela poder dizer a verdade em vez
 * de sugerir o que não dá: com ~26 leads por semana nem o "virou lead" chega
 * lá, e visita e proposta, que aconteceram 4 vezes em toda a história, nunca
 * vão chegar.
 *
 * O que estes eventos servem HOJE é para RESPONDER qual criativo traz quem
 * avança, no relatório. Otimizar por eles é conversa para quando o volume vier.
 */
export const CONVERSAO_MINIMO_SEMANAL = 50;
