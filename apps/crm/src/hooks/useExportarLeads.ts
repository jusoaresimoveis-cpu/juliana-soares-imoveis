import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
// Só o TIPO: a montagem da planilha é carregada sob demanda, ver `useExportarLeads`.
import type { LinhaExportada } from '@/exportacao';

export interface FiltroDaExportacao {
  de: string;
  ate: string;
  responsavel: string | null;
  etapa: string | null;
}

function argumentos(f: FiltroDaExportacao, soContar: boolean) {
  return {
    _de: f.de,
    _ate: f.ate,
    _responsavel: f.responsavel ?? undefined,
    _etapa: f.etapa ?? undefined,
    _so_contar: soContar,
  };
}

/**
 * Quantos leads sairiam — sem exportar e sem registrar.
 *
 * Passa pela MESMA função e pelo MESMO recorte da exportação. Uma contagem
 * feita por outro caminho é o jeito de a tela prometer 142 e o arquivo trazer
 * 139.
 */
export function useContagemDaExportacao(f: FiltroDaExportacao, ativo: boolean) {
  return useQuery({
    queryKey: ['exportacao-contagem', f.de, f.ate, f.responsavel, f.etapa],
    enabled: ativo,
    staleTime: 30_000,
    // Uma nova tentativa, não três: recusa de permissão não muda na segunda
    // vez, e três tentativas seguram o aviso de erro por segundos.
    retry: 1,
    queryFn: async (): Promise<number> => {
      const { data, error } = await supabase.rpc('leads_exportar', argumentos(f, true));
      if (error) throw error;
      return Number((data as { total?: number } | null)?.total ?? 0);
    },
  });
}

export interface ExportacaoRecente {
  id: string;
  exportado_em: string;
  exportado_por_nome: string | null;
  periodo_de: string;
  periodo_ate: string;
  quantidade: number;
}

/** As últimas exportações. A policy só devolve linhas para gerente e admin. */
export function useExportacoesRecentes(ativo: boolean) {
  return useQuery({
    queryKey: ['exportacoes-recentes'],
    enabled: ativo,
    queryFn: async (): Promise<ExportacaoRecente[]> => {
      const { data, error } = await supabase
        .from('lead_exportacoes')
        .select('id, exportado_em, exportado_por_nome, periodo_de, periodo_ate, quantidade')
        .order('exportado_em', { ascending: false })
        .limit(5);
      if (error) throw error;
      return (data ?? []) as ExportacaoRecente[];
    },
  });
}

/** Entrega o arquivo ao navegador como download. */
function baixar(bytes: Uint8Array, nome: string) {
  const blob = new Blob([new Uint8Array(bytes)], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revogar na hora cancela o download em alguns navegadores; dez segundos
  // sobram para ele começar.
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function useExportarLeads() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (f: FiltroDaExportacao): Promise<number> => {
      const { data, error } = await supabase.rpc('leads_exportar', argumentos(f, false));
      if (error) throw error;
      const r = data as unknown as { total: number; de: string; ate: string; linhas: LinhaExportada[] };

      /*
       * A montagem da planilha vem SOB DEMANDA.
       *
       * Ela traz o zip junto, e a tela de leads abre dezenas de vezes por dia
       * sem exportar nada. Importar no topo colocaria esse peso em cada abertura
       * do funil, para uma ação que só gestão faz, e raramente.
       */
      const { planilhaDeLeads, nomeDoArquivo } = await import('@/exportacao');
      baixar(planilhaDeLeads(r.linhas ?? []), nomeDoArquivo(r.de, r.ate));
      return r.total;
    },
    // Mesmo se a montagem falhar, o banco já registrou a saída dos dados — a
    // lista de exportações tem de mostrar isso.
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['exportacoes-recentes'] });
    },
  });
}
