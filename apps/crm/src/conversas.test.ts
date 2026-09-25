import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ESTADOS_DE_CONVERSA, ESTADO_META } from '@/hooks/useConversas';
import { LEAD_SOURCES } from '@contracts';
import {
  colapsado,
  definicaoDaFuncao,
  definicaoDaView,
  semComentarios,
  tabelasPublicadas,
} from '../../../supabase/testes/esquema';

/**
 * A definição vigente de uma função, sem comentário.
 *
 * Estes testes liam a 032, um arquivo fixo — e a regra saiu de lá: a 064 e a
 * 067 a levaram para `wa_e_pessoal` e `wa_estado_da_conversa`. Ler o arquivo
 * velho conferia história, não o banco.
 */
const corpo = (nome: string) => semComentarios(definicaoDaFuncao(nome).texto);

/**
 * A regra de "o que é lead" vive no SQL, dentro de `wa_tem_origem`. Estes
 * testes não a reimplementam — eles conferem que ela continua dizendo o que a
 * tela promete, porque as duas pontas envelhecem em ritmos diferentes.
 */

/** As origens listadas dentro de `wa_tem_origem`, extraídas do próprio SQL. */
function origensQueContam(): string[] {
  const bloco = /_source in \(([^)]+)\)/.exec(corpo('wa_tem_origem'))?.[1];
  if (!bloco) throw new Error('lista de origens não encontrada em wa_tem_origem');
  return [...bloco.matchAll(/'([^']+)'/g)].map((m) => m[1] ?? '').sort();
}

describe('o que conta como conversa de lead', () => {
  it("'whatsapp' NÃO conta como origem", () => {
    /*
     * É o defeito inteiro. A migração 013 grava `source = 'whatsapp'` em todo
     * número que manda mensagem — inclusive na mãe do corretor. Se esse valor
     * entrasse na lista, toda conversa voltaria a ser lead e o filtro não
     * filtraria nada.
     */
    expect(origensQueContam()).not.toContain('whatsapp');
  });

  it("'manual' NÃO conta — quem cadastrou à mão decide na ficha, não aqui", () => {
    expect(origensQueContam()).not.toContain('manual');
  });

  it('as origens rastreadas contam', () => {
    const contam = origensQueContam();
    for (const o of ['meta_ads', 'google_ads', 'landing_page', 'link_bio', 'portal', 'indicacao']) {
      expect(contam, o).toContain(o);
    }
  });

  it('toda origem citada existe no dicionário do banco', () => {
    // Um valor com erro de digitação aqui nunca casaria, e a conversa daquele
    // canal cairia calada em "sem origem" para sempre.
    for (const o of origensQueContam()) {
      expect(LEAD_SOURCES as readonly string[], o).toContain(o);
    }
  });

  it('os sinais de rastreamento estão todos na função', () => {
    // Cada um é uma porta de entrada diferente; perder um é perder um canal
    // inteiro dentro do estado "sem origem".
    const sql = corpo('wa_tem_origem');
    for (const sinal of [
      '_ft_meta_ad_id',
      '_ft_landing_page_id',
      '_ft_utm_source',
      '_ref_code',
      '_property_id',
    ]) {
      expect(sql, sinal).toContain(sinal);
    }
  });
});

describe('os três estados', () => {
  it('existe um estado para quem chegou sem rastro', () => {
    /*
     * Com dois estados, a conversa sem rastreamento teria de ser chamada de
     * pessoal — e lead de indicação, de placa e de telefonema cairiam ali,
     * fora do funil, sem ninguém perceber. Descartar cliente por engano é o
     * erro caro; ter conversa a mais na lista é o barato.
     */
    expect(ESTADOS_DE_CONVERSA).toContain('sem_origem');
    expect(ESTADOS_DE_CONVERSA).toHaveLength(3);
  });

  it('o SQL nunca chuta "pessoal" sozinho, exceto em grupo', () => {
    /*
     * Grupo é condomínio, é equipe, é o grupo da família — nunca é um lead.
     * Fora disso, só a decisão humana marca como pessoal.
     *
     * `wa_estado_da_conversa` é a única definição dos três estados, e ela só
     * diz "pessoal" por `wa_e_pessoal` — que é a marcação humana, ou o grupo
     * que ninguém classificou.
     */
    const estado = colapsado(corpo('wa_estado_da_conversa'));
    const automaticos = [...estado.matchAll(/then '(lead|pessoal|sem_origem)'/g)].map((m) => m[1]);
    expect(automaticos.filter((e) => e === 'pessoal')).toHaveLength(1);
    expect(estado).toContain("when public.wa_e_pessoal(c.classification, c.is_group) then 'pessoal'");

    expect(colapsado(corpo('wa_e_pessoal'))).toContain(
      "coalesce(_classification = 'pessoal', false) or (_classification is null and coalesce(_is_group, false))",
    );
  });

  it('cada estado tem rótulo e explicação para quem lê a tela', () => {
    for (const e of ESTADOS_DE_CONVERSA) {
      expect(ESTADO_META[e].rotulo.length).toBeGreaterThan(0);
      expect(ESTADO_META[e].explicacao.length).toBeGreaterThan(20);
    }
  });
});

