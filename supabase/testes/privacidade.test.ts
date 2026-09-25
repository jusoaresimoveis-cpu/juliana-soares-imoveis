import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { como, comoDono, comoDonoEDesfaz, conectar, desconectar, prepararPrivilegios, IDS } from './banco';

/**
 * A conversa pessoal do dono do número.
 *
 * O WhatsApp da imobiliária é o celular de uma pessoa. Junto do cliente entram o
 * síndico, a esposa e o grupo do churrasco. A promessa feita ao cliente é: ele
 * marca uma conversa como pessoal e ninguém mais a vê pelo CRM — nem o gestor,
 * nem quem administra o sistema.
 *
 * Promessa dessas não se sustenta em intenção. Ou tem teste, ou é conversa.
 *
 * O que estes testes NÃO provam, e é importante não confundir: quem tem a chave
 * do banco continua conseguindo ler, porque `service_role` passa por cima de
 * qualquer policy e o texto segue gravado. O que está provado aqui é que o CRM
 * não mostra.
 */

const FIXTURA = readFileSync(join(__dirname, 'fixtura.sql'), 'utf8');
const MIGRATIONS = join(__dirname, '..', 'migrations');
const INSTANCIA = '00000000-0000-4000-a000-000000000050';

/** Uma conversa comum e uma pessoal, as duas do número do corretor. */
const COMUM = '00000000-0000-4000-a000-000000000060';
const PESSOAL = '00000000-0000-4000-a000-000000000061';

beforeAll(async () => {
  await conectar();
  await prepararPrivilegios(MIGRATIONS);
  const r = await comoDono(FIXTURA);
  if (r.erro) throw new Error(`fixtura não aplicou: ${r.erro}`);

  await comoDono(
    `insert into public.whatsapp_conversations
       (id, organization_id, instance_id, contact_e164, contact_name, classification)
     values ($1, $3, $4, '+5547955550001', 'Alguém sem origem', null),
            ($2, $3, $4, '+5547955550002', 'Assunto de casa',   'pessoal')
     on conflict (id) do nothing`,
    [COMUM, PESSOAL, IDS.orgA, INSTANCIA],
  );

  await comoDono(
    `insert into public.whatsapp_messages
       (organization_id, conversation_id, instance_id, direction, dedupe_key, kind, body, occurred_at)
     values ($1, $2, $3, 'entrada', 'teste-comum-1',   'texto', 'oi, vi a placa',      now()),
            ($1, $4, $3, 'entrada', 'teste-pessoal-1', 'texto', 'amor, compra o pão',  now())
     on conflict do nothing`,
    [IDS.orgA, COMUM, INSTANCIA, PESSOAL],
  );
}, 60_000);

afterAll(async () => {
  await desconectar();
});

describe('quem enxerga a conversa pessoal', () => {
  it('o dono do número enxerga — senão a privacidade viraria censura', async () => {
    /*
     * A afirmação positiva vem primeiro, sempre. Sem ela, os três testes de
     * baixo passariam com a tabela vazia, com a policy negando tudo para todo
     * mundo, ou com o cenário montado errado.
     */
    const r = await como('corretor', `select id, contact_name from public.whatsapp_conversations where id = $1`, [PESSOAL]);
    expect(r.erro).toBeNull();
    expect(r.linhas.length).toBe(1);
  });

  it('o ADMIN da mesma imobiliária não enxerga', async () => {
    // Este é o ponto do produto: quem desenvolve e administra o sistema é
    // justamente quem não pode estar lendo a vida de quem usa.
    const r = await como('admin', `select id from public.whatsapp_conversations where id = $1`, [PESSOAL]);
    expect(r.erro).toBeNull();
    expect(r.linhas.length).toBe(0);
  });

  it('o GERENTE não enxerga, mesmo sendo o dono da imobiliária', async () => {
    const r = await como('gerente', `select id from public.whatsapp_conversations where id = $1`, [PESSOAL]);
    expect(r.linhas.length).toBe(0);
  });

  it('e as MENSAGENS dela também somem', async () => {
    /*
     * Esconder a conversa e deixar as mensagens à mostra seria pior do que não
     * esconder nada: daria a sensação de privacidade sem a privacidade. As duas
     * policies passam pela mesma função, e é este teste que garante isso.
     */
    const doDono = await como('corretor', `select body from public.whatsapp_messages where conversation_id = $1`, [PESSOAL]);
    expect(doDono.linhas.length).toBe(1);

    const doAdmin = await como('admin', `select body from public.whatsapp_messages where conversation_id = $1`, [PESSOAL]);
    expect(doAdmin.linhas.length).toBe(0);
  });

  it('pela VIEW da tela também não, que é por onde o CRM lê', async () => {
    // A view tem `security_invoker = true`. Se alguém trocar isso um dia, a
    // policy continua de pé e a tela passa a mostrar tudo — sem erro nenhum.
    const r = await como('admin', `select id from public.whatsapp_conversas_v where id = $1`, [PESSOAL]);
    expect(r.linhas.length).toBe(0);
  });
});

