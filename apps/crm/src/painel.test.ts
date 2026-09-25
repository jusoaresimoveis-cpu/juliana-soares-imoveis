import { describe, expect, it } from 'vitest';
import { definicaoDaFuncao } from '../../../supabase/testes/esquema';

/**
 * As quatro regras do painel, e o motivo de este arquivo existir.
 *
 * As funções de contagem do painel foram reescritas por INTEIRO cinco vezes. A
 * cada reescrita, quem escreveu partiu da cópia que tinha à mão — e a cópia era
 * anterior a alguma correção. O rastro:
 *
 *   030  ancora as datas no fuso da organização
 *   032  tira da conta o lead marcado como conversa pessoal
 *   070  o funil soma `furthest_position`; e PERDE o `excluded_at` e o fuso
 *   079  recorta por dono; e PERDE o `excluded_at` das quatro e o
 *        `furthest_position` do funil
 *   083  as quatro juntas, e este teste
 *
 * O sintoma da última perda chegou ao cliente com as mesmas palavras da vez
 * anterior: cinco leads desqualificados aparecendo em todas as etapas,
 * "Fechado: 5" ao lado de "Conversão total: 0,0%".
 *
 * Nada aqui roda contra o banco. O que este teste pega é exatamente a falha que
 * já aconteceu duas vezes: alguém reescreve a função a partir de uma versão
 * velha, tudo compila, tudo roda, e uma correção antiga some sem deixar erro.
 */

/**
 * O corpo da ÚLTIMA definição de uma função nas migrations.
 *
 * "Última" em ordem de arquivo, que é a ordem em que o Postgres as aplica — e
 * portanto a única que está valendo na produção. Ler a primeira definição, ou
 * todas juntas, deixaria o teste verde com a correção morando numa versão que
 * já foi substituída.
 */
function ultimaDefinicao(nome: string): { arquivo: string; corpo: string } {
  const { arquivo, texto } = definicaoDaFuncao(nome);
  return { arquivo, corpo: texto };
}

const CONTAGENS = ['painel_janela', 'painel_funil', 'painel_serie', 'painel_origens'] as const;

