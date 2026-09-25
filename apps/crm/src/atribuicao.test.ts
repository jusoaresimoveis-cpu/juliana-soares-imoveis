import { describe, expect, it } from 'vitest';
import { definicaoDaFuncao, definicaoDoGatilho } from '../../../supabase/testes/esquema';

/**
 * "Quem é dono da fonte é dono do lead" — o lado do ANÚNCIO.
 *
 * A 080 escreveu a regra para o WhatsApp e a 095 a completou para a landing
 * page. As duas metades têm a mesma trava e o mesmo jeito de morrer: a trava é
 * `assigned_to is null`, e a morte é alguém reescrever o gatilho sem ela — aí a
 * atribuição passa a REESCREVER o dono a cada importação de gasto, desfazendo em
 * silêncio o repasse que o gerente fez à mão. Nada quebra, nada fica vermelho, e
 * o corretor descobre pela ficha que sumiu da carteira dele.
 *
 * Nada aqui fala com banco: quem exercita gatilho de verdade é
 * `supabase/testes/`, que só roda no CI. O que sobra para cá é ler o SQL que
 * está valendo e conferir que as guardas continuam escritas nele.
 */

/** O corpo da ÚLTIMA definição de uma função — a única que vale na produção. */
function ultimaDefinicao(nome: string): { arquivo: string; corpo: string } {
  const { arquivo, texto } = definicaoDaFuncao(nome);
  return { arquivo, corpo: texto };
}

describe('de quem é o anúncio', () => {
  it('não responde para anúncio vazio', () => {
    /*
     * `ad_id` vazio é SENTINELA em `meta_ads_spend` (017): é assim que a linha de
     * gasto do nível de campanha se distingue da do anúncio. Sem `nullif`, um
     * lead com anúncio vazio casaria com as linhas agregadas de TODAS as contas
     * da casa e o `order by date desc` escolheria uma ao acaso — o lead cairia
     * na carteira de quem tivesse gastado mais recentemente, com toda a cara de
     * estar certo.
     */
    const { corpo, arquivo } = ultimaDefinicao('dono_do_anuncio');
    expect(corpo, `dono_do_anuncio (${arquivo})`).toMatch(/nullif\(\s*_ad_id\s*,\s*''\s*\)/);
  });

  it('não entrega lead a quem foi desativado', () => {
    // Carteira de conta desativada é carteira que ninguém abre. Mesma exigência
    // que a 088 pôs no dono da conexão, depois de a 087 ter posto a BM da casa
    // no nome de um usuário de teste.
    const { corpo, arquivo } = ultimaDefinicao('dono_do_anuncio');
    expect(corpo, `dono_do_anuncio (${arquivo})`).toContain('is_active');
    expect(corpo, `dono_do_anuncio (${arquivo}) parou de exigir papel na casa`).toContain(
      'user_roles',
    );
  });

  it('e devolve só o uuid do dono — nunca gasto', () => {
    /*
     * A função é `security definer` e atravessa `meta_ads_spend`, que é a tabela
     * mais restrita do domínio: só quem administra verba lê gasto. Ela existe
     * para responder UMA pergunta, e o dia em que devolver `spend_minor` junto
     * vira porta dos fundos para o número que a policy protege.
     */
    const { corpo, arquivo } = ultimaDefinicao('dono_do_anuncio');
    expect(corpo, `dono_do_anuncio (${arquivo})`).toMatch(/returns uuid/i);
    expect(corpo, `dono_do_anuncio (${arquivo}) passou a devolver gasto`).not.toMatch(
      /spend_minor|impressions|clicks/,
    );
  });
});

describe('a atribuição por anúncio nunca tira de ninguém', () => {
  it('o gatilho do lead sai na frente quando já existe dono', () => {
    const { corpo, arquivo } = ultimaDefinicao('tg_lead_do_dono_do_anuncio');
    expect(corpo, `tg_lead_do_dono_do_anuncio (${arquivo})`).toMatch(
      /new\.assigned_to is not null/,
    );
  });

  it('e o gatilho do gasto só alcança lead sem dono e não excluído', () => {
    /*
     * Este é o que dói mais se cair: ele roda de hora em hora, dentro da
     * importação. Sem `assigned_to is null`, toda importação devolveria o lead
     * ao dono do anúncio — e a correção feita à mão duraria até a hora cheia.
     */
    const { corpo, arquivo } = ultimaDefinicao('tg_gasto_adota_lead_orfao');
    expect(corpo, `tg_gasto_adota_lead_orfao (${arquivo})`).toMatch(/l\.assigned_to is null/);
    expect(corpo, `tg_gasto_adota_lead_orfao (${arquivo}) alcança lead apagado`).toMatch(
      /l\.excluded_at is null/,
    );
  });

  it('e não reescreve a linha quando não há a quem entregar', () => {
    /*
     * `set assigned_to = f()` sem exigir que `f()` não seja nulo grava nulo por
     * cima de nulo: o valor não muda, mas a linha É reescrita, e o gatilho de
     * aviso da 074 acorda a cada importação. Um lead órfão de anúncio sem dono
     * resolvido viraria uma batida silenciosa de hora em hora, para sempre.
     */
    const { corpo, arquivo } = ultimaDefinicao('tg_gasto_adota_lead_orfao');
    expect(corpo, `tg_gasto_adota_lead_orfao (${arquivo})`).toMatch(
      /dono_do_anuncio\([^)]*\) is not null/,
    );
  });
});

describe('a fiação dos gatilhos', () => {
  it('o do lead roda DEPOIS do que dá dono ao cadastro manual', () => {
    /*
     * O Postgres dispara gatilhos do mesmo evento em ordem ALFABÉTICA, e é só
     * isso que garante a precedência: `leads_nasce_com_dono` (079) põe o
     * corretor como dono do que ele mesmo cadastra, e o `zz_` faz este aqui
     * chegar depois e encontrar a linha já resolvida. Renomear sem o prefixo
     * inverte a ordem e nada fica vermelho.
     */
    expect(definicaoDoGatilho('zz_lead_do_dono_do_anuncio').normal).toMatch(
      /^create trigger zz_lead_do_dono_do_anuncio before insert on public\.leads /,
    );
  });

  it('o do gasto é por COMANDO, com tabela de transição', () => {
    /*
     * A importação grava centenas de linhas de gasto por rodada. `for each row`
     * faria centenas de varreduras em `leads` para achar, quase sempre, nada —
     * e ainda chamaria `dono_do_anuncio` uma vez por linha.
     */
    const gatilho = definicaoDoGatilho('gasto_adota_lead_orfao');
    expect(gatilho.funcao).toBe('tg_gasto_adota_lead_orfao');
    expect(gatilho.normal).toContain('referencing new table as novo');
    expect(gatilho.normal).toContain('for each statement');
  });
});