describe('o que continua visível', () => {
  it('a conversa SEM ORIGEM é só do dono do número — nem admin, nem gerente', async () => {
    /*
     * Esta asserção era o CONTRÁRIO até a 086, e a mudança é de produto, não de
     * implementação.
     *
     * A segunda corretora conectou o celular dela e o gerente passou a ler, na
     * tela de Conversas, tudo que chegava ali sem rastro de campanha. "Sem
     * origem" é justamente a categoria mais delicada das três: pode ser cliente
     * de indicação, pode ser o síndico, pode ser a esposa. O CRM não sabe — e
     * enquanto não souber, quem decide é quem tem o aparelho no bolso.
     *
     * O eixo deixou de ser o PAPEL e passou a ser o APARELHO.
     */
    for (const ator of ['admin', 'gerente'] as const) {
      const r = await como(ator, `select id from public.whatsapp_conversations where id = $1`, [COMUM]);
      expect(r.erro).toBeNull();
      expect(r.linhas.length, `${ator} não pode ver a sem origem de outro número`).toBe(0);
    }
  });

  it('mas o dono do número continua vendo a sem origem dele', async () => {
    // O contraponto obrigatório: se a trava fechasse para todo mundo, o
    // sintoma seria a caixa de entrada vazia — e isso não é privacidade, é
    // sistema quebrado.
    const r = await como('corretor', `select id from public.whatsapp_conversations where id = $1`, [COMUM]);
    expect(r.erro).toBeNull();
    expect(r.linhas.length).toBe(1);
  });

  it('e a gestão volta a enxergar quando a conversa vira LEAD de campanha', async () => {
    /*
     * A única porta da gestão para o celular de outra pessoa, e ela tem
     * justificativa: lead com origem comprovada veio de verba da casa, e a casa
     * acompanha. É a diferença entre supervisionar o negócio e ler o telefone
     * de alguém.
     */
    const r = await comoDonoEDesfaz(`
      update public.whatsapp_conversations set ref_code = '1002-A' where id = '${COMUM}';
      set local role authenticated;
      select set_config('request.jwt.claims', '{"sub":"${IDS.gerente}","role":"authenticated"}', true);
      select id from public.whatsapp_conversations where id = '${COMUM}';
    `);
    expect(r.erro).toBeNull();
    expect(r.linhas.length).toBe(1);
  });

  it('o aviso de mensagem nova segue a MESMA regra da tela', async () => {
    /*
     * A metade que quase ficou de fora. O corpo de `mensagem_recebida` carrega
     * 120 caracteres do TEXTO da mensagem e vira push no celular: fechar a tela
     * e deixar o aviso passar entregaria o conteúdo pela porta dos fundos, por
     * um caminho que ninguém pensa em auditar.
     */
    const r = await comoDonoEDesfaz(`
      select public.create_notification(
        '${IDS.orgA}',
        array['${IDS.gerente}', '${IDS.admin}', '${IDS.corretor}']::uuid[],
        'mensagem_recebida', 'Mensagem de alguem', 'amor, compra o pao',
        '/conversas', 'conversa', '${COMUM}', null);
      select recipient_id from public.notifications
       where related_entity_id = '${COMUM}' and type = 'mensagem_recebida';
    `);
    expect(r.erro).toBeNull();
    // Só o dono do número. O gerente e o admin não recebem nem o banner.
    expect(r.linhas.map((l) => l.recipient_id)).toEqual([IDS.corretor]);
  });

  it('o admin sabe QUANTAS pessoais existem, e nada além disso', async () => {
    const n = await como('admin', `select public.pessoais_contagem() as n`);
    expect(Number(n.linhas[0]?.n)).toBeGreaterThan(0);

    // O número serve para diagnosticar fila parada. Nome, telefone e conteúdo
    // continuam fora de alcance.
    const nada = await como('admin', `select contact_name from public.whatsapp_conversations where classification = 'pessoal'`);
    expect(nada.linhas.length).toBe(0);
  });

  it('o corretor de OUTRA imobiliária não vê nem uma nem outra', async () => {
    for (const id of [COMUM, PESSOAL]) {
      const r = await como('corretor_de_fora', `select id from public.whatsapp_conversations where id = $1`, [id]);
      expect(r.linhas.length).toBe(0);
    }
  });
});

