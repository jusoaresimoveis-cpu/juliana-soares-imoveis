import { describe, expect, it } from 'vitest';
import { gerarUnidades } from '@contracts';
import {
  celulaDasPartes,
  conferirTabela,
  consulteDesde,
  finalDaUnidade,
  formatarPreco,
  formatarVariacao,
  juntarComE,
  lerCelula,
  lerFinais,
  listaCurta,
  mesSeguinte,
  montarGrade,
  ordenarUnidades,
  partesDaCelula,
  prepararGeracao,
  resumoDaPlanta,
  situacoesNoMeioDoMes,
  textoDaCelula,
  unidadesQueSeguemOsFinais,
  type CelulaEditada,
  type UnidadeDaTabela,
} from './unidades';
import { valoresDoImovel as valoresNaLista } from './utils';
import { mensagemDoErro } from '@/hooks/useUnidades';

/**
 * A página "Unidades" com o caso real: o New York Residence, 90 apartamentos
 * (andares 5 a 19, finais 01 a 06) e a tabela de outubro com 10 disponíveis,
 * de R$ 840.569,40 (804) a R$ 942.072,12 (1604).
 *
 * O que se guarda aqui é o caminho do que a Juliana digita até o "a partir de"
 * do anúncio: uma célula mal lida, ou uma conferência que não grita, e um erro
 * de digitação na mais barata vira o preço do site.
 */

const SUITES = { id: 'suites', name: '2 suítes + lavabo', finals: ['02', '04', '05'] };
const DORMS = { id: 'dorms', name: '3 dormitórios', finals: ['01', '03', '06'] };

const OUTUBRO: Record<string, number> = {
  '1702': 89766468,
  '1705': 91035252,
  '1604': 94207212,
  '1502': 87228900,
  '1504': 92938428,
  '1404': 91669644,
  '1204': 89132076,
  '804': 84056940,
  '701': 88497684,
  '506': 85008528,
};

/** As 90 unidades com a tabela de outubro aplicada: 10 disponíveis, o resto vendido sem preço. */
function predio(): UnidadeDaTabela[] {
  return gerarUnidades(5, 19, ['01', '02', '03', '04', '05', '06']).map((u) => {
    const preco = OUTUBRO[u.label] ?? null;
    return {
      id: `u${u.label}`,
      label: u.label,
      floor: u.floor,
      price_cents: preco,
      status: preco ? 'disponivel' : 'vendido',
    };
  });
}

/** O que a Juliana digitou, pelo rótulo, por cima da grade aberta com `abertas`. */
function digitando(abertas: readonly UnidadeDaTabela[], porRotulo: Record<string, string>): Record<string, CelulaEditada> {
  return Object.fromEntries(
    abertas
      .filter((u) => porRotulo[u.label] !== undefined)
      .map((u) => [
        u.id,
        { texto: porRotulo[u.label] ?? '', antes: { label: u.label, status: u.status, price_cents: u.price_cents } },
      ]),
  );
}

/** A conferência sem ninguém mexer no banco entre abrir a grade e conferir. */
const conferir = (unidades: UnidadeDaTabela[], porRotulo: Record<string, string>) =>
  conferirTabela(unidades, digitando(unidades, porRotulo));

/** O prédio com o 1604 vendido pelo celular depois que o computador abriu a grade. */
const comO1604Vendido = (unidades: UnidadeDaTabela[]) =>
  unidades.map((u) => (u.label === '1604' ? { ...u, status: 'vendido' } : u));

