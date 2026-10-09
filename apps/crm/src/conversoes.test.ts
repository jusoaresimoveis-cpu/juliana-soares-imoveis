import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CONVERSOES_DEVOLVIDAS,
  CONVERSAO_META,
  CONVERSAO_NA_CONVERSA,
  CONVERSAO_NO_SITE,
  CONVERSAO_DA_ETAPA,
  CONVERSAO_JANELA_DIAS,
  ETAPAS_QUE_NAO_VOLTAM,
  DEFAULT_STAGES,
} from '@contracts';
import {
  definicaoDaFuncao,
  definicaoDaRestricao,
  definicaoDaTabela,
  funcoesVigentes,
  semComentarios,
  valoresDoCheck,
} from '../../../supabase/testes/esquema';

/**
 * A VOLTA PARA A META — as migrações 141 a 147.
 *
 * O sétimo item do método é "devolver a conversão ao Meta". A medição de 24/09
 * mostrou que não havia o que aprofundar, porque não havia nada:
 *
 *   187 leads vivos, TODOS do anúncio que abre o WhatsApp. Pelo formulário da
 *   landing page: zero. E a API de Conversões deste repositório morava dentro
 *   da função do formulário desde agosto — nunca disparou uma vez.
 *
 * O cano existia, instalado na porta que ninguém usa. Ligá-lo na porta certa
 * custou CINCO recusas da Meta, cada uma revelando um campo que a anterior
 * escondia, e nenhum deles documentado junto. Estes testes seguram o que cada
 * uma ensinou — o último bloco as lista na ordem em que apareceram.
 */

/** A definição vigente de uma função, sem comentário — só ela, e não o arquivo. */
const corpo = (nome: string) => semComentarios(definicaoDaFuncao(nome).texto);

/**
 * As funções que mexem na fila ou a alimentam, na versão vigente de cada uma:
 * as que tocam a tabela e as que chamam a API dela (`meta_conversao_*`).
 */
const funcoesDaFila = () =>
  funcoesVigentes().filter((f) => /public\.meta_(conversoes\b|conversao_)/.test(semComentarios(f.texto)));

const trabalhador = () =>
  readFileSync(join(__dirname, '..', '..', '..', 'supabase', 'functions', 'meta-conversoes', 'index.ts'), 'utf8');

const capi = () =>
  readFileSync(join(__dirname, '..', '..', '..', 'supabase', 'functions', '_shared', 'meta-capi.ts'), 'utf8');

describe('os dois vocabulários da Meta', () => {
  it('a conversa não aceita "Lead", e é isso que a 142 corrigiu', () => {
    /*
     * A recusa literal dos 42 primeiros eventos:
     *
     *   "O valor do parâmetro de nome do evento 'Lead' fornecido para seus
     *    eventos com a fonte da ação business_messaging é inválido."
     *
     * Este é o teste que impede alguém de "simplificar" as duas tabelas numa
     * só daqui a seis meses, sem ter visto o 400.
     */
    expect(CONVERSAO_NO_SITE.lead).toBe('Lead');
    expect(CONVERSAO_NA_CONVERSA.lead).not.toBe('Lead');
    expect(CONVERSAO_NA_CONVERSA.lead).toBe('LeadSubmitted');
  });

  it('toda conversão tem nome na rota comum, e o nome pode ser NOSSO', () => {
    /*
     * A rota comum (`website` e `chat`) aceita nome próprio. É por isso que
     * ela é completa e a da conversa não — e é o que devolveu a visita
     * realizada à fila na 148.
     */
    for (const c of CONVERSOES_DEVOLVIDAS) {
      expect(CONVERSAO_NO_SITE[c], c).toBeTruthy();
      expect(CONVERSAO_META[c]?.label, c).toBeTruthy();
    }
  });

  it('e a da conversa tem um buraco, que é a visita presencial', () => {
    /*
     * O único evento que existe numa rota e não na outra. A lista do CTWA não
     * tem nada que queira dizer "o cliente entrou no apartamento" — o mais
     * parecido é `ViewContent`, que para a Meta é intenção baixa.
     *
     * O `Partial` do tipo é o que torna essa ausência declarada em vez de
     * acidental, e o trabalhador descarta dizendo por quê.
     */
    expect(CONVERSAO_NA_CONVERSA.visita_realizada).toBeUndefined();
    for (const c of CONVERSOES_DEVOLVIDAS) {
      if (c !== 'visita_realizada') expect(CONVERSAO_NA_CONVERSA[c], c).toBeTruthy();
    }
  });

  it('e o trabalhador traduz com as mesmas tabelas do contrato', () => {
    /*
     * A função de borda roda em Deno e não enxerga `@contracts`, então as
     * tabelas são copiadas lá dentro — a mesma disciplina das listas de
     * qualificação na `landing-lead`. O que impede as cópias de divergirem é
     * isto aqui.
     */
    const t = trabalhador();
    for (const c of CONVERSOES_DEVOLVIDAS) {
      expect(t).toContain(`${c}: '${CONVERSAO_NO_SITE[c]}'`);
      const naConversa = CONVERSAO_NA_CONVERSA[c];
      if (naConversa) expect(t).toContain(`${c}: '${naConversa}'`);
    }
  });
});

