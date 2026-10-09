// O formato do que os hooks da Meta (hooks/useMeta.ts) devolvem.
import type { MetaHealth, MetaSyncStatus } from '@contracts';

export interface Integracao {
  id: string;
  /*
   * Quem conectou esta BM, e o nome que ela recebeu.
   *
   * Passaram a existir na 087, quando a imobiliária deixou de ter uma conexão
   * só. Sem eles a tela não tem como dizer QUAL conexão está mostrando — e "a
   * integração" deixou de identificar qualquer coisa.
   */
  owner_id: string | null;
  label: string | null;
  app_id: string;
  token_type: string | null;
  token_expires_at: string | null;
  scopes: string[];
  health: MetaHealth;
  health_error_code: number | null;
  health_message: string | null;
  health_changed_at: string;
}

export interface Pagina {
  id: string;
  page_id: string;
  page_name: string | null;
  subscribed_at: string | null;
  subscribe_error: string | null;
}

export interface ContaDeAnuncio {
  id: string;
  ad_account_id: string;
  name: string | null;
  currency: string | null;
  timezone_name: string | null;
  enabled: boolean;
}

export interface LinhaDeGasto {
  object_id: string;
  nome: string | null;
  /**
   * A campanha a que a linha pertence.
   *
   * Não é enfeite: TRÊS anúncios desta conta se chamam "Azure — 3", em
   * campanhas diferentes. Sem esta coluna eles aparecem como três linhas
   * idênticas com números diferentes, e quem olha conclui que o relatório
   * quebrou — ou soma os três de cabeça achando que é o mesmo.
   */
  campanha: string | null;
  /** Qual das contas ligadas pagou. Com duas contas, é a pergunta imediata. */
  conta: string | null;
  objective: string | null;
  /**
   * `effective_status` da Meta, cru.
   *
   * Nulo enquanto a importação de estado não passou por este objeto — e nulo
   * NÃO é "pausado". Quem traduz para "No ar"/"Pausado" é `entregaDoStatus`,
   * do pacote de contratos, que é onde a lista de valores mora.
   */
  status: string | null;
  currency: string;
  spend_minor: number;
  impressions: number | null;
  clicks: number | null;
  /**
   * O que a META apurou. Nulo enquanto a importação não trouxe — e nulo vira
   * '—' na tela, nunca zero: "0 cadastros" afirma que a campanha não converteu,
   * '—' diz que não sabemos ainda.
   */
  cadastros: number | null;
  conversas: number | null;
  /**
   * O que o CRM registrou, por atribuição de primeiro toque.
   *
   * Vai divergir de `cadastros`, e a divergência é o dado: "a Meta diz 12,
   * chegaram 9" aponta três leads perdidos no caminho.
   */
  leads_atribuidos: number;
}

export interface Sincronizacao {
  kind: string;
  /*
   * Uma linha por CONTA DE ANÚNCIO, não uma por tipo.
   *
   * `meta-insights` grava uma execução por conta, e a função antiga fazia
   * `distinct on (kind)` — com duas contas ligadas, a tela mostrava a que
   * terminou por último e escondia a outra. A imobiliária de origem tinha duas: uma parava de
   * importar e o cartão continuava verde, que é exatamente o defeito que este
   * cartão existe para eliminar.
   */
  ad_account_id: string | null;
  status: MetaSyncStatus;
  finished_at: string | null;
  truncated: boolean;
  rows_written: number;
  error_message: string | null;
}
