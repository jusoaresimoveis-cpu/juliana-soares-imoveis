import { describe, expect, it } from 'vitest';

import { parseRefCode } from './attribution';
import { definicaoDaFuncao } from '../../../supabase/testes/esquema';
import { CANAIS, CODIGO_DO_SITE, ORIGEM_SEM_CANAL, canalDoSlug, ehCanal, refDoSite } from './rastreio';

/**
 * O código do site precisa ser lido pela mesma regra que o banco usa.
 *
 * Se não for, o contato que veio do site cai como conversa pessoal e some do
 * CRM sem erro nenhum: a Juliana responde pelo celular e ninguém fica sabendo
 * que o site trouxe aquele cliente. O banco repete a regra em `parse_ref_code`,
 * e `attribution.test.ts` confere que as duas batem.
 */
describe('o código do site', () => {
  it('é lido com o imóvel', () => {
    const mensagem = `Olá! Tenho interesse neste imóvel: https://exemplo/imovel/apartamento-1000 (${refDoSite('1000')})`;
    expect(parseRefCode(mensagem)).toEqual({ publicCode: '1000', market: null, variant: 'a' });
  });

  it('é lido sem imóvel, pelo código do site', () => {
    expect(parseRefCode(`Olá! Vim pelo site. (${refDoSite()})`)).toMatchObject({
      publicCode: CODIGO_DO_SITE.toLowerCase(),
      variant: 'a',
    });
  });

  it('o código do site tem o formato de um código de imóvel', () => {
    // A leitura só aceita quatro letras ou números antes da variante.
    expect(CODIGO_DO_SITE).toMatch(/^[A-Z0-9]{4}$/);
  });
});

/**
 * O canal no meio do código (decisão de 05/10).
 *
 * O site e o link `/w/<canal>` escrevem; o banco lê e grava a origem do lead
 * com `origem_do_canal`. Se as duas listas se separarem, o lead do Google entra
 * como "Site" sem erro nenhum, e o painel passa a mentir sobre de onde vêm os
 * clientes.
 */
describe('o canal no código', () => {
  it('vai no meio, com e sem imóvel', () => {
    expect(refDoSite('1004', 'go')).toBe('Ref. 1004-GO-A');
    expect(refDoSite(undefined, 'mk')).toBe('Ref. SITE-MK-A');
  });

  it('é lido de volta pela mesma regra do banco', () => {
    expect(parseRefCode(`Olá! (${refDoSite('1004', 'bi')})`)).toEqual({ publicCode: '1004', market: 'bi', variant: 'a' });
  });

  it('o banco traduz cada canal na mesma origem do contrato, e o resto vira site', () => {
    const sql = definicaoDaFuncao('origem_do_canal').texto;
    for (const [canal, { origem }] of Object.entries(CANAIS)) {
      expect(sql, canal).toContain(`when '${canal}' then '${origem}'`);
    }
    expect(sql).toContain(`else '${ORIGEM_SEM_CANAL}'`);
  });

  it('cada canal tem duas letras e um endereço só seu', () => {
    const canais = Object.keys(CANAIS);
    for (const c of canais) expect(c).toMatch(/^[a-z]{2}$/);
    const slugs = canais.map((c) => CANAIS[c as keyof typeof CANAIS].slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('o endereço leva ao canal', () => {
    expect(canalDoSlug('bio')).toBe('bi');
    expect(canalDoSlug('Google')).toBe('go');
    expect(canalDoSlug('nao-existe')).toBeNull();
    expect(ehCanal('mk')).toBe(true);
    expect(ehCanal('toString')).toBe(false);
  });
});
