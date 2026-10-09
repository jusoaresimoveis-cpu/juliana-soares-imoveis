import { describe, expect, it } from 'vitest';
import {
  AVISO_DEPENDE_DE_BANCO,
  ENCAIXES_FINANCEIROS,
  ENCAIXE_FINANCEIRO_LABEL,
  FILTROS_DE_TEMPERATURA,
  FILTRO_DE_TEMPERATURA_LABEL,
  FINALIDADES,
  FINALIDADE_LABEL,
  PRAZOS_DE_COMPRA,
  PRAZO_DE_COMPRA_LABEL,
  TEMPERATURAS,
  TEMPERATURA_LABEL,
  TEMPERATURA_MATIZ,
  explicarTemperatura,
  isFiltroDeTemperatura,
  resumoDaQualificacao,
  type RespostasDeQualificacao,
} from './index';
import {
  colunasDaTabela,
  definicaoDaFuncao,
  definicaoDoGatilho,
  executoresDaFuncao,
  literais,
  semComentarios,
  valoresDoCheck,
} from '../../../supabase/testes/esquema';

/**
 * Qualificação do lead: o contrato contra o banco, e a frase que explica.
 *
 * A regra da temperatura mora em SQL (a 120) e a tabela-verdade dela é
 * conferida contra um Postgres de verdade em `supabase/testes`. Aqui, em
 * memória, ficam as duas coisas que quebram sem ninguém ver: uma lista que
 * mudou de um lado só, e um rótulo do histórico que deixou de bater com o da
 * ficha.
 */

/**
 * A definição VIGENTE de uma função, sem comentário: a migração explica em
 * prosa o que ela NÃO faz, e um arquivo fixo passaria verde sobre código morto
 * no dia em que alguém redefinisse a função numa migração nova.
 */
const funcaoVigente = (nome: string) => semComentarios(definicaoDaFuncao(nome).texto);

function colapsado(sql: string): string {
  return sql.split(/\s+/).join(' ');
}

describe('qualificação do lead ↔ banco', () => {
  it('as finalidades batem', () => {
    expect(valoresDoCheck('leads_finalidade_ck')).toEqual([...FINALIDADES].sort());
  });

  it('os prazos batem', () => {
    expect(valoresDoCheck('leads_prazo_compra_ck')).toEqual([...PRAZOS_DE_COMPRA].sort());
  });

  it('os encaixes financeiros batem', () => {
    expect(valoresDoCheck('leads_encaixe_financeiro_ck')).toEqual([...ENCAIXES_FINANCEIROS].sort());
  });

  it('a marcação manual aceita exatamente as três temperaturas', () => {
    expect(valoresDoCheck('leads_temperatura_manual_ck')).toEqual([...TEMPERATURAS].sort());
  });

  it('todo valor tem rótulo, e nenhum rótulo sobra', () => {
    const pares: [readonly string[], Record<string, string>][] = [
      [FINALIDADES, FINALIDADE_LABEL],
      [PRAZOS_DE_COMPRA, PRAZO_DE_COMPRA_LABEL],
      [ENCAIXES_FINANCEIROS, ENCAIXE_FINANCEIRO_LABEL],
      [TEMPERATURAS, TEMPERATURA_LABEL],
      [FILTROS_DE_TEMPERATURA, FILTRO_DE_TEMPERATURA_LABEL],
    ];
    for (const [valores, rotulos] of pares) {
      expect(Object.keys(rotulos).sort()).toEqual([...valores].sort());
      for (const v of valores) expect(rotulos[v]?.trim(), v).toBeTruthy();
    }
    expect(Object.keys(TEMPERATURA_MATIZ).sort()).toEqual([...TEMPERATURAS].sort());
  });
});

