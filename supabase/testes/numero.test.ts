import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { como, comoDono, comoDonoEDesfaz, conectar, desconectar, prepararPrivilegios, IDS } from './banco';

/**
 * O dono do número — a migration 080.
 *
 * Duas regras, e a segunda existe porque a primeira, sozinha, quebraria a
 * operação:
 *
 *   o corretor enxerga e opera o número que ele conectou, e nenhum outro;
 *   o lead que entra por um número com dono nasce no nome desse dono.
 *
 * Na fixtura o número da imobiliária A pertence ao CORRETOR, e existe um
 * segundo corretor na mesma casa. É essa segunda pessoa que dá sentido ao
 * teste: sem ela, "não vê porque é de outra imobiliária" e "não vê porque não é
 * dele" seriam a mesma pergunta.
 */

const FIXTURA = readFileSync(join(__dirname, 'fixtura.sql'), 'utf8');
const MIGRATIONS = join(__dirname, '..', 'migrations');

beforeAll(async () => {
  await conectar();
  await prepararPrivilegios(MIGRATIONS);
  const r = await comoDono(FIXTURA);
  if (r.erro) throw new Error(`fixtura não aplicou: ${r.erro}`);
}, 60_000);

afterAll(async () => {
  await desconectar();
});

describe('quem enxerga o número', () => {
  it('o dono enxerga o número dele', async () => {
    // Positiva primeiro: uma policy que negasse para todo mundo deixaria os
    // três testes de baixo verdes.
    const r = await como('corretor', 'select id, label from public.whatsapp_instances');
    expect(r.erro).toBeNull();
    expect(r.linhas.map((l) => l.id)).toEqual([IDS.instanciaA]);
  });

  it('o gerente enxerga, porque acompanha a operação', async () => {
    const r = await como('gerente', 'select id from public.whatsapp_instances');
    expect(r.erro).toBeNull();
    expect(r.linhas.length).toBe(1);
  });

  it('o colega da MESMA imobiliária não enxerga', async () => {
    /*
     * Este é o teste que a fixtura antiga não conseguia fazer.
     *
     * A policy da 010 abria a lista por organização inteira, então o número
     * pessoal de um corretor — rótulo e telefone conectado — aparecia na tela
     * de configurações de todos os colegas.
     */
    const r = await como('colega', 'select id from public.whatsapp_instances');
    expect(r.erro).toBeNull();
    expect(r.linhas.length).toBe(0);
  });

  it('nem pedindo pelo id', async () => {
    const r = await como('colega', 'select id from public.whatsapp_instances where id = $1', [
      IDS.instanciaA,
    ]);
    expect(r.erro).toBeNull();
    expect(r.linhas.length).toBe(0);
  });
});

describe('um número por corretor', () => {
  it('o segundo número do mesmo corretor é recusado', async () => {
    /*
     * A trava é GATILHO e não policy: quem grava esta linha é a edge function
     * com `service_role`, que ignora RLS por completo. Uma policy aqui seria
     * decoração — e o teste roda como dono justamente para provar isso: mesmo
     * com poderes totais, a regra segura.
     */
    const r = await comoDonoEDesfaz(`
      insert into public.whatsapp_instances
        (organization_id, label, provider, base_url, status, owner_id, created_by)
      values ('${IDS.orgA}', 'Segundo do corretor', 'uazapi',
              'https://exemplo.invalido', 'desconectada', '${IDS.corretor}', '${IDS.corretor}')
    `);
    expect(r.erro).toMatch(/cada corretor conecta um número/i);
  });

  it('mas o colega, que não tem nenhum, conecta o dele', async () => {
    // O contraponto obrigatório: se a trava fechasse para todo mundo, o
    // sintoma seria ninguém conseguir conectar — e isso não é segurança.
    const r = await comoDonoEDesfaz(`
      insert into public.whatsapp_instances
        (organization_id, label, provider, base_url, status, owner_id, created_by)
      values ('${IDS.orgA}', 'Número do colega', 'uazapi',
              'https://exemplo.invalido', 'desconectada', '${IDS.colega}', '${IDS.colega}');
      select label from public.whatsapp_instances where owner_id = '${IDS.colega}';
    `);
    expect(r.erro).toBeNull();
    expect(r.linhas.map((l) => l.label)).toEqual(['Número do colega']);
  });

  it('e o gerente pode ter mais de um', async () => {
    /*
     * O teto de um número é do CORRETOR. O gerente responde por plantão, por
     * número de campanha, por linha de recepção — limitá-lo a um transformaria
     * uma regra de organização interna em impedimento operacional.
     *
     * Quem segura o gasto é o teto da imobiliária, na 010, que continua de pé.
     */
    const r = await comoDonoEDesfaz(`
      insert into public.whatsapp_instances
        (organization_id, label, provider, base_url, status, owner_id, created_by)
      values ('${IDS.orgA}', 'Plantão', 'uazapi',
              'https://exemplo.invalido', 'desconectada', '${IDS.gerente}', '${IDS.gerente}'),
             ('${IDS.orgA}', 'Recepção', 'uazapi',
              'https://exemplo.invalido', 'desconectada', '${IDS.gerente}', '${IDS.gerente}');
      select count(*)::int as n from public.whatsapp_instances where owner_id = '${IDS.gerente}';
    `);
    expect(r.erro).toBeNull();
    expect(r.linhas[0]?.n).toBe(2);
  });
});

