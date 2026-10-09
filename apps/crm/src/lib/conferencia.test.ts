import { describe, expect, it } from 'vitest';
import { gerarUnidades } from '@contracts';
import {
  conferirTabela,
  formatarPreco,
  type CelulaEditada,
  type UnidadeDaTabela,
} from './unidades';

/**
 * A página "Unidades" com o caso real: o New York Residence, 90 apartamentos
 * (andares 5 a 19, finais 01 a 06) e a tabela de outubro com 10 disponíveis,
 * de R$ 840.569,40 (804) a R$ 942.072,12 (1604).
 *
 * O que se guarda aqui é o caminho do que a Juliana digita até o "a partir de"
 * do anúncio: uma célula mal lida, ou uma conferência que não grita, e um erro
 * de digitação na mais barata vira o preço do site.
 */

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
