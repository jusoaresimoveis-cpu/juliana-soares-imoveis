import { describe, expect, it } from 'vitest';
import {
  instanteDaParede,
  paredeNoFuso,
  parseReminderHint,
  resolverPreset,
  REMINDER_PRESETS,
  REMINDER_STATUSES,
} from './reminders';
import {
  colunasDaTabela,
  definicaoDaFuncao,
  restricoesDaTabela,
  semComentarios,
  valoresDoCheck as valoresDoCheckAtual,
} from '../../../supabase/testes/esquema';
import { exigir } from '../../../supabase/testes/exigir';

const SP = 'America/Sao_Paulo';

/** 10/08/2026 (segunda) às 14:00 em São Paulo. */
const SEGUNDA_14H = new Date('2026-08-10T17:00:00Z');
/** Mesma segunda, às 19:00 — depois das 18h. */
const SEGUNDA_19H = new Date('2026-08-10T22:00:00Z');

/** Formata um instante como parede de São Paulo, para asserção legível. */
const parede = (d: Date) => {
  const p = paredeNoFuso(d, SP);
  const z = (n: number) => String(n).padStart(2, '0');
  return `${z(p.dia)}/${z(p.mes)} ${z(p.hora)}:${z(p.minuto)}`;
};

describe('parede e instante', () => {
  it('a ida e a volta fecham', () => {
    const i = instanteDaParede(2026, 8, 10, 18, 30, SP);
    expect(parede(i)).toBe('10/08 18:30');
    expect(i.toISOString()).toBe('2026-08-10T21:30:00.000Z');
  });

  it('o dia que estoura o mês normaliza', () => {
    // dia 30 + 3 = 2 de setembro, e não "33 de agosto"
    expect(parede(instanteDaParede(2026, 8, 33, 9, 0, SP))).toBe('02/09 09:00');
  });

  it('domingo é 0, igual ao Postgres e ao JavaScript', () => {
    expect(paredeNoFuso(new Date('2026-08-09T15:00:00Z'), SP).dow).toBe(0);
    expect(paredeNoFuso(SEGUNDA_14H, SP).dow).toBe(1);
  });

  it('o fuso do usuário não contamina o resultado', () => {
    // Mesmo instante lido em dois fusos dá paredes diferentes — é o ponto de
    // ancorar em organizations.timezone e não no navegador do corretor.
    const i = new Date('2026-08-10T23:30:00Z');
    expect(paredeNoFuso(i, SP).dia).toBe(10);
    expect(paredeNoFuso(i, 'America/Santiago').dia).toBe(10);
    expect(paredeNoFuso(i, 'UTC').dia).toBe(10);
    expect(paredeNoFuso(i, 'Asia/Tokyo').dia).toBe(11);
  });
});

describe('atalhos', () => {
  it('"Hoje às 18h" às 14h marca para hoje', () => {
    const p = exigir(REMINDER_PRESETS.find((x) => x.key === 'hoje_18h'));
    expect(parede(resolverPreset(p, SEGUNDA_14H, SP))).toBe('10/08 18:00');
  });

  it('"Hoje às 18h" às 19h vira amanhã, não um lembrete já vencido', () => {
    const p = exigir(REMINDER_PRESETS.find((x) => x.key === 'hoje_18h'));
    expect(parede(resolverPreset(p, SEGUNDA_19H, SP))).toBe('11/08 18:00');
  });

  it('"Segunda às 9h" numa segunda aponta para a próxima', () => {
    const p = exigir(REMINDER_PRESETS.find((x) => x.key === 'proxima_seg'));
    expect(parede(resolverPreset(p, SEGUNDA_14H, SP))).toBe('17/08 09:00');
  });

  it('todo atalho cai no futuro', () => {
    REMINDER_PRESETS.forEach((p) => {
      expect(resolverPreset(p, SEGUNDA_14H, SP).getTime(), p.key).toBeGreaterThan(
        SEGUNDA_14H.getTime(),
      );
    });
  });
});