describe('a regra da temperatura, como está no banco', () => {
  const corpo = () => colapsado(funcaoVigente('temperatura_pela_regra'));

  /*
   * As quatro linhas, literalmente. É frágil de propósito: quem mudar a regra
   * tem de vir aqui e mudar a frase junto — e reler o aviso da 120 sobre
   * reescrever as linhas, porque coluna gerada não se recalcula sozinha.
   */
  it('sem prazo não há temperatura', () => {
    expect(corpo()).toContain('when _prazo is null then null');
  });

  it('quente exige prazo curto E entrada que cabe', () => {
    expect(corpo()).toContain(
      "when _prazo in ('ate_30_dias', 'de_1_a_3_meses') and _encaixe = 'cabe' then 'quente'",
    );
  });

  it('morno é prazo de até 6 meses, e frio é o resto', () => {
    expect(corpo()).toContain(
      "when _prazo in ('ate_30_dias', 'de_1_a_3_meses', 'de_3_a_6_meses') then 'morno'",
    );
    expect(corpo()).toContain("else 'frio'");
  });

  it('quem depende de banco nunca sai quente pela regra', () => {
    // Na planta não entra banco. O único caminho para "quente" passa por
    // `_encaixe = 'cabe'`, e `depende_banco` nem aparece na regra.
    expect(corpo().split("then 'quente'")).toHaveLength(2);
    expect(corpo()).not.toContain('depende_banco');
  });

  it('a regra só fala valores que o contrato conhece', () => {
    const conhecidos = new Set<string>([...PRAZOS_DE_COMPRA, ...ENCAIXES_FINANCEIROS, ...TEMPERATURAS]);
    const usados = literais(corpo().slice(corpo().indexOf('select case')));
    expect(usados.length).toBeGreaterThan(0);
    for (const v of usados) expect(conhecidos.has(v), v).toBe(true);
  });

  it('é imutável, e o corretor consegue executá-la', () => {
    expect(corpo()).toContain('immutable');
    // A expressão de uma coluna gerada roda com o papel de quem faz o UPDATE.
    // Sem este grant, salvar a ficha passaria a dar "permission denied". O
    // `revoke ... from public, anon, authenticated` seguido do `grant execute
    // ... to authenticated, service_role`, lido como ficou:
    expect(executoresDaFuncao('temperatura_pela_regra')).toEqual(['authenticated', 'service_role']);
  });

  it('as duas temperaturas são colunas GERADAS — ninguém escreve nelas', () => {
    // O espaço junto do parêntese é de quem escreveu (`( coalesce(...) )`), e
    // o pg_dump não o guarda.
    const justo = (s: string | undefined) => (s ?? '').replace(/\(\s+/g, '(').replace(/\s+\)/g, ')');
    const colunas = colunasDaTabela('leads');
    expect(justo(colunas.get('temperatura_regra'))).toBe(
      'text generated always as (public.temperatura_pela_regra(prazo_compra, encaixe_financeiro)) stored',
    );
    expect(justo(colunas.get('temperatura'))).toBe(
      'text generated always as (coalesce(temperatura_manual, public.temperatura_pela_regra(prazo_compra, encaixe_financeiro))) stored',
    );
  });
});

describe('o histórico da qualificação', () => {
  const gatilho = () => funcaoVigente('tg_lead_qualificacao');

  it('escreve os mesmos rótulos que a ficha mostra', () => {
    const sql = gatilho();
    const rotulos = [
      ...Object.values(FINALIDADE_LABEL),
      ...Object.values(PRAZO_DE_COMPRA_LABEL),
      ...Object.values(ENCAIXE_FINANCEIRO_LABEL),
    ];
    for (const r of rotulos) expect(sql, r).toContain(`'${r}'`);
  });

  it('e conhece cada código do contrato', () => {
    const sql = gatilho();
    for (const v of [...FINALIDADES, ...PRAZOS_DE_COMPRA, ...ENCAIXES_FINANCEIROS, ...TEMPERATURAS]) {
      expect(sql, v).toContain(`when '${v}'`);
    }
  });

  it('roda DEPOIS do update: num BEFORE a coluna gerada ainda não existe', () => {
    expect(definicaoDoGatilho('leads_qualificacao').normal).toContain(
      'create trigger leads_qualificacao after update of finalidade, prazo_compra, encaixe_financeiro, temperatura_manual on public.leads',
    );
  });

  it('grava na linha do tempo como evento do lead', () => {
    expect(colapsado(gatilho())).toContain("new.id, 'lead', 'qualificacao'");
  });
});

