import { describe, expect, it } from 'vitest';
import {
  colapsado,
  definicaoDaFuncao,
  definicaoDoGatilho,
  definicaoDoIndice,
  gatilhosDaTabela,
  semComentarios,
  valoresDoCheck,
} from '../../../supabase/testes/esquema';

/**
 * O cartão que anda sozinho — a migração 122.
 *
 * O que estes testes guardam não é o comportamento (isso é `supabase/testes/
 * atendimento.test.ts`, que interroga um Postgres de verdade): é o DESENHO.
 *
 * Cada afirmação aqui existe porque o caminho contrário é tentador e quebra em
 * silêncio. "Não há gatilho em leads" é a mais importante de todas: um gatilho
 * ali desfaz o arrastar do cartão, e o sintoma seria o corretor mover o lead e
 * ver ele voltar — sem erro em lugar nenhum.
 */

/**
 * O corpo da ÚLTIMA definição de uma função, que é a que vale na produção, sem
 * comentário e com os espaços colapsados.
 *
 * Ler a primeira definição deixaria o teste verde com a correção morando numa
 * versão que já foi substituída — o defeito que a 079 produziu de verdade.
 */
const corpoVigente = (nome: string) => colapsado(semComentarios(definicaoDaFuncao(nome).texto));

describe('quem manda o cartão andar', () => {
  it('NÃO existe gatilho em public.leads que reaja ao primeiro contato', () => {
    /*
     * A trava central. Um gatilho em `leads` reagindo a `first_contact_at`
     * desfaria todo salto que pula a segunda etapa, porque o BEFORE da 003
     * carimba o campo em qualquer saída da posição 1 — a condição dele olha a
     * etapa VELHA e nunca o destino.
     *
     * Quem move o cartão é a MENSAGEM: o gatilho mora em `whatsapp_messages`,
     * e nenhum gatilho de `leads` chama a mesma função nem escuta a coluna.
     */
    const daMensagem = definicaoDoGatilho('whatsapp_messages_primeiro_contato');
    expect(daMensagem.tabela).toBe('whatsapp_messages');
    expect(daMensagem.funcao).toBe('tg_lead_primeiro_contato');
    expect(daMensagem.normal).toContain('after insert on public.whatsapp_messages for each row');

    const deLeads = gatilhosDaTabela('leads');
    expect(deLeads.length, 'nenhum gatilho em leads? o leitor parou de enxergar').toBeGreaterThan(0);
    for (const g of deLeads) {
      expect(g.funcao, g.normal).not.toBe('tg_lead_primeiro_contato');
      expect(g.normal).not.toMatch(/update of [^;]*\bfirst_contact_at\b/);
    }
  });
});

describe('as guardas do gatilho', () => {
  const corpo = () => corpoVigente('tg_lead_primeiro_contato');

  it('resposta do robô não tira o lead da fila', () => {
    /*
     * A guarda que protege o futuro. Quando o agente de IA for ligado, a
     * saudação automática esvaziaria a coluna "Novo" sem ninguém ter atendido
     * nada — o oposto exato do que a 122 existe para consertar.
     */
    expect(corpo()).toContain('if not new.automatica then');
  });

  it('só anda quem está na primeira etapa ativa da própria organização', () => {
    const sql = corpo();
    expect(sql).toContain('where s.organization_id = v_org and s.is_active order by s.position limit 1');
    expect(sql).toContain('if v_etapa is not distinct from v_primeira then');
  });

  it('o destino sai da CHAVE, nunca da posição', () => {
    /*
     * `(organization_id, key)` é a única unicidade de `pipeline_stages`; o índice
     * de posição não é único. Um `where position = 2` pode devolver duas linhas —
     * e quem paga o erro é o INSERT da mensagem do cliente.
     */
    const sql = corpo();
    expect(sql).toContain("and s.key = 'em_atendimento'");
    expect(sql).not.toMatch(/position\s*=\s*2/);
    for (const guarda of ['s.organization_id = v_org', 's.is_active', 'not s.is_lost', 'not s.is_won', 's.position > v_pos']) {
      expect(sql, guarda).toContain(guarda);
    }
  });

  it('move com um UPDATE que NOMEIA stage_id, nunca atribuindo new.stage_id', () => {
    /*
     * `leads_marca_avanco` é `before update OF stage_id`, e o `update of` olha a
     * lista do SET do comando. Atribuindo em NEW, `furthest_position` ficaria em
     * 1 e o funil continuaria contando o lead em "Novo" enquanto o quadro o
     * mostra em "Em atendimento".
     */
    const sql = corpo();
    expect(sql).toContain('update public.leads set stage_id = v_destino');
    expect(sql).not.toContain('new.stage_id :=');
  });

  it('o cartão pode não andar; a mensagem do cliente entra assim mesmo', () => {
    const sql = corpo();
    expect(sql).toContain('exception when others then');
    expect(sql).toContain('raise warning');
  });

  it('continua security definer — senão a policy corta a linha em silêncio', () => {
    // Quem responde nem sempre é o dono do lead. Sem `security definer` o UPDATE
    // afetaria zero linhas, sem erro nenhum.
    expect(corpo()).toContain('security definer');
  });
});

