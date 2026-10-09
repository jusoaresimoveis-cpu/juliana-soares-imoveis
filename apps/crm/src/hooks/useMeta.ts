import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { exigir } from '@/lib/exigir';
import { chamarFuncao } from '@/lib/funcoes';
import type { MetaHealth, MetaAdLevel } from '@contracts';
import type { ContaDeAnuncio, Integracao, LinhaDeGasto, Pagina, Sincronizacao } from '@/types/meta';

// Os tipos moram em types/meta.ts; quem já os importava daqui continua
// importando sem mudar nada.
export type { ContaDeAnuncio, Integracao, LinhaDeGasto, Pagina, Sincronizacao } from '@/types/meta';

/**
 * A projeção nomeia as colunas, e não é preciosismo: o GRANT da 018 concede
 * leitura só na lista segura. `webhook_secret_hash` está de fora, e um
 * `select('*')` aqui devolveria erro em vez de dado.
 */
/**
 * As conexões que esta pessoa enxerga.
 *
 * Era `maybeSingle()`, e isso deixou de funcionar no instante em que a segunda
 * BM entrou: com duas linhas visíveis o supabase-js devolve ERRO, e a tela de
 * Anúncios do gerente quebraria inteira — não por causa da conexão nova, mas
 * por causa da forma da consulta antiga.
 *
 * Quem recorta é a policy da 087: a corretora vê a dela, a gestão vê todas.
 */
export function useIntegracoesMeta() {
  return useQuery({
    queryKey: ['meta-integracoes'],
    queryFn: async (): Promise<Integracao[]> => {
      const { data, error } = await supabase
        .from('meta_integrations')
        .select(
          'id, owner_id, label, app_id, token_type, token_expires_at, scopes, health, health_error_code, health_message, health_changed_at',
        )
        .order('created_at');
      if (error) throw error;
      return (data ?? []).map((i) => ({ ...i, health: i.health as MetaHealth }));
    },
  });
}

/**
 * As páginas, com o estado da ASSINATURA.
 *
 * `subscribed_at` nulo significa que a Meta não vai entregar lead nenhum —
 * mesmo com o webhook configurado e verde no painel dela. É o passo invisível
 * da integração, e por isso ele aparece na tela como estado, não como suposição.
 */
export function usePaginasMeta(integracaoId?: string) {
  return useQuery({
    queryKey: ['meta-paginas', integracaoId ?? null],
    enabled: !!integracaoId,
    queryFn: async (): Promise<Pagina[]> => {
      const { data, error } = await supabase
        .from('meta_pages')
        .select('id, page_id, page_name, subscribed_at, subscribe_error')
        .eq('integration_id', exigir(integracaoId, 'a integração'))
        .order('page_name');
      if (error) throw error;
      return data ?? [];
    },
  });
}

/**
 * As contas de anúncio DA CONEXÃO escolhida.
 *
 * Sem o filtro, a lista vinha pela RLS — e a RLS abre para a gestão TODAS as
 * conexões da casa. O cabeçalho dizia "BM do dono da conta" e a lista mostrava
 * também as contas da BM da corretora.
 *
 * Não era só feio: o botão "Em uso" chama `ligar_conta`, que filtra pela conexão
 * no servidor. Marcar a conta de uma BM a partir do cartão de outra afetava zero
 * linhas — e devolvia sucesso. O clique não fazia nada, em silêncio.
 */
/**
 * Quais campanhas contam no painel.
 *
 * Vem de `meta_ad_dimensions` e não da tabela de gasto: o interruptor é do
 * OBJETO campanha, e precisa existir mesmo num período em que ela não gastou —
 * senão desligar uma campanha antiga seria impossível, e ligá-la de volta
 * também.
 *
 * A policy da 087 recorta pela conexão: cada um enxerga as campanhas das contas
 * de anúncio da BM dele.
 */
export function useCampanhasNoPainel() {
  return useQuery({
    queryKey: ['meta-campanhas-painel'],
    staleTime: 60_000,
    queryFn: async (): Promise<Record<string, boolean>> => {
      const { data, error } = await supabase
        .from('meta_ad_dimensions')
        .select('object_id, conta_no_painel')
        .eq('level', 'campaign');
      if (error) throw error;
      const mapa: Record<string, boolean> = {};
      for (const d of data ?? []) mapa[d.object_id] = d.conta_no_painel;
      return mapa;
    },
  });
}

/**
 * Liga e desliga uma campanha do painel.
 *
 * Escreve direto na coluna — é `update` de uma coluna só, com policy pela
 * conexão (087) e privilégio de coluna (094). Não passa por edge function
 * porque não há segredo envolvido nem chamada externa: é uma decisão da casa
 * sobre os próprios números.
 */
export function useAlternarCampanhaNoPainel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { objectId: string; conta: boolean }) => {
      const { error } = await supabase
        .from('meta_ad_dimensions')
        .update({ conta_no_painel: v.conta })
        .eq('level', 'campaign')
        .eq('object_id', v.objectId);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['meta-campanhas-painel'] });
      // O painel inteiro muda de número quando uma campanha sai da conta.
      void qc.invalidateQueries({ queryKey: ['painel'] });
      void qc.invalidateQueries({ queryKey: ['meta-gasto'] });
    },
  });
}