describe('quem é dono da fonte é dono do lead', () => {
  it('a conversa que chega no número entrega o lead ao dono dele', async () => {
    /*
     * O buraco que a 079 abriu e este gatilho fecha: a corretora enxergava a
     * CONVERSA no número dela (a 067 dá isso ao dono do número) e não enxergava
     * o LEAD daquela mesma conversa, porque lead sem responsável não é de
     * ninguém. Falar com a pessoa sem ter a ficha dela é pior do que qualquer
     * um dos dois problemas separados.
     */
    const r = await comoDonoEDesfaz(`
      insert into public.whatsapp_conversations
        (organization_id, instance_id, contact_e164, lead_id)
      values ('${IDS.orgA}', '${IDS.instanciaA}', '+5547988887777', '${IDS.leadSemDono}');
      select assigned_to from public.leads where id = '${IDS.leadSemDono}';
    `);
    expect(r.erro).toBeNull();
    expect(r.linhas[0]?.assigned_to).toBe(IDS.corretor);
  });

  it('lead que JÁ TEM dono não muda de mão quando chega mensagem', async () => {
    /*
     * A trava mais importante das duas.
     *
     * Sem o `assigned_to is null` no UPDATE, toda mensagem recebida devolveria
     * o lead ao dono do número — desfazendo em silêncio o repasse que o gerente
     * acabou de fazer à mão, e desfazendo de novo na mensagem seguinte. O dono
     * da fonte decide quem PEGA o lead, não quem fica com ele para sempre.
     */
    const r = await comoDonoEDesfaz(`
      insert into public.whatsapp_conversations
        (organization_id, instance_id, contact_e164, lead_id)
      values ('${IDS.orgA}', '${IDS.instanciaA}', '+5547988886666', '${IDS.leadDoGerente}');
      select assigned_to from public.leads where id = '${IDS.leadDoGerente}';
    `);
    expect(r.erro).toBeNull();
    expect(r.linhas[0]?.assigned_to).toBe(IDS.gerente);
  });

  it('e o vínculo feito DEPOIS também entrega o lead', async () => {
    // `processar_inbox` amarra a conversa ao lead em mais de um ramo, e às vezes
    // só numa mensagem seguinte — quando o código de referência aparece. O
    // gatilho de update é o que cobre esse caminho.
    const r = await comoDonoEDesfaz(`
      insert into public.whatsapp_conversations
        (organization_id, instance_id, contact_e164)
      values ('${IDS.orgA}', '${IDS.instanciaA}', '+5547988885555');
      update public.whatsapp_conversations set lead_id = '${IDS.leadSemDono}'
       where contact_e164 = '+5547988885555';
      select assigned_to from public.leads where id = '${IDS.leadSemDono}';
    `);
    expect(r.erro).toBeNull();
    expect(r.linhas[0]?.assigned_to).toBe(IDS.corretor);
  });
});