describe('o que a fila guarda', () => {
  it('guarda o fato do CRM, nunca o nome da Meta', () => {
    /*
     * O erro de desenho da 141, e o motivo de ele importar: com dois
     * vocabulários, uma linha com "Lead" escrito nela não consegue estar certa
     * para as duas portas. No dia em que o formulário da landing receber o
     * primeiro envio, ele entraria na fila com o nome errado.
     */
    const aceitos = valoresDoCheck('meta_conversoes_evento_ck');
    for (const c of CONVERSOES_DEVOLVIDAS) expect(aceitos).toContain(c);
    expect(aceitos).not.toContain('LeadSubmitted');
    expect(aceitos).not.toContain('QualifiedLead');

    // E quem grava na fila grava o fato: nome da Meta só existe no trabalhador.
    const fila = funcoesDaFila();
    expect(fila.length, 'nenhuma função mexe na fila? o leitor parou de enxergar').toBeGreaterThan(0);
    for (const f of fila) {
      expect(semComentarios(f.texto), f.nome).not.toContain("'LeadSubmitted'");
      expect(semComentarios(f.texto), f.nome).not.toContain("'QualifiedLead'");
    }
  });

  it('e um lead nunca gera o mesmo evento duas vezes', () => {
    /*
     * O cartão volta para "Em atendimento" e avança de novo — acontece toda
     * semana. Sem a chave única a Meta contaria duas visitas, o custo por
     * visita apareceria pela METADE, e a verba seria remanejada com base num
     * número inventado. Erro que engana para o lado bom não é conferido.
     */
    expect(definicaoDaRestricao('meta_conversoes_uk').definicao).toBe('unique (lead_id, evento)');
    expect(corpo('meta_conversao_enfileirar')).toContain('on conflict (lead_id, evento) do nothing');
  });

  it('e o id mandado à Meta é o da LINHA, para retentativa não dobrar', () => {
    // Uma falha de rede numa chamada que a Meta na verdade aceitou: o reenvio
    // chega com o mesmo `event_id` e ela junta os dois num só.
    expect(trabalhador()).toContain('eventID: linha.o_id');
  });
});

describe('quem entra e quem não entra', () => {
  it('só lead com origem de anúncio — o resto nem hash sai daqui', () => {
    /*
     * Duas razões, e a segunda decide: sem `ctwa_clid` e sem `fbclid` a Meta
     * não tem como ligar a conversão a um clique; e o lead de indicação nunca
     * teve nada com ela. Mandar o telefone dele, ainda que em hash, é entregar
     * a uma empresa de fora o contato de quem chegou por conta própria.
     */
    const t = corpo('meta_conversao_enfileirar');
    expect(t).toContain('if not v_tem_origem then return; end if;');
  });

  it('e o "lead" do formulário não sai duas vezes', () => {
    // A `landing-lead` dispara na hora, com o MESMO event_id do pixel do
    // navegador. Um terceiro envio, com outro id, faria a Meta contar dois.
    const t = corpo('meta_conversao_enfileirar');
    expect(t).toContain("if _evento = 'lead' and v_metodo = 'form' then return; end if;");
  });

  it('“em atendimento” não vira evento, e isso é metade da decisão', () => {
    /*
     * Ela anda SOZINHA desde a 122, no instante em que um humano responde. Em
     * 24/09 eram 158 das 179 mudanças de etapa de toda a história, e 156 dos
     * 187 leads vivos estavam parados nela. Um evento que acontece com quase
     * todo mundo não separa ninguém de ninguém.
     */
    expect(ETAPAS_QUE_NAO_VOLTAM).toContain('em_atendimento');
    expect(ETAPAS_QUE_NAO_VOLTAM).toContain('perdido');
    expect(CONVERSAO_DA_ETAPA.em_atendimento).toBeUndefined();

    const t = corpo('tg_lead_conversao_etapa');
    expect(t).not.toContain("'em_atendimento'");
  });

  it('e a visita realizada VOLTOU, com nome próprio', () => {
    /*
     * Ela saiu na 142 e voltou na 148, e a diferença é a rota: enquanto a
     * única saída era o CTWA, não havia nome honesto para "o cliente entrou no
     * apartamento". Pela rota comum o nome é nosso.
     *
     * O que continua proibido é o atalho que a tentação oferece: mandá-la como
     * `ViewContent`, que para a Meta é alguém olhando uma página de produto —
     * jogar o sinal mais forte da casa num balde de intenção baixa.
     */
    expect(CONVERSOES_DEVOLVIDAS).toContain('visita_realizada');
    expect(CONVERSAO_NO_SITE.visita_realizada).toBe('VisitaRealizada');
    expect(ETAPAS_QUE_NAO_VOLTAM).not.toContain('visita_realizada');
    for (const nome of Object.values(CONVERSAO_NO_SITE)) expect(nome).not.toBe('ViewContent');
    for (const nome of Object.values(CONVERSAO_NA_CONVERSA)) expect(nome).not.toBe('ViewContent');
  });

  it('e sem conta oficial a conversa sai como `chat`, não como CTWA', () => {
    /*
     * A escolha é do BANCO e é automática: `business_messaging` só quando
     * existe conjunto de dados; `chat` enquanto não existe. Ninguém precisa
     * lembrar de trocar nada no dia em que a HVA tiver conta oficial — nem de
     * voltar atrás se ela perder.
     */
    const t = corpo('meta_conversoes_reivindicar');
    expect(t).toContain("then 'business_messaging'");
    expect(t).toContain('o.meta_whatsapp_dataset_id is not null');
    expect(t).toMatch(/when l\.attribution_method = 'ctwa' then 'chat'/);
  });

  it('e toda etapa que volta existe mesmo no funil', () => {
    // Uma chave digitada errada aqui não quebra nada: só produz uma etapa que
    // nunca dispara, em silêncio, para sempre.
    const chaves = DEFAULT_STAGES.map((s) => s.key);
    for (const k of Object.keys(CONVERSAO_DA_ETAPA)) expect(chaves, k).toContain(k);
    for (const k of ETAPAS_QUE_NAO_VOLTAM) expect(chaves, k).toContain(k);
  });
});

