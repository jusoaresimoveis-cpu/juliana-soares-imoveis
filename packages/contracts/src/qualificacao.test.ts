import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AVISO_DEPENDE_DE_BANCO,
  ENCAIXES_FINANCEIROS,
  ENCAIXE_FINANCEIRO_LABEL,
  FILTROS_DE_TEMPERATURA,
  FILTRO_DE_TEMPERATURA_LABEL,
  FINALIDADES,
  FINALIDADE_LABEL,
  FRASES_DE_FINALIDADE,
  NEGACOES_DE_FINALIDADE,
  PORTAS_AUTOMATICAS,
  PORTA_AUTOMATICA_LABEL,
  PRAZOS_DE_COMPRA,
  PRAZO_DE_COMPRA_LABEL,
  TEMPERATURAS,
  TEMPERATURA_LABEL,
  TEMPERATURA_MATIZ,
  explicarTemperatura,
  finalidadeDoTexto,
  isFiltroDeTemperatura,
  resumoDaQualificacao,
  textoNormalizado,
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

/** O trecho entre uma marca e o primeiro fecho depois dela. */
function trecho(sql: string, inicio: string, fim: string): string {
  const i = sql.indexOf(inicio);
  expect(i, `não achei "${inicio}"`).toBeGreaterThanOrEqual(0);
  const f = sql.indexOf(fim, i + inicio.length);
  expect(f, `não achei "${fim}" depois de "${inicio}"`).toBeGreaterThan(i);
  return sql.slice(i, f);
}

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

describe('o leitor da primeira mensagem', () => {
  /*
   * A especificação executável. O leitor de verdade roda em SQL (a 121), e a
   * suíte de banco faz as MESMAS perguntas a ele — se as duas listas de exemplos
   * divergirem, uma delas está testando outra coisa.
   */
  it('lê o toque numa pergunta do anúncio', () => {
    expect(finalidadeDoTexto('Quero investir')).toBe('investir');
    expect(finalidadeDoTexto('Quero morar em Porto Belo')).toBe('morar');
    expect(finalidadeDoTexto('Quero um apartamento para veraneio')).toBe('segunda_residencia');
  });

  it('lê as versões em espanhol', () => {
    expect(finalidadeDoTexto('Quiero invertir')).toBe('investir');
    expect(finalidadeDoTexto('Quiero vivir en Porto Belo')).toBe('morar');
    expect(finalidadeDoTexto('Quiero un departamento para vacaciones')).toBe('segunda_residencia');
  });

  it('lê a frase no meio de um texto, com acento, caixa e espaço a mais', () => {
    expect(finalidadeDoTexto('Olá!  QUERO   INVESTIR em Porto Belo. Ref. 1002-BR-A')).toBe('investir');
    expect(textoNormalizado('  Olá,\n  São   JOSÉ ')).toBe('ola, sao jose');
  });

  it('"quero valores e plantas" não diz finalidade nenhuma', () => {
    expect(finalidadeDoTexto('Quero valores e plantas')).toBeNull();
    expect(finalidadeDoTexto('Olá! Tenho interesse neste imóvel')).toBeNull();
  });

  it('quem nega não quer', () => {
    expect(finalidadeDoTexto('Não quero investir agora')).toBeNull();
    expect(finalidadeDoTexto('No quiero invertir')).toBeNull();
  });

  it('duas finalidades na mesma mensagem não escolhem uma', () => {
    expect(finalidadeDoTexto('Quero morar ou quero investir, ainda não sei')).toBeNull();
    // A mesma finalidade dita duas vezes continua sendo uma.
    expect(finalidadeDoTexto('Quero investir. Quiero invertir.')).toBe('investir');
  });

  it('vazio e nulo não viram resposta', () => {
    expect(finalidadeDoTexto('')).toBeNull();
    expect(finalidadeDoTexto(null)).toBeNull();
    expect(finalidadeDoTexto(undefined)).toBeNull();
  });

  it('as frases do contrato já estão normalizadas', () => {
    for (const { frase } of FRASES_DE_FINALIDADE) expect(textoNormalizado(frase)).toBe(frase);
    for (const n of NEGACOES_DE_FINALIDADE) expect(textoNormalizado(n)).toBe(n);
  });
});

