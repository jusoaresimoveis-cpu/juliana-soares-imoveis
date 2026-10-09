import { describe, expect, it } from 'vitest';
import { definicaoDaFuncao, semComentarios } from '../../../supabase/testes/esquema';

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