describe('a célula da tabela', () => {
  it('o preço é disponível, como a construtora escreve', () => {
    expect(lerCelula('840.569,40', null)).toEqual({ ok: true, status: 'disponivel', price_cents: 84056940 });
    expect(lerCelula('  R$ 942.072,12 ', 90000000)).toEqual({ ok: true, status: 'disponivel', price_cents: 94207212 });
  });

  it('"v" é vendida e mantém o preço que tinha (o site não a mostra, e trocar contaria como mudança)', () => {
    expect(lerCelula('v', 84056940)).toEqual({ ok: true, status: 'vendido', price_cents: 84056940 });
    expect(lerCelula('VENDIDO', null)).toEqual({ ok: true, status: 'vendido', price_cents: null });
    expect(lerCelula('Vendida', null)).toMatchObject({ ok: true, status: 'vendido' });
  });

  it('"r" é reservada e mantém o preço; "r 850.000,00" troca', () => {
    expect(lerCelula('r', 84056940)).toEqual({ ok: true, status: 'reservado', price_cents: 84056940 });
    expect(lerCelula('Reservada', 84056940)).toEqual({ ok: true, status: 'reservado', price_cents: 84056940 });
    expect(lerCelula('r 850.000,00', 84056940)).toEqual({ ok: true, status: 'reservado', price_cents: 85000000 });
    // O "R" do "R$" não é reservada.
    expect(lerCelula('r R$ 850.000,00', null)).toEqual({ ok: true, status: 'reservado', price_cents: 85000000 });
    expect(partesDaCelula('R$ 942.072,12', null)).toEqual({ status: 'disponivel', preco: '942.072,12' });
    expect(lerCelula('r', null)).toEqual({ ok: true, status: 'reservado', price_cents: null });
  });

  it('"d" volta a disponível com o preço que tinha, e sem preço não grava', () => {
    expect(lerCelula('d', 84056940)).toEqual({ ok: true, status: 'disponivel', price_cents: 84056940 });
    expect(lerCelula('d', null)).toMatchObject({ ok: false });
  });

  it('vazio e texto que não é preço são erro, e nunca viram nada em silêncio', () => {
    expect(lerCelula('', 84056940)).toMatchObject({ ok: false });
    expect(lerCelula('   ', 84056940)).toMatchObject({ ok: false });
    expect(lerCelula('840,569,40', null)).toMatchObject({ ok: false });
    expect(lerCelula('x', null)).toMatchObject({ ok: false });
    expect(lerCelula('r abc', 84056940)).toMatchObject({ ok: false });
  });

  it('a grade abre com o estado gravado, e ler de volta não muda nada', () => {
    for (const u of predio()) {
      const leitura = lerCelula(textoDaCelula(u), u.price_cents);
      expect(leitura).toEqual({ ok: true, status: u.status, price_cents: u.price_cents });
    }
    expect(textoDaCelula({ status: 'disponivel', price_cents: 84056940 })).toBe('840.569,40');
    expect(textoDaCelula({ status: 'reservado', price_cents: 84056940 })).toBe('r');
    expect(textoDaCelula({ status: 'vendido', price_cents: null })).toBe('v');
  });

  it('no celular, situação e preço em dois campos escrevem a mesma célula', () => {
    expect(partesDaCelula('840.569,40', null)).toEqual({ status: 'disponivel', preco: '840.569,40' });
    expect(partesDaCelula('r', 84056940)).toEqual({ status: 'reservado', preco: '840.569,40' });
    expect(partesDaCelula('r 850.000,00', 84056940)).toEqual({ status: 'reservado', preco: '850.000,00' });
    expect(partesDaCelula('v', 84056940)).toEqual({ status: 'vendido', preco: '' });
    expect(partesDaCelula('', null)).toEqual({ status: 'disponivel', preco: '' });

    expect(celulaDasPartes('vendido', '840.569,40')).toBe('v');
    expect(celulaDasPartes('reservado', '')).toBe('r');
    expect(celulaDasPartes('reservado', '850.000,00')).toBe('r 850.000,00');
    expect(celulaDasPartes('disponivel', ' 840.569,40 ')).toBe('840.569,40');
    expect(lerCelula(celulaDasPartes('reservado', '850.000,00'), null)).toMatchObject({ price_cents: 85000000 });
  });
});

