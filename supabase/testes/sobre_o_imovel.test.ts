import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { como, comoDono, comoDonoEDesfaz, conectar, desconectar, prepararPrivilegios, IDS } from './banco';

/**
 * "Sobre o imóvel" (migration 20261008000000): os itens marcados e o texto
 * livre por categoria, em `properties.features`.
 *
 * O banco confere o formato, para o site nunca receber algo que não sabe
 * mostrar; os ids ficam com packages/contracts.
 */

const FIXTURA = readFileSync(join(__dirname, 'fixtura.sql'), 'utf8');
const MIGRATIONS = join(__dirname, '..', 'migrations');
const IMOVEL_A = '00000000-0000-4000-a000-000000000030';

const comoCorretor = `
  set local role authenticated;
  select set_config('request.jwt.claims', '{"sub":"${IDS.corretor}","role":"authenticated"}', true);`;

/** Grava `features` como o corretor e devolve o erro, se houver. */
async function gravar(features: unknown) {
  return comoDonoEDesfaz(`
    ${comoCorretor}
    update public.properties set features = '${JSON.stringify(features).replace(/'/g, "''")}'::jsonb where id = '${IMOVEL_A}';`);
}

beforeAll(async () => {
  await conectar();
  await prepararPrivilegios(MIGRATIONS);
  const r = await comoDono(FIXTURA);
  if (r.erro) throw new Error(`fixtura não aplicou: ${r.erro}`);
}, 60_000);

afterAll(desconectar);

describe('sobre o imóvel', () => {
  it('nasce vazio', async () => {
    const r = await comoDono(`select features from public.properties where id = $1`, [IMOVEL_A]);
    expect(r.linhas[0]?.features).toEqual({});
  });

  it('o corretor grava itens e texto livre, e o site recebe', async () => {
    const features = {
      unidade: { itens: ['lavabo'], outros: ["Cozinha com ilha em quartzo d'água"] },
      lazer: { itens: ['piscina'] },
      adicionais: { outros: ['Escriturado'] },
    };
    const r = await comoDonoEDesfaz(`
      update public.properties set is_published = true where id = '${IMOVEL_A}';
      ${comoCorretor}
      update public.properties set features = '${JSON.stringify(features).replace(/'/g, "''")}'::jsonb where id = '${IMOVEL_A}';
      reset role;
      set local role anon;
      select public.site_imoveis('imob-a')::text as json;`);
    expect(r.erro).toBeNull();
    const [imovel] = JSON.parse(String(r.linhas[0]?.json));
    expect(imovel.features).toEqual(features);
    // A coluna antiga, sem categoria, não sai mais para o site.
    expect(imovel).not.toHaveProperty('amenities');
  });

  it('recusa formato que o site não sabe mostrar', async () => {
    const ruins: unknown[] = [
      ['lavabo'],
      { cozinha: { itens: ['ilha'] } },
      { unidade: ['lavabo'] },
      { unidade: { marcados: ['lavabo'] } },
      { unidade: { itens: 'lavabo' } },
      { unidade: { itens: [1] } },
      { unidade: { outros: [''] } },
      { unidade: { outros: ['x'.repeat(121)] } },
      { lazer: { itens: Array.from({ length: 301 }, (_, i) => `item_${i}`) } },
    ];
    for (const features of ruins) {
      const r = await gravar(features);
      expect(r.erro, JSON.stringify(features).slice(0, 60)).toMatch(/properties_features_ck/);
    }
  });

  it('aceita o limite exato', async () => {
    const r = await gravar({
      unidade: { outros: ['x'.repeat(120)] },
      lazer: { itens: Array.from({ length: 300 }, (_, i) => `item_${i}`) },
    });
    expect(r.erro).toBeNull();
  });

  it('corretor de outra imobiliária não grava no imóvel da A', async () => {
    const r = await comoDonoEDesfaz(`
      set local role authenticated;
      select set_config('request.jwt.claims', '{"sub":"${IDS.corretorDeFora}","role":"authenticated"}', true);
      update public.properties set features = '{"lazer":{"itens":["piscina"]}}'::jsonb where id = '${IMOVEL_A}';
      reset role;
      select features from public.properties where id = '${IMOVEL_A}';`);
    expect(r.erro).toBeNull();
    expect(r.linhas[0]?.features).toEqual({});
  });

  it('visitante não grava', async () => {
    const r = await como('anon', `update public.properties set features = '{}'::jsonb where id = $1 returning id`, [IMOVEL_A]);
    expect(r.erro ?? r.linhas.length).not.toBe(1);
  });
});
