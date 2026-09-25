import type { AppRole } from './roles';

/**
 * Notificações.
 *
 * Desenho derivado de auditoria do CRM da Dra. Denise, que tem a pilha
 * equivalente em produção. Cada ausência aqui é defeito confirmado lá, não
 * economia de escopo — os comentários dizem qual.
 */

export const NOTIFICATION_TYPES = [
  'lead_novo',
  /*
   * Alguém passou este lead PARA VOCÊ.
   *
   * Não cabia em `lead_novo`: aquele avisa que entrou lead na casa, e vai para
   * quem acompanha a operação. Este é dirigido — tem um destinatário só e uma
   * ação esperada dele. Com a segunda corretora entrando, "chegou lead" e
   * "chegou lead SEU" deixam de ser a mesma frase.
   */
  'lead_atribuido',
  /*
   * A qualificação fez o lead virar QUENTE.
   *
   * Não é `lead_novo`: aquele avisa que alguém chegou, e a maior parte de quem
   * chega não tem pressa. Este avisa que alguém DISSE que quer comprar em até
   * três meses e que a entrada cabe — é a linha que muda a ordem do dia.
   *
   * Sai só na virada, e nunca para quem preencheu a ficha: quem acabou de
   * marcar já sabe o que marcou.
   */
  'lead_quente',
  /*
   * O cliente escreveu e ninguém voltou.
   *
   * Não é `mensagem_recebida`: aquele avisa na hora em que a mensagem chega e
   * rola para fora da tela em minutos. Este avisa DEPOIS, quando o relógio
   * passou do limite da casa — é sobre o silêncio, não sobre a mensagem.
   *
   * Sai uma vez por espera (`leads.espera_avisada`, na 128) e só entre 8h e 20h
   * da hora da imobiliária: toda notificação vira push, e um celular tocando às
   * 2h da manhã por um recado que ninguém vai responder antes do café é o jeito
   * mais rápido de ensinar a equipe a ignorar o aviso.
   */
  'lead_esperando',
  'mensagem_recebida',
  'lembrete',
  'visita_proxima',
  'sistema',
  /*
   * O WhatsApp de alguém caiu.
   *
   * Não é `sistema`. Aquele é o balde do que não tem casa; este tem
   * destinatário certo — o DONO do número, que é quem reconecta — e uma
   * consequência que corre enquanto ninguém age: todo lead que chegar naquele
   * número está sendo perdido em silêncio.
   *
   * Nasceu de um caso real: um número caiu às 22h31 e ninguém soube por
   * dezessete horas, enquanto a campanha continuava comprando lead que
   * evaporava na entrada.
   */
  'whatsapp_fora',
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/**
 * Os sons disponíveis. Sintetizados na hora (Web Audio), sem arquivo hospedado.
 */
export const NOTIFICATION_SOUNDS = ['lead', 'mensagem', 'lembrete', 'alerta'] as const;

export type NotificationSound = (typeof NOTIFICATION_SOUNDS)[number];

/**
 * Rótulo, ícone e som saem do TIPO — nunca de colunas gravadas junto com a
 * notificação.
 *
 * No sistema auditado havia uma coluna `icon` que o produtor preenchia com
 * `clipboard-check`, enquanto o mapa de ícones da tela conhecia quatro nomes.
 * A notificação caía no ícone genérico sem erro em lugar nenhum. Aqui o mapa é
 * a única fonte, e o teste de contrato exige cobertura de todos os tipos.
 */
export const NOTIFICATION_META: Record<
  NotificationType,
  { label: string; icone: string; som: NotificationSound }
> = {
  lead_novo: { label: 'Lead novo', icone: 'user-plus', som: 'lead' },
  lead_atribuido: { label: 'Lead para você', icone: 'user-check', som: 'lead' },
  lead_quente: { label: 'Lead quente', icone: 'flame', som: 'lead' },
  lead_esperando: { label: 'Sem resposta', icone: 'alarm-clock', som: 'lembrete' },
  mensagem_recebida: { label: 'Mensagem recebida', icone: 'message-circle', som: 'mensagem' },
  lembrete: { label: 'Lembrete', icone: 'bell-ring', som: 'lembrete' },
  visita_proxima: { label: 'Visita próxima', icone: 'calendar-clock', som: 'lembrete' },
  sistema: { label: 'Sistema', icone: 'alert-triangle', som: 'alerta' },
  whatsapp_fora: { label: 'WhatsApp fora do ar', icone: 'plug-zap', som: 'alerta' },
};

// -----------------------------------------------------------------------------
// O que TOCA no celular — a 151
// -----------------------------------------------------------------------------

/**
 * QUAIS AVISOS FAZEM O TELEFONE TOCAR.
 *
 * Nasceu de uma medição, em 24/09, e ela é o argumento inteiro:
 *
 *   1.540 notificações criadas em toda a história do CRM. **6 lidas.**
 *   Em 14 dias: 263 "mensagem recebida", 172 "lead novo" — e 22 "lead
 *   esperando", que é o único que pede ação e não tem outro caminho.
 *
 * Onze avisos por dia por pessoa, quase todos sem nada a fazer. Um sino que
 * avisa de tudo não avisa de nada: o que a equipe aprendeu foi a ignorar o
 * aparelho, e junto com o ruído foi embora o aviso que importava.
 *
 * A REGRA É UMA SÓ: toca o que a pessoa não descobriria de outro jeito.
 *
 * `lead_novo` e `mensagem_recebida` não tocam porque a primeira mensagem do
 * cliente cai no WhatsApp DA PESSOA — o mesmo aparelho, dois segundos antes.
 * Avisar de novo é repetir. Já "ninguém voltou para esse cliente há três
 * horas" não existe em lugar nenhum além daqui: o WhatsApp não tem tela de
 * silêncio.
 *
 * ELES CONTINUAM NO SINO. O que muda é só o toque — a lista dentro do CRM
 * segue completa, para quem quiser rolar.
 *
 * O mapa é FECHADO e o teste exige entrada para todo tipo: um aviso novo
 * obriga alguém a decidir se ele merece acordar a pessoa, em vez de herdar um
 * padrão que ninguém escolheu.
 */
export const TOCA_NO_CELULAR: Record<NotificationType, boolean> = {
  /* Pede ação e não tem outro caminho. */
  lead_esperando: true,
  lead_atribuido: true,
  lead_quente: true,
  lembrete: true,
  visita_proxima: true,
  whatsapp_fora: true,
  sistema: true,

  /* Chega antes pelo WhatsApp, no mesmo aparelho. */
  lead_novo: false,
  mensagem_recebida: false,
};

// -----------------------------------------------------------------------------
// Cobrança de resposta
// -----------------------------------------------------------------------------

/**
 * Depois de quantas horas sem resposta o CRM cobra a casa.
 *
 * É escolha da IMOBILIÁRIA, não da pessoa — por isso mora em
 * `organizations.aviso_espera_horas` e só gerente e admin mudam (a RLS da
 * organização já decide isso). Cada um desliga para si silenciando o tipo
 * `lead_esperando` na própria lista.
 *
 * `null` desliga o alarme para a casa inteira.
 */
export const AVISO_ESPERA_OPCOES = [1, 2, 3, 6, 12, 24, null] as const;

export type AvisoEsperaHoras = (typeof AVISO_ESPERA_OPCOES)[number];

/**
 * Duas horas, e o número saiu da medição de 45 dias de conversa (696 esperas):
 * 69% são respondidas na primeira hora, e depois disso a curva é plana — quem
 * não foi respondido em uma hora quase nunca é respondido no mesmo dia. Apertar
 * de 3h para 1h acrescenta menos de um aviso por dia; afrouxar deixa a pessoa
 * esperando a tarde inteira antes de alguém ser avisado.
 */
export const AVISO_ESPERA_PADRAO = 2;

/**
 * O alarme só toca dentro desta janela, na hora da imobiliária. O que estoura
 * de madrugada toca às 8h — não se perde, espera o dia começar.
 */
export const AVISO_ESPERA_JANELA = { inicio: 8, fim: 20 } as const;

export function rotuloDoAvisoDeEspera(horas: number | null): string {
  if (horas === null) return 'Não cobrar';
  if (horas === 1) return 'Depois de 1 hora';
  if (horas < 24) return `Depois de ${horas} horas`;
  return 'Depois de um dia';
}

// -----------------------------------------------------------------------------
// Alcance de lead
// -----------------------------------------------------------------------------

/**
 * De quais leads a pessoa quer saber.
 *
 * É isto que impede o lead sem dono de virar uma notificação por corretor. Com
 * dois na equipe não faz diferença; com quinze, um lead vira quinze avisos e o
 * time aprende a ignorar o sino — que é a morte silenciosa de qualquer sistema
 * de notificação.
 */
export const LEAD_SCOPES = ['nenhum', 'meus', 'todos'] as const;

export type LeadScope = (typeof LEAD_SCOPES)[number];

export const LEAD_SCOPE_LABEL: Record<LeadScope, string> = {
  nenhum: 'Não me avise sobre leads',
  meus: 'Só os leads que são meus',
  todos: 'Todos os leads da imobiliária',
};

/**
 * Padrão por papel.
 *
 * O admin cuida de desenvolvimento e de mídia; receber push de cada lead novo
 * enquanto programa é ruído. Ele pode ligar na tela, mas o padrão é desligado.
 */
export const DEFAULT_LEAD_SCOPE: Record<AppRole, LeadScope> = {
  admin: 'nenhum',
  gerente: 'todos',
  corretor: 'meus',
};

/**
 * Teto por papel.
 *
 * O gerente pode baixar para 'meus' quando a equipe crescer e ele cansar do
 * barulho. O corretor NÃO pode subir para 'todos': senão a preferência de
 * notificação vira porta dos fundos para acompanhar a carteira alheia.
 */
export const MAX_LEAD_SCOPE: Record<AppRole, LeadScope> = {
  admin: 'todos',
  gerente: 'todos',
  corretor: 'meus',
};

const ORDEM_ALCANCE: Record<LeadScope, number> = { nenhum: 0, meus: 1, todos: 2 };

export function podeUsarAlcance(role: AppRole, escopo: LeadScope): boolean {
  const teto = MAX_LEAD_SCOPE[role];
  return ORDEM_ALCANCE[escopo] <= ORDEM_ALCANCE[teto];
}

/** Os alcances que a tela deve oferecer a este papel. */
export function alcancesDisponiveis(role: AppRole): LeadScope[] {
  return LEAD_SCOPES.filter((e) => podeUsarAlcance(role, e));
}

// -----------------------------------------------------------------------------
// Fila de push
// -----------------------------------------------------------------------------

/**
 * Push não sai de gatilho por HTTP: o gatilho enfileira, um worker envia.
 *
 * No sistema auditado o gatilho chamava a função de envio direto, montando o
 * cabeçalho de autenticação com uma variável de sessão que não existia — o
 * header virava nulo e o serviço respondia 401 em silêncio, de minuto em
 * minuto, sem ninguém perceber. O princípio já estava escrito no nosso
 * ARQUITETURA.md: fila para toda integração externa, nada de disparar e torcer.
 */
export const PUSH_OUTBOX_STATUSES = [
  'pendente',
  'enviando',
  'enviado',
  'falhou',
  'descartado',
] as const;

export type PushOutboxStatus = (typeof PUSH_OUTBOX_STATUSES)[number];

/** Depois disto a linha vira 'descartado' e para de ocupar a fila. */
export const PUSH_MAX_TENTATIVAS = 5;

/**
 * Se a fila mais antiga passar disto, o sistema notifica os admins de que o
 * push parou. É como ele percebe o próprio silêncio — o defeito mais caro do
 * sistema auditado foi não ter nada disso.
 */
export const PUSH_ATRASO_ALERTA_MINUTOS = 15;

export function isNotificationType(v: string): v is NotificationType {
  return (NOTIFICATION_TYPES as readonly string[]).includes(v);
}
