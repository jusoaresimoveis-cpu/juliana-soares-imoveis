import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  RETOMADA_APOS_HORAS,
  RETOMADA_TOQUES_MAXIMO,
  PESO_DA_TEMPERATURA,
  TEMPERATURAS,
  podeRetomar,
  motivoDaRetomada,
} from '@contracts';
import { colunasDaTabela, definicaoDaFuncao, semComentarios } from '../../../supabase/testes/esquema';

/**
 * A FILA DE RETOMADA — a migração 140.
 *
 * O sexto item do método se chama "nutrição por temperatura". A medição mudou o
 * nome: de 187 leads ativos, 186 não têm qualificação nenhuma. Segmentar por
 * temperatura hoje seria ordenar uma fila por uma coluna vazia — então ela
 * entra como critério de ORDEM, e quem decide a entrada é o silêncio.
 *
 * Os dois números que desenharam isto, medidos em 24/09:
 *
 *   dos 645 retornos, 97,8% vieram no mesmo dia. Passado um dia, 2,2%;
 *   das 1.771 segundas mensagens sem resposta, 385 trouxeram o cliente: 21,7%.
 *
 * Esperar rende 2%, cutucar rende 22%. Estes testes seguram as duas pontas
 * disso — o número que abre a fila e o que a faz calar a boca.
 */

/**
 * O gatilho que mantém as duas colunas, na definição vigente e sem comentário.
 *
 * A 140 criou as colunas e reescreveu uma função só: `tg_lead_espera`, que já
 * cuidava da espera da casa e passou a cuidar do silêncio do cliente também.
 */
const gatilhoDaEspera = () => semComentarios(definicaoDaFuncao('tg_lead_espera').texto);

const horasAtras = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

describe('quem entra na fila', () => {
  it('só entra depois de um dia de silêncio', () => {
    // 97,8% dos retornos vêm no mesmo dia: antes disso, cutucar é atropelar
    // quem ainda ia responder sozinho.
    expect(RETOMADA_APOS_HORAS).toBe(24);
    expect(podeRetomar({ silencio_desde: horasAtras(2), toques_sem_resposta: 0 })).toBe(false);
    expect(podeRetomar({ silencio_desde: horasAtras(23), toques_sem_resposta: 0 })).toBe(false);
    expect(podeRetomar({ silencio_desde: horasAtras(25), toques_sem_resposta: 0 })).toBe(true);
  });

  it('e sai depois de três toques sem resposta', () => {
    /*
     * O freio. Insistir com quem não responde é o caminho mais curto para o
     * número ser denunciado — e um número denunciado leva junto os leads de
     * todo mundo.
     */
    expect(RETOMADA_TOQUES_MAXIMO).toBe(3);
    expect(podeRetomar({ silencio_desde: horasAtras(48), toques_sem_resposta: 2 })).toBe(true);
    expect(podeRetomar({ silencio_desde: horasAtras(48), toques_sem_resposta: 3 })).toBe(false);
    expect(podeRetomar({ silencio_desde: horasAtras(48), toques_sem_resposta: 9 })).toBe(false);
  });

  it('quem não está em silêncio nunca entra', () => {
    // Silêncio nulo quer dizer que a bola está com a CASA — esse lead é da
    // outra fila, a de "esperando resposta".
    expect(podeRetomar({ silencio_desde: null, toques_sem_resposta: 0 })).toBe(false);
  });
});

describe('a ordem da fila', () => {
  it('toda temperatura tem peso, e quente vem primeiro', () => {
    for (const t of TEMPERATURAS) expect(PESO_DA_TEMPERATURA[t], t).toBeTypeOf('number');
    expect(PESO_DA_TEMPERATURA.quente).toBeLessThan(PESO_DA_TEMPERATURA.morno);
    expect(PESO_DA_TEMPERATURA.morno).toBeLessThan(PESO_DA_TEMPERATURA.frio);
  });

  it('e quem não tem temperatura fica depois de quem tem', () => {
    /*
     * Hoje isso vale para 186 dos 187 leads. A ordem tem de funcionar com a
     * coluna vazia — senão a fila só começa a servir no dia em que a
     * qualificação encher.
     */
    const hook = readFileSync(join(__dirname, 'hooks', 'usePainel.ts'), 'utf8');
    const i = hook.indexOf('export function useParaRetomar');
    expect(i).toBeGreaterThan(0);
    const corpo = hook.slice(i, i + 3500);
    expect(corpo).toContain('PESO_DA_TEMPERATURA[a.temperatura] : 9');
    expect(corpo).toContain('b.silencio_desde.localeCompare(a.silencio_desde)');
  });
});

