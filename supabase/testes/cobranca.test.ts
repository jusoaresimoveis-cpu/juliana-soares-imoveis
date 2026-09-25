import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { comoDono, comoDonoEDesfaz, conectar, desconectar, prepararPrivilegios, IDS } from './banco';

/**
 * A cobrança de resposta — a migração 128.
 *
 * Os testes em memória conferem o TEXTO da migração; estes conferem o que ela
 * faz, e aqui isso importa mais do que de costume: o alarme é uma consulta com
 * seis guardas (limite, marca, janela, etapa, exclusão, organização ativa) e um
 * erro em qualquer uma delas não aparece como falha — aparece como silêncio.
 *
 * Um alarme que não toca é indistinguível de um dia sem fila.
 *
 * TODO teste positivo vem acompanhado do negativo correspondente, e o fuso é
 * FIXADO em cada cenário: sem isso a suíte passaria de dia e falharia de
 * madrugada, que é o jeito mais rápido de ensinar a equipe a ignorar vermelho.
 */

const FIXTURA = readFileSync(join(__dirname, 'fixtura.sql'), 'utf8');
const MIGRATIONS = join(__dirname, '..', 'migrations');

/** Um fuso onde AGORA é horário comercial, seja qual for a hora do CI. */
const FUSO_DE_DIA = `(select t.name from pg_timezone_names t
   where extract(hour from now() at time zone t.name) between 10 and 16
     and t.name like 'Etc/%' limit 1)`;

/** E um onde AGORA é madrugada. */
const FUSO_DE_MADRUGADA = `(select t.name from pg_timezone_names t
   where extract(hour from now() at time zone t.name) between 1 and 4
     and t.name like 'Etc/%' limit 1)`;

/** Como está a casa: o limite em horas (nulo desliga) e que horas são lá. */
const casa = (horas: number | null, fuso: string = FUSO_DE_DIA) => `
  update public.organizations
     set aviso_espera_horas = ${horas === null ? 'null' : horas},
         timezone = ${fuso}
   where id = '${IDS.orgA}';`;

/** Alguém escreveu faz tanto tempo e ninguém voltou. */
const esperando = (horas: number, leadId: string = IDS.leadDoCorretor) => `
  update public.leads
     set esperando_desde = now() - make_interval(hours => ${horas}),
         espera_avisada  = null
   where id = '${leadId}';`;

const TOCA_O_ALARME = `do $$ begin perform public.avisar_espera_longa(); end $$;`;

/** O que sobrou depois do alarme: quantos avisos, para quem, dizendo o quê. */
const oQueSaiu = (leadId: string = IDS.leadDoCorretor) => `
  select (select count(*)::int from public.notifications
           where type = 'lead_esperando' and related_entity_id = '${leadId}')      as avisos,
         (select string_agg(p.full_name, ', ' order by p.full_name)
            from public.notifications n join public.profiles p on p.id = n.recipient_id
           where n.type = 'lead_esperando' and n.related_entity_id = '${leadId}')  as para_quem,
         (select n.body from public.notifications n
           where n.type = 'lead_esperando' and n.related_entity_id = '${leadId}' limit 1) as corpo,
         (select (l.espera_avisada is not distinct from l.esperando_desde)
            from public.leads l where l.id = '${leadId}')                          as marcado;`;

beforeAll(async () => {
  await conectar();
  await prepararPrivilegios(MIGRATIONS);
  const r = await comoDono(FIXTURA);
  if (r.erro) throw new Error(`fixtura não aplicou: ${r.erro}`);
  const alcance = await comoDono(
    `update public.notification_preferences set lead_scope = 'meus' where profile_id = '${IDS.gerente}'`,
  );
  if (alcance.erro) throw new Error(`alcance do gerente não fixou: ${alcance.erro}`);
}, 60_000);

afterAll(async () => {
  await desconectar();
});

