import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  definicaoDaFuncao,
  executoresDaFuncao,
  policiesDaTabela,
  rlsLigada,
  semComentarios,
} from '../../../supabase/testes/esquema';

/**
 * As duas portas públicas, e o que as protege.
 *
 * Nada aqui roda contra o banco — o projeto ainda não tem teste que fale com um
 * Postgres de verdade. O que estes testes pegam é a classe de quebra que já
 * aconteceu neste repositório mais de uma vez: alguém edita a função, o
 * comentário continua descrevendo a defesa, e a defesa não está mais lá. Falha
 * silenciosa, e do tipo que só aparece quando alguém abusa.
 */

const raiz = join(__dirname, '..');
const ler = (...p: string[]) => readFileSync(join(raiz, ...p), 'utf8');

const PORTAS_PUBLICAS = ['landing-lead', 'reportar-erro'] as const;

describe('portas sem sessão', () => {
  it.each(PORTAS_PUBLICAS)('%s aplica o limite de acessos', (porta) => {
    const fonte = ler('..', '..', 'supabase', 'functions', porta, 'index.ts');
    expect(fonte).toContain('passouNoLimite');
    // O retorno precisa ser CHECADO. `await passouNoLimite(...)` solto compila,
    // roda, conta certo — e deixa passar tudo.
    expect(fonte).toMatch(/if\s*\(!\(await passouNoLimite\(/);
  });

  it.each(PORTAS_PUBLICAS)('%s carimba a origem de quem chamou', (porta) => {
    /*
     * `CORS` traz uma origem FIXA, a primeira da lista, que é a do CRM. A
     * landing page é servida pelo domínio da imobiliária — outra origem — e o
     * navegador descarta a resposta quando o cabeçalho não bate. Foi exatamente
     * isso que aconteceu com a `landing-lead`, e o sintoma na tela é o inútil
     * "Failed to send a request to the Edge Function".
     */
    /*
     * `servir` no lugar de `comOrigem(await responder(req), req)`.
     *
     * O padrão antigo carimbava a origem e tinha um buraco: exceção dentro do
     * handler fazia o `await` rejeitar, `comOrigem` nunca rodava, e saía um 500
     * sem CORS — o navegador descartava e a tela dizia "erro de rede". `servir`
     * faz o mesmo carimbo E segura a exceção, então esta guarda ficou mais
     * forte, não mais fraca.
     */
    expect(ler('..', '..', 'supabase', 'functions', porta, 'index.ts')).toContain('servir(responder)');
  });

  it.each(PORTAS_PUBLICAS)('%s está declarada no config.toml sem verify_jwt', (porta) => {
    // Sem a entrada, o padrão do Supabase é `verify_jwt = true` e o portão
    // recusa a chamada ANTES da função — com 401 e sem cabeçalho de CORS, que
    // no navegador aparece como erro de rede.
    const toml = ler('..', '..', 'supabase', 'config.toml');
    const bloco = toml.split(`[functions.${porta}]`)[1] ?? '';
    expect(bloco.split('[functions.')[0]).toContain('verify_jwt = false');
  });
});

describe('o limite de acessos, no banco', () => {
  it('só o service_role executa `limitar`', () => {
    // `anon` com permissão de executar poderia inflar o próprio contador até o
    // teto e se auto-bloquear — ou, pior, inflar o de outra chave.
    expect(executoresDaFuncao('limitar')).toEqual(['service_role']);
  });

  it('a tabela do contador tem RLS', () => {
    expect(rlsLigada('limite_acessos')).toBe(true);
  });

  it('conta e decide na mesma instrução', () => {
    // Ler o contador e gravar depois deixa passar o dobro quando dois pedidos
    // chegam juntos — e chegar junto é o que um laço faz.
    expect(semComentarios(definicaoDaFuncao('limitar').texto)).toContain('on conflict (chave) do update');
  });
});

describe('os relatos de erro, no banco', () => {
  const policies = () => policiesDaTabela('error_reports');

  it('a tabela tem RLS', () => {
    expect(rlsLigada('error_reports')).toBe(true);
  });

  it('só gestor da própria organização lê', () => {
    // O pg_dump qualifica a coluna: `is_admin_or_above(error_reports.organization_id)`.
    const texto = policies().map((p) => p.normal).join('\n');
    expect(texto).toMatch(/is_admin_or_above\((error_reports\.)?organization_id\)/);
    expect(texto).toContain('current_org_id()');
  });

  it('ninguém escreve pela API — a escrita é da edge function', () => {
    /*
     * Uma policy de insert aqui abriria uma tabela para a internet gravar, que é
     * o problema que a migration 056 acabou de fechar do outro lado. A função
     * escreve com `service_role`, que ignora RLS e não precisa de policy.
     *
     * Policy sem `for` vale para tudo — e o pg_dump só escreve o `for` quando
     * ela não é para tudo. As duas formas reprovam aqui.
     */
    expect(policies().length).toBeGreaterThan(0);
    for (const p of policies()) {
      expect(p.normal).toMatch(/ for select /);
    }
  });
});
