import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_STAGES } from '@contracts';
import { CADEIA_MINIMO_PARA_LER, aproveitamentoDaConversa } from '@/inteligencia';
import {
  definicaoDaFuncao,
  executoresDaFuncao,
  semComentarios,
} from '../../../supabase/testes/esquema';

/**
 * A CADEIA INTEIRA, POR ANÚNCIO — a migração 150.
 *
 * A última linha da tabela do método que estava pela metade: "painel da cadeia
 * inteira — por campanha; falta por anúncio e por ângulo". O ângulo entrou na
 * 134; aqui entra o anúncio, e a cadeia passa a DESCER.
 *
 * O que a medição de 24/09 mostrou, e que a tela agora mostra todo dia:
 *
 *   Aurora 2 ....... R$ 227 → 25 leads → 0 visitas   (o mais barato da conta)
 *   CHILE .......... R$ 412 → 12 leads → 1 visita
 *   Aurora BRANCO .. R$ 544 → 16 leads → 0 visitas
 *
 * E o número que não existia em tela nenhuma: a Meta contou 288 conversas no
 * mês e o CRM fez 154 fichas.
 */

/** A definição vigente da função, sem comentário — só ela, e não o arquivo. */
const fn = () => semComentarios(definicaoDaFuncao('mkt_cadeia_por_anuncio').texto);
const tela = () =>
  readFileSync(join(__dirname, 'components', 'inteligencia', 'Cadeia.tsx'), 'utf8');

describe('a cadeia é uma coorte, não uma janela de eventos', () => {
  it('conta os leads NASCIDOS no período e onde eles chegaram até hoje', () => {
    /*
     * Se as colunas de baixo contassem eventos dentro da janela, a cadeia não
     * fecharia: um lead de setembro que visita em outubro sumiria das duas
     * pontas — não apareceria como lead de outubro nem como visita de setembro.
     */
    const t = fn();
    expect(t).toContain('le.created_at >= v_ini and le.created_at < v_fim');
    expect(t).toContain('le.furthest_position >= d.position');
  });

  it('e usa furthest_position, não a etapa atual', () => {
    /*
     * A lição da 070. A pergunta é "chegou a marcar visita?", não "está parado
     * em visita?". Quem visitou e depois foi perdido visitou do mesmo jeito, e
     * o anúncio merece o crédito — senão o melhor anúncio da casa fica com
     * zero porque os leads dele avançaram.
     */
    const t = fn();
    expect(t).toContain('furthest_position');
    expect(t).not.toMatch(/join public\.pipeline_stages\s+\w+\s+on\s+\w+\.id = le\.stage_id/);
  });

  it('e a contagem de leads não é multiplicada pelos degraus', () => {
    /*
     * O defeito que o primeiro rascunho tinha: `cross join degraus` DENTRO do
     * mesmo agregado que conta leads faria `count(*)` devolver lead × degrau —
     * cinco vezes mais leads do que existem, num número que decide verba.
     *
     * A separação em duas CTEs é a correção, e este teste é o que impede a
     * "simplificação" que junta as duas de novo.
     */
    const t = fn();
    const iVindos = t.indexOf('vindos as (');
    const iPassos = t.indexOf('passos as (');
    expect(iVindos).toBeGreaterThan(0);
    expect(iPassos).toBeGreaterThan(iVindos);
    expect(t.slice(iVindos, iPassos)).not.toContain('cross join degraus');
    expect(t.slice(iPassos)).toContain('cross join degraus');
  });
});

