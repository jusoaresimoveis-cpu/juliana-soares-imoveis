import { CIDADES_ATENDIDAS } from '@juliana/contracts';
import { describe, expect, it } from 'vitest';

import { IMOVEIS_DE_EXEMPLO } from './exemplos';
import {
  bairrosDe,
  filtrarImoveis,
  interpretarSegmentos,
  listagensComImoveis,
  segmentosDaListagem,
  tituloDaListagem,
  urlDaListagem,
} from './listagem';

const itapema = CIDADES_ATENDIDAS[0];

describe('interpretarSegmentos', () => {
  it('aceita cada nível da URL', () => {
    expect(interpretarSegmentos('aluguel', undefined)).toEqual({
      ok: true,
      filtro: { finalidade: 'aluguel', tipo: null, cidade: null, bairro: null },
    });
    expect(interpretarSegmentos('aluguel', ['apartamentos'])).toMatchObject({
      ok: true,
      filtro: { tipo: 'apartamento', cidade: null },
    });
    expect(interpretarSegmentos('venda', ['imoveis', 'porto-belo'])).toMatchObject({
      ok: true,
      filtro: { tipo: null, cidade: { slug: 'porto-belo' } },
    });
    expect(interpretarSegmentos('aluguel', ['apartamentos', 'itapema', 'meia-praia'])).toMatchObject({
      ok: true,
      filtro: { tipo: 'apartamento', cidade: { slug: 'itapema' }, bairro: 'meia-praia' },
    });
  });

  it('manda /aluguel/imoveis para /aluguel, que é a mesma página', () => {
    expect(interpretarSegmentos('aluguel', ['imoveis'])).toEqual({ ok: false, redirecionarPara: '/aluguel' });
  });

  it('corrige bairro digitado com acento ou maiúscula', () => {
    expect(interpretarSegmentos('venda', ['casas', 'porto-belo', 'Perequê'])).toEqual({
      ok: false,
      redirecionarPara: '/venda/casas/porto-belo/pereque',
    });
    // É assim que o Next entrega o parâmetro: ainda codificado.
    expect(interpretarSegmentos('venda', ['casas', 'porto-belo', 'Perequ%C3%AA'])).toEqual({
      ok: false,
      redirecionarPara: '/venda/casas/porto-belo/pereque',
    });
  });

  it('recusa segmento com codificação quebrada em vez de estourar erro', () => {
    expect(interpretarSegmentos('aluguel', ['imoveis', 'itapema', '%E0%A4%A'])).toEqual({
      ok: false,
      redirecionarPara: null,
    });
  });

  it('recusa tipo, cidade ou profundidade desconhecidos', () => {
    const invalido = { ok: false, redirecionarPara: null };
    expect(interpretarSegmentos('aluguel', ['mansoes'])).toEqual(invalido);
    expect(interpretarSegmentos('aluguel', ['apartamentos', 'florianopolis'])).toEqual(invalido);
    expect(interpretarSegmentos('aluguel', ['apartamentos', 'itapema', 'centro', 'extra'])).toEqual(invalido);
  });
});

describe('urlDaListagem', () => {
  it('é o inverso de interpretarSegmentos', () => {
    for (const filtro of listagensComImoveis(IMOVEIS_DE_EXEMPLO)) {
      const volta = interpretarSegmentos(filtro.finalidade, segmentosDaListagem(filtro));
      expect(volta).toEqual({ ok: true, filtro });
    }
  });

  it('usa "imoveis" quando há cidade sem tipo', () => {
    expect(urlDaListagem({ finalidade: 'aluguel', cidade: itapema })).toBe('/aluguel/imoveis/itapema');
  });
});

describe('tituloDaListagem', () => {
  it('monta a frase que a pessoa busca', () => {
    expect(
      tituloDaListagem({ finalidade: 'aluguel', tipo: 'apartamento', cidade: itapema, bairro: 'meia-praia' }, 'Meia Praia'),
    ).toBe('Apartamentos para alugar em Meia Praia, Itapema');
    expect(tituloDaListagem({ finalidade: 'venda', tipo: null, cidade: null, bairro: null })).toBe(
      'Imóveis à venda em Itapema e Porto Belo',
    );
  });
});

describe('filtrarImoveis', () => {
  it('imóvel de venda e aluguel aparece nas duas listagens', () => {
    const aluguel = filtrarImoveis(IMOVEIS_DE_EXEMPLO, { finalidade: 'aluguel', tipo: null, cidade: null, bairro: null });
    const venda = filtrarImoveis(IMOVEIS_DE_EXEMPLO, { finalidade: 'venda', tipo: null, cidade: null, bairro: null });
    expect(aluguel.map((i) => i.codigo)).toContain('EX4');
    expect(venda.map((i) => i.codigo)).toContain('EX4');
  });

  it('alugado sai da vitrine mas o bairro continua existindo', () => {
    const alugado = { ...IMOVEIS_DE_EXEMPLO[1], status: 'alugado' as const };
    const filtro = { finalidade: 'aluguel' as const, tipo: null, cidade: itapema, bairro: 'centro' };
    expect(filtrarImoveis([alugado], filtro)).toEqual([]);
    expect(bairrosDe([alugado]).map((b) => b.slug)).toEqual(['centro']);
    expect(listagensComImoveis([alugado])).toEqual([]);
  });
});