describe('toda função de contagem do painel', () => {
  it.each(CONTAGENS)('%s tira da conta o lead marcado como pessoal', (nome) => {
    /*
     * A regra da 032. O WhatsApp da imobiliária é o celular de uma pessoa: a
     * mãe, o síndico e o entregador viram lead e entram na contagem. Com dez
     * conversas pessoais, a taxa de conversão cai um terço sem nada ter
     * acontecido no negócio.
     *
     * A asserção não é "aparece em algum lugar" — é que TODA leitura de `leads`
     * na função tem o filtro. Contar as duas ocorrências e exigir que sejam
     * iguais é o que faz um indicador NOVO ser obrigado a trazer o filtro junto.
     */
    const { corpo, arquivo } = ultimaDefinicao(nome);
    // `from` E `join`: o funil lê a tabela por `left join public.leads`, e um
    // padrão só com `from` daria zero leituras — verde por não ter procurado.
    const leituras = corpo.match(/\b(from|join) public\.leads\b/g)?.length ?? 0;
    const filtros = corpo.match(/excluded_at is null/g)?.length ?? 0;

    expect(leituras, `${nome} (${arquivo}) não lê leads?`).toBeGreaterThan(0);
    expect(filtros, `${nome} (${arquivo}): ${leituras} leituras de leads, ${filtros} filtros`).toBe(
      leituras,
    );
  });

  it.each(CONTAGENS)('%s respeita a campanha desligada, em TODA leitura de lead', (nome) => {
    /*
     * A regra da 093. Uma campanha pode ser marcada como "fora do painel" —
     * verba de recrutamento não é verba de captação — e aí nem o gasto dela
     * soma, nem os leads dela contam.
     *
     * A contagem casada é o que importa. No primeiro patch da 093, seis das sete
     * leituras de `leads` receberam o filtro e a sétima escapou por não ter
     * vírgula no fim: `contatados` ficaria maior que `leads`, e a frase "N leads
     * esperando contato" iria a NEGATIVO na primeira dobra.
     */
    const { corpo, arquivo } = ultimaDefinicao(nome);
    const leituras = corpo.match(/\b(from|join) public\.leads\b/g)?.length ?? 0;
    const filtros = corpo.match(/meta_fora_do_painel_anuncios/g)?.length ?? 0;
    expect(filtros, `${nome} (${arquivo}): ${leituras} leituras de leads, ${filtros} filtros`).toBe(
      leituras,
    );
  });

  it('e a soma do gasto ignora a campanha desligada', () => {
    // Só o gasto sairia da conta e os leads ficariam: o custo por lead pareceria
    // mais barato do que é — o número muda para o lado errado e continua com
    // toda a cara de estar certo.
    const { corpo } = ultimaDefinicao('painel_janela');
    expect(corpo.match(/meta_fora_do_painel_campanhas/g)?.length ?? 0).toBe(2);
  });

  it.each(CONTAGENS)('%s ancora o dia no fuso da imobiliária', (nome) => {
    // A regra da 030. `created_at::date` usa o fuso do SERVIDOR — UTC. Um lead
    // que entra às 21h30 no Brasil é 00h30 do dia seguinte lá, e vai para a
    // barra errada. Aparece toda noite, e o corretor compara com o relatório da
    // Meta, que usa o fuso da conta de anúncios.
    const { corpo, arquivo } = ultimaDefinicao(nome);
    expect(corpo, `${nome} (${arquivo})`).toMatch(/inicio_do_dia|at time zone/);
    expect(corpo, `${nome} (${arquivo}) voltou a comparar data crua`).not.toMatch(
      /created_at::date between/,
    );
  });

  it.each(CONTAGENS)('%s recorta pela carteira de quem está olhando', (nome) => {
    // A regra da 079. Sem ela, a corretora vê os números da imobiliária inteira.
    const { corpo, arquivo } = ultimaDefinicao(nome);
    expect(corpo, `${nome} (${arquivo})`).toContain('ve_a_carteira_toda');
  });
});

describe('o funil não conta perdido como venda', () => {
  it('soma o recorde de avanço, não a etapa atual', () => {
    /*
     * A regra da 070, perdida duas vezes.
     *
     * "Perdido" está na posição 7, depois de "Fechado" na 6. Somar por posição
     * ATUAL faz um lead perdido satisfazer `atual.position >= s.position` para
     * todas as etapas anteriores — ele aparece como venda. O `where not
     * s.is_lost` que existia só escondia a COLUNA "Perdido" da lista; não tirava
     * o lead perdido da conta das outras.
     */
    const { corpo, arquivo } = ultimaDefinicao('painel_funil');
    expect(corpo, `painel_funil (${arquivo})`).toContain('furthest_position');
    expect(corpo, `painel_funil (${arquivo}) voltou a somar a etapa atual`).not.toMatch(
      /atual\.position/,
    );
  });

  it('e as etapas vazias continuam na lista', () => {
    // O recorte por dono vai no ON do `left join`. No WHERE, o `left join`
    // viraria `inner` e as etapas sem nenhum lead sumiriam — um funil que muda
    // de tamanho conforme quem olha.
    const { corpo } = ultimaDefinicao('painel_funil');
    expect(corpo).toContain('left join public.leads');
  });
});

describe('o painel diz de quem são os números', () => {
  it('painel_indicadores devolve o escopo', () => {
    // É o que deixa a tela escrever "Sua carteira" e retirar os cartões de
    // investimento e custo por lead de quem não pode ler a verba.
    const { corpo } = ultimaDefinicao('painel_indicadores');
    expect(corpo).toContain("'escopo'");
    expect(corpo).toContain('ve_a_carteira_toda');
  });
});
