import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Check, Download, Loader2, X } from 'lucide-react';
import { CamposDePeriodo } from '@/components/CamposDePeriodo';
import {
  janelaDeDias,
  janelaDoPeriodo,
  PERIODOS_DE_JANELA,
  type PeriodoDeJanela,
} from '@/hooks/usePainel';
import {
  useContagemDaExportacao,
  useExportacoesRecentes,
  useExportarLeads,
  type FiltroDaExportacao,
} from '@/hooks/useExportarLeads';
import { cn } from '@/lib/utils';

interface Pessoa {
  id: string;
  full_name: string;
}

interface Etapa {
  id: string;
  label: string;
}

/**
 * O botão de exportar e a janela dele.
 *
 * A janela só existe enquanto está aberta: fechar descarta o filtro, e abrir de
 * novo começa nos 30 dias. Guardar o último filtro faria a pessoa exportar a
 * semana passada achando que exportava esta.
 */
export function ExportarLeads({ corretores, etapas }: { corretores: Pessoa[]; etapas: Etapa[] }) {
  const [aberto, setAberto] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="flex items-center gap-1.5 rounded-full border border-line-2 bg-card px-3.5 py-2 text-sm font-semibold text-tx-2 transition-colors hover:border-pri-light hover:text-tx"
      >
        <Download className="h-3.5 w-3.5" />
        Exportar
      </button>
      {aberto && <Janela corretores={corretores} etapas={etapas} onFechar={() => setAberto(false)} />}
    </>
  );
}

const SELETOR =
  'rounded-xl border border-line-2 bg-card px-3 py-2.5 text-md outline-none focus:border-pri';