describe('a grade, como a tabela da construtora', () => {
  it('andares do mais alto para o mais baixo nas linhas, finais nas colunas', () => {
    const { finais, linhas, foraDaGrade } = montarGrade(predio());
    expect(finais).toEqual(['01', '02', '03', '04', '05', '06']);
    expect(linhas.map((l) => l.andar)).toEqual([19, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5]);
    expect(linhas[0]?.celulas.map((u) => u?.label)).toEqual(['1901', '1902', '1903', '1904', '1905', '1906']);
    expect(linhas.find((l) => l.andar === 8)?.celulas[3]?.label).toBe('804');
    expect(foraDaGrade).toEqual([]);
  });

  it('o andar sem um final fica com o buraco; sala sem andar e rótulo fora do padrão vão para a lista', () => {
    const unidades = [
      { label: '1001', floor: 10 },
      { label: '1002', floor: 10 },
      { label: '901', floor: 9 },
      { label: '03', floor: null },
      { label: '01', floor: null },
      { label: 'T1', floor: 0 },
    ];
    const { finais, linhas, foraDaGrade } = montarGrade(unidades);
    expect(finais).toEqual(['01', '02']);
    expect(linhas.map((l) => l.celulas.map((u) => u?.label ?? null))).toEqual([
      ['1001', '1002'],
      ['901', null],
    ]);
    expect(foraDaGrade.map((u) => u.label)).toEqual(['T1', '01', '03']);
  });

  it('o final sai do rótulo e do andar', () => {
    expect(finalDaUnidade('804', 8)).toBe('04');
    expect(finalDaUnidade('1906', 19)).toBe('06');
    expect(finalDaUnidade('-101', -1)).toBe('01');
    expect(finalDaUnidade('03', null)).toBeNull();
    expect(finalDaUnidade('8', 8)).toBeNull();
    expect(finalDaUnidade('T1', 0)).toBeNull();
  });

  it('a lista segue a grade: do alto para baixo, e os números em ordem de número', () => {
    const lista = ordenarUnidades([
      { label: '10', floor: null },
      { label: '501', floor: 5 },
      { label: '2', floor: null },
      { label: '1001', floor: 10 },
      { label: '502', floor: 5 },
    ]);
    expect(lista.map((u) => u.label)).toEqual(['1001', '501', '502', '2', '10']);
  });
});

describe('gerar as unidades do prédio', () => {
  it('os 90 apartamentos, cada um com a planta do seu final', () => {
    const g = prepararGeracao({ primeiroAndar: 5, ultimoAndar: 19, finais: ['01', '02', '03', '04', '05', '06'], plantas: [SUITES, DORMS], existentes: [] });
    expect(g.novas).toHaveLength(90);
    expect(g.novas.find((u) => u.label === '804')).toEqual({ label: '804', floor: 8, floorplan_id: 'suites' });
    expect(g.novas.find((u) => u.label === '506')).toEqual({ label: '506', floor: 5, floorplan_id: 'dorms' });
    expect(g.novas.filter((u) => u.floorplan_id === 'suites')).toHaveLength(45);
    expect(g).toMatchObject({ jaExistem: [], semPlanta: [], emDuasPlantas: [], invalidas: [] });
  });

  it('gerar de novo pula o que já existe, e não mexe no preço de ninguém', () => {
    const existentes = predio().map((u) => u.label);
    const g = prepararGeracao({ primeiroAndar: 5, ultimoAndar: 20, finais: ['01', '02'], plantas: [SUITES, DORMS], existentes });
    expect(g.novas.map((u) => u.label)).toEqual(['2001', '2002']);
    expect(g.jaExistem).toHaveLength(30);
  });

  it('final sem planta, ou em duas plantas, não gera a unidade e é dito', () => {
    const g = prepararGeracao({
      primeiroAndar: 5,
      ultimoAndar: 5,
      finais: ['01', '07'],
      plantas: [DORMS, { id: 'outra', name: 'Garden', finals: ['01'] }],
      existentes: [],
    });
    expect(g.novas).toEqual([]);
    expect(g.semPlanta).toEqual(['07']);
    expect(g.emDuasPlantas).toEqual([{ final: '01', plantas: ['3 dormitórios', 'Garden'] }]);
  });

  it('andar fora do que o banco aceita não vira unidade', () => {
    const g = prepararGeracao({ primeiroAndar: -1, ultimoAndar: -1, finais: ['01'], plantas: [DORMS], existentes: [] });
    expect(g.invalidas).toEqual(['-101']);
    expect(g.novas).toEqual([]);
  });

  it('os finais digitados', () => {
    expect(lerFinais('01, 02 03;04,,02')).toEqual({ finais: ['01', '02', '03', '04'], invalidos: [] });
    expect(lerFinais('01, 0-2, 12345')).toEqual({ finais: ['01'], invalidos: ['0-2', '12345'] });
    expect(lerFinais('  ')).toEqual({ finais: [], invalidos: [] });
  });

  it('a planta em uma linha, com os quartos sem as suítes', () => {
    expect(resumoDaPlanta({ bedrooms: 0, suites: 2, bathrooms: 3, parking_spots: null, area_built: 70 })).toBe(
      '2 suítes · 3 banheiros · 70 m²',
    );
    expect(resumoDaPlanta({ bedrooms: 2, suites: 1, bathrooms: 2, parking_spots: 1, area_built: 70.5 })).toBe(
      '2 quartos + 1 suíte · 2 banheiros · 1 vaga · 70,5 m²',
    );
    expect(resumoDaPlanta({ bedrooms: null, suites: null, bathrooms: null, parking_spots: null, area_built: null })).toBe('');
  });
});

