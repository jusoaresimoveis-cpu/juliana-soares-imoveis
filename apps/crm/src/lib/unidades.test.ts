import { describe, expect, it } from 'vitest';
import { gerarUnidades } from '@contracts';
import {
  consulteDesde,
  finalDaUnidade,
  formatarVariacao,
  juntarComE,
  lerFinais,
  listaCurta,
  mesSeguinte,
  montarGrade,
  ordenarUnidades,
  prepararGeracao,
  resumoDaPlanta,
  situacoesNoMeioDoMes,
  unidadesQueSeguemOsFinais,
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
  const valoresDoImovel = (p: Parameters<typeof valoresNaLista>[0]) => valoresNaLista(p).map((v) => v.replace(/\u00a0/g, ' '));
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
