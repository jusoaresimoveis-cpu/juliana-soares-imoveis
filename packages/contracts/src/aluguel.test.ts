import { describe, expect, it } from 'vitest';

import {
  colunasDaTabela,
  executoresDaFuncao,
  valoresDoCheck,
} from '../../../supabase/testes/esquema';

import { PROPERTY_PURPOSES, RENTAL_GUARANTEE_LABEL, RENTAL_GUARANTEES, rotuloDoRegime } from './index';

describe('aluguel ↔ banco', () => {
  it('as garantias do dicionário são exatamente as do CHECK', () => {
    expect(valoresDoCheck('properties_guarantees_ck')).toEqual([...RENTAL_GUARANTEES].sort());
  });

  it('toda garantia tem rótulo, e nenhum rótulo sobra', () => {
    expect(Object.keys(RENTAL_GUARANTEE_LABEL).sort()).toEqual([...RENTAL_GUARANTEES].sort());
  });

  it('a finalidade calculada continua dentro do contrato herdado', () => {
    expect(valoresDoCheck('properties_purpose_ck')).toEqual([...PROPERTY_PURPOSES].sort());
  });

  it('o imóvel tem os dois regimes, cada um com o seu valor', () => {
    const colunas = colunasDaTabela('properties');
    for (const coluna of ['for_sale', 'for_rent', 'price_cents', 'rent_cents', 'rental_guarantees']) {
      expect(colunas.has(coluna), coluna).toBe(true);
    }
  });
});

describe('o regime no CRM', () => {
  it('diz os dois quando o imóvel está nos dois', () => {
    expect(rotuloDoRegime({ for_sale: true, for_rent: false })).toBe('Venda');
    expect(rotuloDoRegime({ for_sale: false, for_rent: true })).toBe('Aluguel');
    expect(rotuloDoRegime({ for_sale: true, for_rent: true })).toBe('Venda e aluguel');
  });
});

describe('o que o site alcança', () => {
  it('a leitura dos imóveis é chamável com a chave pública', () => {
    expect(executoresDaFuncao('site_imoveis')).toContain('anon');
  });

  it('o aviso de revalidação não é chamável de fora', () => {
    const quem = executoresDaFuncao('avisar_site_dos_imoveis');
    expect(quem).not.toContain('anon');
    expect(quem).not.toContain('authenticated');
    expect(quem).not.toContain('PUBLIC');
  });
});