describe('o que sai e o que nunca sai', () => {
  it('telefone e e-mail só em SHA-256', () => {
    const t = capi();
    expect(t).toContain("crypto.subtle.digest('SHA-256'");
    expect(t).toContain('user_data.ph = [await hash(tel)]');
    expect(t).toContain('user_data.em = [await hash(mail)]');
  });

  it('e o clique vai CRU, porque é a Meta que precisa reconhecê-lo', () => {
    // Passar o `ctwa_clid` por hash o tornaria irreconhecível para quem o
    // emitiu — e ele é o único fio entre a conversa e o clique que foi pago.
    expect(capi()).toContain('user_data.ctwa_clid = c.ctwaClid');
  });

  it('e nome, mensagem e imóvel não são nem selecionados', () => {
    /*
     * A defesa não é "lembrar de não mandar": é a função de reivindicação não
     * devolver esses campos. O trabalhador não tem como vazar o que nunca
     * recebeu.
     */
    const reivindicar = corpo('meta_conversoes_reivindicar');
    expect(reivindicar).not.toContain('full_name');
    expect(reivindicar).not.toContain('notes');
    expect(reivindicar).toContain('l.phone_e164');
  });

  it('e o IP do servidor não se passa por IP de cliente', () => {
    /*
     * No formulário eles vêm do pedido da pessoa e sobem a correspondência. Na
     * conversa não existe pedido: mandar o IP do Supabase diria à Meta que 187
     * pessoas moram no mesmo endereço, o que PIORA a correspondência.
     */
    const t = capi();
    const i = t.indexOf("if (c.acao === 'website') {");
    expect(i).toBeGreaterThan(0);
    expect(t.slice(i, i + 300)).toContain('client_ip_address');
  });

  it('e o token nunca encosta no banco', () => {
    // A lição da 130. O trabalhador lê do ambiente da função de borda; a fila
    // guarda o que aconteceu, nunca com o que foi assinado.
    expect(capi()).toContain("Deno.env.get('META_CAPI_TOKEN')");
    // Nem coluna na fila, nem função da fila que o mencione.
    expect(definicaoDaTabela('meta_conversoes').normal).not.toContain('token');
    for (const f of funcoesDaFila()) expect(semComentarios(f.texto), f.nome).not.toContain('token');
  });
});

describe('a hora do fato, e a janela de sete dias', () => {
  it('o evento leva a hora em que aconteceu, não a do envio', () => {
    /*
     * É a diferença entre um relatório e uma mentira. A visita marcada terça
     * tem de contar na terça — senão o custo por visita do anúncio de terça
     * aparece na quinta, e a verba vai para a peça errada.
     */
    expect(trabalhador()).toContain('quando: Math.floor(quandoMs / 1000)');
    expect(corpo('tg_lead_conversao_nova')).toContain('coalesce(new.ft_occurred_at, new.created_at)');
  });

  it('e o que envelhece é marcado, não retentado para sempre', () => {
    /*
     * O defeito da 133: uma fila que se reporta ocupada para sempre porque o
     * critério de saída nunca chega. Aqui o `update` muda as mesmas linhas que
     * o `where` seleciona, então converge.
     */
    expect(CONVERSAO_JANELA_DIAS).toBe(7);
    const t = corpo('meta_conversoes_expirar');
    expect(t).toMatch(/estado in \('pendente','falhou'\)/);
    expect(t).toContain("interval '7 days'");
    expect(trabalhador()).toContain('const JANELA_MS = 7 * 24 * 3_600_000;');
  });

  it('e a fila não acorda ninguém quando está vazia', () => {
    expect(corpo('meta_conversoes_drenar')).toContain('if v_pendentes = 0 then return; end if;');
  });
});
