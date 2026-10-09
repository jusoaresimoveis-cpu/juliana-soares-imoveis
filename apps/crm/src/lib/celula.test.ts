import { describe, expect, it } from 'vitest';
import { gerarUnidades } from '@contracts';
import {
  celulaDasPartes,
  lerCelula,
  partesDaCelula,
  textoDaCelula,
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
