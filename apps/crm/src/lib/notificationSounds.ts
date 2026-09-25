import type { NotificationSound } from '@contracts';

/**
 * Sons de notificação sintetizados na hora, via Web Audio.
 *
 * Portado do CRM imobiliário v1, que resolveu isto bem: zero arquivo de áudio,
 * zero hospedagem, nada para carregar antes de tocar. O desenho dos timbres
 * também veio de lá e é deliberadamente do ramo — lead é arpejo ascendente
 * ("dinheiro entrando"), mensagem é um blip discreto porque acontece o tempo
 * todo e não pode incomodar.
 *
 * O que NÃO veio junto foi o `resolveSoundType`, que mapeava dezenas de nomes
 * de tipo por `switch` e terminava em `default: return "message"`. É o mesmo
 * defeito que a auditoria encontrou no outro CRM: tipo que ninguém previu cai
 * no som genérico sem erro nenhum. Aqui o som sai de NOTIFICATION_META, no
 * contrato, e o teste exige que todo tipo tenha um som conhecido.
 */

const CHAVE_PREFERENCIA = 'sc_som_notificacao';

let ctx: AudioContext | null = null;

function contexto(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    try {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
    } catch {
      return null;
    }
  }
  // O Safari suspende o contexto quando a aba perde o foco.
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

/** Uma nota com envelope, para não estalar no ataque nem cortar seco no fim. */
function nota(
  freq: number,
  duracao: number,
  atraso = 0,
  tipo: OscillatorType = 'sine',
  pico = 0.18,
) {
  const c = contexto();
  if (!c) return;
  const t = c.currentTime + atraso;

  const osc = c.createOscillator();
  const ganho = c.createGain();

  osc.type = tipo;
  osc.frequency.value = freq;

  ganho.gain.setValueAtTime(0, t);
  ganho.gain.linearRampToValueAtTime(pico, t + 0.005);
  ganho.gain.exponentialRampToValueAtTime(pico * 0.4, t + duracao * 0.3);
  ganho.gain.exponentialRampToValueAtTime(0.001, t + duracao);

  osc.connect(ganho);
  ganho.connect(c.destination);
  osc.start(t);
  osc.stop(t + duracao);
}

const TOQUES: Record<NotificationSound, () => void> = {
  // Blip curto e ascendente. Evento frequente: tem que ser leve.
  mensagem: () => {
    nota(784, 0.07, 0.0, 'sine', 0.12);
    nota(988, 0.11, 0.07, 'sine', 0.13);
  },
  // Arpejo maior com brilho no fim. É o som de oportunidade entrando.
  lead: () => {
    nota(523, 0.12, 0.0, 'sine', 0.16);
    nota(659, 0.12, 0.1, 'sine', 0.17);
    nota(784, 0.14, 0.2, 'sine', 0.18);
    nota(1047, 0.3, 0.31, 'triangle', 0.15);
  },
  // Batida quente, tipo marimba: calma mas presente. "Hora de ligar."
  lembrete: () => {
    nota(440, 0.16, 0.0, 'triangle', 0.18);
    nota(587, 0.26, 0.15, 'triangle', 0.18);
  },
  // Três batidas firmes. Algo pede atenção agora.
  alerta: () => {
    nota(659, 0.13, 0.0, 'triangle', 0.2);
    nota(659, 0.13, 0.17, 'triangle', 0.2);
    nota(523, 0.22, 0.34, 'triangle', 0.2);
  },
};

/**
 * Freio contra rajada.
 *
 * Uma campanha despejando dez leads em três segundos tocaria dez arpejos por
 * cima um do outro. Por tipo, e não global, para que um lead no meio de uma
 * conversa ainda se anuncie.
 */
const ULTIMO: Record<NotificationSound, number> = { mensagem: 0, lead: 0, lembrete: 0, alerta: 0 };
const FREIO_MS = 800;

export function tocar(som: NotificationSound) {
  if (typeof window === 'undefined' || !somLigado()) return;

  const agora = Date.now();
  if (agora - ULTIMO[som] < FREIO_MS) return;
  ULTIMO[som] = agora;

  try {
    TOQUES[som]();
  } catch {
    // Som é enfeite: falhar aqui nunca pode derrubar a notificação em si.
  }
}

/** Para os botões de teste: ignora o mudo e o freio, senão o botão parece quebrado. */
export function ouvir(som: NotificationSound) {
  try {
    TOQUES[som]();
  } catch {
    /* idem */
  }
}

/**
 * A preferência de som vive no APARELHO, não no banco.
 *
 * No CRM auditado havia uma coluna `sound_enabled` que era gravada e nunca
 * lida: desligar o som no notebook não desligava no celular, e a tela dizia que
 * sim. Som é característica de onde a pessoa está — sala silenciosa, carro,
 * plantão —, não da conta dela.
 */
export function somLigado(): boolean {
  if (typeof window === 'undefined') return true;
  return localStorage.getItem(CHAVE_PREFERENCIA) !== 'false';
}

export function definirSom(ligado: boolean) {
  localStorage.setItem(CHAVE_PREFERENCIA, String(ligado));
}
