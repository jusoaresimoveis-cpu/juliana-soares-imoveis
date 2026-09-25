import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  colunasDaTabela,
  definicaoDaFuncao,
  definicaoDoGatilho,
  executoresDaFuncao,
  privilegiosNaTabela,
  semComentarios,
} from '../../../supabase/testes/esquema';

/**
 * Credencial não mora em tabela — as migrações 130 e 131.
 *
 * O token da instância do WhatsApp (o mesmo do Vault, o que ENVIA mensagem)
 * estava em texto puro no payload guardado, em 41 mil mensagens e 93 mil linhas
 * de fila. Não foi maldade de ninguém: o provedor manda o token no corpo do
 * webhook, e o corpo inteiro era gravado como veio.
 *
 * Estes testes seguram as quatro camadas da correção. A que mais importa é a
 * primeira: `raw` fora da lista de colunas de `authenticated`. Sem ela, a tela
 * assina `postgres_changes` e o Realtime empurra a linha inteira — com o
 * segredo dentro — para todo navegador conectado.
 */

/** A definição vigente de uma função, sem comentário — só ela, e não o arquivo. */
const corpo = (nome: string) => semComentarios(definicaoDaFuncao(nome).texto);

/** As chaves que o provedor usa para credencial, e que não podem ficar. */
const CHAVES = ['token', 'apikey', 'apiKey', 'admintoken', 'adminToken'];

describe('a regra de "o que é credencial" mora num lugar só', () => {
  const sql = () => corpo('sem_credencial');

  it('tira todas as chaves conhecidas', () => {
    const f = sql();
    for (const chave of CHAVES) expect(f, chave).toContain(`- '${chave}'`);
  });

  it('e também as que vêm dentro de `instance`', () => {
    /*
     * O provedor repete o token num objeto aninhado. Trinta linhas hoje — e um
     * `- 'token'` de primeiro nível deixaria essas trinta intactas, com o
     * segredo inteiro, dando a impressão de limpeza.
     */
    const f = sql();
    const dentro = f.slice(f.indexOf("jsonb_build_object('instance'"));
    for (const chave of CHAVES) expect(dentro.slice(0, 400), chave).toContain(`- '${chave}'`);
  });
});

describe('a porta', () => {
  it('o gatilho é do BANCO, e não do webhook', () => {
    /*
     * A função de borda é UM caminho. Importação, reprocessamento de fila e o
     * webhook que alguém escrever depois passam pelo mesmo INSERT.
     */
    const inbox = definicaoDoGatilho('whatsapp_inbox_sem_credencial');
    expect(inbox.normal).toContain('before insert or update of payload on public.whatsapp_inbox');
    expect(inbox.funcao).toBe('tg_inbox_sem_credencial');

    const mensagem = definicaoDoGatilho('whatsapp_messages_sem_credencial');
    expect(mensagem.normal).toContain('before insert or update of raw on public.whatsapp_messages');
    expect(mensagem.funcao).toBe('tg_mensagem_sem_credencial');

    expect(corpo('tg_inbox_sem_credencial')).toContain('new.payload := public.sem_credencial(new.payload)');
    expect(corpo('tg_mensagem_sem_credencial')).toContain('new.raw := public.sem_credencial(new.raw)');
  });
});

describe('a limpeza do passado', () => {
  const sql = () => corpo('limpar_credencial_do_passado');

  it('acontece em lotes, e não numa transação só', () => {
    /*
     * 134 mil linhas de jsonb para reescrever é uma transação de dez minutos
     * segurando trava na tabela mais quente do sistema — e o trabalhador, que
     * marca `media_status` em linha antiga, espera esses dez minutos. Ensaiado:
     * morreu duas vezes em `statement timeout` antes disto.
     */
    const f = sql();
    expect(f).toContain('_lote integer default');
    expect(f).toContain('limit _lote');
  });

  it('e o trabalho se desliga sozinho quando acaba', () => {
    // Cron que sobra rodando depois de terminar é lixo que ninguém recolhe.
    const f = sql();
    const fim = f.indexOf("cron.unschedule('limpar-credencial')");
    expect(fim).toBeGreaterThan(0);
    expect(f.slice(0, fim)).toContain('if v_n = 0 then');
  });

  it('a função é do cron, e não da tela', () => {
    const quem = executoresDaFuncao('limpar_credencial_do_passado');
    for (const papel of ['PUBLIC', 'anon', 'authenticated']) expect(quem, papel).not.toContain(papel);
  });

  it('e o critério da fila fica FALSO depois de limpar', () => {
    /*
     * O defeito da 130, achado porque o cron continuou vivo depois de acabar o
     * serviço: o critério perguntava pelo ENVELOPE, não pela credencial —
     *
     *     jsonb_typeof(payload -> 'instance') = 'object'
     *
     * e tirar o token de dentro de `instance` não faz `instance` deixar de ser
     * um objeto. Trinta linhas voltavam à fila para sempre, `v_n` nunca chegava
     * a zero e o auto-desligamento nunca era alcançado.
     *
     * Critério de fila que continua verdadeiro depois do trabalho feito é fila
     * infinita — e esta rodou de minuto em minuto reportando "succeeded".
     */
    const f = sql();
    expect(f).not.toContain("jsonb_typeof(raw -> 'instance') = 'object'");
    expect(f).not.toContain("jsonb_typeof(payload -> 'instance') = 'object'");
    expect(f).toContain("(raw -> 'instance') ? 'token'");
    expect(f).toContain("(payload -> 'instance') ? 'token'");
  });
});

