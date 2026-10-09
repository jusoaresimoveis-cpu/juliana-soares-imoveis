import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  GRAPH_VERSION,
  META_AD_LEVELS,
  META_ENTREGAS,
  META_ENTREGA_META,
  META_ERROS_DE_LIMITE,
  META_ERROS_DE_PERMISSAO,
  META_ERROS_DE_TOKEN,
  META_HEALTH,
  META_HEALTH_META,
  META_INBOX_STATUSES,
  META_SYNC_KINDS,
  META_SYNC_STATUSES,
  custoPorLead,
  entregaDoStatus,
  estaEntregando,
  gastoParaMenor,
  idDaMeta,
  mensagemDoErro,
  saudeDoErro,
  telefoneE164,
} from './index';
import {
  colunasDaTabela,
  privilegiosNaTabela,
  tabelasVigentes,
  valoresDoCheck as valoresDoCheckAtual,
} from '../../../supabase/testes/esquema';

describe('meta — o dicionário e o banco dizem a mesma coisa', () => {
  it('saúde da integração', () => {
    expect(valoresDoCheckAtual('meta_integrations_health_ck')).toEqual([...META_HEALTH].sort());
  });

  it('estado do evento recebido', () => {
    expect(valoresDoCheckAtual('meta_webhook_inbox_st_ck')).toEqual(
      [...META_INBOX_STATUSES].sort(),
    );
  });

  it('tipo e resultado da sincronização', () => {
    expect(valoresDoCheckAtual('meta_sync_runs_kind_ck')).toEqual([...META_SYNC_KINDS].sort());
    expect(valoresDoCheckAtual('meta_sync_runs_status_ck')).toEqual(
      [...META_SYNC_STATUSES].sort(),
    );
  });

  it('nível da hierarquia de anúncios', () => {
    expect(valoresDoCheckAtual('meta_ad_dimensions_lv_ck')).toEqual([...META_AD_LEVELS].sort());
  });

  it('todo estado de saúde tem instrução para quem está olhando', () => {
    // "Com erro" sem dizer o que fazer é o mesmo que não avisar.
    for (const h of META_HEALTH) {
      expect(META_HEALTH_META[h]?.instrucao.length, h).toBeGreaterThan(20);
    }
  });
});

describe('meta — segredo nunca vira coluna', () => {
  it('nenhuma tabela tem coluna de token nem de app secret', () => {
    /*
     * O sistema auditado guardava `meta_app_secret` e `meta_access_token` em
     * colunas TEXT que o navegador de qualquer gerente alcançava. Este teste
     * quebra se alguém repetir o padrão aqui.
     */
    for (const tabela of tabelasVigentes()) {
      for (const [coluna, tipo] of colunasDaTabela(tabela)) {
        expect(`${tabela}.${coluna} ${tipo}`).not.toMatch(
          /\.(app_secret|access_token|page_token|verify_token) text\b/,
        );
      }
    }
    // Só ponteiro para o Vault.
    const conexao = colunasDaTabela('meta_integrations');
    expect(conexao.get('app_secret_id')).toMatch(/^uuid\b/);
    expect(conexao.get('access_token_id')).toMatch(/^uuid\b/);
  });

  it('a chave do gasto não admite nulo em nenhuma coluna da constraint', () => {
    // `null` nunca é igual a `null` numa unique: coluna anulável na chave é o
    // mesmo que não ter chave, e cada importação duplica a linha.
    // (`text not null default ''` à mão; `text default ''::text not null` no pg_dump.)
    const gasto = colunasDaTabela('meta_ads_spend');
    for (const coluna of ['adset_id', 'ad_id']) {
      const tipo = gasto.get(coluna) ?? '';
      expect(tipo, coluna).toMatch(/^text\b/);
      expect(tipo, coluna).toMatch(/\bnot null\b/);
      expect(tipo, coluna).toMatch(/\bdefault ''(::text)?/);
    }
  });

  it('a fila e o dado cru do formulário não são legíveis pelo cliente', () => {
    for (const tabela of ['meta_webhook_inbox', 'meta_lead_submissions']) {
      for (const papel of ['anon', 'authenticated']) {
        expect(privilegiosNaTabela(tabela, papel), `${tabela} / ${papel}`).toEqual({ tabela: [], colunas: {} });
      }
    }
  });
});