describe('o leitor, como está no banco', () => {
  const funcao = funcaoVigente;

  it('conhece exatamente as frases do contrato, com as mesmas finalidades', () => {
    const sql = funcao('finalidade_do_texto');
    const lista = trecho(sql, 'from (values', ') as f(frase, finalidade)');
    const pares = literais(lista);
    expect(pares.length % 2).toBe(0);

    const doBanco: string[] = [];
    for (let i = 0; i < pares.length; i += 2) doBanco.push(`${pares[i]} => ${pares[i + 1]}`);
    const doContrato = FRASES_DE_FINALIDADE.map((f) => `${f.frase} => ${f.finalidade}`);
    expect(doBanco.sort()).toEqual(doContrato.sort());
  });

  it('cala diante das mesmas negações', () => {
    const sql = funcao('finalidade_do_texto');
    for (const n of NEGACOES_DE_FINALIDADE) expect(sql, n).toContain(`position('${n}' in v_texto) > 0`);
  });

  it('duas finalidades diferentes devolvem nulo', () => {
    const sql = colapsado(funcao('finalidade_do_texto'));
    expect(sql).toContain('select count(distinct f.finalidade), min(f.finalidade)');
    /*
     * A REGRA, e não a forma de escrevê-la: `if ... then return` e
     * `return case when ... end` dizem a mesma coisa, e a 135 reescreveu a
     * função na segunda forma. O que não pode mudar é o `= 1` — é ele que
     * transforma "achei duas" em nulo.
     */
    expect(sql).toMatch(/v_quantas = 1/);
    expect(sql).not.toMatch(/return v_final;\s*end \$fn\$/);
  });

  it('só lê mensagem com prova de origem: clique em anúncio ou código da landing', () => {
    const porta = colapsado(funcao('porta_da_mensagem'));
    expect(porta).toContain("->>'conversionSource', '') <> ''");
    expect(porta).toContain("->>'entryPointConversionSource', '') = 'ctwa_ad'");
    expect(porta).toContain("then 'whatsapp'");
    expect(porta).toContain("when nullif(_ref_code, '') is not null then 'landing'");

    const gatilho = colapsado(funcao('tg_mensagem_qualifica'));
    const semProva = gatilho.indexOf('if v_porta is null then return null; end if;');
    const leitura = gatilho.indexOf('public.finalidade_do_texto(new.body)');
    expect(semProva).toBeGreaterThan(0);
    expect(leitura).toBeGreaterThan(semProva);
  });

  it('nunca derruba a entrada da mensagem', () => {
    const gatilho = colapsado(funcao('tg_mensagem_qualifica'));
    expect(gatilho).toContain('exception when others then raise warning');
    // A mesma condição do `when`, como o pg_dump a devolve: um parêntese por
    // termo e o literal com `::text`.
    expect(definicaoDoGatilho('whatsapp_messages_qualifica').normal).toContain(
      "create trigger whatsapp_messages_qualifica after insert on public.whatsapp_messages for each row when (((new.direction = 'entrada'::text) and (new.body is not null)))",
    );
  });
});

describe('a porta única de quem grava sem ser a ficha', () => {
  const porta = () => colapsado(funcaoVigente('lead_preencher_qualificacao'));

  it('aceita exatamente as portas do contrato', () => {
    const lista = trecho(porta(), '_origem not in (', ')');
    expect(literais(lista).sort()).toEqual([...PORTAS_AUTOMATICAS].sort());
  });

  it('só preenche o que está vazio', () => {
    expect(porta()).toContain('set finalidade = coalesce(l.finalidade, _finalidade)');
    expect(porta()).toContain('prazo_compra = coalesce(l.prazo_compra, _prazo)');
    expect(porta()).toContain('encaixe_financeiro = coalesce(l.encaixe_financeiro, _encaixe)');
  });

  it('avisa a origem antes de gravar e APAGA o aviso depois', () => {
    // `processar_inbox` trata várias mensagens na mesma transação. Aviso
    // esquecido carimbaria "lido do WhatsApp" em tudo o que viesse depois.
    const sql = porta();
    const aviso = sql.indexOf("set_config('app.qualificacao_origem', _origem, true)");
    const grava = sql.indexOf('update public.leads l');
    const apaga = sql.indexOf("set_config('app.qualificacao_origem', '', true)");
    expect(aviso).toBeGreaterThan(0);
    expect(grava).toBeGreaterThan(aviso);
    expect(apaga).toBeGreaterThan(grava);
  });

  it('o histórico conta de onde veio, com as palavras do contrato', () => {
    const gatilho = funcaoVigente('tg_lead_qualificacao');
    for (const p of PORTAS_AUTOMATICAS) {
      expect(colapsado(gatilho), p).toContain(`when '${p}' then '${PORTA_AUTOMATICA_LABEL[p]}'`);
    }
  });

  it('nenhuma das três funções é chamável pela tela', () => {
    // O `revoke ... from public, anon, authenticated` com o `grant execute ...
    // to service_role` de cada uma, lido como ficou: só o servidor executa.
    for (const f of ['lead_preencher_qualificacao', 'finalidade_do_texto', 'porta_da_mensagem']) {
      expect(executoresDaFuncao(f), f).toEqual(['service_role']);
    }
  });

  it('a função da landing guarda uma cópia fiel das finalidades', () => {
    const fonte = readFileSync(join(__dirname, '../../../supabase/functions/landing-lead/index.ts'), 'utf8');
    const lista = trecho(fonte, 'const FINALIDADES = [', ']');
    expect(literais(lista)).toEqual([...FINALIDADES]);
    expect(fonte).toContain("_origem: 'landing'");
  });
});
