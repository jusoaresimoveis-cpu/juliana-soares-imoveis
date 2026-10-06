import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { como, comoDono, comoDonoEDesfaz, conectar, desconectar, prepararPrivilegios, IDS } from './banco';

/**
 * A ordem das fotos (migration 20261006000100): o CRM manda a lista inteira
 * depois de cada arrastada, e o banco grava as posições e faz da primeira foto
 * a capa. A lista do CRM é a ordem do site, então uma posição gravada errada
 * aparece direto na vitrine.
 */

const FIXTURA = readFileSync(join(__dirname, 'fixtura.sql'), 'utf8');
const MIGRATIONS = join(__dirname, '..', 'migrations');
const IMOVEL_A = '00000000-0000-4000-a000-000000000030';
const M = {
  um: '00000000-0000-4000-a000-0000000000f1',
  dois: '00000000-0000-4000-a000-0000000000f2',
  tres: '00000000-0000-4000-a000-0000000000f3',
  quatro: '00000000-0000-4000-a000-0000000000f4',
};

// Três fotos e um vídeo, com a capa no meio da lista, como estava no imóvel do print.
const MIDIAS = `
  insert into public.property_media (id, organization_id, property_id, kind, storage_path, position, is_cover) values
    ('${M.um}',     '${IDS.orgA}', '${IMOVEL_A}', 'image', 'teste/1.jpg', 0, false),
    ('${M.dois}',   '${IDS.orgA}', '${IMOVEL_A}', 'image', 'teste/2.jpg', 1, true),
    ('${M.tres}',   '${IDS.orgA}', '${IMOVEL_A}', 'video', 'teste/3.mp4', 2, false),
    ('${M.quatro}', '${IDS.orgA}', '${IMOVEL_A}', 'image', 'teste/4.jpg', 3, false);`;

const comoQuem = (quem: string) => `
  set local role authenticated;
  select set_config('request.jwt.claims', '{"sub":"${quem}","role":"authenticated"}', true);`;

// Volta ao dono e diz como as mídias ficaram.
const RESULTADO = `
  reset role;
  select array_agg(storage_path order by position) as ordem,
         array_agg(position order by position) as posicoes,
         max(storage_path) filter (where is_cover) as capa,
         count(*) filter (where is_cover)::int as capas
    from public.property_media
   where property_id = '${IMOVEL_A}';`;

async function ordenar(quem: string, ordem: string[], antes = '') {
  const lista = `array[${ordem.map((id) => `'${id}'`).join(',')}]::uuid[]`;
  return comoDonoEDesfaz(`
    ${MIDIAS}
    ${antes}
    ${comoQuem(quem)}
    select public.ordenar_midia('${IMOVEL_A}', ${lista});
    ${RESULTADO}`);
}

beforeAll(async () => {
  await conectar();
  await prepararPrivilegios(MIGRATIONS);
  const r = await comoDono(FIXTURA);
  if (r.erro) throw new Error(`fixtura não aplicou: ${r.erro}`);
}, 60_000);

afterAll(desconectar);

describe('a ordem das fotos', () => {
  it('grava a ordem da lista, e a primeira foto vira a capa', async () => {
    const r = await ordenar(IDS.corretor, [M.quatro, M.tres, M.um, M.dois]);
    expect(r.erro).toBeNull();
    expect(r.linhas[0]).toEqual({
      ordem: ['teste/4.jpg', 'teste/3.mp4', 'teste/1.jpg', 'teste/2.jpg'],
      posicoes: [0, 1, 2, 3],
      capa: 'teste/4.jpg',
      capas: 1,
    });
  });

  it('vídeo no primeiro lugar não é capa: a capa é a primeira foto', async () => {
    const r = await ordenar(IDS.corretor, [M.tres, M.um, M.dois, M.quatro]);
    expect(r.erro).toBeNull();
    expect(r.linhas[0]).toMatchObject({ ordem: ['teste/3.mp4', 'teste/1.jpg', 'teste/2.jpg', 'teste/4.jpg'], capa: 'teste/1.jpg', capas: 1 });
  });

  it('o que não veio na lista vai para o fim, na ordem do site, e id de fora é ignorado', async () => {
    // A ordem do site é a capa primeiro: a 2, depois a 1 e o vídeo.
    const r = await ordenar(IDS.corretor, [M.quatro, '00000000-0000-4000-b000-0000000000f9']);
    expect(r.erro).toBeNull();
    expect(r.linhas[0]).toMatchObject({
      ordem: ['teste/4.jpg', 'teste/2.jpg', 'teste/1.jpg', 'teste/3.mp4'],
      posicoes: [0, 1, 2, 3],
      capa: 'teste/4.jpg',
    });
  });

  it('lista vazia só arruma: depois de apagar a capa, a primeira foto que sobrou vira capa', async () => {
    const r = await ordenar(IDS.corretor, [], `delete from public.property_media where id = '${M.dois}';`);
    expect(r.erro).toBeNull();
    expect(r.linhas[0]).toEqual({
      ordem: ['teste/1.jpg', 'teste/3.mp4', 'teste/4.jpg'],
      posicoes: [0, 1, 2],
      capa: 'teste/1.jpg',
      capas: 1,
    });
  });

  it('corretor de outra imobiliária não mexe na ordem', async () => {
    const r = await ordenar(IDS.corretorDeFora, [M.quatro, M.tres, M.um, M.dois]);
    expect(r.erro).toBeNull();
    expect(r.linhas[0]).toMatchObject({ ordem: ['teste/1.jpg', 'teste/2.jpg', 'teste/3.mp4', 'teste/4.jpg'], capa: 'teste/2.jpg' });
  });

  it('visitante não chama a função', async () => {
    const r = await como('anon', 'select public.ordenar_midia($1, $2)', [IMOVEL_A, [M.um]]);
    expect(r.erro).toMatch(/permission denied/);
  });
});
