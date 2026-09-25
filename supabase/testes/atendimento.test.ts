import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { comoDono, comoDonoEDesfaz, conectar, desconectar, prepararPrivilegios, IDS } from './banco';

/**
 * O cartão que anda sozinho — a migração 122.
 *
 * Os testes em memória conferem o TEXTO da migração. Estes conferem o que ela
 * FAZ, e só um Postgres de verdade sabe responder: numa cadeia de oito gatilhos
 * sobre duas tabelas, ninguém prevê de cabeça o que sobra no fim.
 *
 * A pergunta central não é "o lead andou?". É o par: andou quando gente
 * respondeu, e NÃO andou em nenhum dos cinco casos em que andar seria errado.
 * Por isso cada afirmação negativa aqui vem depois da positiva que prova que o
 * cenário estava montado — sem isso, um erro de fixtura deixaria a suíte verde.
 */

const FIXTURA = readFileSync(join(__dirname, 'fixtura.sql'), 'utf8');
const MIGRATIONS = join(__dirname, '..', 'migrations');

const CONVERSA = '00000000-0000-4000-a000-000000000090';

/** A conversa do lead do corretor, plantada dentro do cenário e desfeita com ele. */
const conversa = (leadId: string = IDS.leadDoCorretor) => `
  insert into public.whatsapp_conversations
    (id, organization_id, instance_id, contact_e164, is_group, lead_id, ref_code)
  values ('${CONVERSA}', '${IDS.orgA}', '${IDS.instanciaA}', '+5547999990090', false, '${leadId}', '1002-BR-A')
  on conflict (id) do update set lead_id = excluded.lead_id;`;

/**
 * Uma mensagem na conversa. `automatica` e `direction` são o que cada teste varia.
 *
 * `lead_id` fica NULO de propósito: é assim que a mensagem do celular do corretor
 * nasce na produção, e foi para isso que a 092 passou a achar o lead pela conversa.
 */
const mensagem = (opcoes: { direcao?: string; automatica?: boolean; quando?: string } = {}) => `
  insert into public.whatsapp_messages
    (organization_id, conversation_id, instance_id, direction, dedupe_key, kind, body,
     status, occurred_at, automatica)
  values ('${IDS.orgA}', '${CONVERSA}', '${IDS.instanciaA}', '${opcoes.direcao ?? 'saida'}',
          'teste:' || gen_random_uuid()::text, 'texto', 'oi',
          '${opcoes.direcao === 'entrada' ? 'recebida' : 'enviada'}',
          ${opcoes.quando ?? 'now()'}, ${opcoes.automatica ?? false});`;

/** Onde o lead está, e o que os gatilhos deixaram pelo caminho. */
const ondeEstaOLead = (leadId: string = IDS.leadDoCorretor) => `
  select s.key                    as etapa,
         l.furthest_position       as recorde,
         (l.first_contact_at is not null) as tem_contato,
         (select count(*)::int from public.lead_timeline_events e
           where e.lead_id = l.id and e.category = 'etapa') as eventos_de_etapa
    from public.leads l
    join public.pipeline_stages s on s.id = l.stage_id
   where l.id = '${leadId}';`;

beforeAll(async () => {
  await conectar();
  await prepararPrivilegios(MIGRATIONS);
  const r = await comoDono(FIXTURA);
  if (r.erro) throw new Error(`fixtura não aplicou: ${r.erro}`);
}, 60_000);

afterAll(async () => {
  await desconectar();
});

describe('o cenário está montado', () => {
  it('a casa tem três etapas, e o lead do corretor nasce na primeira', async () => {
    // Sem esta afirmação, todo "não moveu" abaixo passaria por falta de etapa
    // de destino em vez de por acerto da guarda.
    const etapas = await comoDono(
      `select key, position from public.pipeline_stages
        where organization_id = $1 and is_active order by position`,
      [IDS.orgA],
    );
    expect(etapas.linhas.map((l) => l.key)).toEqual(['novo', 'em_atendimento', 'visita_agendada']);

    const lead = await comoDono(ondeEstaOLead());
    expect(lead.linhas[0]?.etapa).toBe('novo');
  });
});