describe('o que a 092 ensinou, e a 122 não pode desfazer', () => {
  const corpo = () => corpoVigente('tg_lead_primeiro_contato');

  it('o primeiro contato continua sendo a hora da MENSAGEM, não a hora do banco', () => {
    /*
     * A mensagem do celular chega pelo webhook com atraso. `now()` poria na conta
     * um tempo de resposta que não foi o do corretor — e esse número é a razão de
     * a coluna existir. Custou 1.616 mensagens medidas para ser descoberto.
     */
    const sql = corpo();
    expect(sql).toContain('set first_contact_at = new.occurred_at');
    expect(sql).toContain('(first_contact_at is null or first_contact_at > new.occurred_at)');
    expect(sql).not.toContain('set first_contact_at = now()');
  });

  it('e o lead continua sendo achado pela CONVERSA quando a mensagem não o nomeia', () => {
    // A maioria das saídas nasce com `lead_id` nulo. Foi para isso que a 092 existiu.
    expect(corpo()).toContain('coalesce( new.lead_id, (select c.lead_id from public.whatsapp_conversations c');
  });
});

describe('a fila de quem espera resposta — a 124', () => {
  const corpo = () => corpoVigente('tg_lead_espera');

  it('a mensagem que CHEGA abre a espera; a que sai de GENTE fecha', () => {
    const sql = corpo();
    expect(sql).toContain("if new.direction = 'entrada' then");
    expect(sql).toContain('elsif not new.automatica then');
    expect(sql).toContain('set esperando_desde = null');
  });

  it('guarda a PRIMEIRA mensagem sem resposta, não a última', () => {
    /*
     * "Esperando desde as 9h" mede a dívida. "Última mensagem às 14h" esconde as
     * cinco horas em que a pessoa escreveu três vezes e ninguém voltou.
     */
    expect(corpo()).toContain(
      'set esperando_desde = least(coalesce(esperando_desde, new.occurred_at), new.occurred_at)',
    );
  });

  it('resposta atrasada não apaga uma pergunta feita depois dela', () => {
    // Mensagem chega fora de ordem quando o processamento fica parado.
    expect(corpo()).toContain('and esperando_desde <= new.occurred_at');
  });

  it('a resposta do robô não esvazia a fila', () => {
    // Mesma regra da 122: saudação automática não é atendimento.
    expect(corpo()).toContain('not new.automatica');
  });

  it('e a fila nunca derruba a mensagem do cliente', () => {
    const sql = corpo();
    expect(sql).toContain('exception when others then');
    expect(sql).toContain('raise warning');
  });

  it('o índice cobre a consulta da fila, e só as linhas que interessam', () => {
    // O pg_dump põe o `where` do índice parcial entre parênteses.
    const indice = definicaoDoIndice('leads_esperando_idx').normal;
    expect(indice).toContain(' on public.leads ');
    expect(indice).toMatch(/ where \(?esperando_desde is not null\)?/);
  });
});

describe('o aviso de lead quente — a 124', () => {
  const corpo = () => corpoVigente('tg_lead_qualificacao');

  it('sai só na VIRADA para quente', () => {
    // Sem isso, cada retoque numa ficha já quente vira um aviso novo, e a caixa
    // de avisos ensina a ser ignorada.
    expect(corpo()).toContain(
      "if new.temperatura = 'quente' and old.temperatura is distinct from 'quente' then",
    );
  });

  it('não avisa quem acabou de marcar', () => {
    // O princípio da 074: contar a alguém o que ele mesmo acabou de fazer é
    // como uma caixa de avisos vira ruído.
    expect(corpo()).toContain('auth.uid() is null or p is distinct from auth.uid()');
  });

  it('não avisa sobre lead fechado nem perdido', () => {
    const sql = corpo();
    expect(sql).toContain('select s.is_lost or s.is_won into v_perdeu');
    expect(sql).toContain('if not coalesce(v_perdeu, false) then');
  });

  it('e o aviso pode falhar sem levar a qualificação junto', () => {
    /*
     * A lição da 113: um alarme ficou 576 execuções sem tocar porque o tipo não
     * estava no CHECK, e o erro subia calado. Aqui ele vira aviso de log.
     */
    const sql = corpo();
    expect(sql).toContain('raise warning');
    const grava = sql.indexOf('perform public.log_timeline_event');
    const avisa = sql.indexOf('perform public.create_notification');
    expect(grava).toBeGreaterThan(0);
    expect(avisa).toBeGreaterThan(grava);
  });

  it('o tipo novo entra nas DUAS listas do banco', () => {
    // A preferência é onde a pessoa desliga o aviso. Um tipo que ela não
    // alcança é um tipo que ninguém consegue silenciar — o esquecimento da 113.
    expect(valoresDoCheck('notifications_type_ck')).toContain('lead_quente');
    expect(valoresDoCheck('notification_preferences_muted_ck')).toContain('lead_quente');
  });
});