function Janela({
  corretores,
  etapas,
  onFechar,
}: {
  corretores: Pessoa[];
  etapas: Etapa[];
  onFechar: () => void;
}) {
  const [periodo, setPeriodo] = useState<PeriodoDeJanela>('30');
  const [aMao, setAMao] = useState(() => janelaDeDias(30));
  const [responsavel, setResponsavel] = useState('');
  const [etapa, setEtapa] = useState('');

  const janela = useMemo(() => janelaDoPeriodo(periodo, aMao), [periodo, aMao]);
  const filtro: FiltroDaExportacao = {
    de: janela.de,
    ate: janela.ate,
    responsavel: responsavel || null,
    etapa: etapa || null,
  };

  const contagem = useContagemDaExportacao(filtro, true);
  const recentes = useExportacoesRecentes(true);
  const exportar = useExportarLeads();

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onFechar();
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [onFechar]);

  /*
   * O "baixado" e o erro valem para o filtro com que foram feitos.
   *
   * Sem esta comparação, exportar agosto e depois trocar para setembro deixaria
   * "Planilha baixada" na tela — e a pessoa fecharia a janela achando que
   * setembro já saiu.
   */
  const desteFiltro = JSON.stringify(exportar.variables) === JSON.stringify(filtro);
  const baixado = exportar.isSuccess && desteFiltro;
  const falhou = exportar.isError && desteFiltro;

  const total = contagem.data;
  const pronto = !contagem.isFetching && !!total;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Exportar leads"
      className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4"
      onClick={(e) => e.target === e.currentTarget && onFechar()}
    >
      <div className="max-h-[90svh] w-full max-w-[520px] overflow-y-auto rounded-[22px] bg-sheet p-6 shadow-sheet">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold">Exportar leads</h2>
            <p className="mt-0.5 text-base text-tx-2">
              Planilha para Excel com os leads que entraram no período.
            </p>
          </div>
          <button
            type="button"
            onClick={onFechar}
            aria-label="Fechar"
            className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-tx-3 hover:bg-card-2 hover:text-tx"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-base font-semibold text-tx-2">Entraram no período</span>
          <div className="flex flex-wrap items-center gap-1.5">
            {PERIODOS_DE_JANELA.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => {
                  // Abre as datas na janela que já estava escolhida, em vez de
                  // saltar para um padrão.
                  if (p.key === 'personalizado' && periodo !== 'personalizado') setAMao(janela);
                  setPeriodo(p.key);
                }}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors',
                  periodo === p.key
                    ? 'border-pri bg-pri text-pri-fg'
                    : 'border-line-2 bg-card text-tx-2 hover:border-pri-light hover:text-tx',
                )}
              >
                {p.rotulo}
              </button>
            ))}
          </div>
          {periodo === 'personalizado' && (
            <CamposDePeriodo de={aMao.de} ate={aMao.ate} onChange={setAMao} />
          )}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-base font-semibold text-tx-2">Corretor</span>
            <select value={responsavel} onChange={(e) => setResponsavel(e.target.value)} className={SELETOR}>
              <option value="">Todos</option>
              {corretores.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.full_name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-base font-semibold text-tx-2">Etapa</span>
            <select value={etapa} onChange={(e) => setEtapa(e.target.value)} className={SELETOR}>
              <option value="">Todas</option>
              {etapas.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <p className="mt-4 min-h-[1.5rem] text-base" aria-live="polite">
          {/*
            Decide pelo que TEM, não pelo estado da consulta.

            A primeira versão perguntava `isLoading` e caía no último ramo em
            qualquer outro instante — entre duas tentativas, por exemplo — e a
            tela escrevia "leads vão para a planilha." sem número nenhum, justo
            na hora de decidir baixar. Sem número, a única frase honesta é
            "Contando…".
          */}
          {contagem.isError ? (
            <span className="text-dng">Não consegui contar: {(contagem.error as Error).message}</span>
          ) : total === undefined ? (
            <span className="flex items-center gap-2 text-tx-3">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Contando…
            </span>
          ) : total === 0 ? (
            <span className="text-tx-2">Nenhum lead entrou neste período com esses filtros.</span>
          ) : (
            <span className="text-tx">
              <b>{total}</b> {total === 1 ? 'lead vai' : 'leads vão'} para a planilha.
            </span>
          )}
        </p>

        {falhou && (
          <p className="mt-3 flex items-start gap-2 rounded-xl bg-dng-soft p-3 text-sm text-dng">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {(exportar.error as Error).message}
          </p>
        )}

        <button
          type="button"
          onClick={() => exportar.mutate(filtro)}
          disabled={!pronto || exportar.isPending}
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-pri px-4 py-3 text-md font-semibold text-pri-fg hover:bg-pri-deep disabled:opacity-50"
        >
          {exportar.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : baixado ? (
            <Check className="h-4 w-4" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          {exportar.isPending
            ? 'Montando a planilha…'
            : baixado
              ? 'Planilha baixada — baixar de novo'
              : total
                ? `Baixar planilha (${total})`
                : 'Baixar planilha'}
        </button>

        <p className="mt-2 text-sm text-tx-3">
          Toda exportação fica registrada: quem baixou, quando e quantos leads.
        </p>

        {(recentes.data ?? []).length > 0 && (
          <div className="mt-5 border-t border-line pt-4">
            <h3 className="mb-2 text-sm font-bold uppercase text-tx-3">Últimas exportações</h3>
            <ul className="flex flex-col gap-1.5">
              {(recentes.data ?? []).map((r) => (
                <li key={r.id} className="flex flex-wrap items-baseline gap-x-2 text-sm text-tx-2">
                  <span className="tabular-nums text-tx-3">{quando(r.exportado_em)}</span>
                  <span className="font-semibold text-tx">{r.exportado_por_nome ?? 'Alguém'}</span>
                  <span>
                    {r.quantidade} {r.quantidade === 1 ? 'lead' : 'leads'} · {diaMes(r.periodo_de)} a{' '}
                    {diaMes(r.periodo_ate)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function quando(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** "2026-08-18" → "18/08". */
function diaMes(data: string): string {
  const [, m, d] = data.split('-');
  return `${d}/${m}`;
}
