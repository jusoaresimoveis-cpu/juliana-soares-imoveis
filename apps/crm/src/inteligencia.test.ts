import { describe, expect, it } from 'vitest';
import { definicaoDaFuncao, semComentarios } from '../../../supabase/testes/esquema';
import {
  acharProblemas,
  linkDoGerenciador,
  motivoDo,
  rotuloDoDestino,
  rotuloDoObjetivo,
  VEREDITO_META,
  EVENTOS_PARA_APRENDER,
  type CampanhaInteligencia,
  type Inteligencia,
} from './inteligencia';

/**
 * A mesa de decisão de verba é a tela mais perigosa deste CRM: ela não mostra
 * dado, ela EMITE OPINIÃO sobre onde pôr e onde tirar dinheiro. Errado, o
 * dashboard confunde; errada, esta tela manda desligar a campanha que estava
 * funcionando.
 *
 * O que estes testes guardam não são os números — são as TRAVAS. Cada uma
 * existe porque, sem ela, a ferramenta produziria uma recomendação confiante e
 * infundada nos volumes reais desta imobiliária.
 */

/*
 * A definicao VIGENTE da funcao, onde quer que ela more — hoje, o texto da 108,
 * que substituiu inteira a da 107. Ler uma versao anterior testaria uma
 * definicao que o banco nao usa mais, e o teste continuaria verde afirmando
 * algo sobre codigo morto.
 */
const BRUTO = definicaoDaFuncao('mkt_inteligencia').texto;

/**
 * O SQL SEM os comentários.
 *
 * As migrações deste projeto explicam por escrito o que NÃO fazem — "a porta é
 * `e_admin` e não `is_admin_or_above`", "`furthest_position >= 5` escrito à mão
 * quebra quando alguém insere uma etapa". Um teste que procura no arquivo cru
 * encontra a proibição no texto que a proíbe e falha — ou, pior, passa porque a
 * prosa cita o que o código deixou de fazer.
 *
 * Tudo aqui é asserção sobre CÓDIGO. O comentário é documentação, não contrato.
 */
const SQL = semComentarios(BRUTO);

/** `Intl` separa o símbolo da moeda com espaço NÃO-QUEBRÁVEL (U+00A0). */
const n = (s: string) => s.replace(/\u00a0/g, ' ');

function campanha(p: Partial<CampanhaInteligencia> = {}): CampanhaInteligencia {
  return {
    id: '1',
    nome: 'Campanha',
    status: 'ACTIVE',
    objetivo: 'OUTCOME_LEADS',
    destino: 'WHATSAPP',
    conta: 'act_123',
    conta_nome: 'Conta',
    moeda: 'BRL',
    imovel: null,
    imovel_id: null,
    lance: null,
    orcamento: 2200,
    orcamento_tipo: 'diario',
    orcamento_nivel: 'campanha',
    conjuntos: null,
    gasto: 11784,
    dias: 6,
    ultimo_dia: '2026-08-23',
    impressoes: 3734,
    cliques: 50,
    cliques_link: 15,
    ctr: 0.402,
    cpc: 786,
    cpm: 3156,
    resultados_meta: 11,
    leads: 9,
    atendidos: 8,
    qualificados: 0,
    propostas: 0,
    vendas: 0,
    vgv: null,
    visitas_agendadas: 0,
    visitas_realizadas: 0,
    cpl: 1309,
    cpl_piso: 792,
    cpl_teto: 3777,
    cpql: null,
    custo_visita: null,
    resposta_min: 4,
    veredito: 'sem_leitura',
    faltam: 1,
    moedas: 1,
    ...p,
  };
}