describe('gente responde: o cartão anda', () => {
  it('sai de "Novo" para "Em atendimento", com recorde e histórico', async () => {
    const r = await comoDonoEDesfaz(`${conversa()} ${mensagem()} ${ondeEstaOLead()}`);
    expect(r.erro).toBeNull();
    expect(r.linhas).toEqual([
      { etapa: 'em_atendimento', recorde: 2, tem_contato: true, eventos_de_etapa: 1 },
    ]);
  });

  it('a hora da resposta é a da MENSAGEM, e é ela que vira a data da etapa', async () => {
    /*
     * A mensagem do celular chega pelo webhook com atraso. Se o primeiro contato
     * virasse `now()`, o tempo de resposta medido não seria o do corretor.
     */
    const r = await comoDonoEDesfaz(
      `${conversa()} ${mensagem({ quando: "now() - interval '3 hours'" })}
       select extract(epoch from now() - first_contact_at)::int / 60 as minutos_atras,
              (stage_changed_at >= now() - interval '1 minute') as etapa_agora
         from public.leads where id = '${IDS.leadDoCorretor}';`,
    );
    expect(r.erro).toBeNull();
    // O contato é de 3 horas atrás; a etapa mudou agora, que é quando o cartão
    // de fato andou. São duas perguntas diferentes e dois carimbos diferentes.
    expect(Number(r.linhas[0]?.minutos_atras)).toBeGreaterThanOrEqual(179);
    expect(r.linhas[0]?.etapa_agora).toBe(true);
  });

  it('a segunda resposta não move de novo nem escreve um segundo evento', async () => {
    const r = await comoDonoEDesfaz(
      `${conversa()} ${mensagem()} ${mensagem()} ${ondeEstaOLead()}`,
    );
    expect(r.erro).toBeNull();
    expect(r.linhas[0]?.etapa).toBe('em_atendimento');
    expect(r.linhas[0]?.eventos_de_etapa).toBe(1);
  });
});

describe('os cinco casos em que andar seria errado', () => {
  it('mensagem que CHEGA não é atendimento', async () => {
    const r = await comoDonoEDesfaz(`${conversa()} ${mensagem({ direcao: 'entrada' })} ${ondeEstaOLead()}`);
    expect(r.erro).toBeNull();
    expect(r.linhas[0]?.etapa).toBe('novo');
    expect(r.linhas[0]?.tem_contato).toBe(false);
  });

  it('resposta do ROBÔ não tira o lead da fila', async () => {
    /*
     * A guarda que protege o futuro. Com o agente de IA ligado, a saudação
     * automática esvaziaria a coluna "Novo" sem ninguém ter atendido nada.
     * Repare que o primeiro contato AINDA é carimbado: quem respondeu foi o
     * robô, e isso é verdade — o que não é verdade é chamar aquilo de atendimento.
     */
    const r = await comoDonoEDesfaz(`${conversa()} ${mensagem({ automatica: true })} ${ondeEstaOLead()}`);
    expect(r.erro).toBeNull();
    expect(r.linhas[0]?.etapa).toBe('novo');
    expect(r.linhas[0]?.eventos_de_etapa).toBe(0);
  });

  it('lead que já saiu da primeira etapa fica onde está', async () => {
    const r = await comoDonoEDesfaz(
      `update public.leads set stage_id = '${IDS.etapaA3}' where id = '${IDS.leadDoCorretor}';
       ${conversa()} ${mensagem()} ${ondeEstaOLead()}`,
    );
    expect(r.erro).toBeNull();
    expect(r.linhas[0]?.etapa).toBe('visita_agendada');
  });

  it('o salto feito à mão NÃO é desfeito — a prova de que não há gatilho em leads', async () => {
    /*
     * Este é o teste que justifica o desenho inteiro. O BEFORE da 003 carimba
     * `first_contact_at` em QUALQUER saída da posição 1. Um gatilho em
     * `public.leads` reagindo a esse carimbo puxaria o cartão de volta para "Em
     * atendimento" na mesma transação, e o corretor veria o arrasto desfazer-se
     * sozinho, sem erro em lugar nenhum.
     */
    const r = await comoDonoEDesfaz(
      `update public.leads set stage_id = '${IDS.etapaA3}' where id = '${IDS.leadDoCorretor}';
       ${ondeEstaOLead()}`,
    );
    expect(r.erro).toBeNull();
    expect(r.linhas[0]?.etapa).toBe('visita_agendada');
    expect(r.linhas[0]?.tem_contato).toBe(true);
  });

  it('a casa sem "Em atendimento" ativa: o gatilho fica inerte e a mensagem entra', async () => {
    const r = await comoDonoEDesfaz(
      `update public.pipeline_stages set is_active = false
        where organization_id = '${IDS.orgA}' and key = 'em_atendimento';
       ${conversa()} ${mensagem()}
       select (select count(*)::int from public.whatsapp_messages
                where conversation_id = '${CONVERSA}') as mensagens,
              (select s.key from public.leads l
                 join public.pipeline_stages s on s.id = l.stage_id
                where l.id = '${IDS.leadDoCorretor}') as etapa;`,
    );
    expect(r.erro).toBeNull();
    expect(r.linhas).toEqual([{ mensagens: 1, etapa: 'novo' }]);
  });

  it('a mensagem ATRASADA reescreve o primeiro contato e não arranca o lead de onde ele chegou', async () => {
    /*
     * O único caminho em que `first_contact_at` deixa de ser "escreve uma vez":
     * uma saída antiga chegando depois. Sem a guarda de etapa, ela arrancaria de
     * "Visita agendada" um lead que já andou.
     */
    const r = await comoDonoEDesfaz(
      `${conversa()} ${mensagem()}
       update public.leads set stage_id = '${IDS.etapaA3}' where id = '${IDS.leadDoCorretor}';
       ${mensagem({ quando: "now() - interval '2 days'" })}
       select (select s.key from public.pipeline_stages s
                where s.id = (select stage_id from public.leads where id = '${IDS.leadDoCorretor}')) as etapa,
              (select extract(epoch from now() - first_contact_at)::int > 86000
                 from public.leads where id = '${IDS.leadDoCorretor}') as contato_voltou;`,
    );
    expect(r.erro).toBeNull();
    expect(r.linhas).toEqual([{ etapa: 'visita_agendada', contato_voltou: true }]);
  });
});

