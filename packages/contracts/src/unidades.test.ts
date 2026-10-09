import { describe, expect, it } from 'vitest';

import { colunasDaTabela, definicaoDaRestricao, tarefaAgendada, valoresDoCheck } from '../../../supabase/testes/esquema';

import {
  CONSTRUCTION_STATUSES,
  CONSTRUCTION_STATUS_LABEL,
  ROTULO_DA_UNIDADE,
  UNIT_STATUSES,
  UNIT_STATUS_LABEL,
  aPartirDe,
  gerarUnidades,
  lerReais,
  mesCorrente,
  nomeDoMesDaTabela,
  reaisComCentavos,
  resumoDoEmpreendimento,
  rotuloDaUnidade,
  tabelaVigente,
} from './index';

// A tabela de outubro do New York Residence (as 10 disponíveis), mais duas vendidas.
const OUTUBRO = [
  { label: '1702', price_cents: 89766468, status: 'disponivel' },
  { label: '1705', price_cents: 91035252, status: 'disponivel' },
  { label: '1604', price_cents: 94207212, status: 'disponivel' },
  { label: '1502', price_cents: 87228900, status: 'disponivel' },
  { label: '1504', price_cents: 92938428, status: 'disponivel' },
  { label: '1404', price_cents: 91669644, status: 'disponivel' },
  { label: '1204', price_cents: 89132076, status: 'disponivel' },
  { label: '804', price_cents: 84056940, status: 'disponivel' },
  { label: '701', price_cents: 88497684, status: 'disponivel' },
  { label: '506', price_cents: 85008528, status: 'disponivel' },
  { label: '1901', price_cents: null, status: 'vendido' },
  { label: '1902', price_cents: 99000000, status: 'vendido' },
];

describe('unidades ↔ banco', () => {
  it('as situações da unidade são as do CHECK', () => {
    expect(valoresDoCheck('property_units_status_ck')).toEqual([...UNIT_STATUSES].sort());
    expect(Object.keys(UNIT_STATUS_LABEL).sort()).toEqual([...UNIT_STATUSES].sort());
  });

  it('as situações da obra são as do CHECK herdado', () => {
    expect(valoresDoCheck('properties_obra_ck')).toEqual([...CONSTRUCTION_STATUSES].sort());
    expect(Object.keys(CONSTRUCTION_STATUS_LABEL).sort()).toEqual([...CONSTRUCTION_STATUSES].sort());
  });

  it('o rótulo da unidade segue o mesmo padrão do banco', () => {
    expect(definicaoDaRestricao('property_units_status_ck').definicao).toContain('status');
    expect(colunasDaTabela('property_units').get('label')).toMatch(/\^\[0-9A-Za-z\]\{1,8\}\$/);
    expect(ROTULO_DA_UNIDADE.source).toBe('^[0-9A-Za-z]{1,8}$');
    expect(colunasDaTabela('property_units').get('price_cents')).toMatch(/^bigint\b/);
  });
});

describe('resumoDoEmpreendimento', () => {
  it('o "a partir de" é o menor preço entre as disponíveis', () => {
    const r = resumoDoEmpreendimento(OUTUBRO);
    expect(r).toEqual({
      total: 12,
      disponiveis: 10,
      reservadas: 0,
      menorCents: 84056940,
      maiorCents: 94207212,
      menorReservadaCents: null,
    });
    expect(aPartirDe(r)).toBe(84056940);
  });

  it('vendeu a mais barata: o "a partir de" sobe para a próxima', () => {
    const semO804 = OUTUBRO.map((u) => (u.label === '804' ? { ...u, status: 'vendido' } : u));
    expect(aPartirDe(resumoDoEmpreendimento(semO804))).toBe(85008528);
  });

  it('só reservadas: o preço é o da menor reservada; nenhuma unidade: sem preço', () => {
    const reservadas = [
      { status: 'reservado', price_cents: 90000000 },
      { status: 'reservado', price_cents: 80000000 },
      { status: 'vendido', price_cents: 70000000 },
    ];
    expect(aPartirDe(resumoDoEmpreendimento(reservadas))).toBe(80000000);
    expect(aPartirDe(resumoDoEmpreendimento([]))).toBeNull();
  });
});