function painel(p: Partial<Inteligencia> = {}): Inteligencia {
  return {
    periodo: { de: '2026-08-18', ate: '2026-08-23', dias: 6 },
    provisorio_desde: '2026-08-20',
    meta_cpl: 600,
    teto_cpl: 1200,
    resposta_casa: 9,
    sincronizacao: { ok: true, quando: '2026-08-23T05:07:10Z' },
    etapas: { visita: 3, proposta: 5, venda: 6, primeira: 1 },
    cobertura: { leads: 32, com_ad: 30, na_tela: 30, por_origem: { meta_ads: 30 } },
    resumo: {
      gasto: 76579,
      moedas: 1,
      moeda: 'BRL',
      impressoes: 31160,
      cliques: 440,
      cliques_link: 135,
      campanhas: 17,
      contas: 3,
    },
    campanhas: [campanha()],
    ...p,
  };
}

/* -------------------------------------------------------------------------- */

describe('as travas do veredito, no SQL', () => {
  it('a porta é `e_admin`, e nunca `is_admin_or_above`', () => {
    /*
     * `is_admin_or_above` aceita gerente. Gerente distribui lead e cobra
     * corretor; decidir onde a verba entra e sai é do dono. Trocar uma pela
     * outra aqui abriria a tela de dinheiro para o cargo de operação, e o
     * commit pareceria uma simplificação.
     */
    expect(SQL).toContain('public.e_admin(v_org)');
    expect(SQL, 'a porta virou is_admin_or_above').not.toContain('is_admin_or_above');
  });

  it('a função é SECURITY INVOKER', () => {
    // Nenhuma função definer deste projeto devolve valor de gasto, e é isso que
    // sustenta a separação entre as duas BMs da casa. Uma definer aqui
    // devolveria o dinheiro das duas para quem só pode ver uma.
    expect(SQL).toMatch(/create or replace function public\.mkt_inteligencia[\s\S]{0,200}security invoker/);
    expect(SQL).not.toMatch(/create or replace function public\.mkt_inteligencia[\s\S]{0,200}security definer/);
  });

  it('sem TETO declarado, nenhum veredito é emitido', () => {
    /*
     * O teto e o obrigatorio, nao o alvo. Um semaforo sem limite externo so
     * compara campanhas entre si — e num mes inteiro ruim alguma coisa fica
     * verde e recebe mais verba.
     */
    expect(SQL).toMatch(/when v_teto is null\s+then 'sem_meta'/);
  });

  it('o vermelho compara o MELHOR caso da faixa com o teto', () => {
    /*
     * `cpl_piso` e a ponta otimista. Se nem ela cabe no maximo que a casa
     * aceita pagar, nao e azar de amostra: e preco.
     *
     * A versao anterior usava `cpl >= 1.5 * alvo` — um multiplicador que EU
     * escolhi, e que com o numero lido como teto colocava o vermelho 50% ACIMA
     * do maximo declarado. O cliente encontrou olhando a tela.
     */
    expect(SQL).toMatch(/c\.cpl_piso >= v_teto\s+then 'revisar'/);
    expect(SQL, 'multiplicador inventado voltou').not.toMatch(/1\.5 \* v_/);
    expect(SQL, 'multiplicador inventado voltou').not.toMatch(/0\.8 \* v_/);
  });

  it('o verde exige o palpite abaixo do alvo E o PIOR caso dentro do teto', () => {
    /*
     * A segunda condicao e a que faz o trabalho: o topo da faixa carrega o
     * tamanho da amostra dentro dele, entao campanha com poucos leads — que nao
     * tem topo — nunca chega aqui. Foi o que substituiu o limiar de 25 leads.
     */
    expect(SQL).toMatch(
      /v_alvo is not null and c\.cpl <= v_alvo[\s\S]{0,120}c\.cpl_teto <= v_teto then 'rende'/,
    );
    expect(SQL, 'o limiar de 25 leads voltou').not.toMatch(/leads >= 25/);
  });

  it('o alvo e OPCIONAL, e sem ele o verde simplesmente nao acende', () => {
    // Sem alvo ha vermelho e amarelo. Chutar um numero para destravar o verde
    // seria dar autoridade a um palpite no lugar exato onde ela mais pesa.
    expect(SQL).toContain('v_alvo is not null');
  });

  it('campanha que nao esta entregando NAO recebe veredito', () => {
    /*
     * Veredito e recomendacao de acao, e campanha parada nao tem acao possivel:
     * o dinheiro ja saiu. Apareceu com dado real — as duas primeiras campanhas
     * que o semaforo pintou de vermelho, R$ 65,29 e R$ 64,47 sem nenhum lead,
     * ja estavam pausadas havia dias, e "revisar" ali recomenda algo que ja foi
     * feito.
     *
     * `is distinct from` e nao `<>`: estado NULO e campanha que a importacao
     * nunca alcancou, e `null <> 'ACTIVE'` devolve NULO, que num CASE nao casa
     * o ramo — ela escaparia para o proximo e receberia veredito.
     */
    expect(SQL).toMatch(/when c\.effective_status is distinct from 'ACTIVE'\s+then 'parada'/);
    const bloco = SQL.slice(SQL.indexOf('case'), SQL.indexOf('end as veredito'));
    expect(bloco.indexOf("'parada'")).toBeLessThan(bloco.indexOf("'sem_meta'"));
  });

  it('a ordem dos ramos vai do que DESLIGA para o que sustenta', () => {
    /*
     * A ordem É a lógica: o primeiro `when` que casa ganha. Um verde avaliado
     * antes da checagem de sincronização é um verde que ninguém consegue
     * retirar depois, porque já virou decisão.
     */
    const bloco = SQL.slice(SQL.indexOf('when c.effective_status'), SQL.indexOf('end as veredito'));
    const pos = (t: string) => bloco.indexOf(t);
    expect(pos("'sem_meta'")).toBeLessThan(pos('v_sync_ok'));
    expect(pos("'parada'")).toBeLessThan(pos("'sem_meta'"));
    expect(pos('v_sync_ok')).toBeLessThan(pos('c.leads < 10'));
    expect(pos('c.leads < 10')).toBeLessThan(pos("'rende'"));
    expect(pos('v_resposta')).toBeLessThan(pos("'rende'"));
    // E o vermelho da faixa vem ANTES do verde: quem ja estourou o teto nao
    // pode ser resgatado por um alvo generoso logo abaixo.
    expect(pos("c.cpl_piso >= v_teto")).toBeLessThan(pos("'rende'"));
  });

  it('o piso de dez leads fica, e o motivo e da formula', () => {
    // A faixa usa a aproximacao normal da Poisson, que e ruim abaixo de cerca
    // de dez eventos. Usa-la com tres seria fingir uma precisao que ela nao tem.
    expect(SQL).toMatch(/c\.leads < 10\s+then 'sem_leitura'/);
  });

  it('o teto do custo por lead SOME quando a amostra não o sustenta', () => {
    /*
     * A trava mais importante de todas. Com n até 3, `n - 1.96·√n` é negativo:
     * os dados são compatíveis com um custo arbitrariamente alto. Sem esta
     * guarda, a campanha de 3 leads a R$ 8,64 apareceria como a mais barata da
     * conta e receberia a verba das outras.
     */
    expect(SQL).toMatch(/case when b\.leads - 1\.96 \* sqrt\(b\.leads::numeric\) > 0/);
  });

  it('a contagem de lead leva os quatro filtros do painel', () => {
    // `meta_gasto_agregado` não leva nenhum deles, e é por isso que o número
    // dela nunca bate com o do Dashboard. Repetir o defeito aqui faria a mesma
    // organização ver dois totais de leads em duas abas abertas ao mesmo tempo.
    /*
     * O recorte vai de um CTE ao SEGUINTE, e os dois marcadores são código.
     * Fatiar por texto de comentário daria -1 depois que os comentários são
     * removidos, `slice(a, -1)` devolveria o resto do arquivo inteiro, e o
     * teste passaria verde afirmando algo sobre outra parte da função.
     */
    const ini = SQL.indexOf('  l as (');
    const fim = SQL.indexOf('  v as (');
    expect(ini, 'o CTE `l` sumiu').toBeGreaterThan(0);
    expect(fim, 'o CTE `v` sumiu').toBeGreaterThan(ini);
    const l = SQL.slice(ini, fim);
    expect(l).toContain('le.excluded_at is null');
    expect(l).toContain('meta_fora_do_painel_anuncios()');
    expect(l).toContain('le.organization_id = v_org');
    // Fuso: `created_at::date` cortaria em UTC e jogaria todo lead depois das
    // 21h em São Paulo para o dia seguinte.
    expect(l).toContain('v_ini');
    expect(l).not.toContain('created_at::date');
  });

  it('as posições do funil vêm da tabela, nunca de número fixo', () => {
    // `pipeline_stages` é por organização e editável. `furthest_position >= 5`
    // escrito à mão passa a significar outra coisa no dia em que alguém insere
    // uma etapa — e continua rodando.
    expect(SQL).toContain("min(s.position) filter (where s.key = 'proposta')");
    expect(SQL).toContain('min(s.position) filter (where s.is_won)');
    // Toda ocorrência tem de apontar para uma variável, nunca para um literal.
    for (const m of SQL.matchAll(/furthest_position\s*>=\s*(\S+)/g)) {
      expect(m[1], `posição fixa no SQL: ${m[0]}`).toMatch(/^v_pos_/);
    }
  });

  it('dinheiro somado devolve NULO quando há mais de uma moeda', () => {
    // Somar real com dólar produz um número plausível e falso, que é a pior
    // categoria de erro numa tela de verba. É a regra que painel_janela já usa.
    expect(SQL).toMatch(/case when count\(distinct s\.currency\) = 1 then sum\(s\.spend_minor\) end/);
  });
});

