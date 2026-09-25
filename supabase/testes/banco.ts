import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';

/**
 * O laboratório onde a RLS é testada de verdade.
 *
 * Os 305 testes que já existem rodam em memória e não sabem nada de banco. Eles
 * cobrem conta, formato e contrato — e não cobrem a única coisa que separa um
 * cliente do outro, que são as 57 policies. Uma policy quebrada não faz teste
 * nenhum falhar hoje: ela aparece quando alguém abre a tela e vê o dado de
 * outra imobiliária, que é tarde demais.
 *
 * Estes testes falam com um Postgres de verdade, com as migrations aplicadas, e
 * fazem a pergunta que importa: quem consegue ler o quê.
 */

/*
 * Endereço do Postgres do `supabase start`.
 *
 * Fixo e público de propósito: é a instância local descartável do CLI, com a
 * senha que o próprio CLI documenta. Não existe segredo aqui, e não pode
 * existir — no dia em que este arquivo precisar de uma credencial de verdade, o
 * teste está apontando para o lugar errado.
 */
const URL_DO_BANCO =
  process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

/**
 * Quem está perguntando.
 *
 * Os nomes descrevem o PAPEL na história, não o identificador: é a diferença
 * entre um teste que se lê e um teste que precisa de um mapa ao lado.
 */
export type Ator =
  | 'anon'
  | 'corretor'
  | 'colega'
  | 'gerente'
  | 'admin'
  | 'corretor_de_fora'
  | 'gerente_de_fora';

/** Ids fixos, para a fixtura e os testes falarem da mesma linha. */
export const IDS = {
  orgA: '00000000-0000-4000-a000-000000000001',
  orgB: '00000000-0000-4000-b000-000000000001',
  corretor: '00000000-0000-4000-a000-000000000010',
  gerente: '00000000-0000-4000-a000-000000000011',
  admin: '00000000-0000-4000-a000-000000000012',
  /* Outro corretor da MESMA imobiliária. É ele que separa "não vê porque é de
     outra casa" de "não vê porque não é dele". */
  colega: '00000000-0000-4000-a000-000000000013',
  corretorDeFora: '00000000-0000-4000-b000-000000000010',
  gerenteDeFora: '00000000-0000-4000-b000-000000000011',
  /* Os três leads da imobiliária A, um por dono. É o que separa "vê tudo" de
     "vê o que é seu" — com um lead só, as duas respostas são idênticas. */
  leadDoCorretor: '00000000-0000-4000-a000-000000000040',
  leadDoGerente: '00000000-0000-4000-a000-000000000041',
  leadSemDono: '00000000-0000-4000-a000-000000000042',
  etapaA: '00000000-0000-4000-a000-000000000020',
  /** A segunda e a terceira etapa da A: para onde a 122 move, e o salto que ela não desfaz. */
  etapaA2: '00000000-0000-4000-a000-000000000021',
  etapaA3: '00000000-0000-4000-a000-000000000022',
  /** O número de WhatsApp da imobiliária A. Dono: o corretor. */
  instanciaA: '00000000-0000-4000-a000-000000000050',
  /** A conexão com a Meta de cada casa. Dono: o gerente. */
  conexaoA: '00000000-0000-4000-a000-000000000070',
  conexaoB: '00000000-0000-4000-b000-000000000070',
} as const;

const USUARIO: Record<Exclude<Ator, 'anon'>, string> = {
  corretor: IDS.corretor,
  colega: IDS.colega,
  gerente: IDS.gerente,
  admin: IDS.admin,
  corretor_de_fora: IDS.corretorDeFora,
  gerente_de_fora: IDS.gerenteDeFora,
};

let cliente: Client | null = null;

export async function conectar(): Promise<Client> {
  if (cliente) return cliente;
  cliente = new Client({ connectionString: URL_DO_BANCO });
  await cliente.connect();
  return cliente;
}

export async function desconectar(): Promise<void> {
  await cliente?.end();
  cliente = null;
}

export interface Resposta {
  /** Linhas devolvidas. Vazio é uma resposta legítima da RLS, não um erro. */
  linhas: Record<string, unknown>[];
  /** Preenchido quando o Postgres RECUSOU — violação de policy, permissão, etc. */
  erro: string | null;
}

/**
 * Roda uma consulta como um ator, e desfaz tudo depois.
 *
 * Duas peças fazem o disfarce funcionar:
 *
 *   set local role         — troca o papel do Postgres, que é o que as policies
 *                            olham no `to authenticated`.
 *   request.jwt.claims     — é daqui que `auth.uid()` lê o `sub`. Sem isso, uma
 *                            policy que compara com `auth.uid()` recebe nulo e
 *                            nega tudo, e o teste passaria por engano.
 *
 * `set local` e `rollback` no fim: a transação inteira é descartada, então um
 * teste de INSERT não deixa linha para o próximo encontrar. Sem isso, a ordem
 * dos testes passaria a importar — e teste que depende de ordem é teste que
 * mente em algum momento.
 */
export async function como(ator: Ator, sql: string, params: unknown[] = []): Promise<Resposta> {
  const c = await conectar();
  await c.query('begin');
  try {
    if (ator === 'anon') {
      await c.query("set local role anon");
      // Visitante não tem `sub`. Um objeto vazio, e não a ausência do
      // parâmetro: assim `auth.uid()` devolve nulo em vez de estourar.
      await c.query("select set_config('request.jwt.claims', '{}', true)");
    } else {
      await c.query("set local role authenticated");
      await c.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: USUARIO[ator], role: 'authenticated' }),
      ]);
    }

    const r = await c.query(sql, params);
    return { linhas: r.rows ?? [], erro: null };
  } catch (e) {
    return { linhas: [], erro: (e as Error).message };
  } finally {
    // `rollback` mesmo no caminho de sucesso: nada do que um teste escreve
    // sobrevive a ele.
    await c.query('rollback');
  }
}