describe('a conversa carrega o número que a trouxe', () => {
  it('o dono do número lê rótulo e estado pela view', async () => {
    /*
     * Sem estas colunas, a tela de Conversas descobria o número cruzando
     * `instance_id` com a lista de números da organização — e a lista acabou de
     * ser recortada por dono. Um lead repassado pelo gerente traz uma conversa
     * que entrou pelo número DELE: a tela diria "número removido" e travaria a
     * resposta, com a mensagem do cliente na frente da pessoa.
     */
    const r = await comoDonoEDesfaz(`
      insert into public.whatsapp_conversations
        (organization_id, instance_id, contact_e164)
      values ('${IDS.orgA}', '${IDS.instanciaA}', '+5547988884444');
      set local role authenticated;
      select set_config('request.jwt.claims', '{"sub":"${IDS.corretor}","role":"authenticated"}', true);
      select numero_rotulo, numero_estado, numero_e_meu
        from public.whatsapp_conversas_v where contact_e164 = '+5547988884444';
    `);
    expect(r.erro).toBeNull();
    expect(r.linhas[0]?.numero_rotulo).toBe('Número da A');
    expect(r.linhas[0]?.numero_estado).toBe('conectada');
    expect(r.linhas[0]?.numero_e_meu).toBe(true);
  });

  it('o telefone conectado NÃO sai pela função', async () => {
    // O que a conversa precisa saber é se dá para responder por ali. O número
    // em si é o que a 080 acabou de tirar da vista dos colegas — devolvê-lo por
    // outra porta anularia a mudança inteira.
    const r = await comoDono(
      `select pg_get_function_result(oid) as devolve
         from pg_proc where proname = 'wa_numero_resumo'`,
    );
    expect(String(r.linhas[0]?.devolve)).not.toMatch(/phone|e164/i);
  });
});

describe('o número que a página pública publica', () => {
  /*
   * O cenário é montado inteiro dentro da transação porque a fixtura não tem
   * landing page — e não deve ter: uma fixtura que cresce para cada teste vira
   * um segundo sistema para manter.
   *
   * O imóvel e a página precisam estar publicados, senão `landing_publica`
   * responde "não encontrei" e o teste mediria isso em vez da regra.
   */
  const PAGINA = `
    update public.properties set is_published = true, slug = 'imovel-da-sonda'
     where id = '00000000-0000-4000-a000-000000000030';
    insert into public.landing_pages
      (organization_id, property_id, variant, angulo, layout, cta_kind, market, is_published)
    values ('${IDS.orgA}', '00000000-0000-4000-a000-000000000030', 'a',
            'experiencia', 'padrao', 'whatsapp', 'br', true);
  `;

  it('não é o celular do corretor, nem quando é o único conectado', async () => {
    /*
     * Na fixtura o ÚNICO número conectado é o do corretor. Antes da 081 a
     * consulta era "o conectado que deu sinal por último", então este mesmo
     * cenário devolveria o celular particular dele — impresso numa página de
     * anúncio, sem que ele tivesse concordado com isso.
     *
     * Nulo aqui é a resposta certa: a landing page esconde o botão de WhatsApp.
     * É pior do que ter o botão, e muito melhor do que publicar o telefone de
     * alguém por engano.
     */
    const r = await comoDonoEDesfaz(`
      ${PAGINA}
      select public.landing_publica('imob-a', 'br', 'imovel-da-sonda', 'a') ->> 'whatsapp' as fone;
    `);
    expect(r.erro).toBeNull();
    expect(r.linhas[0]?.fone).toBeNull();
  });

  it('é o da gestão — mesmo que o do corretor tenha dado sinal depois', async () => {
    /*
     * A positiva e a prova do critério ao mesmo tempo: o número do corretor tem
     * `last_seen_at` uma hora À FRENTE, que é o caso extremo em que a ordenação
     * antiga entregava a vaga para ele. A resposta continua sendo a da casa.
     */
    const r = await comoDonoEDesfaz(`
      ${PAGINA}
      update public.whatsapp_instances
         set connected_phone_e164 = '+5547900001111', last_seen_at = now() + interval '1 hour'
       where id = '${IDS.instanciaA}';
      insert into public.whatsapp_instances
        (organization_id, label, provider, base_url, status, owner_id, created_by,
         connected_phone_e164, last_seen_at)
      values ('${IDS.orgA}', 'Número da casa', 'uazapi', 'https://exemplo.invalido',
              'conectada', '${IDS.gerente}', '${IDS.gerente}', '+5547900002222', now());
      select public.landing_publica('imob-a', 'br', 'imovel-da-sonda', 'a') ->> 'whatsapp' as fone;
    `);
    expect(r.erro).toBeNull();
    expect(r.linhas[0]?.fone).toBe('+5547900002222');
  });
});
