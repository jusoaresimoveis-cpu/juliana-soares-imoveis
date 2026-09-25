/**
 * Os NOMES de campanha, conjunto e anúncio.
 *
 * A tabela `meta_ad_dimensions` existe desde a migração 017 e a consulta
 * agregada já a juntava — mas nada nunca escrevia nela. O resultado era a tela
 * de anúncios listando `#120200000000000003` em vez de "Apartamento Jardim —
 * Vídeo 15s": uma tela de decisão de verba onde não dá para saber o que
 * desligar. O gasto estava certo o tempo todo; faltava só saber de quem era.
 *
 * O nome vem JUNTO com o gasto, na mesma resposta do insights — pedir
 * `campaign_name,adset_name,ad_name` não custa uma chamada a mais. Buscar
 * depois em `/{conta}/ads` custaria, e ainda traria anúncios que nunca gastaram
 * e portanto não têm linha nesta tela.
 *
 * O id continua sendo a chave e o nome resolve por junção: é o que permite ao
 * gestor renomear a campanha no meio do mês sem partir o histórico dela em duas
 * linhas no relatório.
 *
 * Este arquivo não importa nada do Deno de propósito — assim a suíte do
 * navegador consegue exercitar a única parte com regra de verdade aqui, que é a
 * deduplicação.
 */

export interface Linha {
  date_start?: string;
  campaign_id?: string;
  adset_id?: string;
  ad_id?: string;
  campaign_name?: string;
  adset_name?: string;
  ad_name?: string;
  objective?: string;
  spend?: string;
  impressions?: string;
  /** Clique em QUALQUER lugar do anúncio, inclusive curtir e expandir foto. */
  clicks?: string;
  /** Clique no LINK. É este que vira visita, e é sobre ele que o CTR vale. */
  inline_link_clicks?: string;
  account_currency?: string;
  /** `[{ action_type, value }]` — cadastros, conversas, e mais uma dúzia. */
  actions?: unknown;
}

export interface Dimensao {
  organization_id: string;
  level: string;
  object_id: string;
  ad_account_id: string;
  name: string | null;
  objective: string | null;
  synced_at: string;
}

const NIVEIS = [
  { nivel: 'campaign', id: 'campaign_id', nome: 'campaign_name' },
  { nivel: 'adset', id: 'adset_id', nome: 'adset_name' },
  { nivel: 'ad', id: 'ad_id', nome: 'ad_name' },
] as const;

/** O que pedir à Graph, além do gasto. Fica aqui para não divergir de `NIVEIS`. */
export const CAMPOS_DE_NOME = 'campaign_name,adset_name,ad_name,objective';

/**
 * As dimensões de uma página de resultados, sem repetição.
 *
 * Trinta dias de um anúncio são trinta linhas com o mesmo nome. Sem
 * deduplicação, o upsert receberia o mesmo par (level, object_id) várias vezes
 * NO MESMO lote — e o Postgres recusa o comando inteiro com "ON CONFLICT DO
 * UPDATE command cannot affect row a second time". Não falharia uma linha:
 * falharia a gravação toda, e em silêncio, porque nome é cosmético e ninguém
 * aborta uma importação de gasto por causa dele.
 */
export function dimensoesDe(
  linhas: Linha[],
  org: string,
  adAccountId: string,
  agora: string,
): Dimensao[] {
  const porChave = new Map<string, Dimensao>();

  for (const l of linhas) {
    for (const n of NIVEIS) {
      const objectId = l[n.id];
      // Sentinela '' do gasto não é objeto: uma linha de conjunto vazio não
      // deve criar uma dimensão chamada "".
      if (!objectId) continue;

      const chave = `${n.nivel}:${objectId}`;
      const anterior = porChave.get(chave);

      const bruto = l[n.nome];
      const nome = typeof bruto === 'string' && bruto.trim() !== '' ? bruto.trim() : null;

      porChave.set(chave, {
        organization_id: org,
        level: n.nivel,
        object_id: objectId,
        ad_account_id: adAccountId,
        // Nome vazio NÃO apaga o que já veio. A Meta repete o nome atual em
        // toda linha, mas basta uma vir sem para o anúncio voltar a ser um
        // número na tela.
        name: nome ?? anterior?.name ?? null,
        /*
         * `objective` é da campanha, e a Meta o repete nas linhas de conjunto e
         * de anúncio. Guardá-lo nos três níveis evita uma segunda junção só
         * para descobrir que tipo de campanha é aquela — e evita classificar
         * por SUBSTRING do nome ("se contém 'wpp' é WhatsApp"), que foi como o
         * sistema auditado fazia e que quebra no dia em que alguém escreve
         * "Whats" ou renomeia.
         */
        objective: l.objective ?? anterior?.objective ?? null,
        synced_at: agora,
      });
    }
  }

  return [...porChave.values()];
}