describe('da frase para a sugestão', () => {
  const dica = (txt: string, agora = SEGUNDA_14H) => parseReminderHint(txt, agora, SP);

  it('reconhece o caso que originou o recurso', () => {
    const d = dica('Cliente pediu para retornar depois das 18h');
    expect(d).not.toBeNull();
    expect(parede(exigir(d).remindAt)).toBe('10/08 18:00');
  });

  it('minuto explícito sobrevive', () => {
    expect(parede(exigir(dica('retornar 18h30')).remindAt)).toBe('10/08 18:30');
    expect(parede(exigir(dica('ligar as 9:45')).remindAt)).toBe('11/08 09:45');
  });

  it('hora que já passou hoje empurra para amanhã', () => {
    expect(parede(exigir(dica('me lembra as 9h')).remindAt)).toBe('11/08 09:00');
  });

  it('período sem hora vira convenção, com confiança média', () => {
    const d = exigir(dica('ligar amanhã de manhã'));
    expect(parede(d.remindAt)).toBe('11/08 09:00');
    expect(d.confianca).toBe('media');
  });

  it('dia e hora juntos dão confiança alta', () => {
    const d = exigir(dica('retornar amanhã às 15h'));
    expect(parede(d.remindAt)).toBe('11/08 15:00');
    expect(d.confianca).toBe('alta');
  });

  it('dia da semana pelo nome', () => {
    expect(parede(exigir(dica('visita na quarta às 10h')).remindAt)).toBe('12/08 10:00');
    expect(parede(exigir(dica('retornar sexta-feira')).remindAt)).toBe('14/08 09:00');
  });

  it('contagem de dias', () => {
    expect(parede(exigir(dica('me cobra daqui a 3 dias')).remindAt)).toBe('13/08 09:00');
  });

  it('depois de amanhã não é confundido com amanhã', () => {
    expect(parede(exigir(dica('retornar depois de amanhã às 11h')).remindAt)).toBe('12/08 11:00');
  });

  it('anotação sem intenção de horário não vira lembrete', () => {
    expect(dica('Cliente gostou do apartamento e vai conversar com a esposa')).toBeNull();
    expect(dica('Achou o valor do condomínio alto')).toBeNull();
  });

  it('nunca devolve instante no passado', () => {
    const d = dica('era pra ter ligado hoje as 9h');
    if (d) expect(d.remindAt.getTime()).toBeGreaterThan(SEGUNDA_14H.getTime());
  });
});

describe('a dica distingue o que veio da frase do que foi convenção', () => {
  const dica = (txt: string) => exigir(parseReminderHint(txt, SEGUNDA_14H, SP));

  it('hora dita, dia inferido — o caso que originou o recurso', () => {
    const d = dica('Cliente pediu para retornar depois das 18h');
    expect(d.horaExplicita).toBe(true);
    expect(d.diaExplicito).toBe(false);
    // A tela dizia "não havia hora exata" para esta frase, que diz 18h.
  });

  it('dia dito, hora inferida', () => {
    const d = dica('ligar amanhã');
    expect(d.horaExplicita).toBe(false);
    expect(d.diaExplicito).toBe(true);
  });

  it('os dois ditos', () => {
    const d = dica('retornar amanhã às 15h');
    expect(d.horaExplicita).toBe(true);
    expect(d.diaExplicito).toBe(true);
    expect(d.confianca).toBe('alta');
  });
});

/** A definição vigente de uma função, sem comentário. */
const funcao = (nome: string) => semComentarios(definicaoDaFuncao(nome).texto);

describe('lembretes', () => {
  it('os status batem com o CHECK', () => {
    expect(valoresDoCheckAtual('lead_reminders_status_ck')).toEqual([...REMINDER_STATUSES].sort());
  });

  it('a varredura olha para trás, nunca para uma janela futura', () => {
    // A origem usava `between now+5min and now+15min`: três horas fora do ar e
    // o lembrete não casava mais com filtro nenhum, ficando pendente para
    // sempre, sem erro em lugar algum.
    const varredura = funcao('run_due_reminders');
    expect(varredura).toMatch(/remind_at <= now\(\)/);
    expect(varredura).not.toMatch(/remind_at\s+between/i);
  });

  it('o lembrete é reservado antes de ser notificado', () => {
    expect(funcao('run_due_reminders')).toMatch(/for update skip locked/);
  });

  it('o lembrete é de uma pessoa, não do plantão', () => {
    // À mão, `assigned_to uuid not null references public.profiles`; o pg_dump
    // separa a referência numa restrição da tabela.
    const coluna = colunasDaTabela('lead_reminders').get('assigned_to') ?? '';
    expect(coluna).toMatch(/^uuid not null\b/);
    const referencia =
      /references public\.profiles\b/.test(coluna) ||
      restricoesDaTabela('lead_reminders').some((r) =>
        /^foreign key \(assigned_to\) references public\.profiles\b/.test(r.definicao),
      );
    expect(referencia, 'assigned_to deixou de apontar para profiles').toBe(true);
  });
});