describe('a conferência da tabela do mês', () => {
  it('a mesma tabela de novo: nada muda, nada em destaque, e nenhuma linha vai para o banco (gravar só registra o mês)', () => {
    const c = conferir(predio(), {});
    expect(c.erros.size).toBe(0);
    expect(c.mudaram).toBe(0);
    expect(c.destaques).toBe(0);
    expect(c.exigeConferi).toBe(false);
    expect(c.linhas).toEqual([]);
    expect(c.aPartirDeAntes).toBe(84056940);
    expect(c.aPartirDeDepois).toBe(84056940);
    expect(c.unidadeDoAPartirDe?.label).toBe('804');

    // Redigitar os mesmos preços, até com "R$", também não manda nada.
    const iguais = Object.fromEntries(Object.entries(OUTUBRO).map(([label, cents]) => [label, formatarPreco(cents)]));
    expect(conferir(predio(), { ...iguais, '701': 'R$ 884.976,84' }).linhas).toEqual([]);
  });

  it('a tabela de novembro com o CUB: preços novos, o "a partir de" sobe, sem destaque', () => {
    const novembro = Object.fromEntries(
      Object.entries(OUTUBRO).map(([label, cents]) => [label, formatarPreco(Math.round(cents * 1.005))]),
    );
    const c = conferir(predio(), novembro);
    expect(c.precos).toHaveLength(10);
    expect(c.linhas).toHaveLength(10);
    expect(c.destaques).toBe(0);
    expect(c.aPartirDeDepois).toBe(Math.round(84056940 * 1.005));
    expect(c.aPartirDeCaiu).toBe(false);
    expect(c.precos.every((m) => m.variacao !== null && Math.abs(m.variacao - 0.005) < 0.0001)).toBe(true);
  });

  it('vírgula no lugar errado na mais barata: o "a partir de" cai e a conferência grita', () => {
    const c = conferir(predio(), { '804': '84.056,94' });
    expect(c.aPartirDeDepois).toBe(8405694);
    expect(c.aPartirDeCaiu).toBe(true);
    expect(c.unidadeDoAPartirDe?.label).toBe('804');
    expect(c.precos[0]).toMatchObject({ de: 84056940, para: 8405694, destaque: 'caiu' });
    // O preço que caiu e o "a partir de" que caiu.
    expect(c.destaques).toBe(2);
  });

  it('variação acima de 10% fica em destaque, e o destaque vem primeiro na lista', () => {
    const c = conferir(predio(), { '1702': '999.000,00', '1705': '911.000,00' });
    expect(c.precos.map((m) => [m.unidade.label, m.destaque])).toEqual([
      ['1702', 'subiu'],
      ['1705', null],
    ]);
    expect(c.aPartirDeCaiu).toBe(false);
  });

  it('vendeu a mais barata: vai para as vendidas, e o "a partir de" passa para a próxima', () => {
    const c = conferir(predio(), { '804': 'v' });
    expect(c.vendidas.map((u) => u.label)).toEqual(['804']);
    expect(c.aPartirDeDepois).toBe(85008528);
    expect(c.unidadeDoAPartirDe?.label).toBe('506');
    expect(c.depois.disponiveis).toBe(9);
    expect(c.linhas).toEqual([{ label: '804', price_cents: 84056940, status: 'vendido' }]);
  });

  it('reservada e a que voltou à venda aparecem cada uma no seu lugar', () => {
    const c = conferir(predio(), { '701': 'r', '1901': '990.000,00' });
    expect(c.reservadas.map((m) => m.unidade.label)).toEqual(['701']);
    expect(c.voltaram).toMatchObject([{ unidade: { label: '1901' }, de: null, para: 99000000, destaque: null }]);
    expect(c.mudaram).toBe(2);
  });

  it('a primeira tabela, sem preço anterior: o preço longe dos outros fica em destaque', () => {
    const tudoVendido = predio().map((u) => ({ ...u, status: 'vendido', price_cents: null }));
    const primeira = Object.fromEntries(Object.entries(OUTUBRO).map(([label, cents]) => [label, formatarPreco(cents)]));
    const c = conferir(tudoVendido, { ...primeira, '804': '84.056,94' });
    expect(c.voltaram).toHaveLength(10);
    expect(c.voltaram.filter((m) => m.destaque).map((m) => [m.unidade.label, m.destaque])).toEqual([['804', 'longe']]);
    expect(c.aPartirDeAntes).toBeNull();
    expect(c.aPartirDeDepois).toBe(8405694);
  });

  it('célula vazia não grava: o erro vem com a unidade, e a linha dela não vai', () => {
    const c = conferir(predio(), { '804': '' });
    expect([...c.erros.keys()]).toEqual(['u804']);
    expect(c.linhas.some((l) => l.label === '804')).toBe(false);
  });
});