describe('o cenário está montado', () => {
  it('a casa nasce com o limite padrão, e o lead do corretor tem dono', async () => {
    // Sem esta afirmação, todo "não avisou" abaixo poderia passar por falta de
    // configuração em vez de por acerto da guarda.
    const r = await comoDono(
      `select o.aviso_espera_horas as horas,
              (select l.assigned_to = '${IDS.corretor}' from public.leads l
                where l.id = '${IDS.leadDoCorretor}') as e_do_corretor
         from public.organizations o where o.id = '${IDS.orgA}'`,
    );
    expect(r.linhas[0]?.horas).toBe(2);
    expect(r.linhas[0]?.e_do_corretor).toBe(true);
  });
});

describe('passou do limite: o aviso sai', () => {
  it('vai para o dono do lead, dizendo há quanto tempo', async () => {
    const r = await comoDonoEDesfaz(
      `${casa(2)} ${esperando(3)} ${TOCA_O_ALARME} ${oQueSaiu()}`,
    );
    expect(r.erro).toBeNull();
    expect(r.linhas[0]?.avisos).toBe(1);
    expect(r.linhas[0]?.para_quem).toBe('Corretor da A');
    expect(r.linhas[0]?.corpo).toBe('Sem resposta há 3h');
    expect(r.linhas[0]?.marcado).toBe(true);
  });

  it('e a execução seguinte NÃO repete', async () => {
    /*
     * O cron roda quatro vezes por hora. Sem a marca, a mesma espera viraria
     * quarenta avisos até o fim do dia — e um sino que repete é um sino que se
     * aprende a fechar sem ler.
     */
    const r = await comoDonoEDesfaz(
      `${casa(2)} ${esperando(3)} ${TOCA_O_ALARME} ${TOCA_O_ALARME} ${TOCA_O_ALARME} ${oQueSaiu()}`,
    );
    expect(r.erro).toBeNull();
    expect(r.linhas[0]?.avisos).toBe(1);
  });

  it('lead sem dono cai em quem manda na casa', async () => {
    const r = await comoDonoEDesfaz(
      `${casa(2)} ${esperando(5, IDS.leadSemDono)} ${TOCA_O_ALARME} ${oQueSaiu(IDS.leadSemDono)}`,
    );
    expect(r.erro).toBeNull();
    expect(r.linhas[0]?.avisos).toBe(2);
    expect(r.linhas[0]?.para_quem).toBe('Admin da A, Gerente da A');
  });

  it('o corpo conta o TEMPO, e não o que o cliente escreveu', async () => {
    /*
     * A notificação vira push e acende na tela de bloqueio. O texto da conversa
     * já está no painel e na conversa, para quem tem acesso a ela.
     */
    const r = await comoDonoEDesfaz(
      `${casa(2)} ${esperando(30)} ${TOCA_O_ALARME} ${oQueSaiu()}`,
    );
    expect(r.erro).toBeNull();
    expect(r.linhas[0]?.corpo).toBe('Sem resposta há 1 dia');
  });
});

