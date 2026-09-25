import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { privilegiosNaTabela } from '../../../supabase/testes/esquema';

/**
 * Toda coluna que a tela lê precisa estar no GRANT.
 *
 * Três tabelas do domínio Meta não têm privilégio de tabela para os papéis de
 * cliente: têm uma LISTA FECHADA de colunas, reescrita por inteiro a cada
 * migration que mexe nelas. É assim que `access_token_id` e
 * `webhook_secret_hash` ficam fora do alcance do navegador, e é uma defesa boa.
 *
 * Só que ela falha para o lado errado e em silêncio. No Postgres, FILTRAR por
 * uma coluna exige SELECT naquela coluna — não basta poder ler as outras. Uma
 * coluna nova que não entre na lista faz a consulta inteira responder
 * "permission denied", o hook devolve erro, e o componente cai no estado vazio.
 *
 * Foi o que aconteceu duas vezes no mesmo dia:
 *
 *   a 087 deu `integration_id` a `meta_pages` e não reescreveu a lista. A tela
 *   passou a mostrar "Nenhuma página ainda" — uma frase plausível, sem erro
 *   nenhum — enquanto a página estava lá, assinada havia dez dias.
 *
 * Este teste compara as duas pontas: as colunas que os hooks pedem e a última
 * lista concedida nas migrations. Ele não checa segredo NENHUM — ao contrário,
 * quanto menor a lista, melhor; o que ele exige é que ela cubra o que a tela usa.
 */

const RAIZ = join(__dirname, '..');
const HOOK = readFileSync(join(RAIZ, 'src', 'hooks', 'useMeta.ts'), 'utf8');

/**
 * A lista de colunas que `authenticated` pode ler, como ficou depois de todo
 * GRANT e REVOKE — ou `null` quando não há lista fechada.
 *
 * O pg_dump escreve um GRANT por coluna, e não a lista que a migration
 * escreveu; o que importa é o resultado. E SELECT na tabela inteira também é
 * "sem lista fechada": com ele, toda coluna volta ao alcance do navegador.
 */
function colunasConcedidas(tabela: string): string[] | null {
  const concedido = privilegiosNaTabela(tabela, 'authenticated');
  if (concedido.tabela.includes('select')) return null;
  return concedido.colunas.select ?? null;
}

/**
 * As colunas que o hook usa numa tabela: as do `select` e as de todo `.eq()`.
 *
 * O `.eq()` é o que importa aqui — foi o filtro, e não a projeção, que quebrou.
 * Uma coluna que só aparece no `where` é fácil de esquecer justamente porque não
 * está na lista visível do `select`.
 */
function colunasUsadas(tabela: string): string[] {
  const bloco = new RegExp(`from\\('${tabela}'\\)([\\s\\S]{0,600}?)(?:;|\\n\\s*\\}\\s*,)`, 'g');
  const usadas = new Set<string>();

  for (const m of HOOK.matchAll(bloco)) {
    const trecho = m[1] ?? '';
    const sel = trecho.match(/\.select\(\s*\n?\s*'([^']+)'/);
    if (sel?.[1]) {
      for (const c of sel[1].split(',')) {
        // `split('(')[0]` para descartar embed (`pipeline_stages(label)`), e o
        // `?? ''` porque em modo estrito o índice de um split é opcional.
        const nome = (c.trim().split('(')[0] ?? '').trim();
        if (nome && !nome.includes('*')) usadas.add(nome);
      }
    }
    for (const eq of trecho.matchAll(/\.(?:eq|neq|gt|gte|lt|lte|is|in|order)\(\s*'([a-z_]+)'/g)) {
      if (eq[1]) usadas.add(eq[1]);
    }
  }
  return [...usadas];
}

const COM_LISTA_FECHADA = ['meta_integrations', 'meta_pages'] as const;

describe('grant por coluna cobre o que a tela usa', () => {
  it.each(COM_LISTA_FECHADA)('%s tem lista fechada nas migrations', (tabela) => {
    // A positiva primeiro: se a lista sumisse (a tabela virasse grant de tabela
    // inteira), o teste de baixo passaria sem medir nada — e passaria justamente
    // no caso em que o segredo voltaria a ficar alcançável.
    expect(colunasConcedidas(tabela), `${tabela} deixou de ter grant por coluna`).not.toBeNull();
  });

  it.each(COM_LISTA_FECHADA)('%s: nenhuma coluna usada pelo hook está fora do grant', (tabela) => {
    const concedidas = colunasConcedidas(tabela) ?? [];
    const usadas = colunasUsadas(tabela);

    expect(usadas.length, `nenhuma leitura de ${tabela} encontrada no hook`).toBeGreaterThan(0);

    const faltando = usadas.filter((c) => !concedidas.includes(c));
    expect(
      faltando,
      `${tabela}: o hook usa ${faltando.join(', ')}, que não está no grant. ` +
        `A consulta vai responder "permission denied" e a tela vai cair no estado vazio, ` +
        `sem erro visível.`,
    ).toEqual([]);
  });

  it('e o segredo continua fora — é para isso que a lista fechada existe', () => {
    /*
     * O contraponto. Um "conserto" preguiçoso para o teste acima seria conceder
     * a tabela inteira, e aí `app_secret_id`, `access_token_id` e
     * `webhook_secret_hash` voltariam ao alcance do navegador — que é o defeito
     * que a 017 descreve tendo encontrado no sistema auditado.
     */
    const proibidas = ['app_secret_id', 'access_token_id', 'webhook_secret_hash', 'page_token_id'];
    for (const tabela of COM_LISTA_FECHADA) {
      const concedidas = colunasConcedidas(tabela) ?? [];
      for (const p of proibidas) {
        expect(concedidas, `${tabela} concedeu ${p} ao cliente`).not.toContain(p);
      }
    }
  });
});