describe('meta — dinheiro e telefone', () => {
  it('gasto que não converte vira nulo, nunca zero', () => {
    // `parseFloat(x) || 0` do sistema auditado gravava ZERO por cima do gasto
    // correto do dia quando a Meta omitia o campo.
    expect(gastoParaMenor('12.34')).toBe(1234);
    expect(gastoParaMenor(0)).toBe(0);
    expect(gastoParaMenor(undefined)).toBeNull();
    expect(gastoParaMenor('')).toBeNull();
    expect(gastoParaMenor('abc')).toBeNull();
    expect(gastoParaMenor('-1')).toBeNull();
  });

  it('custo por lead sem lead atribuído é nulo, não zero', () => {
    expect(custoPorLead(10000, 0).valor).toBeNull();
    expect(custoPorLead(10000, 4)).toEqual({ valor: 2500, confiavel: false });
    expect(custoPorLead(10000, 5).confiavel).toBe(true);
  });

  it('a regra do nono dígito só vale para número brasileiro', () => {
    // Celular antigo, de 8 dígitos: ganha o nono na frente.
    expect(telefoneE164('(47) 8888-6666')).toBe('+5547988886666');
    // Já com o nono: fica como está, não ganha outro.
    expect(telefoneE164('5547988886666')).toBe('+5547988886666');
    // Fixo não ganha o 9.
    expect(telefoneE164('4733334444')).toBe('+554733334444');
    // Português: passa inteiro, sem apanhar a regra brasileira.
    expect(telefoneE164('+351912345678')).toBe('+351912345678');
    expect(telefoneE164(null)).toBeNull();
  });

  it('id da Meta que vira URL é validado — inclusive o leadgen_id', () => {
    // O sistema auditado validava quatro ids e esquecia justamente deste, que
    // ia cru para o caminho da Graph API junto com o token da organização.
    expect(idDaMeta('120209876543210')).toBe('120209876543210');
    expect(idDaMeta('me/accounts?fields=access_token&x=')).toBeNull();
    expect(idDaMeta('../../etc')).toBeNull();
    expect(idDaMeta(123)).toBeNull();
  });

  it('o código de erro da Graph decide se vale insistir', () => {
    expect(saudeDoErro(190)).toBe('precisa_reconectar');
    expect(saudeDoErro(17)).toBe('throttled');
    expect(saudeDoErro(999)).toBe('erro');
    expect(saudeDoErro(null)).toBe('erro');
  });

  it('falta de permissão NÃO manda reconectar', () => {
    /*
     * Os códigos 200 e 10 moravam na lista de "token morreu" e não deviam.
     *
     * Foi o que aconteceu na primeira busca de leads desta instalação: token
     * válido, escopos todos concedidos, e a Graph respondendo 200 porque a
     * chamada ia com o token do usuário do sistema em vez do token da Página.
     * A tela mandava reconectar — e reconectar não mudava nada, porque não era
     * o token que estava errado.
     */
    expect(saudeDoErro(200)).toBe('sem_permissao');
    expect(saudeDoErro(10)).toBe('sem_permissao');
    expect(META_HEALTH_META.sem_permissao.grave).toBe(true);
  });

  it('o erro da Graph vira frase, não número solto', () => {
    // "Graph 200" é o que a tela mostrava: nem diz o que houve, nem o que
    // fazer, e ainda se parece com o status HTTP de sucesso.
    expect(mensagemDoErro(200)).toMatch(/controle total/);
    expect(mensagemDoErro(190)).toMatch(/reconecte/);
    expect(mensagemDoErro(17)).toMatch(/limite/i);
    // Código desconhecido não vira frase inventada.
    expect(mensagemDoErro(4242)).toBe('erro 4242 da Meta');
    expect(mensagemDoErro(null, 503)).toBe('a Meta respondeu 503');
  });

  it('as listas de erro do pacote e das funções não divergem', () => {
    /*
     * O Deno não alcança este pacote, então `_shared/meta.ts` carrega uma
     * cópia dos códigos. Duas cópias sem guarda é como o que a tela diz deixa
     * de descrever o que o servidor decidiu — e a divergência só aparece no dia
     * do incidente, que é o pior dia para descobrir.
     */
    const compartilhado = readFileSync(
      join(__dirname, '../../../supabase/functions/_shared/meta.ts'),
      'utf8',
    );
    const numerosDe = (nome: string): number[] => {
      const m = compartilhado.match(new RegExp(`const ${nome} = \\[([^\\]]*)\\]`));
      if (!m?.[1]) throw new Error(`${nome} não encontrado em _shared/meta.ts`);
      return m[1]
        .split(',')
        .map((t) => Number(t.trim()))
        .filter((n) => Number.isFinite(n))
        .sort((a, b) => a - b);
    };
    const ordenado = (v: readonly number[]) => [...v].sort((a, b) => a - b);

    expect(numerosDe('ERROS_DE_TOKEN')).toEqual(ordenado(META_ERROS_DE_TOKEN));
    expect(numerosDe('ERROS_DE_PERMISSAO')).toEqual(ordenado(META_ERROS_DE_PERMISSAO));
    expect(numerosDe('ERROS_DE_LIMITE')).toEqual(ordenado(META_ERROS_DE_LIMITE));
  });

  it('a versão da Graph mora num lugar só', () => {
    // Espalhada por arquivo, uma delas envelhece e a chamada falha em silêncio.
    expect(GRAPH_VERSION).toMatch(/^v\d+\.0$/);
  });
});

