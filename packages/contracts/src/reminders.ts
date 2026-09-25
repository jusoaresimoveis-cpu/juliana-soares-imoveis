/**
 * Lembretes.
 *
 * "Cliente pediu para retornar depois das 18h" é anotação hoje e precisa virar
 * alerta no futuro. Dos três casos de notificação, é o único sem implementação
 * de referência para copiar: no CRM auditado, tarefa vencida vira linha numa
 * tabela e fica esperando alguém abrir a tela.
 *
 * Tudo aqui é função pura, testada sem tocar no banco.
 */

export const REMINDER_STATUSES = ['pendente', 'notificado', 'concluido', 'cancelado'] as const;

export type ReminderStatus = (typeof REMINDER_STATUSES)[number];

export const REMINDER_STATUS_LABEL: Record<ReminderStatus, string> = {
  pendente: 'Pendente',
  notificado: 'Avisado',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
};

/** Quanto tempo o botão "adiar" empurra, em minutos. */
export const SNOOZE_OPCOES = [15, 60, 180, 1440] as const;

// -----------------------------------------------------------------------------
// Parede e instante
// -----------------------------------------------------------------------------

/**
 * "18h" não é um instante — é uma posição no relógio de parede de alguém.
 *
 * O banco guarda `timestamptz`, que é instante. A conversão entre os dois
 * precisa do fuso da imobiliária (`organizations.timezone`), nunca do fuso do
 * navegador: o corretor pode estar viajando e o cliente continua em São Paulo.
 */
export interface ParedeNoFuso {
  ano: number;
  mes: number; // 1-12
  dia: number;
  hora: number;
  minuto: number;
  dow: number; // 0 = domingo, igual a Date#getDay e a extract(dow) do Postgres
}

export function paredeNoFuso(instante: Date, tz: string): ParedeNoFuso {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    weekday: 'short',
  }).formatToParts(instante);

  const pega = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? '0';
  const DOW: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

  return {
    ano: Number(pega('year')),
    mes: Number(pega('month')),
    dia: Number(pega('day')),
    hora: Number(pega('hour')),
    minuto: Number(pega('minute')),
    dow: DOW[pega('weekday')] ?? 0,
  };
}

/**
 * O caminho de volta: parede → instante.
 *
 * Duas passadas porque a primeira corrige o grosso do desvio e a segunda pega a
 * mudança de desvio quando a data cai do outro lado de uma virada de horário de
 * verão. O Brasil não tem mais desde 2019, mas Argentina e Chile — os países das
 * landing pages — têm.
 */
export function instanteDaParede(
  ano: number,
  mes: number,
  dia: number,
  hora: number,
  minuto: number,
  tz: string,
): Date {
  const alvo = Date.UTC(ano, mes - 1, dia, hora, minuto, 0, 0);
  let ms = alvo;
  for (let i = 0; i < 2; i++) {
    const p = paredeNoFuso(new Date(ms), tz);
    const produzido = Date.UTC(p.ano, p.mes - 1, p.dia, p.hora, p.minuto, 0, 0);
    const desvio = alvo - produzido;
    if (desvio === 0) break;
    ms += desvio;
  }
  return new Date(ms);
}

// -----------------------------------------------------------------------------
// Atalhos
// -----------------------------------------------------------------------------

export interface ReminderPreset {
  key: string;
  label: string;
  dias?: number;
  proximoDow?: number;
  hora: number;
}

export const REMINDER_PRESETS: readonly ReminderPreset[] = [
  { key: 'hoje_18h', label: 'Hoje às 18h', dias: 0, hora: 18 },
  { key: 'amanha_9h', label: 'Amanhã às 9h', dias: 1, hora: 9 },
  { key: 'amanha_18h', label: 'Amanhã às 18h', dias: 1, hora: 18 },
  { key: 'em_2_dias', label: 'Em 2 dias', dias: 2, hora: 9 },
  { key: 'proxima_seg', label: 'Segunda às 9h', proximoDow: 1, hora: 9 },
];

export function resolverPreset(preset: ReminderPreset, agora: Date, tz: string): Date {
  const p = paredeNoFuso(agora, tz);

  let deslocamento = preset.dias ?? 0;
  if (preset.proximoDow !== undefined) {
    deslocamento = (preset.proximoDow - p.dow + 7) % 7;
    if (deslocamento === 0) deslocamento = 7; // "segunda" numa segunda é a próxima
  }

  const alvo = instanteDaParede(p.ano, p.mes, p.dia + deslocamento, preset.hora, 0, tz);

  // "Hoje às 18h" pedido às 19h vira amanhã. Criar lembrete já vencido é
  // notificar na mesma hora, que não é o que a pessoa quis dizer.
  if (alvo <= agora && preset.proximoDow === undefined) {
    return instanteDaParede(p.ano, p.mes, p.dia + deslocamento + 1, preset.hora, 0, tz);
  }
  return alvo;
}

// -----------------------------------------------------------------------------
// Da frase para a sugestão
// -----------------------------------------------------------------------------

