import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { como, comoDono, comoDonoEDesfaz, conectar, desconectar, prepararPrivilegios, IDS } from './banco';

/**
 * O proprietário do imóvel e as visitas à página (migration 20260925000100).
 *
 * O cadastro do dono é dado pessoal de terceiro: nome, cidade e telefone de
 * quem entregou o imóvel para a Juliana. Aqui se confere que ele fica na
 * organização, que o site nunca o devolve, e que a contagem de visitas só tem
 * uma porta de entrada.
 */

const FIXTURA = readFileSync(join(__dirname, 'fixtura.sql'), 'utf8');
const MIGRATIONS = join(__dirname, '..', 'migrations');
const IMOVEL_A = '00000000-0000-4000-a000-000000000030';
const IMOVEL_B = '00000000-0000-4000-b000-000000000030';

/*
 * Vários passos na MESMA transação, como uma pessoa, e tudo desfeito no fim.
 * `como` roda uma consulta só; aqui o cenário precisa encadear chamadas (gravar
 * o dono duas vezes, contar duas visitas) e olhar o resultado antes do rollback.
 */
const papel = (ator: 'corretor' | 'corretor_de_fora') =>
  `set local role authenticated;
   select set_config('request.jwt.claims', '{"sub":"${ator === 'corretor' ? IDS.corretor : IDS.corretorDeFora}","role":"authenticated"}', true);`;
const visitante = `set local role anon; select set_config('request.jwt.claims', '{}', true);`;

beforeAll(async () => {
  await conectar();
  await prepararPrivilegios(MIGRATIONS);
  const r = await comoDono(FIXTURA);
  if (r.erro) throw new Error(`fixtura não aplicou: ${r.erro}`);
}, 60_000);

afterAll(desconectar);

describe('o proprietário do imóvel', () => {
  it('o corretor grava o dono, e o mesmo telefone reaproveita o cadastro', async () => {
    const r = await comoDonoEDesfaz(`
      ${papel('corretor')}
      select public.definir_proprietario('${IMOVEL_A}', 'Maria Silva', 'Blumenau', '(47) 99999-1234');
      select public.definir_proprietario('${IMOVEL_A}', 'Maria da Silva', 'Joinville', '47999991234');
      select count(*)::int as cadastros, max(full_name) as nome, max(city) as cidade, max(phone_e164) as telefone,
             (select owner_id is not null from public.properties where id = '${IMOVEL_A}') as ligado
        from public.property_owners;`);
    expect(r.erro).toBeNull();
    expect(r.linhas[0]).toEqual({
      cadastros: 1,
      nome: 'Maria da Silva',
      cidade: 'Joinville',
      telefone: '+5547999991234',
      ligado: true,
    });
  });

  it('nome e telefone vazios soltam o imóvel, e o cadastro do dono continua', async () => {
    const r = await comoDonoEDesfaz(`
      ${papel('corretor')}
      select public.definir_proprietario('${IMOVEL_A}', 'Maria Silva', null, '47999991234');
      select public.definir_proprietario('${IMOVEL_A}', '', '', '');
      select (select owner_id from public.properties where id = '${IMOVEL_A}') as dono,
             (select count(*)::int from public.property_owners) as cadastros;`);
    expect(r.erro).toBeNull();
    expect(r.linhas[0]).toEqual({ dono: null, cadastros: 1 });
  });

  it('telefone inválido é recusado com uma frase que se lê', async () => {
    const r = await como('corretor', `select public.definir_proprietario($1, 'Maria', null, '123')`, [IMOVEL_A]);
    expect(r.erro).toMatch(/Telefone do proprietário inválido/);
  });

  it('outra imobiliária não vê o cadastro nem grava dono no imóvel da A', async () => {
    const r = await comoDonoEDesfaz(`
      insert into public.property_owners (organization_id, full_name, phone_e164)
      values ('${IDS.orgA}', 'Dono da A', '+5547999990000');
      ${papel('corretor_de_fora')}
      select count(*)::int as ve from public.property_owners;`);
    expect(r.erro).toBeNull();
    expect(r.linhas[0]?.ve).toBe(0);

    const grava = await como('corretor_de_fora', `select public.definir_proprietario($1, 'Invasor', null, '47988887777')`, [IMOVEL_A]);
    expect(grava.erro).toMatch(/Imóvel não encontrado/);
  });

  it('o imóvel não aceita o dono de outra imobiliária, nem com o id na mão', async () => {
    // Como dono do banco: sem RLS, só a chave composta segura.
    const r = await comoDonoEDesfaz(`
      insert into public.property_owners (id, organization_id, full_name, phone_e164)
      values ('00000000-0000-4000-b000-000000000090', '${IDS.orgB}', 'Dono da B', '+5547999990001');
      update public.properties set owner_id = '00000000-0000-4000-b000-000000000090' where id = '${IMOVEL_A}';`);
    expect(r.erro).toMatch(/properties_owner_fk/);
  });

  it('visitante não lê o cadastro nem chama a função do CRM', async () => {
    expect((await como('anon', 'select count(*) from public.property_owners')).erro).toMatch(/permission denied/);
    const r = await como('anon', `select public.definir_proprietario($1, 'Maria', null, '47999991234')`, [IMOVEL_A]);
    expect(r.erro).toMatch(/permission denied/);
  });

  it('o site nunca devolve o dono', async () => {
    const r = await comoDonoEDesfaz(`
      update public.properties set is_published = true where id = '${IMOVEL_A}';
      ${papel('corretor')}
      select public.definir_proprietario('${IMOVEL_A}', 'Maria Silva', 'Blumenau', '47999991234');
      reset role;
      select public.site_imoveis('imob-a')::text as json;`);
    expect(r.erro).toBeNull();
    const json = String(r.linhas[0]?.json);
    // O imóvel publicado veio: a ausência do dono não é resposta vazia.
    expect(JSON.parse(json)).toHaveLength(1);
    expect(json).not.toMatch(/owner|Maria|999991234|Blumenau/);
  });
});