/**
 * Devolve ao Postgres local o modelo de privilégio que a produção tem.
 *
 * Isto não é enfeite de teste: sem ele a suíte mede a coisa errada, e mede
 * bonito. Na primeira execução no CI, TODA consulta como `authenticated`
 * respondeu "permission denied for table leads" — e dois testes passaram por
 * causa disso, porque "recusado" era o que eles esperavam. Verde por falta de
 * permissão, não por acerto da policy.
 *
 * A causa: no Supabase de verdade, `anon` e `authenticated` recebem privilégio
 * de tabela por DEFAULT PRIVILEGES no momento em que a tabela nasce, e a RLS é
 * quem decide o resto. Em cima dessa base, as migrations fazem algo mais fino —
 * revogam tudo numa tabela sensível e devolvem só o que pode:
 *
 *     revoke all    on public.whatsapp_conversations from authenticated;
 *     grant  select on public.whatsapp_conversations to   authenticated;
 *     grant  update (lead_id, archived_at, unread_count) on ... to authenticated;
 *
 * Isso é privilégio de COLUNA, uma camada abaixo da RLS, e é proteção de
 * verdade: nem policy permissiva deixa o corretor reescrever o corpo de uma
 * mensagem que chegou do WhatsApp. O Postgres do `supabase start` nasce sem a
 * base, então as revogações não tinham o que revogar e nada foi concedido.
 *
 * Aqui a base é recriada e, em seguida, TODO `grant`/`revoke` das migrations é
 * reexecutado na ordem. Reexecutar em vez de copiar à mão é o que impede a
 * divergência: no dia em que alguém revogar mais uma coluna, o teste passa a
 * saber disso sozinho, porque lê o mesmo arquivo que a produção recebeu.
 */
export async function prepararPrivilegios(pastaDasMigrations: string): Promise<number> {
  const c = await conectar();

  await c.query('grant usage on schema public to anon, authenticated');
  await c.query('grant all on all tables in schema public to anon, authenticated');
  await c.query('grant all on all sequences in schema public to anon, authenticated');

  /*
   * Da abertura da linha até o primeiro `;`.
   *
   * Pegar o arquivo e quebrar em `;` seria mais simples e estaria errado: os
   * corpos de função vêm entre `$$` e são cheios de ponto e vírgula, e os
   * pedaços picados voltariam como instruções inventadas.
   */
  const instrucao = /(?:^|\n)[ \t]*(?:grant|revoke)\b[^;]*;/gi;

  let aplicadas = 0;
  const arquivos = readdirSync(pastaDasMigrations).filter((f) => f.endsWith('.sql')).sort();

  for (const arquivo of arquivos) {
    const sql = readFileSync(join(pastaDasMigrations, arquivo), 'utf8');
    for (const achado of sql.match(instrucao) ?? []) {
      try {
        await c.query(achado.trim());
        aplicadas += 1;
      } catch (e) {
        // Uma instrução que não aplica é sinal, não detalhe — um objeto que
        // mudou de nome, um papel que não existe. Fica no log e o teste segue,
        // porque a asserção de fidelidade abaixo é quem decide se deu certo.
        console.warn(`privilégio não aplicado (${arquivo}): ${(e as Error).message}`);
      }
    }
  }

  return aplicadas;
}

/**
 * Cenário de VÁRIOS passos, com poderes totais, desfeito no fim.
 *
 * `comoDono` grava de verdade e não desfaz — bom para plantar a fixtura, ruim
 * para um teste que precisa inserir, deixar um gatilho rodar e depois LER o que
 * ele fez. Ler no mesmo comando não funciona: gatilho `after` roda no fim da
 * instrução, e o `select` de dentro do mesmo comando enxerga o instantâneo
 * anterior. Então são dois comandos, na mesma transação, e a transação some.
 *
 * Sem parâmetros de propósito: o protocolo simples do Postgres é o que aceita
 * várias instruções numa ida só, e ele não aceita `$1`. Cenário de teste
 * escreve os próprios valores.
 */
export async function comoDonoEDesfaz(sql: string): Promise<Resposta> {
  const c = await conectar();
  await c.query('begin');
  try {
    const r = (await c.query(sql)) as unknown;
    const ultimo = Array.isArray(r) ? r[r.length - 1] : r;
    return { linhas: (ultimo as { rows?: Record<string, unknown>[] })?.rows ?? [], erro: null };
  } catch (e) {
    return { linhas: [], erro: (e as Error).message };
  } finally {
    await c.query('rollback');
  }
}

/** Consulta com poderes totais, para montar cenário e conferir o resultado. */
export async function comoDono(sql: string, params: unknown[] = []): Promise<Resposta> {
  const c = await conectar();
  try {
    const r = await c.query(sql, params);
    return { linhas: r.rows ?? [], erro: null };
  } catch (e) {
    return { linhas: [], erro: (e as Error).message };
  }
}

/** Quantas linhas o ator enxerga numa tabela. */
export async function quantasVe(ator: Ator, tabela: string): Promise<number> {
  const r = await como(ator, `select count(*)::int as n from public.${tabela}`);
  if (r.erro) return -1;
  return (r.linhas[0]?.n as number) ?? 0;
}