describe('os casos em que avisar seria errado', () => {
  it('ainda dentro do limite: ninguém é cobrado', async () => {
    const r = await comoDonoEDesfaz(`${casa(2)} ${esperando(1)} ${TOCA_O_ALARME} ${oQueSaiu()}`);
    expect(r.erro).toBeNull();
    expect(r.linhas[0]?.avisos).toBe(0);
    expect(r.linhas[0]?.marcado).toBe(false);
  });

  it('de madrugada na hora da imobiliária: espera o dia começar', async () => {
    /*
     * A guarda que o `cron` do Supabase não dá: ele roda em UTC, e a casa é
     * quem tem fuso. A espera continua na fila e por avisar — não se perde,
     * toca às 8h.
     */
    const r = await comoDonoEDesfaz(
      `${casa(2, FUSO_DE_MADRUGADA)} ${esperando(6)} ${TOCA_O_ALARME} ${oQueSaiu()}`,
    );
    expect(r.erro).toBeNull();
    expect(r.linhas[0]?.avisos).toBe(0);
    expect(r.linhas[0]?.marcado).toBe(false);
  });

  it('com o alarme desligado, nada sai', async () => {
    const r = await comoDonoEDesfaz(`${casa(null)} ${esperando(48)} ${TOCA_O_ALARME} ${oQueSaiu()}`);
    expect(r.erro).toBeNull();
    expect(r.linhas[0]?.avisos).toBe(0);
  });

  it('lead ganho não é cobrado', async () => {
    const r = await comoDonoEDesfaz(
      `${casa(2)} ${esperando(9)}
       update public.pipeline_stages set is_won = true where id = '${IDS.etapaA}';
       ${TOCA_O_ALARME} ${oQueSaiu()}`,
    );
    expect(r.erro).toBeNull();
    expect(r.linhas[0]?.avisos).toBe(0);
  });

  it('lead perdido também não', async () => {
    const r = await comoDonoEDesfaz(
      `${casa(2)} ${esperando(9)}
       update public.pipeline_stages set is_lost = true where id = '${IDS.etapaA}';
       ${TOCA_O_ALARME} ${oQueSaiu()}`,
    );
    expect(r.erro).toBeNull();
    expect(r.linhas[0]?.avisos).toBe(0);
  });

  it('lead excluído também não', async () => {
    const r = await comoDonoEDesfaz(
      `${casa(2)} ${esperando(9)}
       update public.leads set excluded_at = now() where id = '${IDS.leadDoCorretor}';
       ${TOCA_O_ALARME} ${oQueSaiu()}`,
    );
    expect(r.erro).toBeNull();
    expect(r.linhas[0]?.avisos).toBe(0);
  });

  it('quem silenciou "Sem resposta" não recebe', async () => {
    const r = await comoDonoEDesfaz(
      `${casa(2)} ${esperando(4)}
       insert into public.notification_preferences (profile_id, organization_id, muted_types)
       values ('${IDS.corretor}', '${IDS.orgA}', array['lead_esperando'])
       on conflict (profile_id) do update set muted_types = excluded.muted_types;
       ${TOCA_O_ALARME} ${oQueSaiu()}`,
    );
    expect(r.erro).toBeNull();
    expect(r.linhas[0]?.avisos).toBe(0);
    // A espera fica MARCADA mesmo assim: ela foi processada, e quem silenciou o
    // tipo não pode receber amanhã o aviso acumulado de hoje.
    expect(r.linhas[0]?.marcado).toBe(true);
  });
});

describe('a espera nova volta a valer', () => {
  it('o cliente escreve de novo depois de respondido, e o alarme conta do zero', async () => {
    /*
     * A marca guarda QUAL espera foi avisada, e não um sim/não. É o que faz o
     * segundo silêncio da casa ser cobrado sem ninguém precisar limpar nada.
     */
    const r = await comoDonoEDesfaz(
      `${casa(2)} ${esperando(3)} ${TOCA_O_ALARME}
       update public.leads set esperando_desde = null where id = '${IDS.leadDoCorretor}';
       update public.leads set esperando_desde = now() - interval '4 hours'
        where id = '${IDS.leadDoCorretor}';
       ${TOCA_O_ALARME} ${oQueSaiu()}`,
    );
    expect(r.erro).toBeNull();
    /*
     * UMA linha, e não duas: a chave de colapso junta enquanto o aviso não for
     * lido, e é assim que dez mensagens do mesmo lead viram um aviso só. O que
     * prova que a segunda espera foi cobrada é o CORPO, que passou a dizer o
     * tempo novo.
     */
    expect(r.linhas[0]?.avisos).toBe(1);
    expect(r.linhas[0]?.corpo).toBe('Sem resposta há 4h');
    expect(r.linhas[0]?.marcado).toBe(true);
  });
});