describe('a frase diz o fato, não a ordem', () => {
  it('conta há quanto tempo, e quantas vezes quando passou de uma', () => {
    expect(motivoDaRetomada(1.2, 1)).toBe('Sem resposta desde ontem');
    expect(motivoDaRetomada(9.7, 1)).toBe('Sem resposta há 9 dias');
    expect(motivoDaRetomada(9.7, 2)).toContain('2 mensagens nossas sem retorno');
  });

  it('e não manda ninguém fazer nada', () => {
    // Quem decide se vale a pena é quem conhece a conversa.
    for (const frase of [motivoDaRetomada(2, 1), motivoDaRetomada(30, 2)]) {
      expect(frase.toLowerCase()).not.toMatch(/ligue|mande|urgente|agora!/);
    }
  });
});

describe('as duas colunas do banco', () => {
  const sql = gatilhoDaEspera;

  it('existem, com o tipo certo', () => {
    // O silêncio é um INSTANTE (há quanto tempo), e os toques uma contagem que
    // nunca é nula — é ela que tira o lead da fila no terceiro.
    const colunas = colunasDaTabela('leads');
    expect(colunas.get('silencio_desde')).toMatch(/^(timestamptz|timestamp with time zone)\b/);
    expect(colunas.get('toques_sem_resposta')).toMatch(/^integer default 0 not null\b/);
  });

  it('o silêncio é do CLIENTE, e a espera é da casa — nunca os dois', () => {
    /*
     * `esperando_desde` (124) e `silencio_desde` (140) são os dois lados da
     * mesma conversa. Se os dois estivessem preenchidos ao mesmo tempo, os dois
     * cartões do painel mostrariam a mesma pessoa pedindo coisas opostas.
     */
    const t = sql();
    expect(t).toContain('silencio_desde = null');
    expect(t).toContain('toques_sem_resposta = 0');
    expect(t).toMatch(/set silencio_desde = greatest\(/);
  });

  it('o ROBÔ não conta como toque', () => {
    /*
     * A mesma guarda da 122 e da 124: a saudação automática não é atendimento.
     * No dia em que o agente de IA for ligado, ele encheria a contagem de
     * toques e calaria a fila sem ninguém ter falado com ninguém.
     */
    const t = sql();
    const i = t.indexOf('elsif not new.automatica then');
    expect(i).toBeGreaterThan(0);
    expect(t.slice(i)).toContain('toques_sem_resposta = toques_sem_resposta + 1');
  });

  it('e mensagem fora de ordem não apaga silêncio mais novo', () => {
    // A lição da 124: mensagem chega fora de ordem quando o processamento fica
    // parado, e sem guarda uma mensagem atrasada reescreve o presente.
    const t = sql();
    expect(t).toContain('silencio_desde is null or silencio_desde <= new.occurred_at');
    expect(t).toContain('esperando_desde is null or esperando_desde > new.occurred_at');
  });
});

describe('a fila não manda mensagem', () => {
  it('o gatilho da fila não enfileira nem dispara nada', () => {
    /*
     * A regra do projeto inteiro, e ela vale em dobro aqui: esta fila, por
     * definição, fala com quem não respondeu. Número que dispara sozinho é
     * número bloqueado.
     */
    const t = gatilhoDaEspera();
    expect(t).not.toContain('enfileirar_mensagem');
    expect(t).not.toContain('whatsapp_outbox');
    expect(t).not.toContain('net.http_post');
  });

  it('e o painel só leva à ficha', () => {
    const painel = readFileSync(join(__dirname, 'pages', 'Dashboard.tsx'), 'utf8');
    const i = painel.indexOf('Para retomar');
    expect(i).toBeGreaterThan(0);
    const cartao = painel.slice(i, i + 2600);
    expect(cartao).toContain('to={`/leads/${lead.id}`}');
    expect(cartao).not.toContain('wa.me');
  });
});
