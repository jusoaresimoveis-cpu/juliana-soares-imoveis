import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { como, comoDono, comoDonoEDesfaz, conectar, desconectar, prepararPrivilegios, IDS } from './banco';

/**
 * Trocar o "Nome no site" de um imóvel já cadastrado (migration 20260925000200).
 *
 * O endereço da página acompanha o nome, e o antigo vai para
 * `property_slug_history`, para o link que já circula continuar abrindo. Quem
 * grava o antigo é o gatilho do imóvel, e a tabela só tem policy de leitura:
 * rodando com o papel de quem salvou, a gravação era recusada e o imóvel
 * inteiro não salvava ("new row violates row-level security policy for table
 * property_slug_history"), em 25/09/2026, no segundo imóvel da Juliana.
 */

const FIXTURA = readFileSync(join(__dirname, 'fixtura.sql'), 'utf8');
const MIGRATIONS = join(__dirname, '..', 'migrations');
const IMOVEL_A = '00000000-0000-4000-a000-000000000030';

const comoCorretor = (sql: string) =>
  comoDonoEDesfaz(`
    set local role authenticated;
    select set_config('request.jwt.claims', '{"sub":"${IDS.corretor}","role":"authenticated"}', true);
    ${sql}`);

beforeAll(async () => {
  await conectar();
  await prepararPrivilegios(MIGRATIONS);
  const r = await comoDono(FIXTURA);
  if (r.erro) throw new Error(`fixtura não aplicou: ${r.erro}`);
}, 60_000);

afterAll(desconectar);

describe('trocar o nome no site de um imóvel', () => {
  it('o corretor troca, o endereço acompanha e o antigo fica guardado', async () => {
    const r = await comoCorretor(`
      update public.properties set public_title = 'Cobertura vista mar' where id = '${IMOVEL_A}';
      update public.properties set public_title = 'Cobertura frente mar' where id = '${IMOVEL_A}';
      select (select slug from public.properties where id = '${IMOVEL_A}') as slug,
             (select count(*)::int from public.property_slug_history where property_id = '${IMOVEL_A}') as antigos;`);
    expect(r.erro).toBeNull();
    expect(r.linhas[0]?.antigos).toBe(2);
    expect(String(r.linhas[0]?.slug)).toMatch(/^cobertura-frente-mar-/);
  });

  it('mexer em outra coisa não mexe no endereço', async () => {
    const r = await comoCorretor(`
      update public.properties set bedrooms = 3 where id = '${IMOVEL_A}';
      select count(*)::int as antigos from public.property_slug_history where property_id = '${IMOVEL_A}';`);
    expect(r.erro).toBeNull();
    expect(r.linhas[0]?.antigos).toBe(0);
  });

  it('ninguém grava endereço antigo direto: só o gatilho', async () => {
    const r = await como(
      'corretor',
      `insert into public.property_slug_history (organization_id, property_id, old_slug) values ($1, $2, 'endereco-inventado')`,
      [IDS.orgA, IMOVEL_A],
    );
    expect(r.erro).toMatch(/row-level security|permission denied/);
  });
});