describe('os degraus vêm do banco, não de uma lista escrita', () => {
  it('a função lê pipeline_stages e descarta perda e a primeira posição', () => {
    /*
     * O funil é editável por desenho — a `pipeline_stages` existe para o
     * cliente mexer sem migração. Uma lista fixa faria a tela parar de enxergar
     * a etapa nova no dia em que alguém a criasse, em silêncio.
     */
    const t = fn();
    const i = t.indexOf('degraus as (');
    expect(i).toBeGreaterThan(0);
    const bloco = t.slice(i, i + 400);
    expect(bloco).toContain('from public.pipeline_stages');
    expect(bloco).toContain('not s.is_lost');
    expect(bloco).toContain('s.position > 1');
  });

  it('e nenhuma chave de etapa está escrita à mão na função', () => {
    // Nem 'visita_agendada', nem 'proposta'. A função não conhece o funil dela.
    const t = fn();
    for (const s of DEFAULT_STAGES) expect(t, s.key).not.toContain(`'${s.key}'`);
  });

  it('e a tela desenha uma coluna por degrau que o banco devolveu', () => {
    const t = tela();
    expect(t).toContain('degraus.map');
    expect(t).toContain('a.passos?.[d.key]');
  });
});

describe('a porta e o período', () => {
  it('verba é assunto de quem manda — mesma porta da mkt_inteligencia', () => {
    const t = fn();
    expect(t).toContain('public.e_admin(v_org)');
    // O `revoke ... from public, anon, authenticated` seguido de `grant execute
    // ... to authenticated`, lido como ficou: a tela chama; anon e PUBLIC, não.
    const quem = executoresDaFuncao('mkt_cadeia_por_anuncio');
    expect(quem).toContain('authenticated');
    expect(quem).not.toContain('anon');
    expect(quem).not.toContain('PUBLIC');
  });

  it('e o dia é o da imobiliária, não o do banco', () => {
    // A lição da 118: o cron e o banco vivem em UTC, e o relatório do dia tem
    // de fechar no fuso de quem vende.
    const t = fn();
    expect(t).toContain('public.fuso_da_org(v_org)');
    expect(t).toContain('public.inicio_do_dia(');
  });

  it('e anúncio excluído do painel continua excluído aqui', () => {
    const t = fn();
    expect(t.match(/meta_fora_do_painel_anuncios/g)?.length).toBeGreaterThanOrEqual(3);
  });
});

describe('o que a tabela mostra e o que ela recusa mostrar', () => {
  it('a distância entre conversa e ficha, que não existe em outra tela', () => {
    /*
     * A Meta conta conversa aberta; o CRM conta ficha com origem provada.
     * Medido: 288 contra 154. Quase metade não vira nada — e isso aparece
     * ANTES do custo por lead, que é onde a decisão costuma parar.
     */
    expect(aproveitamentoDaConversa({ conversas: 288, leads: 154 })).toBeCloseTo(0.534, 2);
    expect(tela()).toContain('aproveitamentoDaConversa');
  });

  it('e não divide por zero quando a Meta não reportou conversa', () => {
    // `Infinity` na tela vira "∞%" e parece defeito do sistema.
    expect(aproveitamentoDaConversa({ conversas: 0, leads: 3 })).toBeNull();
  });

  it('e avisa que o zero pode ser falta de registro, não falta de visita', () => {
    /*
     * Sem esta frase, "zero visitas" parece defeito da tela — e quem olha volta
     * a decidir pelo custo por lead, que é exatamente o que esta tabela existe
     * para questionar. O funil de baixo está vazio porque ninguém o preenche:
     * 2 lembretes e 1 anotação em toda a história do CRM.
     */
    const t = tela();
    expect(t).toContain('só enchem quando alguém move o cartão');
    expect(CADEIA_MINIMO_PARA_LER).toBe(10);
    expect(t).toContain('CADEIA_MINIMO_PARA_LER');
  });

  it('e a ordem é por gasto, para a primeira linha não parecer recomendação', () => {
    expect(fn()).toContain('order by c.gasto desc');
    expect(tela()).toContain('não por eficiência');
  });

  it('e anúncio que dorme não entra', () => {
    // A conta tem 297 anúncios e quase todos estão parados sem gastar nada.
    expect(fn()).toContain('where c.gasto > 0 or c.leads > 0');
  });
});
