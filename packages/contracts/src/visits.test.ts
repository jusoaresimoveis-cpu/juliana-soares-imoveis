import { describe, expect, it } from 'vitest';
import {
  MAX_VISIT_HOURS,
  VISIT_BLOCKING_STATUSES,
  VISIT_CLOSED_STATUSES,
  VISIT_STATUSES,
} from './index';
import {
  definicaoDaFuncao,
  definicaoDaRestricao,
  literais,
  semComentarios,
  valoresDoCheck as valoresDoCheckAtual,
} from '../../../supabase/testes/esquema';

/** A definição vigente de uma função, sem comentário. */
const funcao = (nome: string) => semComentarios(definicaoDaFuncao(nome).texto);

/**
 * A lista de status da visita aparece em QUATRO lugares: o dicionário aqui, o
 * CHECK da tabela, o `where` da restrição de exclusão e o `where` da função de
 * conflito. Os dois últimos são os perigosos — se alguém acrescentar um status
 * "remarcada" e esquecer deles, a agenda passa a aceitar dois corretores no
 * mesmo horário sem nenhum erro aparecer.
 */
describe('visitas', () => {
  it('os status batem com o CHECK da tabela', () => {
    expect(valoresDoCheckAtual('visits_status_ck')).toEqual([...VISIT_STATUSES].sort());
  });

  it('a restrição de exclusão bloqueia exatamente os status que ocupam a agenda', () => {
    // `where (status in (...) ...)` à mão; `where (((status = any (array[...]))
    // ...)` no pg_dump. Os status são os literais do `where`, nas duas formas.
    const exclusao = definicaoDaRestricao('visits_sem_sobreposicao').definicao;
    expect(exclusao).toMatch(/^exclude using gist /);
    const onde = exclusao.slice(exclusao.indexOf(' where '));
    expect(onde, 'a restrição de exclusão perdeu o where').toMatch(/^ where /);
    expect(literais(onde).sort()).toEqual([...VISIT_BLOCKING_STATUSES].sort());
  });

  it('a função de conflito usa a mesma lista da restrição', () => {
    const bloco = /status in \(([^)]+)\)/i.exec(funcao('visit_conflicts'))?.[1] ?? '';
    const noSql = [...bloco.matchAll(/'([^']+)'/g)].map((m) => m[1] ?? '').sort();
    expect(noSql).toEqual([...VISIT_BLOCKING_STATUSES].sort());
  });

  it('todo status ou ocupa a agenda ou encerra a visita', () => {
    const cobertos = [...VISIT_BLOCKING_STATUSES, ...VISIT_CLOSED_STATUSES].sort();
    expect(cobertos).toEqual([...VISIT_STATUSES].sort());
  });

  it('o teto de duração bate com o do banco', () => {
    // `interval '12 hours'` à mão; o pg_dump normaliza para `'12:00:00'::interval`.
    const check = definicaoDaRestricao('visits_duration_ck').definicao;
    const horas = /interval '(\d+) hours?'/.exec(check)?.[1] ?? /'(\d+):00:00'::interval/.exec(check)?.[1];
    expect(Number(horas), check).toBe(MAX_VISIT_HOURS);
  });

  it('o gatilho da linha do tempo trata cada status de encerramento', () => {
    const corpo = funcao('tg_visit_timeline');
    VISIT_CLOSED_STATUSES.forEach((s) =>
      expect(corpo, `status "${s}" sem texto próprio na linha do tempo`).toContain(`when '${s}'`),
    );
  });

  it('as saídas de visit_conflicts não colidem com nome de coluna', () => {
    const assinatura = /visit_conflicts[\s\S]*?returns table \(([^)]+)\)/i.exec(funcao('visit_conflicts'))?.[1] ?? '';
    expect(assinatura).not.toBe('');
    const nomes = assinatura.split(',').map((p) => p.trim().split(/\s+/)[0] ?? '');
    nomes.forEach((n) => expect(n.startsWith('o_'), `saída "${n}" precisa do prefixo o_`).toBe(true));
  });
});
