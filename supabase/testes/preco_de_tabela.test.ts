import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { comoDono, comoDonoEDesfaz, conectar, desconectar, prepararPrivilegios } from './banco';

/**
 * O preço de tabela (migration 20261006000000): o "de" do "de R$ X por R$ Y".
 *
 * O banco só aceita o "de" acima do "por", e o site só o recebe na venda. É a
 * regra de `precoDeTabela` (packages/contracts) do lado do banco: uma linha que
 * escapasse dela viraria "de R$ 900 mil por R$ 950 mil" na vitrine.
 */

const FIXTURA = readFileSync(join(__dirname, 'fixtura.sql'), 'utf8');
const MIGRATIONS = join(__dirname, '..', 'migrations');
const IMOVEL_A = '00000000-0000-4000-a000-000000000030';
const visitante = `set local role anon; select set_config('request.jwt.claims', '{}', true);`;

beforeAll(async () => {
  await conectar();
  await prepararPrivilegios(MIGRATIONS);
  const r = await comoDono(FIXTURA);
  if (r.erro) throw new Error(`fixtura não aplicou: ${r.erro}`);
}, 60_000);

afterAll(desconectar);

/** O imóvel da A publicado com estes preços, como o site o lê (com a chave pública). */
async function noSite(precos: string) {
  const r = await comoDonoEDesfaz(`
    update public.properties set is_published = true, ${precos} where id = '${IMOVEL_A}';
    ${visitante}
    select public.site_imoveis('imob-a')::text as json;`);
  return { erro: r.erro, imovel: r.erro ? null : JSON.parse(String(r.linhas[0]?.json))[0] };
}

describe('o preço de tabela', () => {
  it('o site recebe o "de" junto com o "por"', async () => {
    const { erro, imovel } = await noSite('for_sale = true, price_cents = 185000000, original_price_cents = 195000000');
    expect(erro).toBeNull();
    expect(imovel).toMatchObject({ price_cents: 185000000, original_price_cents: 195000000 });
  });

  it('sem desconto, o "de" vem nulo', async () => {
    const { erro, imovel } = await noSite('for_sale = true, price_cents = 185000000, original_price_cents = null');
    expect(erro).toBeNull();
    expect(imovel).toMatchObject({ price_cents: 185000000, original_price_cents: null });
  });

  it('igual ou abaixo do preço de venda não é desconto, e o banco recusa', async () => {
    for (const tabela of [185000000, 180000000]) {
      const { erro } = await noSite(`for_sale = true, price_cents = 185000000, original_price_cents = ${tabela}`);
      expect(erro, String(tabela)).toMatch(/properties_original_price_ck/);
    }
  });

  it('sem preço de venda, o "de" sozinho é recusado', async () => {
    for (const preco of ['null', '0']) {
      const { erro } = await noSite(`price_cents = ${preco}, original_price_cents = 195000000`);
      expect(erro, preco).toMatch(/properties_original_price_ck/);
    }
  });

  it('imóvel que só aluga não mostra preço de venda nem de tabela', async () => {
    const { erro, imovel } = await noSite(
      'for_sale = false, for_rent = true, rent_cents = 350000, price_cents = 185000000, original_price_cents = 195000000',
    );
    expect(erro).toBeNull();
    expect(imovel).toMatchObject({ price_cents: null, original_price_cents: null, rent_cents: 350000 });
  });
});