describe('o custo por lead exibido', () => {
  it('a faixa aparece inteira quando a amostra a sustenta', () => {
    const c = campanha({ veredito: 'observar', leads: 30 });
    const t = n(motivoDo(c, 600, 1200, 'BRL'));
    expect(t).toContain('R$ 7,92');
    expect(t).toContain('R$ 37,77');
  });

  it('e vira "sem teto estimável" quando não sustenta', () => {
    /*
     * É o caso da campanha de 3 leads. Escrever um teto ali seria inventar o
     * número mais importante da linha — e ele é justamente o que decide se a
     * campanha parece boa.
     */
    const c = campanha({ veredito: 'observar', leads: 3, cpl: 864, cpl_piso: 405, cpl_teto: null });
    const t = motivoDo(c, 600, 1200, 'BRL');
    expect(t).toContain('sem teto estimável');
    expect(t).not.toContain('NaN');
  });

  it('sem leitura, a frase diz QUANTO falta e não apenas que falta', () => {
    // "Dados insuficientes" não é acionável. "Faltam 6 leads, cerca de R$ 78 no
    // ritmo atual" diz o que fazer e quanto custa fazer.
    const t = motivoDo(campanha({ veredito: 'sem_leitura', leads: 4, faltam: 6 }), 600, 1200, 'BRL');
    expect(t).toContain('faltam 6');
    expect(t).toMatch(/R\$/);
  });

  it('toda frase carrega pelo menos um número', () => {
    // Um semáforo que diz "desempenho intermediário" é opinião sem endereço:
    // quem lê não tem como discordar dele.
    for (const v of ['rende', 'observar', 'revisar', 'sem_leitura', 'sem_meta', 'parada'] as const) {
      const t = motivoDo(campanha({ veredito: v, leads: v === 'revisar' ? 0 : 9 }), 600, 1200, 'BRL');
      expect(t, `veredito ${v} sem número`).toMatch(/[0-9]/);
    }
  });

  it('e o vermelho por gasto sem resultado explica a estatística', () => {
    const t = motivoDo(campanha({ veredito: 'revisar', leads: 0, cpl: null }), 600, 1200, 'BRL');
    expect(t).toContain('2%');
  });
});