describe('quem pode ler a coluna', () => {
  it('revoga a tabela e concede coluna a coluna, sem `raw`', () => {
    /*
     * Não adianta revogar SÓ a coluna: enquanto existir concessão no nível da
     * tabela ela vale para todas, e a revogação de uma não tira nada.
     *
     * A 130 montava a lista na hora (`column_name <> 'raw'`); o que ficou no
     * banco é o resultado dela: SELECT em toda coluna, menos `raw`.
     */
    const concedido = privilegiosNaTabela('whatsapp_messages', 'authenticated');
    expect(concedido.tabela).not.toContain('select');
    const legiveis = concedido.colunas.select ?? [];
    expect(legiveis).not.toContain('raw');
    const todas = [...colunasDaTabela('whatsapp_messages').keys()];
    expect(todas.filter((c) => !legiveis.includes(c))).toEqual(['raw']);
  });

  it('e o `anon` devolve as quatro tabelas do módulo', () => {
    for (const t of [
      'whatsapp_messages',
      'whatsapp_inbox',
      'whatsapp_outbox',
      'whatsapp_conversations',
    ]) {
      const concedido = privilegiosNaTabela(t, 'anon');
      expect(concedido.tabela, t).toEqual([]);
      expect(concedido.colunas, t).toEqual({});
    }
  });

  it('a tela nunca pede `raw` — e é isso que deixa a revogação ser segura', () => {
    const hook = readFileSync(join(__dirname, 'hooks', 'useConversas.ts'), 'utf8');
    const select = hook.slice(hook.indexOf("from('whatsapp_messages')"));
    expect(select.slice(0, 600)).not.toContain('raw');
    expect(select.slice(0, 600)).not.toContain("select('*')");
  });
});

describe('a mídia é do cliente, não do grupo (131)', () => {
  // O marcador é a FUNÇÃO, e não a prosa que a explica: `semComentarios` tira
  // os comentários antes de procurar, e um teste que se apoia no comentário
  // passa a reprovar a migração pela própria explicação dela.
  const sql = () => corpo('processar_inbox');

  it('só entra na fila mídia de conversa ligada a um lead', () => {
    const f = sql();
    expect(f).toMatch(
      /media_status[\s\S]{0,4000}where c\.id = v_conv and c\.lead_id is not null/,
    );
  });

  it('a pergunta é feita à CONVERSA, e não a `v_lead`', () => {
    /*
     * `v_lead` só é preenchida para mensagem que CHEGA. Usá-la deixaria de fora
     * a foto que o corretor MANDA para o cliente — justamente a que ele vai
     * querer rever depois.
     */
    const f = sql();
    const bloco = f.slice(f.indexOf("case when v_kind in ('imagem'"));
    expect(bloco.slice(0, 300)).toContain('c.lead_id is not null');
    expect(bloco.slice(0, 300)).not.toMatch(/and v_lead is not null/);
  });

  it('conversa que vira lead recupera o que ainda dá tempo', () => {
    const gatilho = definicaoDoGatilho('conversas_virou_lead_pega_midia');
    expect(gatilho.normal).toContain('after update of lead_id on public.whatsapp_conversations');
    expect(gatilho.funcao).toBe('tg_conversa_virou_lead_pega_midia');

    const f = corpo('tg_conversa_virou_lead_pega_midia');
    expect(f).toContain('new.lead_id is null or old.lead_id is not null');
    // Três dias: a amostra da 129 provou que agosto volta 404.
    expect(f).toContain("m.occurred_at > now() - interval '3 days'");
  });
});
