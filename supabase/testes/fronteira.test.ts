import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { como, comoDono, conectar, desconectar, prepararPrivilegios, IDS } from './banco';

/**
 * Os três buracos que a migration 058 fechou.
 *
 * Todos foram achados depois de o sistema estar em produção, e todos eram
 * invisíveis pelo mesmo motivo: com uma imobiliária só, não existe de quem
 * roubar. O teste que os pega precisa de duas — e é por isso que ele só passou
 * a existir quando o laboratório passou a existir.
 *
 * Cada bloco aqui falharia antes da 058. É essa a única prova de que um teste
 * de segurança serve para alguma coisa.
 */

const FIXTURA = readFileSync(join(__dirname, 'fixtura.sql'), 'utf8');
const MIGRATIONS = join(__dirname, '..', 'migrations');

beforeAll(async () => {
  await conectar();
  await prepararPrivilegios(MIGRATIONS);
  const r = await comoDono(FIXTURA);
  if (r.erro) throw new Error(`fixtura não aplicou: ${r.erro}`);
}, 60_000);

afterAll(async () => {
  await desconectar();
});

describe('o vínculo com a imobiliária', () => {
  it('o corretor NÃO se muda para a outra imobiliária', async () => {
    /*
     * O buraco original, em uma linha de SQL.
     *
     * `profiles_self_update` deixa a pessoa editar a própria linha e não diz
     * nada sobre `organization_id`. E `current_org_id()` é, literalmente,
     * `select organization_id from profiles where id = auth.uid()` — a coluna
     * que decide de qual imobiliária você é estava sob a caneta do usuário.
     * Trocar o valor e ler a carteira do outro cliente era um UPDATE.
     */
    const r = await como(
      'corretor',
      `update public.profiles set organization_id = $1 where id = $2`,
      [IDS.orgB, IDS.corretor],
    );
    expect(r.erro).toMatch(/não se troca por aqui/i);
  });

  it('e continua vendo só a própria carteira depois da tentativa', async () => {
    // A transação do teste acima rola atrás; esta é a confirmação de que nada
    // escapou por outro caminho.
    const r = await como('corretor', 'select full_name from public.leads');
    expect(r.linhas.map((l) => l.full_name)).toEqual(['Cliente da A']);
  });

  it('o gerente também não move ninguém para fora', async () => {
    const r = await como(
      'gerente',
      `update public.profiles set organization_id = $1 where id = $2`,
      [IDS.orgB, IDS.corretor],
    );
    expect(r.erro).not.toBeNull();
  });

  it('mas o corretor continua editando o que é dele', async () => {
    // O gatilho não pode ter fechado a porta inteira: trocar o próprio nome e
    // telefone é a razão de `profiles_self_update` existir.
    const r = await como(
      'corretor',
      `update public.profiles set full_name = 'Nome Novo' where id = $1 returning full_name`,
      [IDS.corretor],
    );
    expect(r.erro).toBeNull();
    expect(r.linhas[0]?.full_name).toBe('Nome Novo');
  });
});

describe('as funções internas', () => {
  /*
   * `revoke ... from public` NÃO fecha uma função no Supabase: `anon` e
   * `authenticated` recebem a concessão NOMINAL por default privileges quando a
   * função nasce, e ela sobrevive à revogação do PUBLIC. Medido de fora, antes
   * da 058: POST /rest/v1/rpc/notification_audience devolvia HTTP 200 para quem
   * não tem sessão nenhuma.
   */
  const FECHADAS: [string, string][] = [
    ['find_or_create_lead', `select public.find_or_create_lead($1, 'X', '+5547999990003', 'BR', null, 'manual', null, null, '{}'::jsonb)`],
    ['create_notification', `select public.create_notification($1, array[]::uuid[], 'x', 'x', 'x', null, null, null, null)`],
    ['notification_audience', `select public.notification_audience($1, null, null)`],
    ['touch_lead_attribution', `select public.touch_lead_attribution('00000000-0000-4000-a000-000000000040'::uuid, '{}'::jsonb)`],
    ['limitar', `select public.limitar('x', 1, interval '1 minute')`],
    ['whatsapp_drenar_saida', `select public.whatsapp_drenar_saida()`],
  ];

  it.each(FECHADAS)('o anônimo não executa %s', async (_nome, sql) => {
    const r = await como('anon', sql, sql.includes('$1') ? [IDS.orgA] : []);
    expect(r.erro).toMatch(/permission denied/i);
  });

  it.each(FECHADAS)('nem o corretor logado executa %s', async (_nome, sql) => {
    // Fechar só para o anônimo deixaria o corretor de uma imobiliária criando
    // lead e notificação dentro de outra, que é o mesmo buraco com sessão.
    const r = await como('corretor', sql, sql.includes('$1') ? [IDS.orgA] : []);
    expect(r.erro).toMatch(/permission denied/i);
  });

  it('mas as funções que a RLS usa continuam abertas', async () => {
    /*
     * Este é o teste que impede o conserto de virar apagão.
     *
     * As policies chamam `current_org_id()` e `is_admin_or_above()`, e policy
     * roda com o papel de quem consulta. Revogar essas duas junto com as outras
     * derrubaria a RLS inteira em vez de reforçá-la — e o sintoma seria o CRM
     * inteiro vazio, não um erro.
     */
    const r = await como('corretor', 'select public.current_org_id() as org');
    expect(r.erro).toBeNull();
    expect(r.linhas[0]?.org).toBe(IDS.orgA);
  });

  it('e a página pública continua lendo o anúncio sem sessão', async () => {
    const r = await como('anon', `select public.landing_publica('imob-a', 'br', 'x', 'a') as j`);
    expect(r.erro).toBeNull();
  });
});

describe('escolher a linha só pelo id', () => {
  it('o corretor da B não escreve no histórico do lead da A', async () => {
    /*
     * `log_timeline_event` é `security definer` e passa por cima da RLS. Ela
     * buscava o lead só pelo id: conhecer um UUID bastava para escrever na casa
     * do vizinho. Agora devolve nulo — a MESMA resposta de um lead que não
     * existe, para não confirmar ao curioso que o id dele acertou.
     */
    const r = await como(
      'corretor_de_fora',
      `select public.log_timeline_event($1, 'mensagem', 'nota', 'Invasão') as id`,
      ['00000000-0000-4000-a000-000000000040'],
    );
    expect(r.erro).toBeNull();
    expect(r.linhas[0]?.id).toBeNull();

    const conferindo = await comoDono(
      `select count(*)::int as n from public.lead_timeline_events where lead_id = $1 and title = 'Invasão'`,
      ['00000000-0000-4000-a000-000000000040'],
    );
    expect(conferindo.linhas[0]?.n).toBe(0);
  });

  it('mas escreve no histórico do lead da própria casa', async () => {
    const r = await como(
      'corretor',
      `select public.log_timeline_event($1, 'mensagem', 'nota', 'Ligação feita') as id`,
      ['00000000-0000-4000-a000-000000000040'],
    );
    expect(r.erro).toBeNull();
    expect(r.linhas[0]?.id).not.toBeNull();
  });
});