describe('os achados sobre a conta inteira', () => {
  it('a verba pulverizada é encontrada com os números reais da casa', () => {
    /*
     * O caso medido em produção: doze campanhas ativas, mediana de R$ 22/dia,
     * custo por lead da conta em torno de R$ 24. Dá cerca de 6 resultados por
     * semana por campanha, contra os 50 que a Meta precisa. Nenhuma sai do
     * aprendizado, e é isso que explica por que nada estabiliza.
     */
    const muitas = Array.from({ length: 8 }, (_, i) =>
      campanha({ id: String(i), nome: `C${i}`, orcamento: 2200, leads: 2, gasto: 5000 }),
    );
    const [a] = acharProblemas(painel({ campanhas: muitas }));
    expect(a?.chave).toBe('verba_pulverizada');
    expect(a?.gravidade).toBe('alta');
    expect(a?.detalhe).toContain(String(EVENTOS_PARA_APRENDER));
    expect(a?.quais).toHaveLength(8);
  });

  it('e não é encontrada quando a verba está concentrada', () => {
    const poucas = Array.from({ length: 3 }, (_, i) =>
      campanha({ id: String(i), orcamento: 40000, leads: 40, gasto: 40000 }),
    );
    const achados = acharProblemas(painel({ campanhas: poucas }));
    expect(achados.map((x) => x.chave)).not.toContain('verba_pulverizada');
  });

  it('gasto com resultado na Meta e zero lead no CRM é achado de gravidade alta', () => {
    // É o único item da lista que se resolve com uma configuração, e é verba
    // saindo sem deixar rastro.
    const achados = acharProblemas(
      painel({ campanhas: [campanha({ resultados_meta: 5, leads: 0, gasto: 8798 })] }),
    );
    const a = achados.find((x) => x.chave === 'sem_rastro');
    expect(a).toBeDefined();
    expect(a?.gravidade).toBe('alta');
  });

  it('campanha PAUSADA não entra em nenhum achado de conta ativa', () => {
    /*
     * Recomendar sobre campanha pausada é ruído: o dinheiro já foi e não há
     * ação possível. Pior, sugere que a ferramenta não sabe o que aconteceu.
     */
    const achados = acharProblemas(
      painel({
        campanhas: [campanha({ status: 'PAUSED', resultados_meta: 9, leads: 0 })],
      }),
    );
    expect(achados.map((x) => x.chave)).not.toContain('sem_rastro');
  });

  it('cobertura baixa é denunciada, e a alta não é', () => {
    const ruim = acharProblemas(
      painel({ cobertura: { leads: 100, com_ad: 50, na_tela: 50, por_origem: {} } }),
    );
    expect(ruim.map((x) => x.chave)).toContain('cobertura_baixa');

    // 30 de 32 é 94% — a cobertura real medida em produção.
    const boa = acharProblemas(painel());
    expect(boa.map((x) => x.chave)).not.toContain('cobertura_baixa');
  });

  it('objetivos misturados são apontados', () => {
    const achados = acharProblemas(
      painel({
        campanhas: [
          campanha({ id: 'a', objetivo: 'OUTCOME_LEADS' }),
          campanha({ id: 'b', objetivo: 'OUTCOME_ENGAGEMENT' }),
        ],
      }),
    );
    const a = achados.find((x) => x.chave === 'objetivos_misturados');
    expect(a).toBeDefined();
    expect(a?.detalhe).toContain('LEADS');
    expect(a?.detalhe).toContain('ENGAGEMENT');
  });

  it('atendimento lento é atribuído à operação, e nunca à campanha', () => {
    /*
     * Cada campanha cai sempre na mesma carteira — a regra da 095 manda o lead
     * para quem paga o anúncio. Sem esta separação, "taxa de qualificação por
     * campanha" seria só "velocidade do corretor" com outro nome, e a
     * ferramenta mandaria pausar a campanha do corretor lento.
     */
    const achados = acharProblemas(
      painel({ resposta_casa: 9, campanhas: [campanha({ resposta_min: 200, leads: 9 })] }),
    );
    const a = achados.find((x) => x.chave === 'atendimento_lento');
    expect(a).toBeDefined();
    expect(a?.detalhe).toContain('vermelho');
  });

  it('sem TETO, o primeiro achado é que o semáforo está desligado', () => {
    const [a] = acharProblemas(painel({ meta_cpl: null, teto_cpl: null }));
    expect(a?.chave).toBe('sem_meta');
    expect(a?.gravidade).toBe('alta');
  });

  it('com teto e sem alvo, o achado é outro — e mais brando', () => {
    /*
     * Sao perdas diferentes. Sem teto nao ha semaforo nenhum; sem alvo o
     * vermelho e o amarelo funcionam e so o verde nao acende. Um achado unico
     * para os dois casos diria a coisa errada em metade das vezes.
     */
    const achados = acharProblemas(painel({ meta_cpl: null, teto_cpl: 1200 }));
    const a = achados.find((x) => x.chave === 'sem_alvo');
    expect(a).toBeDefined();
    expect(a?.gravidade).toBe('media');
    expect(achados.map((x) => x.chave)).not.toContain('sem_meta');
  });

  it('os achados saem ordenados por gravidade', () => {
    const achados = acharProblemas(
      painel({
        meta_cpl: null,
        campanhas: [campanha({ cliques_link: null }), campanha({ id: '2', orcamento: null })],
      }),
    );
    const peso = { alta: 0, media: 1, baixa: 2 };
    const pesos = achados.map((x) => peso[x.gravidade]);
    expect([...pesos].sort((a, b) => a - b)).toEqual(pesos);
  });
});