describe('está no ar agora?', () => {
  it('o estado EFETIVO manda, não o botão do objeto', () => {
    /*
     * O caso que dá sentido a esta coluna: um anúncio ligado dentro de uma
     * campanha pausada. O `status` dele é ACTIVE e o `effective_status` é
     * CAMPAIGN_PAUSED — ele não gasta um centavo desde que alguém pausou
     * acima. Filtrar pelo `status` diria que está rodando.
     */
    expect(entregaDoStatus('CAMPAIGN_PAUSED')).toBe('pausado');
    expect(entregaDoStatus('ADSET_PAUSED')).toBe('pausado');
    expect(estaEntregando('CAMPAIGN_PAUSED')).toBe(false);
    expect(estaEntregando('ACTIVE')).toBe(true);
  });

  it('só ACTIVE conta como no ar', () => {
    // "Em análise" ainda não entrega e "com problema" parou de entregar.
    // Chamar qualquer um dos dois de ativo faria a tela afirmar que a verba
    // está rodando quando não está.
    expect(estaEntregando('PENDING_REVIEW')).toBe(false);
    expect(estaEntregando('DISAPPROVED')).toBe(false);
    expect(estaEntregando('ARCHIVED')).toBe(false);
  });

  it('quem quebrou não se confunde com quem foi pausado', () => {
    // Ninguém escolheu parar um DISAPPROVED. Somá-lo aos pausados esconderia
    // justamente a linha que precisa de alguém hoje.
    expect(entregaDoStatus('DISAPPROVED')).toBe('com_problema');
    expect(entregaDoStatus('WITH_ISSUES')).toBe('com_problema');
    expect(META_ENTREGA_META.com_problema.atencao).toBe(true);
    expect(META_ENTREGA_META.pausado.atencao).toBe(false);
  });

  it('ausência de estado é ausência, não pausa', () => {
    /*
     * Antes da primeira importação de estado, TODO objeto cai aqui. Tratar
     * ausência como "pausado" esvaziaria a tela no primeiro clique do filtro e
     * o corretor concluiria que não há nada rodando.
     */
    expect(entregaDoStatus(null)).toBe('desconhecido');
    expect(entregaDoStatus('')).toBe('desconhecido');
    expect(entregaDoStatus('SEI_LA_O_QUE')).toBe('desconhecido');
    expect(estaEntregando(null)).toBe(false);
  });

  it('todo estado tem rótulo para quem está olhando', () => {
    for (const e of META_ENTREGAS) {
      expect(META_ENTREGA_META[e]?.rotulo.length, e).toBeGreaterThan(2);
    }
  });

  it('maiúscula e espaço do provedor não mudam a leitura', () => {
    expect(entregaDoStatus(' active ')).toBe('ativo');
  });
});