export function useContasDeAnuncio(integracaoId?: string) {
  return useQuery({
    queryKey: ['meta-contas', integracaoId ?? null],
    enabled: !!integracaoId,
    queryFn: async (): Promise<ContaDeAnuncio[]> => {
      const { data, error } = await supabase
        .from('meta_ad_accounts')
        .select('id, ad_account_id, name, currency, timezone_name, enabled')
        .eq('integration_id', exigir(integracaoId, 'a integração'))
        .order('name');
      if (error) throw error;
      return data ?? [];
    },
  });
}

/**
 * O gasto vem SOMADO do Postgres.
 *
 * O sistema auditado baixava a tabela inteira e somava no navegador — e o
 * PostgREST corta em 1000 linhas sem avisar, então a partir de certo volume o
 * total simplesmente parava de crescer, com o número continuando plausível.
 */
export function useGasto(since: string, until: string, nivel: MetaAdLevel) {
  return useQuery({
    queryKey: ['meta-gasto', since, until, nivel],
    queryFn: async (): Promise<LinhaDeGasto[]> => {
      const { data, error } = await supabase.rpc('meta_gasto_agregado', {
        _since: since,
        _until: until,
        _nivel: nivel,
      });
      if (error) throw error;
      return (data ?? []) as LinhaDeGasto[];
    },
  });
}

/**
 * Quantos leads do período têm atribuição da Meta, e quantos não têm.
 *
 * Anda junto com o custo por lead na tela. Sem este número ao lado, o painel
 * afirma uma precisão que não tem — que é como o sistema auditado dividia o
 * gasto por TODOS os leads, incluindo indicação e placa na rua.
 */
export function useCobertura(since: string, until: string) {
  return useQuery({
    queryKey: ['meta-cobertura', since, until],
    queryFn: async (): Promise<{ com_atribuicao: number; total: number }> => {
      const { data, error } = await supabase.rpc('meta_cobertura_atribuicao', {
        _since: since,
        _until: until,
      });
      if (error) throw error;
      const linha = (data ?? [])[0] as { com_atribuicao: number; total: number } | undefined;
      return linha ?? { com_atribuicao: 0, total: 0 };
    },
  });
}

export function useUltimaSincronizacao() {
  return useQuery({
    queryKey: ['meta-sync'],
    queryFn: async (): Promise<Sincronizacao[]> => {
      const { data, error } = await supabase.rpc('meta_ultima_sincronizacao');
      if (error) throw error;
      return (data ?? []) as Sincronizacao[];
    },
    // O frescor do painel vem daqui, não do conteúdo: uma tabela cheia não
    // prova que a sincronização de hoje funcionou.
    refetchInterval: 60_000,
  });
}

/** Leads da Meta que não conseguiram entrar. Cada um é verba paga sem retorno. */
export function useEventosPresos() {
  return useQuery({
    queryKey: ['meta-presos'],
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from('meta_webhook_inbox')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'erro');
      // A fila é do servidor: sem GRANT, o cliente leva 42501. Não é erro de
      // verdade, é a regra funcionando — devolve zero em vez de quebrar a tela.
      if (error) return 0;
      return count ?? 0;
    },
  });
}

async function chamar(corpo: Record<string, unknown>) {
  // O detalhe da Meta vem em `detalhe`, separado do `erro` — e `chamarFuncao`
  // devolve só o `erro`. Aqui a chamada volta a ler o corpo para juntar os dois
  // quando ele chega com 200.
  const data = (await chamarFuncao<{ erro?: string; detalhe?: string }>(
    'meta-conectar',
    corpo,
    'Não foi possível falar com a Meta.',
  )) as { erro?: string; detalhe?: string } | null;

  if (data?.erro) throw new Error(data.detalhe ? `${data.erro} ${data.detalhe}` : data.erro);
  return data;
}


export function useSalvarCredenciais() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { appId: string; appSecret: string; accessToken: string }) =>
      chamar({ acao: 'salvar', ...v }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['meta-integracoes'] });
    },
  });
}

export function useBuscarAtivos(integracaoId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => chamar({ acao: 'ativos', integracaoId }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['meta-contas'] });
      void qc.invalidateQueries({ queryKey: ['meta-paginas'] });
      void qc.invalidateQueries({ queryKey: ['meta-integracoes'] });
    },
  });
}

export function useLigarConta(integracaoId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { adAccountId: string; ligada: boolean }) =>
      chamar({ acao: 'ligar_conta', ...v, integracaoId }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['meta-contas'] });
    },
  });
}

export function useAssinarPagina(integracaoId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (pageId: string) => chamar({ acao: 'assinar_pagina', pageId, integracaoId }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['meta-paginas'] });
    },
  });
}

export function useBuscarLeadsAntigos(integracaoId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (desdeDias: number) => chamar({ acao: 'buscar_leads_antigos', desdeDias, integracaoId }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['meta-presos'] });
      void qc.invalidateQueries({ queryKey: ['painel'] });
    },
  });
}

export function useNovoWebhook(integracaoId?: string) {
  return useMutation({ mutationFn: () => chamar({ acao: 'novo_webhook', integracaoId }) });
}

export function useImportarGasto(integracaoId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => chamar({ acao: 'importar_gasto', integracaoId }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['meta-gasto'] });
      void qc.invalidateQueries({ queryKey: ['meta-sync'] });
      void qc.invalidateQueries({ queryKey: ['painel'] });
    },
  });
}

export function useDesconectar(integracaoId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => chamar({ acao: 'desconectar', integracaoId }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['meta-integracoes'] });
      void qc.invalidateQueries({ queryKey: ['meta-contas'] });
    },
  });
}