describe('rotuloDaUnidade', () => {
  it('o número nunca aparece sozinho', () => {
    expect(rotuloDaUnidade('apartamento', '804')).toBe('Apto 804');
    expect(rotuloDaUnidade('cobertura', '1901')).toBe('Apto 1901');
    expect(rotuloDaUnidade('sala_comercial', '03')).toBe('Sala 03');
    expect(rotuloDaUnidade('casa_condominio', '12')).toBe('Casa 12');
  });
});

describe('gerarUnidades', () => {
  it('andar por final, como a tabela da construtora', () => {
    const todas = gerarUnidades(5, 19, ['01', '02', '03', '04', '05', '06']);
    expect(todas).toHaveLength(90);
    expect(todas[0]).toEqual({ label: '501', floor: 5, final: '01' });
    expect(todas.at(-1)).toEqual({ label: '1906', floor: 19, final: '06' });
    expect(todas.find((u) => u.label === '804')).toEqual({ label: '804', floor: 8, final: '04' });
    // Os andares podem vir na ordem da tabela (do alto para baixo).
    expect(gerarUnidades(19, 5, ['01'])).toHaveLength(15);
  });
});

describe('a tabela do mês', () => {
  it('o mês é o de Brasília, não o do servidor', () => {
    // 31/10, 23h em Brasília, já é 1º/11 em UTC.
    expect(mesCorrente(new Date('2026-11-01T02:00:00Z'))).toBe('2026-10-01');
    expect(mesCorrente(new Date('2026-11-01T03:00:00Z'))).toBe('2026-11-01');
  });

  it('vale no mês em que foi aplicada; no dia 1 do seguinte, vira "Consulte"', () => {
    expect(tabelaVigente('2026-10-01', new Date('2026-10-31T23:00:00-03:00'))).toBe(true);
    expect(tabelaVigente('2026-10-01', new Date('2026-11-01T00:30:00-03:00'))).toBe(false);
    expect(tabelaVigente(null, new Date('2026-10-15T12:00:00-03:00'))).toBe(false);
  });

  it('o banco avisa o site à 00h01 de Brasília do dia 1, quando os preços viram "Consulte"', () => {
    // 03h01 UTC é 00h01 em Brasília (UTC-3, sem horário de verão desde 2019).
    expect(tarefaAgendada('site-virada-do-mes')?.agenda).toBe('1 3 1 * *');
    expect(tarefaAgendada('site-virada-do-mes')?.comando).toContain('public.revalidar_site()');
  });

  it('nomes do mês', () => {
    expect(nomeDoMesDaTabela('2026-10-01')).toBe('outubro de 2026');
    expect(nomeDoMesDaTabela('2026-10-01', true)).toBe('out/26');
    expect(nomeDoMesDaTabela('2027-03-01')).toBe('março de 2027');
  });
});

describe('lerReais', () => {
  it('lê o preço como a tabela da construtora escreve', () => {
    expect(lerReais('840.569,40')).toBe(84056940);
    expect(lerReais('R$ 840.569,40')).toBe(84056940);
    expect(lerReais('840569,4')).toBe(84056940);
    expect(lerReais('840.569')).toBe(84056900);
    expect(lerReais('840569.40')).toBe(84056940);
    expect(lerReais('1.250.000')).toBe(125000000);
  });

  it('vazio, zero e texto que não é preço dão nulo', () => {
    expect(lerReais('')).toBeNull();
    expect(lerReais('0')).toBeNull();
    expect(lerReais('VENDIDO')).toBeNull();
    expect(lerReais('840,569,40')).toBeNull();
  });

  it('e escreve com os centavos', () => {
    expect(reaisComCentavos(84056940).replace(/\u00a0/g, ' ')).toBe('R$ 840.569,40');
  });
});