describe('quem pode marcar como pessoal', () => {
  it('o dono do número marca', async () => {
    const r = await como(
      'corretor',
      `update public.whatsapp_conversations set classification = 'pessoal' where id = $1 returning id`,
      [COMUM],
    );
    expect(r.erro).toBeNull();
    expect(r.linhas.length).toBe(1);
  });

  it('o gerente NÃO marca a conversa de um número que não é dele', async () => {
    /*
     * Sem esta trava, o gestor poderia esconder de si mesmo — ou, pior, marcar
     * como pessoal a conversa de um cliente para tirá-la da vista de outra
     * pessoa. Quem classifica é quem conectou o número.
     *
     * A trava passou a agir mais cedo depois da 086. Antes era o GATILHO que
     * recusava, com uma frase; agora a policy de update chama
     * `pode_ver_conversa`, e o gerente sequer alcança a linha de um número que
     * não é dele. Zero linha afetada É a defesa — só mais funda do que era.
     */
    const r = await como(
      'gerente',
      `update public.whatsapp_conversations set classification = 'pessoal' where id = $1 returning id`,
      [COMUM],
    );
    expect(r.linhas.length).toBe(0);

    const conferindo = await comoDono(
      `select classification from public.whatsapp_conversations where id = $1`,
      [COMUM],
    );
    expect(conferindo.linhas[0]?.classification).toBeNull();
  });
});

describe('a função que define o que é pessoal', () => {
  it('nunca devolve nulo', async () => {
    /*
     * Ela devolvia. `null = 'pessoal'` é NULO, e `NULO or false` é NULO — uma
     * função `returns boolean` respondendo "não sei" onde deveria responder
     * "não". As policies escaparam porque `case when NULO` cai no `else`; quem
     * escreveu `not wa_e_pessoal(...)` viu 21 conversas virarem zero.
     */
    const r = await comoDono(
      `select public.wa_e_pessoal(null, false)     as comum,
              public.wa_e_pessoal(null, true)      as grupo,
              public.wa_e_pessoal('pessoal', false) as marcada,
              (public.wa_e_pessoal(null, false) is null) as devolveu_nulo`,
    );
    expect(r.linhas[0]?.comum).toBe(false);
    expect(r.linhas[0]?.grupo).toBe(true);
    expect(r.linhas[0]?.marcada).toBe(true);
    expect(r.linhas[0]?.devolveu_nulo).toBe(false);
  });

  it('grupo é pessoal por padrão, sem ninguém marcar', async () => {
    // A tela já tratava grupo como pessoal. Se a policy não concordasse, a aba
    // diria "Pessoais" e o administrador continuaria lendo.
    await comoDono(
      `insert into public.whatsapp_conversations
         (organization_id, instance_id, is_group, group_jid, group_subject, contact_name)
       values ($1, $2, true, '120363000000000099@g.us', 'Churrasco', 'Churrasco')
       on conflict do nothing`,
      [IDS.orgA, INSTANCIA],
    );

    const doAdmin = await como('admin', `select id from public.whatsapp_conversations where group_jid = '120363000000000099@g.us'`);
    expect(doAdmin.linhas.length).toBe(0);

    const doDono = await como('corretor', `select id from public.whatsapp_conversations where group_jid = '120363000000000099@g.us'`);
    expect(doDono.linhas.length).toBe(1);
  });
});