describe('a primeira gravação do mês', () => {
  const NOVEMBRO = '2026-11-01';

  it('com a tabela de outubro gravada, gravar em novembro exige o "Conferi", até sem mudança nenhuma', () => {
    const semMudanca = conferirTabela(predio(), {}, { aplicada: '2026-10-01', mes: NOVEMBRO });
    expect(semMudanca.tabelaNova).toBe(true);
    expect(semMudanca.destaques).toBe(0);
    expect(semMudanca.exigeConferi).toBe(true);
  });

  it('só uma venda, com a tabela velha: continua exigindo (os outros preços viram os de novembro)', () => {
    const c = conferirTabela(predio(), digitando(predio(), { '804': 'v' }), { aplicada: '2026-10-01', mes: NOVEMBRO });
    expect(c.linhas).toEqual([{ label: '804', price_cents: 84056940, status: 'vendido' }]);
    expect(c.exigeConferi).toBe(true);
  });

  it('nenhuma tabela aplicada ainda também é tabela nova', () => {
    expect(conferirTabela(predio(), {}, { aplicada: null, mes: NOVEMBRO }).tabelaNova).toBe(true);
  });

  it('a tabela do mês já aplicada: a venda do dia não pede o "Conferi"', () => {
    const c = conferirTabela(predio(), digitando(predio(), { '804': 'v' }), { aplicada: '2026-11-01', mes: NOVEMBRO });
    expect(c.tabelaNova).toBe(false);
    expect(c.exigeConferi).toBe(false);
    // Só o dia conta, como em `tabelaVigente`.
    expect(conferirTabela(predio(), {}, { aplicada: '2026-11-01T00:00:00', mes: NOVEMBRO }).tabelaNova).toBe(false);
  });
});

describe('outro aparelho mexeu com a grade aberta', () => {
  it('vendeu o 1604 pelo celular: o computador grava só o que a Juliana mudou, e o 1604 fica vendido', () => {
    const abertas = predio();
    const c = conferirTabela(comO1604Vendido(abertas), digitando(abertas, { '804': '845.000,00' }));
    expect(c.linhas).toEqual([{ label: '804', price_cents: 84500000, status: 'disponivel' }]);
    expect(c.outroAparelho).toEqual([]);
    expect(c.exigeConferi).toBe(false);
    // O "antes" é o banco relido no clique, já com a venda.
    expect(c.antes.disponiveis).toBe(9);
    expect(c.depois.disponiveis).toBe(9);
  });

  it('a Juliana mudou o preço do 1604 que o celular vendeu: a conferência mostra, e gravar exige o "Conferi"', () => {
    const abertas = predio();
    const c = conferirTabela(comO1604Vendido(abertas), digitando(abertas, { '1604': '950.000,00' }));
    expect(c.outroAparelho).toMatchObject([
      {
        unidade: { label: '1604', status: 'vendido' },
        visto: { status: 'disponivel', price_cents: 94207212 },
        vai: { status: 'disponivel', price_cents: 95000000 },
      },
    ]);
    // Contra o banco de agora, ela devolve o 1604 à venda.
    expect(c.voltaram.map((m) => m.unidade.label)).toEqual(['1604']);
    expect(c.destaques).toBe(0);
    expect(c.exigeConferi).toBe(true);
  });

  it('a célula redigitada igual, sem mudança da Juliana, não desfaz a venda do celular', () => {
    const abertas = predio();
    const c = conferirTabela(comO1604Vendido(abertas), digitando(abertas, { '1604': '942.072,12' }));
    expect(c.linhas).toEqual([]);
    expect(c.outroAparelho).toEqual([]);
  });

  it('vendeu nos dois aparelhos: nada a gravar e nada a conferir', () => {
    const abertas = predio();
    const c = conferirTabela(comO1604Vendido(abertas), digitando(abertas, { '1604': 'v' }));
    expect(c.linhas).toEqual([]);
    expect(c.outroAparelho).toEqual([]);
    expect(c.exigeConferi).toBe(false);
  });

  it('"r" sem preço mantém o preço de agora, e não o de quando a grade abriu', () => {
    const abertas = predio();
    const agora = abertas.map((u) => (u.label === '804' ? { ...u, price_cents: 85000000 } : u));
    const c = conferirTabela(agora, digitando(abertas, { '804': 'r' }));
    expect(c.linhas).toEqual([{ label: '804', price_cents: 85000000, status: 'reservado' }]);
    expect(c.outroAparelho.map((m) => m.unidade.label)).toEqual(['804']);
  });

  it('unidade apagada em outro aparelho fica de fora, e a conferência diz; a criada lá não vai para o banco', () => {
    const abertas = predio();
    const agora = [
      ...abertas.filter((u) => u.label !== '1604'),
      { id: 'u2001', label: '2001', floor: 20, price_cents: null, status: 'vendido' },
    ];
    const c = conferirTabela(agora, digitando(abertas, { '1604': 'v', '804': 'v' }));
    expect(c.apagadas).toEqual(['1604']);
    expect(c.linhas).toEqual([{ label: '804', price_cents: 84056940, status: 'vendido' }]);
    expect(c.antes.total).toBe(90);
  });
});