export interface DicaDeLembrete {
  remindAt: Date;
  trecho: string;
  confianca: 'alta' | 'media';
  /**
   * O que veio da frase e o que foi convenção nossa.
   *
   * São duas incertezas diferentes e a tela precisa saber qual aconteceu.
   * "Retornar depois das 18h" tem hora exata e dia inferido; "ligar amanhã"
   * tem o oposto. Enquanto isso era um único `confianca`, a tela dizia "não
   * havia hora exata" para uma frase que dizia 18h — ou seja, o aviso mentia
   * justamente no caso que originou o recurso.
   */
  horaExplicita: boolean;
  diaExplicito: boolean;
}

const semAcento = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const DIAS_SEMANA: Record<string, number> = {
  domingo: 0,
  segunda: 1,
  terca: 2,
  quarta: 3,
  quinta: 4,
  sexta: 5,
  sabado: 6,
};

/** Quando a pessoa diz o período mas não a hora. */
const PERIODOS: Array<{ re: RegExp; hora: number }> = [
  { re: /\bde manha|\bpela manha|\bde manhazinha/, hora: 9 },
  { re: /\ba tarde|\bde tarde|\bpela tarde/, hora: 14 },
  { re: /\ba noite|\bde noite|\bpela noite/, hora: 19 },
];

/**
 * Reconhece intenção de horário numa anotação livre.
 *
 * O que ela faz: devolve uma sugestão para a tela abrir o diálogo já
 * preenchido, com o trecho reconhecido destacado.
 *
 * O que ela NUNCA faz: criar o lembrete sozinha. Um lembrete errado nascido de
 * adivinhação de texto ensina o corretor a ignorar o sino — e aí lead novo e
 * mensagem morrem junto, porque o sino é um só.
 */
export function parseReminderHint(texto: string, agora: Date, tz: string): DicaDeLembrete | null {
  const t = semAcento(texto);
  const agoraP = paredeNoFuso(agora, tz);

  let hora: number | null = null;
  let minuto = 0;
  let trecho = '';
  let explicitaHora = false;

  // 18h, 18h30, 18:30, "as 18", "depois das 18"
  const mHora = /(?:as|às|depois das|apos as|por volta das|umas)?\s*(\d{1,2})\s*(?:h|:)\s*(\d{2})?/.exec(t);
  if (mHora && mHora[1]) {
    const h = Number(mHora[1]);
    if (h >= 0 && h <= 23) {
      hora = h;
      minuto = mHora[2] ? Number(mHora[2]) : 0;
      trecho = mHora[0].trim();
      explicitaHora = true;
    }
  }

  if (hora === null) {
    for (const p of PERIODOS) {
      const m = p.re.exec(t);
      if (m) {
        hora = p.hora;
        trecho = m[0].trim();
        break;
      }
    }
  }

  // Que dia
  let deslocamento: number | null = null;
  let trechoDia = '';

  if (/\bdepois de amanha\b/.test(t)) {
    deslocamento = 2;
    trechoDia = 'depois de amanhã';
  } else if (/\bamanha\b/.test(t)) {
    deslocamento = 1;
    trechoDia = 'amanhã';
  } else if (/\bhoje\b/.test(t)) {
    deslocamento = 0;
    trechoDia = 'hoje';
  } else {
    const mDias = /\b(?:daqui a|em)\s+(\d{1,2})\s+dias?\b/.exec(t);
    if (mDias && mDias[1]) {
      deslocamento = Number(mDias[1]);
      trechoDia = mDias[0];
    } else {
      for (const [nome, dow] of Object.entries(DIAS_SEMANA)) {
        if (new RegExp(`\\b(?:na |proxima |proximo )?${nome}(?:-feira)?\\b`).test(t)) {
          deslocamento = (dow - agoraP.dow + 7) % 7 || 7;
          trechoDia = nome;
          break;
        }
      }
    }
  }

  if (hora === null && deslocamento === null) return null;

  // Faltando a hora, o padrão é comercial. Faltando o dia, é hoje — e se já
  // passou, amanhã.
  const horaFinal = hora ?? 9;
  let dias = deslocamento ?? 0;

  let alvo = instanteDaParede(agoraP.ano, agoraP.mes, agoraP.dia + dias, horaFinal, minuto, tz);
  if (alvo <= agora && deslocamento === null) {
    dias = 1;
    alvo = instanteDaParede(agoraP.ano, agoraP.mes, agoraP.dia + 1, horaFinal, minuto, tz);
  }

  // Passou mesmo com dia explícito ("hoje às 9h" pedido às 15h): não inventa.
  if (alvo <= agora) return null;

  const partes = [trechoDia, trecho].filter(Boolean);
  return {
    remindAt: alvo,
    trecho: partes.join(' ') || trecho || trechoDia,
    // Alta só quando a frase trouxe as duas metades. Faltando qualquer uma,
    // algo foi convenção nossa e a tela tem de dizer o quê.
    confianca: explicitaHora && deslocamento !== null ? 'alta' : 'media',
    horaExplicita: explicitaHora,
    diaExplicito: deslocamento !== null,
  };
}
