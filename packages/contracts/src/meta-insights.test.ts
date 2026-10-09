import { describe, expect, it } from 'vitest';
import { META_AD_LEVELS, custoPorResultado, resultadoDaLinha, tipoDeResultado } from './index';
import { dimensoesDe, type Linha } from '../../../supabase/functions/meta-insights/dimensoes';
import { resultadosDe } from '../../../supabase/functions/meta-insights/resultados';
import { BORDAS_DE_ENTREGA, entregaDe } from '../../../supabase/functions/meta-insights/entrega';

describe('nomes de campanha, conjunto e anúncio', () => {
  const linha = (extra: Partial<Linha>): Linha => ({
    campaign_id: '111',
    adset_id: '222',
    ad_id: '333',
    ...extra,
  });

  it('o mesmo anúncio em trinta dias vira UMA dimensão', () => {
    /*
     * Sem deduplicar, o upsert recebe o mesmo (level, object_id) várias vezes
     * no mesmo lote e o Postgres recusa o comando INTEIRO: "ON CONFLICT DO
     * UPDATE command cannot affect row a second time". Não falha uma linha,
     * falha a gravação toda.
     */
    const dias = ['2026-08-01', '2026-08-02', '2026-08-03'].map((d) =>
      linha({ date_start: d, ad_name: 'Vídeo 15s' }),
    );
    const dims = dimensoesDe(dias, 'org', 'act_1', '2026-08-10T00:00:00Z');

    expect(dims).toHaveLength(3); // campanha, conjunto, anúncio — um de cada
    const chaves = dims.map((d) => `${d.level}:${d.object_id}`);
    expect(new Set(chaves).size).toBe(3);
  });

  it('nome vazio não apaga o nome que já veio', () => {
    // Basta uma linha vir sem nome para o anúncio voltar a ser um número na
    // tela, que é justamente o sintoma que estamos corrigindo.
    const dims = dimensoesDe(
      [linha({ ad_name: 'Vídeo 15s' }), linha({ ad_name: '' }), linha({})],
      'org',
      'act_1',
      'agora',
    );
    expect(dims.find((d) => d.level === 'ad')?.name).toBe('Vídeo 15s');
  });

  it('a sentinela de id ausente não vira uma dimensão chamada ""', () => {
    // O gasto usa '' como sentinela para conjunto/anúncio ausentes — é o que
    // faz a chave única funcionar. Dimensão com object_id vazio seria uma
    // linha fantasma casando com todo gasto sem conjunto.
    const dims = dimensoesDe([linha({ adset_id: '', ad_id: '' })], 'org', 'act_1', 'agora');
    expect(dims.map((d) => d.level)).toEqual(['campaign']);
  });

  it('cadastro e conversa saem de `actions`, cada um no seu campo', () => {
    const r = resultadosDe([
      { action_type: 'link_click', value: '120' },
      { action_type: 'lead', value: '7' },
      { action_type: 'onsite_conversion.messaging_conversation_started_7d', value: '13' },
    ]);
    expect(r).toEqual({ cadastros: 7, conversas: 13 });
  });

  it('anúncio sem ação nenhuma é zero, não desconhecido', () => {
    // A Meta omite o tipo de ação que ficou em zero. Ausência aqui é zero.
    expect(resultadosDe(undefined)).toEqual({ cadastros: 0, conversas: 0 });
    expect(resultadosDe([{ action_type: 'link_click', value: '4' }])).toEqual({
      cadastros: 0,
      conversas: 0,
    });
  });

  it('a métrica precisa zerada não esconde a agrupada preenchida', () => {
    /*
     * Algumas contas devolvem `lead: 0` junto de `lead_grouped: 5`. Parando no
     * primeiro tipo presente, o anúncio que converteu apareceria com zero — e
     * marcado em vermelho como desperdício, que é o pior jeito de errar numa
     * tela de decisão de verba.
     */
    const r = resultadosDe([
      { action_type: 'lead', value: '0' },
      { action_type: 'onsite_conversion.lead_grouped', value: '5' },
    ]);
    expect(r.cadastros).toBe(5);
  });

  it('as duas contagens do mesmo cadastro nunca são somadas', () => {
    // Somar `lead` com `lead_grouped` dobraria o número — e o dobro continua
    // parecendo plausível na tela, que é o que o torna perigoso.
    const r = resultadosDe([
      { action_type: 'lead', value: '6' },
      { action_type: 'onsite_conversion.lead_grouped', value: '6' },
    ]);
    expect(r.cadastros).toBe(6);
  });

  it('valor ilegível vira nulo, nunca zero', () => {
    // Zero afirma "não converteu"; nulo diz "não sabemos" e vira '—' na tela.
    expect(resultadosDe([{ action_type: 'lead', value: '' }]).cadastros).toBeNull();
    expect(resultadosDe([{ action_type: 'lead', value: 'muitos' }]).cadastros).toBeNull();
    expect(resultadosDe([{ action_type: 'lead', value: -3 }]).cadastros).toBeNull();
  });

  it('campanha de leads que gera conversa é rotulada por CONVERSA', () => {
    /*
     * É a conta do a conta de origem: 9 campanhas `OUTCOME_LEADS`, R$ 470 gastos, zero
     * cadastro de formulário e 37 conversas. `OUTCOME_LEADS` cobre quatro
     * destinos, e o dela é mensagem. Uma regra só de objetivo marcaria os nove
     * como "sem cadastro" em vermelho — errando justamente sobre os anúncios
     * que estavam funcionando.
     */
    expect(tipoDeResultado('OUTCOME_LEADS', 0, 37)).toBe('conversa');
    // Mas quando ela produz o cadastro que prometia, é cadastro.
    expect(tipoDeResultado('OUTCOME_LEADS', 12, 3)).toBe('cadastro');
  });

  it('sem resultado nenhum, o objetivo dá o rótulo da linha vazia', () => {
    // Para a linha dizer "sem cadastro" em vez de "sem clique".
    expect(tipoDeResultado('OUTCOME_LEADS', 0, 0)).toBe('cadastro');
    expect(tipoDeResultado('MESSAGES', 0, 0)).toBe('conversa');
    expect(tipoDeResultado(null, 0, 0)).toBe('clique');
  });

  it('objetivo ambíguo é decidido pelo que foi medido', () => {
    // OUTCOME_ENGAGEMENT cobre tanto conversa no WhatsApp quanto post
    // impulsionado, e a Meta não separa os dois.
    expect(tipoDeResultado('OUTCOME_ENGAGEMENT', 0, 62)).toBe('conversa');
    expect(tipoDeResultado('OUTCOME_ENGAGEMENT', 0, 0)).toBe('clique');
  });

  it('resultado não importado é nulo na tela, não zero', () => {
    expect(resultadoDaLinha('cadastro', { cadastros: null, conversas: 5 })).toBeNull();
    expect(resultadoDaLinha('conversa', { conversas: 5 })).toBe(5);
    expect(custoPorResultado(10000, null).valor).toBeNull();
    // Dividir por nulo daria Infinity, que sai formatado como "R$ ∞".
    expect(custoPorResultado(10000, 0).valor).toBeNull();
    expect(custoPorResultado(10000, 4)).toEqual({ valor: 2500, confiavel: false });
    expect(custoPorResultado(10000, 5).confiavel).toBe(true);
  });

  it('o objetivo desce da campanha para os três níveis', () => {
    // Para não classificar campanha por SUBSTRING do nome, que quebra no dia
    // em que alguém escreve "Whats" em vez de "wpp".
    const dims = dimensoesDe([linha({ objective: 'OUTCOME_LEADS' })], 'org', 'act_1', 'agora');
    expect(dims.every((d) => d.objective === 'OUTCOME_LEADS')).toBe(true);
  });
});