describe('a troca no meio do mês', () => {
  it('só para a frente: disponível reserva ou vende, reservada vende', () => {
    expect(situacoesNoMeioDoMes('disponivel')).toEqual(['disponivel', 'reservado', 'vendido']);
    expect(situacoesNoMeioDoMes('reservado')).toEqual(['reservado', 'vendido']);
    expect(situacoesNoMeioDoMes('vendido')).toEqual(['vendido']);
  });

  it('voltar a disponível, da reservada ou da vendida, é só pela tabela do mês (o preço guardado pode ser velho)', () => {
    expect(situacoesNoMeioDoMes('reservado')).not.toContain('disponivel');
    expect(situacoesNoMeioDoMes('vendido')).not.toContain('disponivel');
  });
});

describe('a planta de cada unidade', () => {
  type ComPlanta = UnidadeDaTabela & { floorplan_id: string };
  const comPlantas = (): ComPlanta[] =>
    predio().map((u) => ({ ...u, floorplan_id: SUITES.finals.includes(u.label.slice(-2)) ? SUITES.id : DORMS.id }));

  it('a planta que ganha um final traz as unidades dele que estão em outra', () => {
    // O final 06 sai dos "3 dormitórios" e vai para a planta nova "Garden".
    const aMover = unidadesQueSeguemOsFinais({
      unidades: comPlantas(),
      plantaId: null,
      finaisAntes: [],
      finaisDepois: ['06'],
    });
    expect(aMover).toHaveLength(15);
    expect(aMover.every((u) => u.floorplan_id === DORMS.id && u.label.endsWith('06'))).toBe(true);
    // Na ordem da grade: do andar mais alto para o mais baixo.
    expect(aMover.slice(0, 3).map((u) => u.label)).toEqual(['1906', '1806', '1706']);
  });

  it('só os finais que a planta ganhou: o que ela já tinha e está em outra planta foi posto lá de propósito', () => {
    // O 504 é garden: está nos "3 dormitórios", embora o final 04 seja das suítes.
    const unidades = comPlantas().map((u) => (u.label === '504' ? { ...u, floorplan_id: DORMS.id } : u));
    const aMover = unidadesQueSeguemOsFinais({
      unidades,
      plantaId: SUITES.id,
      finaisAntes: SUITES.finals,
      finaisDepois: [...SUITES.finals, '06'],
    });
    expect(aMover.map((u) => u.label)).not.toContain('504');
    expect(aMover).toHaveLength(15);
  });

  it('a que já é desta planta fica; sem final novo, nada a mover', () => {
    const unidades = comPlantas();
    expect(
      unidadesQueSeguemOsFinais({ unidades, plantaId: SUITES.id, finaisAntes: ['02', '04', '05'], finaisDepois: ['02', '04'] }),
    ).toEqual([]);
    expect(
      unidadesQueSeguemOsFinais({ unidades, plantaId: DORMS.id, finaisAntes: [], finaisDepois: DORMS.finals }),
    ).toEqual([]);
  });

  it('o final sai do andar gravado; a unidade sem andar (sala) fica fora', () => {
    const unidades = [
      { id: 'a', label: '1004', floor: 10, price_cents: null, status: 'vendido', floorplan_id: 'x' },
      // Rótulo "104" no andar 10 não é final 4: o andar gravado manda.
      { id: 'b', label: '104', floor: 10, price_cents: null, status: 'vendido', floorplan_id: 'x' },
      { id: 'c', label: '104', floor: 1, price_cents: null, status: 'vendido', floorplan_id: 'x' },
      { id: 'd', label: '04', floor: null, price_cents: null, status: 'vendido', floorplan_id: 'x' },
    ];
    const aMover = unidadesQueSeguemOsFinais({ unidades, plantaId: 'y', finaisAntes: [], finaisDepois: ['04'] });
    expect(aMover.map((u) => u.id)).toEqual(['a', 'c']);
  });

  it('a quantidade e alguns exemplos, numa linha', () => {
    expect(juntarComE([])).toBe('');
    expect(juntarComE(['Apto 804'])).toBe('Apto 804');
    expect(juntarComE(['Apto 804', 'Apto 904'])).toBe('Apto 804 e Apto 904');
    expect(juntarComE(['01', '02', '03'])).toBe('01, 02 e 03');
    expect(listaCurta(['804', '904', '1004'])).toBe('804, 904 e 1004');
    // Um a mais que o máximo vai inteiro: "e mais 1" ocupa o lugar do nome.
    expect(listaCurta(['804', '904', '1004', '1104'])).toBe('804, 904, 1004 e 1104');
    expect(listaCurta(['804', '904', '1004', '1104', '1204'])).toBe('804, 904, 1004 e mais 2');
  });
});

