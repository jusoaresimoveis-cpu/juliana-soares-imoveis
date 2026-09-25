import { describe, expect, it } from 'vitest';
import {
  escalaDoTopo,
  caminhoSuave,
  rotulosDoEixo,
} from '@/components/dashboard/SerieDeLeads';
import {
  fatiasDaRosca,
  porcento,
  corDaOrigem,
} from '@/components/dashboard/CanaisDeAquisicao';
import { colunasDaTabela, ordenar, type LinhaCalculada } from '@/pages/Anuncios';
import { LEAD_SOURCES, META_AD_LEVELS } from '@contracts';

/**
 * Os dois gráficos do painel são SVG escrito à mão, e a conta que os desenha é
 * a única coisa entre o dado certo e um desenho errado. Erro de gráfico não
 * lança exceção: ele produz uma imagem plausível, e a pessoa decide verba em
 * cima dela.
 */

describe('entrada de leads — a escala', () => {
  it('o topo do eixo fica ACIMA do pico', () => {
    // Com o pico encostando na borda, ele parece cortado e some a noção de
    // quanto faltava para bater o recorde.
    for (const pico of [1, 3, 7, 12, 47, 180, 950]) {
      expect(escalaDoTopo(pico), `pico ${pico}`).toBeGreaterThan(pico);
    }
  });

  it('o topo é um número redondo de ler', () => {
    // Eixo terminando em 11 obriga a fazer conta para ler a altura de um ponto.
    expect(escalaDoTopo(12)).toBe(15);
    expect(escalaDoTopo(47)).toBe(50);
    expect(escalaDoTopo(180)).toBe(200);
  });

  it('nunca devolve zero, nem para pico 1', () => {
    // Zero viraria divisão por zero na coordenada Y — e `Infinity` num atributo
    // `d` faz o SVG inteiro sumir, sem erro no console.
    expect(escalaDoTopo(1)).toBeGreaterThan(0);
    expect(escalaDoTopo(0)).toBeGreaterThan(0);
  });
});

describe('entrada de leads — a curva', () => {
  const pontos = [
    [0, 40],
    [25, 10],
    [50, 30],
    [75, 0],
    [100, 20],
  ] as const;

  it('a curva PASSA por todos os pontos', () => {
    /*
     * Uma spline que apenas se aproxima dos pontos desenharia um pico de 11
     * onde o dia teve 12 — e o gráfico discordaria da tabela ao lado sem que
     * nenhum dos dois estivesse "quebrado".
     *
     * Cada segmento cúbico termina no ponto seguinte, então todos eles têm de
     * aparecer como destino de um `C`.
     */
    const d = caminhoSuave(pontos);
    for (const [x, y] of pontos.slice(1)) {
      expect(d, `ponto ${x},${y}`).toContain(`, ${x} ${y}`);
    }
    expect(d.startsWith('M 0 40')).toBe(true);
  });

  it('não produz NaN em nenhum caso de borda', () => {
    // `NaN` num atributo `d` derruba o path inteiro em silêncio: o navegador
    // não desenha nada e não reclama.
    expect(caminhoSuave([])).toBe('');
    expect(caminhoSuave([[50, 20]])).not.toContain('NaN');
    expect(caminhoSuave([[0, 0], [100, 40]])).not.toContain('NaN');
    expect(caminhoSuave(pontos)).not.toContain('NaN');
  });
});

describe('entrada de leads — os rótulos do eixo', () => {
  const serie = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      dia: `2026-08-${String((i % 28) + 1).padStart(2, '0')}`,
      n: i,
    }));

  it('no máximo seis datas, por mais longo que seja o período', () => {
    // Trinta rótulos se sobrepõem e viram uma tarja cinza.
    expect(rotulosDoEixo(serie(90))).toHaveLength(6);
    expect(rotulosDoEixo(serie(30))).toHaveLength(6);
  });

  it('período curto não repete nem inventa data', () => {
    expect(rotulosDoEixo(serie(3))).toHaveLength(3);
    expect(rotulosDoEixo(serie(1))).toHaveLength(1);
    expect(rotulosDoEixo([])).toHaveLength(0);
  });

  it('o primeiro e o último rótulo são as pontas do período', () => {
    const s = serie(30);
    const r = rotulosDoEixo(s);
    expect(r[0]?.chave).toBe(s[0]?.dia);
    expect(r[r.length - 1]?.chave).toBe(s[s.length - 1]?.dia);
  });
});

