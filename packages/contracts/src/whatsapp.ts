/**
 * WhatsApp.
 *
 * Desenho derivado de auditoria da integração UAZAPI do CRM da Dra. Denise,
 * com verificação adversarial: 44 dos 141 achados foram refutados e
 * descartados. Cada escolha estranha aqui conserta um defeito CONFIRMADO lá, e
 * o comentário diz qual.
 *
 * Decisão de produto que atravessa o módulo inteiro: **não existe disparo em
 * lote**. Só conversa individual. O vetor de banimento de número no WhatsApp
 * não oficial é exatamente a prospecção fria, e o ativo em risco não é o
 * software — é o número que os clientes da imobiliária já salvaram, que
 * recuperar não depende de nós.
 *
 * Isso não é regra de tela: a fila de saída exige uma conversa existente, então
 * mandar para uma lista de números que nunca escreveram não tem onde encaixar.
 */

export const WA_INSTANCE_STATUSES = [
  'desconectada',
  'pareando',
  'conectada',
  'credenciada_offline',
  'erro',
] as const;

export type WaInstanceStatus = (typeof WA_INSTANCE_STATUSES)[number];

/**
 * `credenciada_offline` existe por causa da frase que a tela mostra.
 *
 * "Seu celular está sem internet" (não faça nada, volta sozinho) é uma
 * instrução completamente diferente de "escaneie o QR code" (aja agora, e o
 * histórico pode não voltar). No sistema auditado esse estado era calculado e
 * morria dentro do JSON de resposta — nenhuma tela lia, e o corretor via
 * "desconectado" nos dois casos.
 *
 * Aqui ele é PERSISTIDO, porque o cron de saúde precisa reagir a "está assim há
 * quarenta minutos".
 */
export const WA_INSTANCE_META: Record<
  WaInstanceStatus,
  { label: string; tom: 'ok' | 'warn' | 'dng' | 'neutro'; instrucao: string }
> = {
  desconectada: {
    label: 'Desconectada',
    tom: 'neutro',
    instrucao: 'Escaneie o QR code para conectar este número.',
  },
  pareando: {
    label: 'Aguardando leitura',
    tom: 'warn',
    instrucao: 'Abra o WhatsApp no celular e leia o código na tela.',
  },
  conectada: {
    label: 'Conectada',
    tom: 'ok',
    instrucao: 'Recebendo e enviando normalmente.',
  },
  credenciada_offline: {
    label: 'Celular sem internet',
    tom: 'warn',
    instrucao: 'O número segue pareado. Assim que o celular voltar à internet, reconecta sozinho.',
  },
  erro: {
    label: 'Com erro',
    tom: 'dng',
    instrucao: 'O provedor recusou a conexão. Veja o detalhe e tente reconectar.',
  },
};

/** Os estados em que a instância consegue enviar mensagem. */
export const WA_STATUSES_OPERANTES: readonly WaInstanceStatus[] = ['conectada'];

/** Os que o monitor de saúde acompanha — pareados, operando ou não. */
export const WA_STATUSES_PAREADOS: readonly WaInstanceStatus[] = ['conectada', 'credenciada_offline'];

export function isWaInstanceStatus(v: string): v is WaInstanceStatus {
  return (WA_INSTANCE_STATUSES as readonly string[]).includes(v);
}

export function podeEnviar(status: string): boolean {
  return (WA_STATUSES_OPERANTES as readonly string[]).includes(status);
}

/**
 * Sem confirmação viva por mais que isto, o monitor rebaixa a instância.
 *
 * O sistema auditado não tinha monitor nenhum: o envio falhava para sempre e a
 * tela repetia "conectado" a cada trinta segundos, porque o status só era
 * escrito no momento em que alguém clicava em conectar.
 */
export const WA_SEM_SINAL_MINUTOS = 5;

/**
 * O QR code do provedor expira. A tela renova antes disso, senão o corretor
 * aponta a câmera para um código morto e conclui que o sistema não funciona.
 */
export const WA_QR_VALIDADE_SEGUNDOS = 20;

/**
 * Extrai o telefone de um identificador do provedor.
 *
 * A UAZAPI devolve o número como JID, no formato `554788886666:3`, onde o
 * sufixo é o aparelho. O corte no `:` precisa vir ANTES de limpar os
 * não-dígitos: na ordem inversa o `3` gruda no fim e vira um número com um
 * dígito a mais, que nunca abre conversa. Foi bug de produção na referência.
 *
 * O WhatsApp sempre entrega E.164 sem o `+`, então não há país a adivinhar nem
 * nono dígito a injetar.
 */
export function telefoneDoJid(jid: string | null | undefined): string | null {
  if (!jid) return null;
  const digitos = jid.split(':')[0]?.split('@')[0]?.replace(/\D/g, '') ?? '';
  return digitos.length >= 10 ? `+${digitos}` : null;
}

/**
 * Identificador anônimo do WhatsApp (`@lid`), que chega no lugar do telefone
 * quando o contato tem privacidade ativada.
 *
 * Quando é isso, a conversa nasce SEM lead e marcada como não identificada, e o
 * corretor vincula com um clique. Nada de adivinhação.
 *
 * O sistema auditado tinha três heurísticas de fusão — uma delas casava
 * "qualquer lead brasileiro recente". Com vários corretores atendendo ao mesmo
 * tempo, que é a operação normal de uma imobiliária, isso costura a conversa de
 * um cliente no lead de outro. Sob LGPD, isso é bem pior que uma conversa sem
 * dono.
 */
export function ehIdentificadorAnonimo(jid: string | null | undefined): boolean {
  if (!jid) return false;
  return jid.includes('@lid') || (jid.split(':')[0]?.replace(/\D/g, '').length ?? 0) > 13;
}
