import { describe, expect, it } from 'vitest';

import { IMOVEIS_DE_EXEMPLO } from './exemplos';
import { numerosDoImovel, textoDosDormitorios } from './numeros';
import type { Imovel, PlantaDoEmpreendimento } from './tipos';

const imovel = (campos: Partial<Imovel>): Imovel => ({
  ...IMOVEIS_DE_EXEMPLO[0]!,
  areaM2: null,
  areaTotalM2: null,
  quartos: null,
  suites: null,
  banheiros: null,
  vagas: null,
  ...campos,
});

const resumo = (i: Imovel) => numerosDoImovel(i).map((n) => [n.valor, n.rotulo, n.extra]);

describe('numerosDoImovel', () => {
  it('põe quartos e suítes lado a lado, e a área total embaixo da área', () => {
    // No cadastro, os quartos não contam as suítes: 2 quartos e 1 suíte são 3
    // dormitórios, e a pessoa vê os dois números para somar.
    expect(resumo(imovel({ areaM2: 130, areaTotalM2: 160, quartos: 2, suites: 1, banheiros: 2, vagas: 1 }))).toEqual([
      ['130', 'm²', '160 m² total'],
      ['2', 'quartos', null],
      ['1', 'suíte', null],
      ['2', 'banheiros', null],
      ['1', 'vaga', null],
    ]);
  });

  it('sem dormitórios cadastrados, as suítes aparecem sozinhas', () => {
    // O imóvel 1000 ficou assim no CRM: dormitórios vazio e 4 suítes.
    expect(resumo(imovel({ areaM2: 177, suites: 4, vagas: 3 }))).toEqual([
      ['177', 'm²', null],
      ['4', 'suítes', null],
      ['3', 'vagas', null],
    ]);
  });

  it('usa o singular quando é um', () => {
    expect(resumo(imovel({ quartos: 1, suites: 1, banheiros: 1, vagas: 1 }))).toEqual([
      ['1', 'quarto', null],
      ['1', 'suíte', null],
      ['1', 'banheiro', null],
      ['1', 'vaga', null],
    ]);
  });

  it('não repete a área quando a total é igual à privativa', () => {
    expect(resumo(imovel({ areaM2: 90, areaTotalM2: 90 }))).toEqual([['90', 'm²', null]]);
  });

  it('não mostra nada do que não foi preenchido', () => {
    expect(numerosDoImovel(imovel({}))).toEqual([]);
  });
});

describe('numerosDoImovel no empreendimento', () => {
  const EX5 = IMOVEIS_DE_EXEMPLO.find((i) => i.codigo === 'EX5')!;
  const com = (plantas: PlantaDoEmpreendimento[]): Imovel => ({
    ...EX5,
    empreendimento: { ...EX5.empreendimento!, plantas },
  });
  const unidade = (rotulo: string, situacao: 'disponivel' | 'reservado' = 'disponivel', areaM2: number | null = null) => ({
    rotulo,
    andar: 1,
    areaM2,
    precoCents: 1_000_000,
    situacao,
  });

  it('junta as plantas à venda: "2 ou 3 dormitórios", já somadas as suítes', () => {
    // "2 suítes + lavabo" (0 quartos e 2 suítes) e "3 dormitórios" (2 quartos e 1 suíte).
    // Somado, o número é "dormitórios": "2 ou 3 quartos" ao lado de "1 ou 2
    // suítes" lia como até 5.
    expect(resumo(EX5)).toEqual([
      ['70', 'm²', null],
      ['2 ou 3', 'dormitórios', null],
      ['1 ou 2', 'suítes', null],
      ['2 ou 3', 'banheiros', null],
      ['1', 'vaga', null],
    ]);
  });

  it('planta que só tem reservada não entra na conta', () => {
    const [suites, dormitorios] = EX5.empreendimento!.plantas;
    const soReservadas = { ...dormitorios!, unidades: [unidade('701', 'reservado')] };
    expect(resumo(com([suites!, soReservadas]))).toEqual([
      ['70', 'm²', null],
      ['2', 'dormitórios', null],
      ['2', 'suítes', null],
      ['3', 'banheiros', null],
      ['1', 'vaga', null],
    ]);
  });

  it('área da unidade vira faixa, e a planta sem vaga faz "até 1 vaga"', () => {
    const base = { nome: 'Sala', quartos: null, suites: null, banheiros: 1, areaM2: 40 };
    const salas = com([
      { ...base, vagas: 0, unidades: [unidade('01', 'disponivel', 32.5), unidade('02')] },
      { ...base, nome: 'Sala com vaga', vagas: 1, unidades: [unidade('03', 'disponivel', 90)] },
    ]);
    expect(resumo(salas)).toEqual([
      ['32,5 a 90', 'm²', null],
      ['1', 'banheiro', null],
      ['até 1', 'vaga', null],
    ]);
  });
});

describe('textoDosDormitorios', () => {
  it('dá o total da planta, com as suítes dentro dele', () => {
    expect(textoDosDormitorios({ quartos: 2, suites: 1 })).toBe('3 dormitórios (1 suíte)');
    expect(textoDosDormitorios({ quartos: 0, suites: 2 })).toBe('2 dormitórios (2 suítes)');
    expect(textoDosDormitorios({ quartos: null, suites: 2 })).toBe('2 dormitórios (2 suítes)');
  });

  it('sem suíte, só o total; no singular quando é um', () => {
    expect(textoDosDormitorios({ quartos: 2, suites: null })).toBe('2 dormitórios');
    expect(textoDosDormitorios({ quartos: 1, suites: 0 })).toBe('1 dormitório');
    expect(textoDosDormitorios({ quartos: 0, suites: 1 })).toBe('1 dormitório (1 suíte)');
  });

  it('sem quarto nem suíte (a sala comercial), nada', () => {
    expect(textoDosDormitorios({ quartos: null, suites: null })).toBeNull();
    expect(textoDosDormitorios({ quartos: 0, suites: 0 })).toBeNull();
  });
});