describe('canais de aquisição — a rosca', () => {
  const CIRC = 1000;

  it('as fatias LADRILHAM a circunferência inteira', () => {
    /*
     * Sobra vira um fio do trilho cinza no meio da rosca; sobreposição escurece
     * a emenda. Nos dois casos o desenho fica com um defeito que ninguém
     * consegue nomear, e a tabela ao lado continua certa — então a suspeita
     * cai sobre o dado.
     */
    const f = fatiasDaRosca(
      [
        { source: 'meta_ads', n: 61 },
        { source: 'whatsapp', n: 23 },
        { source: 'indicacao', n: 7 },
      ],
      CIRC,
    );

    const soma = f.reduce((s, x) => s + x.comprimento, 0);
    expect(soma).toBeCloseTo(CIRC, 6);

    // E cada arco começa exatamente onde o anterior parou.
    let esperado = 0;
    for (const fatia of f) {
      expect(fatia.offset).toBeCloseTo(-esperado, 6);
      esperado += fatia.comprimento;
    }
  });

  it('canal único ocupa a volta inteira', () => {
    const [f] = fatiasDaRosca([{ source: 'meta_ads', n: 92 }], CIRC);
    expect(f?.comprimento).toBeCloseTo(CIRC, 6);
    expect(f?.offset).toBe(-0);
  });

  it('sem lead nenhum não há fatia — e não há divisão por zero', () => {
    expect(fatiasDaRosca([], CIRC)).toEqual([]);
    expect(fatiasDaRosca([{ source: 'meta_ads', n: 0 }], CIRC)).toEqual([]);
  });
});

describe('canais de aquisição — a porcentagem', () => {
  it('canal pequeno não vira "0%"', () => {
    // 4 leads em 900 são 0,44%. Arredondando para inteiro viram "0%", e a soma
    // das porcentagens visíveis deixa de fechar.
    expect(porcento(4 / 900)).toBe('0,4%');
    expect(porcento(0.001)).toBe('0,1%');
  });

  it('canal único é 100%, sem casa decimal sobrando', () => {
    expect(porcento(1)).toBe('100%');
  });

  it('usa vírgula, que é como se escreve decimal em português', () => {
    expect(porcento(0.625)).toBe('62,5%');
    expect(porcento(0.5)).toBe('50%');
  });
});

describe('desempenho — o rodapé cobre a tabela inteira', () => {
  it('a soma dos colSpan bate com o número de colunas, em todos os níveis', () => {
    /*
     * Errar uma unidade não quebra nada visível: a tabela renderiza, e o total
     * simplesmente aparece embaixo do número errado — o gasto total alinhado
     * com a coluna de cliques. Ninguém percebe até decidir verba em cima disso.
     */
    for (const nivel of META_AD_LEVELS) {
      const c = colunasDaTabela(nivel);
      // rótulo + gasto + resultados + cauda
      expect(c.rotulo + 2 + c.cauda, `nível ${nivel}`).toBe(c.total);
    }
  });

  it('cada nível mostra as colunas que fazem sentido nele', () => {
    // Campanha: nome, conta, gasto, resultados, custo, cliques.
    expect(colunasDaTabela('campaign')).toMatchObject({ mostrarCampanha: false, total: 6 });
    // Conjunto ganha a coluna de campanha.
    expect(colunasDaTabela('adset')).toMatchObject({ mostrarCampanha: true, total: 7 });
    // Anúncio ganha também o "No CRM" — só ali o lead casa com o gasto.
    expect(colunasDaTabela('ad')).toMatchObject({ mostrarCampanha: true, total: 8 });
  });

  it('no nível de campanha a coluna "Campanha" não se repete', () => {
    // O objeto da linha JÁ é a campanha; repetir o texto lado a lado gasta
    // largura e faz duvidar se são a mesma coisa.
    expect(colunasDaTabela('campaign').mostrarCampanha).toBe(false);
  });
});

describe('canais de aquisição — as cores', () => {
  it('toda origem do contrato tem cor própria', () => {
    const cores = LEAD_SOURCES.map(corDaOrigem);
    expect(cores.every((c) => c.startsWith('hsl('))).toBe(true);
  });

  it('dois canais coloridos nunca compartilham a mesma cor', () => {
    /*
     * A versão anterior deste mapa, no cartão de lead, dava `bg-ok` para Google
     * E para WhatsApp — duas fatias diferentes com a mesma cor, e a legenda
     * virando a única forma de distinguir.
     *
     * Os neutros ficam de fora: `manual` e `outro` compartilham o cinza de
     * propósito, porque nenhum dos dois é canal de verdade.
     */
    const coloridas = LEAD_SOURCES.filter((s) => s !== 'manual' && s !== 'outro').map(corDaOrigem);
    expect(new Set(coloridas).size).toBe(coloridas.length);
  });

  it('origem desconhecida ganha cinza, não a cor de outro canal', () => {
    // Entre uma migração e o deploy da tela, uma origem nova chega sem entrada
    // no dicionário. Pintá-la com a cor do vizinho seria pior que o cinza.
    const cinza = corDaOrigem('canal_que_ainda_nao_existe');
    expect(cinza).toBe('hsl(220 9% 60%)');
    expect(corDaOrigem('meta_ads')).not.toBe(cinza);
  });
});