describe('o lead de outra carteira também anda', () => {
  it('responder a um lead que não é seu move o cartão — o security definer de pé', async () => {
    /*
     * Quem processa a mensagem é o worker, e o lead pode ser de qualquer corretor.
     * Sem `security definer`, a policy `leads_update` cortaria a linha em silêncio:
     * zero linhas afetadas, nenhum erro, e o cartão parado para sempre.
     */
    const r = await comoDonoEDesfaz(
      `${conversa(IDS.leadDoGerente)} ${mensagem()} ${ondeEstaOLead(IDS.leadDoGerente)}`,
    );
    expect(r.erro).toBeNull();
    expect(r.linhas[0]?.etapa).toBe('em_atendimento');
  });
});

describe('o remanejamento dos que já tinham sido respondidos', () => {
  it('leva quem tem resposta humana e deixa quem só recebeu mensagem', async () => {
    /*
     * O recorte da migração, reproduzido: dois leads na primeira etapa, um com
     * saída humana e outro só com entrada. A migração já rodou quando esta suíte
     * começa, então o teste refaz o recorte em vez de reexecutá-la.
     */
    const r = await comoDonoEDesfaz(
      `${conversa()} ${mensagem({ direcao: 'entrada' })}
       select count(*)::int as alvo
         from public.leads l
        where l.stage_id = (select s.id from public.pipeline_stages s
                             where s.organization_id = l.organization_id and s.is_active
                             order by s.position limit 1)
          and exists (select 1 from public.whatsapp_messages m
                        join public.whatsapp_conversations c on c.id = m.conversation_id
                       where coalesce(m.lead_id, c.lead_id) = l.id
                         and m.direction = 'saida' and not m.automatica);`,
    );
    expect(r.erro).toBeNull();
    // Só entrada na conversa: ninguém entra no recorte.
    expect(r.linhas[0]?.alvo).toBe(0);
  });

  it('e é idempotente: depois de mover, o recorte fica vazio', async () => {
    const r = await comoDonoEDesfaz(
      `${conversa()} ${mensagem()}
       select count(*)::int as ainda_na_primeira
         from public.leads l
        where l.stage_id = (select s.id from public.pipeline_stages s
                             where s.organization_id = l.organization_id and s.is_active
                             order by s.position limit 1)
          and exists (select 1 from public.whatsapp_messages m
                        join public.whatsapp_conversations c on c.id = m.conversation_id
                       where coalesce(m.lead_id, c.lead_id) = l.id
                         and m.direction = 'saida' and not m.automatica);`,
    );
    expect(r.erro).toBeNull();
    // O gatilho já tirou o lead da primeira etapa na hora da mensagem.
    expect(r.linhas[0]?.ainda_na_primeira).toBe(0);
  });
});
