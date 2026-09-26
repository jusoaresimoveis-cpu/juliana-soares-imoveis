import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { como, comoDono, comoDonoEDesfaz, conectar, desconectar, prepararPrivilegios, IDS } from './banco';

/**
 * A chave da marca d'água nas fotos (migration 20260926000000).
 *
 * É regra da imobiliária: todo mundo da casa lê, para o CRM mostrar a chave
 * certa na hora de subir foto, e só quem administra (admin ou gerente) muda.
 * Um corretor que desligasse a marca por engano deixaria sair sem proteção as
 * fotos da casa inteira.
 */

const FIXTURA = readFileSync(join(__dirname, 'fixtura.sql'), 'utf8');
const MIGRATIONS = join(__dirname, '..', 'migrations');

/** Tenta desligar como `quem`, volta ao dono e diz como a chave ficou. */
const desligarComo = (quem: string) => `
  set local role authenticated;
  select set_config('request.jwt.claims', '{"sub":"${quem}","role":"authenticated"}', true);
  update public.organizations set marca_dagua_nas_fotos = false where id = '${IDS.orgA}';
  reset role;
  select marca_dagua_nas_fotos as ligada from public.organizations where id = '${IDS.orgA}';`;

beforeAll(async () => {
  await conectar();
  await prepararPrivilegios(MIGRATIONS);
  const r = await comoDono(FIXTURA);
  if (r.erro) throw new Error(`fixtura não aplicou: ${r.erro}`);
}, 60_000);

afterAll(desconectar);

describe("a marca d'água nas fotos", () => {
  it('nasce ligada', async () => {
    const r = await comoDono(`select marca_dagua_nas_fotos as ligada from public.organizations where id = $1`, [IDS.orgA]);
    expect(r.linhas[0]?.ligada).toBe(true);
  });

  it('o corretor lê a chave, para o CRM saber se desenha a marca', async () => {
    const r = await como('corretor', `select marca_dagua_nas_fotos as ligada from public.organizations`);
    expect(r.erro).toBeNull();
    expect(r.linhas).toEqual([{ ligada: true }]);
  });

  it('o administrador desliga', async () => {
    const r = await comoDonoEDesfaz(desligarComo(IDS.admin));
    expect(r.erro).toBeNull();
    expect(r.linhas[0]?.ligada).toBe(false);
  });

  it('o corretor não desliga: a atualização não pega nenhuma linha', async () => {
    const r = await comoDonoEDesfaz(desligarComo(IDS.corretor));
    expect(r.erro).toBeNull();
    expect(r.linhas[0]?.ligada).toBe(true);
  });

  it('o gerente também desliga: a política é a mesma do resto da organização', async () => {
    const r = await comoDonoEDesfaz(desligarComo(IDS.gerente));
    expect(r.erro).toBeNull();
    expect(r.linhas[0]?.ligada).toBe(false);
  });

  it('o gerente de outra imobiliária não mexe na chave desta', async () => {
    const r = await comoDonoEDesfaz(desligarComo(IDS.gerenteDeFora));
    expect(r.erro).toBeNull();
    expect(r.linhas[0]?.ligada).toBe(true);
  });
});