/* -------------------------------------------------------------------------- */

/**
 * Ordenar a tabela de desempenho.
 *
 * A ordem é uma resposta, não uma preferência: quem clica em "Custo" está
 * perguntando qual anúncio sai mais barato, e quem clica em "Conta" está
 * tentando separar duas contas que aparecem intercaladas. Uma ordenação que
 * erra devolve uma resposta plausível para a pergunta errada — e a decisão de
 * verba sai dali.
 */
describe('ordem da tabela de desempenho', () => {
  const linha = (
    parcial: Partial<LinhaCalculada['l']>,
    resultados: number | null,
    custo: number | null,
  ): LinhaCalculada => ({
    l: {
      object_id: parcial.nome ?? String(Math.abs(parcial.spend_minor ?? 0)),
      nome: null,
      campanha: null,
      conta: null,
      objective: null,
      status: null,
      currency: 'BRL',
      spend_minor: 0,
      impressions: null,
      clicks: null,
      cadastros: null,
      conversas: null,
      leads_atribuidos: 0,
      ...parcial,
    },
    tipo: 'conversa',
    resultados,
    custo: { valor: custo, confiavel: true },
  });

  it('o que não tem número vai para o FIM, nos dois sentidos', () => {
    /*
     * O caso que motiva a regra: "menor custo" em ordem crescente. Sem ela, o
     * topo da tabela vira uma tela de "—" — as linhas cujo custo ainda não foi
     * importado — e a pergunta fica sem resposta justamente no clique feito
     * para respondê-la.
     */
    const linhas = [
      linha({ nome: 'sem custo', spend_minor: 500 }, null, null),
      linha({ nome: 'caro', spend_minor: 300 }, 2, 15000),
      linha({ nome: 'barato', spend_minor: 100 }, 5, 2000),
    ];

    const crescente = ordenar(linhas, { chave: 'custo', desc: false }).map((x) => x.l.nome);
    expect(crescente).toEqual(['barato', 'caro', 'sem custo']);

    const decrescente = ordenar(linhas, { chave: 'custo', desc: true }).map((x) => x.l.nome);
    expect(decrescente).toEqual(['caro', 'barato', 'sem custo']);
  });

  it('empate desempata pelo gasto, do maior para o menor', () => {
    /*
     * Ordenar por conta agrupa tudo da mesma conta — que é o pedido. Dentro do
     * grupo, sem desempate, a ordem seria a que o banco devolveu por acaso e
     * mudaria a cada importação.
     */
    const linhas = [
      linha({ nome: 'b', conta: 'Conta – 2026', spend_minor: 100 }, 1, 100),
      linha({ nome: 'a', conta: 'Conta – 2026', spend_minor: 900 }, 1, 900),
      linha({ nome: 'c', conta: 'Conta – LEADS', spend_minor: 400 }, 1, 400),
    ];

    expect(ordenar(linhas, { chave: 'conta', desc: false }).map((x) => x.l.nome)).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it('nome com número no fim ordena por número, não por letra', () => {
    // Esta conta nomeia tudo assim: "Azure — 2", "Azure — 10". Sem colação
    // numérica o 10 vem antes do 2 e a lista parece embaralhada.
    const linhas = [
      linha({ nome: 'Azure — 10' }, 1, 1),
      linha({ nome: 'Azure — 2' }, 1, 1),
      linha({ nome: 'Azure — 1' }, 1, 1),
    ];
    expect(ordenar(linhas, { chave: 'nome', desc: false }).map((x) => x.l.nome)).toEqual([
      'Azure — 1',
      'Azure — 2',
      'Azure — 10',
    ]);
  });

  it('linha sem nome não encabeça a lista alfabética', () => {
    const linhas = [
      linha({ nome: null, spend_minor: 900 }, 1, 1),
      linha({ nome: 'Falcon', spend_minor: 100 }, 1, 1),
    ];
    expect(ordenar(linhas, { chave: 'nome', desc: false })[0]?.l.nome).toBe('Falcon');
  });

  it('ordenar não altera a lista recebida', () => {
    // O React compara referências. Ordenar no lugar mutaria o resultado da
    // consulta em cache e a tabela poderia não repintar.
    const linhas = [linha({ spend_minor: 1 }, 1, 1), linha({ spend_minor: 2 }, 1, 1)];
    const antes = linhas.map((x) => x.l.spend_minor);
    ordenar(linhas, { chave: 'gasto', desc: true });
    expect(linhas.map((x) => x.l.spend_minor)).toEqual(antes);
  });
});