describe('a conversa pessoal sai das contagens', () => {
  it('toda contagem de lead do painel filtra `excluded_at`', () => {
    /*
     * Uma que ficasse de fora produziria um painel que discorda de si mesmo:
     * 20 leads no card e 23 no funil. E a divergência apareceria só depois de
     * alguém marcar a primeira conversa como pessoal — longe da mudança.
     */
    const funcoes = ['painel_janela', 'painel_funil', 'painel_serie', 'painel_origens'];
    for (const f of funcoes) {
      expect(corpo(f), `${f} não filtra excluded_at`).toContain('excluded_at is null');
    }
  });

  it('marcar como pessoal e desmarcar acontecem na MESMA transação do lead', () => {
    // Em duas chamadas separadas, uma falha de rede no meio deixaria a conversa
    // escondida da lista e o lead ainda contando no painel — o pior dos dois
    // mundos, e invisível.
    const sql = corpo('wa_classificar_conversa');
    expect(sql).toContain('update public.whatsapp_conversations');
    expect(sql).toContain('update public.leads');
    expect(sql).toContain('excluded_at');
  });

  it('a view respeita a RLS de quem consulta', () => {
    // Sem `security_invoker`, a view roda com os direitos de quem a criou e
    // entrega a caixa de entrada de uma imobiliária para outra. É o jeito mais
    // fácil de furar RLS sem perceber. (O pg_dump escreve `'true'` entre aspas.)
    expect(definicaoDaView('whatsapp_conversas_v').normal).toMatch(
      /^create (or replace )?view public\.whatsapp_conversas_v with \(security_invoker ?= ?'?(true|on)'?\)/,
    );
  });

  it('a view lista as colunas, em vez de usar asterisco', () => {
    // Com `c.*`, qualquer coluna acrescentada à tabela depois passa a ser
    // exposta sem ninguém decidir isso — no dia em que a view for recriada.
    // É esse dia que o teste vigia: o pg_dump sempre expande o asterisco, e a
    // guarda só morde numa view reescrita à mão numa migration nova.
    const view = definicaoDaView('whatsapp_conversas_v').normal;
    const colunas = view.slice(0, view.indexOf(' from '));
    expect(colunas).toContain('c.organization_id');
    expect(colunas).not.toContain('c.*');
  });
});

// -----------------------------------------------------------------------------
// A tela ao vivo — a migração 132
// -----------------------------------------------------------------------------

describe('mensagem nova sem recarregar', () => {
  /*
   * O defeito que o Guto achou testando na tela: `useConversasAoVivo` assina
   * `postgres_changes` em `whatsapp_messages` desde que o módulo existe, e a
   * publicação do Realtime tinha UMA tabela da aplicação — `notifications`.
   * A assinatura nunca recebeu um evento sequer.
   *
   * As duas pontas envelhecem separadas: a tela assina e o banco publica. Este
   * teste existe para elas não voltarem a discordar em silêncio.
   */

  const publicadas = () => tabelasPublicadas('supabase_realtime');

  it('o banco publica a tabela que a tela assina', () => {
    const hook = readFileSync(join(__dirname, 'hooks', 'useConversas.ts'), 'utf8');
    expect(hook).toContain("table: 'whatsapp_messages'");
    expect(publicadas().has('whatsapp_messages')).toBe(true);
  });

  it('e publica só as colunas necessárias — nunca o conteúdo', () => {
    /*
     * O Realtime manda para o navegador a linha que trafegou na replicação.
     * Publicando a tabela inteira, o corpo da mensagem e o `raw` iriam junto,
     * para toda aba aberta. A tela não precisa de nenhum dos dois: o handler só
     * manda buscar de novo, e a busca passa pela RLS.
     */
    const colunas = publicadas().get('whatsapp_messages');
    expect(colunas, 'a publicação tem de ter lista de colunas').toBeTruthy();

    for (const proibida of ['raw', 'body', 'transcript']) {
      expect(colunas, proibida).not.toContain(proibida);
    }
    // `id` é a identidade da réplica; `conversation_id` é o que a policy de
    // leitura consulta — sem ela o Realtime não avalia quem pode ver.
    expect(colunas).toContain('id');
    expect(colunas).toContain('conversation_id');
  });
});