describe('as visitas à página do imóvel', () => {
  it('o site conta a visita de imóvel publicado, numa linha por dia', async () => {
    const r = await comoDonoEDesfaz(`
      update public.properties set is_published = true where id = '${IMOVEL_A}';
      select set_config('teste.codigo', (select public_code from public.properties where id = '${IMOVEL_A}'), true);
      ${visitante}
      select public.registrar_visita('imob-a', current_setting('teste.codigo'));
      select public.registrar_visita('imob-a', upper(current_setting('teste.codigo')));
      reset role;
      select day = (now() at time zone 'America/Sao_Paulo')::date as hoje, views
        from public.property_page_views where property_id = '${IMOVEL_A}';`);
    expect(r.erro).toBeNull();
    expect(r.linhas).toEqual([{ hoje: true, views: 2 }]);
  });

  it('não conta imóvel não publicado, de outra imobiliária ou que não existe', async () => {
    const r = await comoDonoEDesfaz(`
      update public.properties set is_published = true where id = '${IMOVEL_B}';
      select set_config('teste.codigo_a', (select public_code from public.properties where id = '${IMOVEL_A}'), true);
      select set_config('teste.codigo_b', (select public_code from public.properties where id = '${IMOVEL_B}'), true);
      ${visitante}
      select public.registrar_visita('imob-a', current_setting('teste.codigo_a'));
      select public.registrar_visita('imob-a', current_setting('teste.codigo_b'));
      select public.registrar_visita('imob-a', 'zzzz');
      reset role;
      select count(*)::int as linhas from public.property_page_views;`);
    expect(r.erro).toBeNull();
    expect(r.linhas[0]?.linhas).toBe(0);
  });

  it('ninguém escreve direto na tabela, e cada casa só lê as suas', async () => {
    const r = await comoDonoEDesfaz(`
      insert into public.property_page_views (property_id, organization_id, day, views) values
        ('${IMOVEL_A}', '${IDS.orgA}', current_date, 5),
        ('${IMOVEL_B}', '${IDS.orgB}', current_date, 7);
      ${papel('corretor')}
      select count(*)::int as ve, sum(views)::int as visitas from public.property_page_views;`);
    expect(r.erro).toBeNull();
    expect(r.linhas[0]).toEqual({ ve: 1, visitas: 5 });

    const escreve = await como(
      'corretor',
      `insert into public.property_page_views (property_id, organization_id, day, views) values ($1, $2, current_date, 999)`,
      [IMOVEL_A, IDS.orgA],
    );
    expect(escreve.erro).toMatch(/permission denied/);
    expect((await como('anon', 'select count(*) from public.property_page_views')).erro).toMatch(/permission denied/);
  });
});
