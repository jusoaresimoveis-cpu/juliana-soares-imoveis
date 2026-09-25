import { describe, expect, it } from 'vitest';
import { NOTIFICATION_TYPES, NOTIFICATION_META, TOCA_NO_CELULAR } from '@contracts';
import { definicaoDaFuncao, semComentarios } from '../../../supabase/testes/esquema';

/**
 * O SINO — a migração 151.
 *
 * A medição de 24/09 foi ver se as filas dos itens 3 e 6 estavam sendo
 * trabalhadas. Não estavam, e o motivo apareceu inteiro:
 *
 *   1.540 notificações criadas em toda a história do CRM, **6 lidas**;
 *   em 14 dias, 263 "mensagem recebida" e 172 "lead novo" contra 22
 *   "lead esperando" — o único que pede ação e não tem outro caminho;
 *   60 leads esperando resposta, 39 deles há mais de sete dias.
 *
 * E não era falta de trabalho: no mesmo dia a casa mandou 636 mensagens em 309
 * conversas, respondendo em 2,4 minutos dentro das conversas vivas. A equipe é
 * rápida com quem fala agora e nunca volta para quem ficou.
 *
 * Um sino que avisa de tudo não avisa de nada. Estes testes seguram a regra que
 * sobrou: toca o que a pessoa não descobriria de outro jeito.
 */

/**
 * SÓ O CORPO DO GATILHO, e o recorte é o próprio teste.
 *
 * A migração inteira também citava `lead_novo` — no bloco que marcou os
 * redundantes como lidos. Ler mais que a função faria a comparação com o
 * contrato dizer que ele toca, que é o contrário do que ele faz.
 */
const gatilho = () => semComentarios(definicaoDaFuncao('tg_enfileirar_push').texto);

describe('o que toca no celular', () => {
  it('todo tipo de aviso tem uma decisão — nenhum herda um padrão', () => {
    /*
     * O mapa é FECHADO de propósito. Um aviso novo que nascesse tocando
     * voltaria a encher o aparelho sem ninguém ter escolhido isso; um que
     * nascesse calado esconderia algo importante em silêncio. Aqui ele não
     * nasce: o teste falha até alguém decidir.
     */
    for (const t of NOTIFICATION_TYPES) {
      expect(TOCA_NO_CELULAR[t], t).toBeTypeOf('boolean');
    }
    expect(Object.keys(TOCA_NO_CELULAR).sort()).toEqual([...NOTIFICATION_TYPES].sort());
  });

  it('e o banco toca exatamente os mesmos que o contrato', () => {
    /*
     * Duas listas que divergem produzem o pior defeito possível aqui: a tela
     * promete um toque que nunca sai, ou sai um toque que a tela diz não
     * existir. Nenhum dos dois aparece em erro nenhum.
     */
    const t = gatilho();
    for (const tipo of NOTIFICATION_TYPES) {
      const noSql = t.includes(`'${tipo}'`);
      expect(noSql, `${tipo}: contrato diz ${TOCA_NO_CELULAR[tipo]}, SQL ${noSql}`).toBe(
        TOCA_NO_CELULAR[tipo],
      );
    }
  });

  it('e é lista de PERMISSÃO, não de bloqueio', () => {
    // Com bloqueio, o tipo novo nasce tocando. A medição inteira desta migração
    // é sobre o que acontece quando o aparelho toca demais.
    expect(gatilho()).toContain('not in (');
    expect(gatilho()).toContain('return new;');
  });
});

describe('a regra: toca o que não tem outro caminho', () => {
  it('o silêncio do cliente toca — ele não existe em lugar nenhum', () => {
    /*
     * O WhatsApp não tem tela de "ninguém voltou para essa pessoa há três
     * horas". É a única coisa que o CRM sabe e o aparelho não.
     */
    expect(TOCA_NO_CELULAR.lead_esperando).toBe(true);
    expect(TOCA_NO_CELULAR.lembrete).toBe(true);
    expect(TOCA_NO_CELULAR.visita_proxima).toBe(true);
    expect(TOCA_NO_CELULAR.lead_atribuido).toBe(true);
  });

  it('e o que já chegou pelo WhatsApp não toca de novo', () => {
    /*
     * A primeira mensagem do cliente cai no WhatsApp DA PESSOA, no mesmo
     * aparelho, dois segundos antes. Eram 435 dos 461 avisos de 14 dias.
     */
    expect(TOCA_NO_CELULAR.lead_novo).toBe(false);
    expect(TOCA_NO_CELULAR.mensagem_recebida).toBe(false);
  });

  it('e o número caído toca, porque o lead evapora na entrada', () => {
    // A lição da 112: um número caiu às 22h31 e ninguém soube por 17 horas,
    // com a campanha comprando lead o tempo todo.
    expect(TOCA_NO_CELULAR.whatsapp_fora).toBe(true);
  });
});

describe('o que a limpeza NÃO faz', () => {
  it('e não tira ninguém do sino — só do toque', () => {
    /*
     * A lista dentro do CRM segue completa. Cortar a lista seria apagar
     * histórico; cortar o toque é devolver significado a ele.
     */
    const t = gatilho();
    expect(t).not.toContain('delete');
    for (const tipo of NOTIFICATION_TYPES) expect(NOTIFICATION_META[tipo].label).toBeTruthy();
  });

  it('e a preferência de cada pessoa continua valendo por cima', () => {
    // Quem desligou o push continua sem push, mesmo nos tipos que tocam.
    expect(gatilho()).toContain('coalesce(p.push_enabled, true)');
  });
});