describe('importação do estado', () => {
  const agora = '2026-08-12T00:00:00Z';

  it('objeto sem estado fica de FORA, em vez de gravar nulo', () => {
    /*
     * Gravar nulo apagaria o último estado conhecido. A tela passaria a mostrar
     * "sem estado" para algo que ela sabia estar no ar, e o filtro esconderia
     * uma campanha ativa sem ninguém entender por quê.
     */
    const linhas = entregaDe(
      [{ id: '1', effective_status: 'ACTIVE' }, { id: '2' }, { id: '3', effective_status: '  ' }],
      'campaign',
      'org',
      'act_1',
      agora,
    );
    expect(linhas.map((l) => l.object_id)).toEqual(['1']);
  });

  it('o lote NÃO carrega nome', () => {
    /*
     * O nome vem do insights. Um lote com `name: null` o apagaria de todas as
     * linhas de uma vez — e o PostgREST exige as mesmas chaves em todas as
     * linhas do lote, então não daria para omitir caso a caso.
     */
    const [linha] = entregaDe([{ id: '1', effective_status: 'ACTIVE' }], 'ad', 'org', 'act_1', agora);
    expect(linha).toBeDefined();
    expect(Object.keys(linha!)).not.toContain('name');
    expect(Object.keys(linha!)).not.toContain('objective');
  });

  it('id repetido vira uma linha só', () => {
    // Sem deduplicar, o upsert recebe a mesma chave duas vezes no mesmo comando
    // e o Postgres recusa o lote INTEIRO — "ON CONFLICT DO UPDATE command
    // cannot affect row a second time".
    const linhas = entregaDe(
      [
        { id: '7', effective_status: 'PAUSED' },
        { id: '7', effective_status: 'ACTIVE' },
      ],
      'campaign',
      'org',
      'act_1',
      agora,
    );
    expect(linhas).toHaveLength(1);
    // A última leitura ganha: é a mais recente da paginação.
    expect(linhas[0]?.effective_status).toBe('ACTIVE');
  });

  it('objeto sem id não vira linha fantasma', () => {
    expect(entregaDe([{ effective_status: 'ACTIVE' }], 'ad', 'org', 'act_1', agora)).toEqual([]);
  });

  it('as bordas da Graph cobrem os três níveis do dicionário', () => {
    // Uma borda a menos deixaria um nível inteiro da tela sem estado — e o
    // filtro, naquele nível, esconderia tudo.
    expect(BORDAS_DE_ENTREGA.map((b) => b.nivel).sort()).toEqual([...META_AD_LEVELS].sort());
  });
});