describe('o link para o gerenciador', () => {
  it('tira o prefixo act_ do identificador da conta', () => {
    // O gerenciador espera o número puro em `act=`. Com o prefixo ele abre a
    // conta errada ou uma tela de "sem permissão" — e a página CARREGA, então
    // o erro passa por comportamento normal.
    const url = linkDoGerenciador('act_1600000000000001', '120200000000000002');
    expect(url).toContain('act=1600000000000001');
    expect(url).not.toContain('act=act_');
  });

  it('e leva a campanha no filtro, pelo id real', () => {
    const url = linkDoGerenciador('act_1', '999');
    expect(decodeURIComponent(url)).toContain('"campaign.id"');
    expect(decodeURIComponent(url)).toContain('999');
  });
});

describe('rótulos', () => {
  it('o destino separa WhatsApp de formulário', () => {
    // Dentro do mesmo OUTCOME_LEADS, "lead" significa conversa iniciada num
    // caso e cadastro preenchido no outro. São denominadores diferentes.
    expect(rotuloDoDestino('WHATSAPP')).toBe('WhatsApp');
    expect(rotuloDoDestino('MESSAGING_INSTAGRAM_DIRECT_WHATSAPP')).toBe('WhatsApp');
    expect(rotuloDoDestino('ON_AD')).toBe('Formulário');
    // `UNDEFINED` é ausência com nome: vira nulo para a tela escrever "—".
    expect(rotuloDoDestino('UNDEFINED')).toBeNull();
    expect(rotuloDoDestino(null)).toBeNull();
  });

  it('o objetivo perde o prefixo que a Meta põe em tudo', () => {
    expect(rotuloDoObjetivo('OUTCOME_LEADS')).toBe('Cadastros');
    expect(rotuloDoObjetivo('OUTCOME_ENGAGEMENT')).toBe('Engajamento');
    // Objetivo que ainda não conhecemos aparece legível, não em branco.
    expect(rotuloDoObjetivo('OUTCOME_INVENTADO')).toBe('INVENTADO');
  });

  it('todo veredito tem rótulo, cor e explicação', () => {
    for (const [chave, m] of Object.entries(VEREDITO_META)) {
      expect(m.rotulo, chave).toBeTruthy();
      expect(m.cor, chave).toBeTruthy();
      expect(m.explica.length, chave).toBeGreaterThan(20);
    }
  });
});