describe('a frase que explica a temperatura', () => {
  const r = (p: Partial<RespostasDeQualificacao> = {}): RespostasDeQualificacao => ({
    finalidade: null,
    prazo_compra: null,
    encaixe_financeiro: null,
    temperatura_manual: null,
    temperatura_regra: null,
    temperatura: null,
    ...p,
  });

  it('sem prazo, diz o que falta perguntar', () => {
    expect(explicarTemperatura(r())).toBe('Falta saber quando a pessoa pretende comprar.');
    expect(explicarTemperatura(r({ finalidade: 'investir', encaixe_financeiro: 'cabe' }))).toBe(
      'Falta saber quando a pessoa pretende comprar.',
    );
  });

  it('com prazo e entrada, conta as duas respostas', () => {
    expect(explicarTemperatura(r({ prazo_compra: 'de_1_a_3_meses', encaixe_financeiro: 'cabe' }))).toBe(
      'Quer comprar em 1 a 3 meses, e a entrada e as parcelas cabem.',
    );
    expect(explicarTemperatura(r({ prazo_compra: 'ate_30_dias', encaixe_financeiro: 'precisa_prazo' }))).toBe(
      'Quer comprar nos próximos 30 dias, mas precisa de mais prazo para a entrada.',
    );
  });

  it('com prazo e sem entrada, pede a pergunta que falta', () => {
    expect(explicarTemperatura(r({ prazo_compra: 'de_3_a_6_meses' }))).toBe(
      'Quer comprar em 3 a 6 meses. Falta saber se a entrada e as parcelas cabem.',
    );
  });

  it('quem depende de banco é dito com todas as letras', () => {
    expect(explicarTemperatura(r({ prazo_compra: 'ate_30_dias', encaixe_financeiro: 'depende_banco' }))).toBe(
      'Quer comprar nos próximos 30 dias, mas depende de financiamento bancário.',
    );
    expect(AVISO_DEPENDE_DE_BANCO).toContain('só vale para imóvel pronto');
    expect(AVISO_DEPENDE_DE_BANCO).toContain('direto com a construtora');
  });

  it('"só pesquisando" não vira uma frase torta', () => {
    expect(explicarTemperatura(r({ prazo_compra: 'pesquisando' }))).toBe('Disse que está só pesquisando.');
  });

  it('marcação à mão aparece, e diz quando discorda da regra', () => {
    expect(
      explicarTemperatura(
        r({
          prazo_compra: 'mais_de_6_meses',
          temperatura_manual: 'quente',
          temperatura_regra: 'frio',
          temperatura: 'quente',
        }),
      ),
    ).toBe('Quer comprar daqui a mais de 6 meses. Falta saber se a entrada e as parcelas cabem. Marcada à mão como quente; pelas respostas seria frio.');

    expect(
      explicarTemperatura(r({ temperatura_manual: 'morno', temperatura: 'morno' })),
    ).toBe('Falta saber quando a pessoa pretende comprar. Marcada à mão como morno.');
  });

  it('a frase DESCREVE, não decide: o selo do banco não muda o texto das respostas', () => {
    // Se esta função passasse a olhar `temperatura` para escolher palavras, ela
    // viraria uma segunda regra. O mesmo par de respostas dá a mesma frase,
    // venha o selo que vier.
    const base = { prazo_compra: 'ate_30_dias', encaixe_financeiro: 'cabe' } as const;
    expect(explicarTemperatura(r({ ...base, temperatura: 'quente', temperatura_regra: 'quente' }))).toBe(
      explicarTemperatura(r({ ...base, temperatura: 'frio', temperatura_regra: 'frio' })),
    );
  });

  it('valor desconhecido do banco não derruba a ficha', () => {
    expect(explicarTemperatura(r({ prazo_compra: 'daqui_a_um_seculo' }))).toBe(
      'Falta saber quando a pessoa pretende comprar.',
    );
  });
});

describe('o resumo de uma linha', () => {
  it('junta só o que foi respondido', () => {
    expect(
      resumoDaQualificacao({ finalidade: 'investir', prazo_compra: 'de_1_a_3_meses', encaixe_financeiro: 'cabe' }),
    ).toBe('Investir · De 1 a 3 meses · Entrada e parcelas cabem');
    expect(resumoDaQualificacao({ finalidade: 'morar', prazo_compra: null, encaixe_financeiro: null })).toBe('Morar');
  });

  it('nada respondido é NULO, não uma frase vazia', () => {
    expect(resumoDaQualificacao({ finalidade: null, prazo_compra: null, encaixe_financeiro: null })).toBeNull();
  });
});

describe('o filtro do quadro', () => {
  it('oferece as três temperaturas, todas, e quem ninguém qualificou', () => {
    expect([...FILTROS_DE_TEMPERATURA]).toEqual(['todas', 'quente', 'morno', 'frio', 'sem']);
  });

  it('valor estranho na URL não vira filtro', () => {
    expect(isFiltroDeTemperatura('quente')).toBe(true);
    expect(isFiltroDeTemperatura('sem')).toBe(true);
    expect(isFiltroDeTemperatura('fervendo')).toBe(false);
    expect(isFiltroDeTemperatura(null)).toBe(false);
  });
});