describe('o erro do banco, na frase da Juliana', () => {
  it('apagar planta que tem unidade não é o mesmo que gravar unidade numa planta que sumiu', () => {
    expect(
      mensagemDoErro({
        message:
          'update or delete on table "property_floorplans" violates foreign key constraint "property_units_floorplan_fk" on table "property_units"',
      }),
    ).toMatch(/^A planta tem unidades\. Mude a planta delas no seletor de planta de “Situação de cada unidade”/);
    expect(
      mensagemDoErro({
        message: 'insert or update on table "property_units" violates foreign key constraint "property_units_floorplan_fk"',
      }),
    ).toMatch(/não existe mais.*Recarregue a página/);
  });
});

describe('o mês da tabela', () => {
  it('o "Consulte" começa no dia 1 do mês seguinte ao da tabela aplicada', () => {
    expect(mesSeguinte('2026-09-01')).toBe('2026-10-01');
    expect(mesSeguinte('2026-12-01')).toBe('2027-01-01');
    expect(consulteDesde('2026-08-01', '2026-10-01')).toBe('2026-09-01');
    expect(consulteDesde('2026-10-01', '2026-10-01')).toBeNull();
    expect(consulteDesde(null, '2026-10-01')).toBeNull();
  });

  it('a variação com o sinal', () => {
    expect(formatarVariacao(0.005)).toBe('+0,5%');
    expect(formatarVariacao(-0.9)).toBe('−90%');
    expect(formatarVariacao(0)).toBe('0%');
  });
});

describe('o valor na lista de imóveis', () => {
  // O Intl separa o "R$" com espaço inquebrável.
  const valoresDoImovel = (p: Parameters<typeof valoresNaLista>[0]) => valoresNaLista(p).map((v) => v.replace(/ /g, ' '));
  const base = { for_sale: true, for_rent: false, rent_cents: null };

  it('empreendimento: "A partir de" com as disponíveis', () => {
    expect(valoresDoImovel({ ...base, price_cents: 84056940, has_units: true, units_available: 10 })).toEqual([
      'A partir de R$ 840.569',
      '10 disponíveis',
    ]);
    expect(valoresDoImovel({ ...base, price_cents: 84056940, has_units: true, units_available: 0 })).toEqual([
      'A partir de R$ 840.569',
      'só reservadas',
    ]);
    expect(valoresDoImovel({ ...base, price_cents: null, has_units: true, units_available: 0 })).toEqual([
      'Nenhuma unidade disponível',
    ]);
  });

  it('imóvel comum continua como antes', () => {
    expect(valoresDoImovel({ ...base, price_cents: 185000000 })).toEqual(['R$ 1.850.000']);
  });
});
