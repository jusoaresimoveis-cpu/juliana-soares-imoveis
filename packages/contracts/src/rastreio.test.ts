import { describe, expect, it } from 'vitest';

import { parseRefCode } from './attribution';
import { CODIGO_DO_SITE, refDoSite } from './rastreio';

/**
 * O código do site precisa ser lido pela mesma regra que o banco usa.
 *
 * Se não for, o contato que veio do site cai como conversa pessoal e some do
 * CRM sem erro nenhum: a Juliana responde pelo celular e ninguém fica sabendo
 * que o site trouxe aquele cliente. O banco repete a regra em `parse_ref_code`,
 * e `contracts.test.ts` confere que as duas batem.
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
