import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { chamarFuncao } from '@/lib/funcoes';
import { WA_QR_VALIDADE_SEGUNDOS, type WaInstanceStatus } from '@contracts';

export interface Instancia {
  id: string;
  label: string;
  owner_id: string | null;
  status: WaInstanceStatus;
  connected_phone_e164: string | null;
  connected_name: string | null;
  webhook_configured_at: string | null;
  last_seen_at: string | null;
  last_error: string | null;
  created_at: string;
}

/**
 * A projeção nomeia as colunas de propósito.
 *
 * `select('*')` aqui devolveria erro: o GRANT da migration 010 concede leitura
 * só nas colunas seguras, e `token_secret_id`/`webhook_secret_hash` estão fora.
 * Nomear é o que documenta essa fronteira no código do cliente.
 *
 * E vai numa LINHA SÓ, sem concatenar: o supabase-js só consegue conferir os
 * nomes contra o schema gerado quando a string é um literal. Concatenada, ela
 * vira `string` qualquer, a inferência desiste e o retorno cai em
 * `GenericStringError` — que é justamente o erro que um `as unknown as`
 * silenciaria, junto com qualquer coluna digitada errado.
 */
export function useInstancias(orgId: string | undefined) {
  return useQuery({
    queryKey: ['wa-instancias', orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<Instancia[]> => {
      const { data, error } = await supabase
        .from('whatsapp_instances')
        .select(
          'id, label, owner_id, status, connected_phone_e164, connected_name, webhook_configured_at, last_seen_at, last_error, created_at',
        )
        .order('created_at');
      if (error) throw error;
      // Só o `status` precisa de estreitamento: o banco guarda text, o contrato
      // sabe que é um dos cinco. Os nomes das colunas já foram conferidos acima.
      return (data ?? []).map((i) => ({ ...i, status: i.status as WaInstanceStatus }));
    },
  });
}

/*
 * A sessão é conferida ANTES de gastar a chamada, e renovada uma vez se a
 * primeira tentativa falhar na rede.
 *
 * O motivo é uma armadilha do caminho: a função tem `verify_jwt = true`, então
 * um token vencido é recusado pelo GATEWAY do Supabase, antes de a função
 * rodar. Essa recusa vem sem cabeçalho de origem — e sem ele o navegador
 * descarta a resposta inteira. O que sobra é "Failed to send a request to the
 * Edge Function", exatamente a mesma frase de um erro de CORS.
 *
 * Duas causas muito diferentes com a mesma mensagem: uma se conserta no
 * servidor, a outra o corretor conserta sozinho recarregando a página. Sem
 * separar as duas, toda sessão vencida vira chamado de suporte.
 *
 * `getSession` já renova sozinho quando o token está vencido; o `refreshSession`
 * explícito cobre o caso em que a renovação automática ficou para trás — aba em
 * segundo plano por horas, máquina que dormiu.
 */
/** O que a função de instância devolve para a tela. */
export interface RespostaDaInstancia {
  /** A criação devolve a linha nova; a consulta de estado, não. */
  id?: string;
  status?: string;
  qrcode?: string | null;
  erro?: string;
}

async function chamar(corpo: Record<string, unknown>): Promise<RespostaDaInstancia> {
  // Isto morava aqui inteiro e ficou só aqui — e por isso `criar-corretor`
  // continuou quebrado por dias. Agora é `chamarFuncao`, e o conserto vale para
  // todas as funções que exigem sessão.
  return chamarFuncao<RespostaDaInstancia>('whatsapp-instancia', corpo, 'Falha na chamada.');
}

export function useConectar(orgId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { rotulo?: string; instanciaId?: string }) =>
      chamar({ acao: 'conectar', ...p }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['wa-instancias', orgId] }),
  });
}

export function useDesconectar(orgId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { instanciaId: string; remover?: boolean }) =>
      chamar({ acao: 'desconectar', ...p }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['wa-instancias', orgId] }),
  });
}

/**
 * Enquanto o QR está na tela, pergunta o estado ao provedor.
 *
 * O código expira, então a tela renova antes disso — senão o corretor aponta a
 * câmera para um código morto e conclui que o sistema não funciona.
 *
 * A consulta é escopada a UMA instância. Na referência o poll era global e
 * atualizava a tela inteira, então dois números pareando ao mesmo tempo
 * embaralhavam o QR um do outro.
 */
export function useStatusAoVivo(instanciaId: string | null, orgId: string | undefined) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: ['wa-status', instanciaId],
    enabled: !!instanciaId,
    refetchInterval: 3000,
    gcTime: 0,
    queryFn: async () => {
      const r = await chamar({ acao: 'status', instanciaId });
      void qc.invalidateQueries({ queryKey: ['wa-instancias', orgId] });
      return r as { status: WaInstanceStatus; qrcode: string | null };
    },
  });
}

export const QR_VALIDADE_MS = WA_QR_VALIDADE_SEGUNDOS * 1000;
