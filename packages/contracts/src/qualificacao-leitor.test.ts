import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  FINALIDADES,
  FRASES_DE_FINALIDADE,
  NEGACOES_DE_FINALIDADE,
  PORTAS_AUTOMATICAS,
  PORTA_AUTOMATICA_LABEL,
  finalidadeDoTexto,
  textoNormalizado,
} from './index';
import {
  definicaoDaFuncao,
  definicaoDoGatilho,
  executoresDaFuncao,
  literais,
  semComentarios,
} from '../../../supabase/testes/esquema';

/*
 * O leitor da primeira mensagem e a porta única de quem grava sem ser a ficha,
 * separados de `qualificacao.test.ts`. `funcaoVigente` e `colapsado` são
 * cópias das de lá: importar de um arquivo de teste rodaria os testes dele de
 * novo.
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
