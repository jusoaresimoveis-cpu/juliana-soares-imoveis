import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Search, Loader2, AlertCircle } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import {
  usePipelineStages,
  useTeamMap,
  useCorretores,
  useLeadsBoard,
  useMoverLead,
  useAtribuirLead,
  chaveDoQuadro,
  type Periodo,
} from '@/hooks/useLeadsBoard';
import { KanbanColumn } from '@/components/leads/KanbanColumn';
import { StageChangeDialog } from '@/components/leads/StageChangeDialog';
import { ScheduleVisitDialog } from '@/components/visits/ScheduleVisitDialog';
import { useAgendarVisita } from '@/hooks/useVisits';
import { LeadPreview } from '@/components/leads/LeadPreview';
import { ExportarLeads } from '@/components/leads/ExportarLeads';
import type { BoardLead, PipelineStage } from '@/types/db';
import { cn } from '@/lib/utils';
import {
  FILTROS_DE_TEMPERATURA,
  FILTRO_DE_TEMPERATURA_LABEL,
  isFiltroDeTemperatura,
  type FiltroDeTemperatura,
} from '@contracts';
import { corDaTemperatura, ehTemperatura } from '@/components/leads/SeloDeTemperatura';

const PRESETS = [
  { key: '7d', label: '7 dias', dias: 7 },
  { key: '30d', label: '30 dias', dias: 30 },
  { key: '90d', label: '90 dias', dias: 90 },
  { key: 'ano', label: 'Este ano', dias: 0 },
  { key: 'tudo', label: 'Tudo', dias: -1 },
] as const;

function calcularPeriodo(key: string): Periodo {
  const ate = new Date();
  ate.setHours(23, 59, 59, 999);

  if (key === 'tudo') return { de: '2020-01-01T00:00:00.000Z', ate: ate.toISOString() };

  if (key === 'ano') {
    const de = new Date(ate.getFullYear(), 0, 1);
    return { de: de.toISOString(), ate: ate.toISOString() };
  }

  const preset = PRESETS.find((p) => p.key === key);
  const de = new Date();
  de.setDate(de.getDate() - (preset?.dias ?? 30));
  de.setHours(0, 0, 0, 0);
  return { de: de.toISOString(), ate: ate.toISOString() };
}

export default function Leads() {
  const { profile, isAdminOrAbove } = useAuth();
  const orgId = profile?.organization_id;

  // Estado da tela na URL: voltar do detalhe do lead cai no mesmo recorte.
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const periodoKey = params.get('periodo') ?? '30d';
  // Valor estranho na URL cai em "todas", em vez de virar um filtro que o
  // banco recusa e a tela mostra como quadro vazio.
  const tempBruta = params.get('temp');
  const temperatura: FiltroDeTemperatura = isFiltroDeTemperatura(tempBruta) ? tempBruta : 'todas';
  const [buscaBruta, setBuscaBruta] = useState(params.get('q') ?? '');
  const [busca, setBusca] = useState(buscaBruta);

  // Busca vai ao servidor com atraso. Sem isso é uma consulta por tecla.
  useEffect(() => {
    const t = setTimeout(() => setBusca(buscaBruta), 300);
    return () => clearTimeout(t);
  }, [buscaBruta]);

  const periodo = useMemo(() => calcularPeriodo(periodoKey), [periodoKey]);

  const { data: etapas } = usePipelineStages(orgId);
  const { data: equipe } = useTeamMap(orgId);
  const { data: corretores } = useCorretores(orgId);
  const board = useLeadsBoard({ orgId, stages: etapas, periodo, busca, responsavel: null, temperatura });

  const chave = chaveDoQuadro({ orgId, periodo, busca, responsavel: null, temperatura });
  const mover = useMoverLead(chave);
  const atribuir = useAtribuirLead(chave);

  const [pendente, setPendente] = useState<{ lead: BoardLead; destino: PipelineStage } | null>(null);
  const [agendando, setAgendando] = useState<{ lead: BoardLead; destino: PipelineStage } | null>(null);
  const agendar = useAgendarVisita(orgId);

  // Prévia ao passar o mouse. O fechamento tem carência para o corretor
  // conseguir mover o mouse do card até dentro do painel sem ele sumir.
  const [previa, setPrevia] = useState<{ lead: BoardLead; rect: DOMRect } | null>(null);
  const fechamento = useRef<number | null>(null);

  const cancelarFechamento = () => {
    if (fechamento.current) {
      window.clearTimeout(fechamento.current);
      fechamento.current = null;
    }
  };
  const abrirPrevia = (lead: BoardLead, rect: DOMRect) => {
    cancelarFechamento();
    setPrevia({ lead, rect });
  };
  const fecharPrevia = () => {
    cancelarFechamento();
    fechamento.current = window.setTimeout(() => setPrevia(null), 180);
  };

  const porId = useMemo(() => {
    const m = new Map<string, BoardLead>();
    board.data?.forEach((c) => c.leads.forEach((l) => m.set(l.id, l)));
    return m;
  }, [board.data]);

  function pedirMover(lead: BoardLead, paraStageId: string) {
    if (lead.stage_id === paraStageId) return;
    const destino = etapas?.find((s) => s.id === paraStageId);
    if (!destino) return;

    // A regra de o que a etapa exige vem do banco, não de um if aqui.
    if (destino.requires_schedule) {
      agendar.reset();
      setAgendando({ lead, destino });
      return;
    }
    if (destino.requires_value || destino.requires_reason) {
      setPendente({ lead, destino });
      return;
    }
    mover.mutate({ lead, paraStageId });
  }

  const total = board.data?.reduce((s, c) => s + c.total, 0) ?? 0;

  return (
    <div className="flex h-full flex-col gap-4">
      <header className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold">Funil</h1>
          <p className="mt-0.5 text-base text-tx-2">
            {board.isFetching ? 'Carregando…' : `${total} ${total === 1 ? 'lead' : 'leads'} no período`}
          </p>
        </div>

        <label className="ml-auto flex min-w-[200px] items-center gap-2 rounded-full border border-line-2 bg-card px-3.5 py-2">
          <Search className="h-3.5 w-3.5 shrink-0 text-tx-3" />
          <input
            value={buscaBruta}
            onChange={(e) => {
              setBuscaBruta(e.target.value);
              const p = new URLSearchParams(params);
              if (e.target.value) p.set('q', e.target.value);
              else p.delete('q');
              setParams(p, { replace: true });
            }}
            placeholder="Nome, telefone, e-mail ou campanha"
            className="w-full bg-transparent text-base outline-none placeholder:text-tx-3"
          />
        </label>

        <div className="flex gap-1 rounded-full border border-line-2 bg-card p-1">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              onClick={() => {
                const q = new URLSearchParams(params);
                q.set('periodo', p.key);
                setParams(q, { replace: true });
              }}
              className={cn(
                'rounded-full px-3 py-1.5 text-sm font-semibold transition-colors',
                periodoKey === p.key ? 'bg-pri-soft text-pri' : 'text-tx-2 hover:text-tx',
              )}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/*
          Quem atender primeiro. "Sem qualificação" está na lista de propósito:
          é por ela que a gestão vê quantos leads ninguém perguntou nada ainda.
        */}
        <div className="flex flex-wrap gap-1 rounded-full border border-line-2 bg-card p-1">
          {FILTROS_DE_TEMPERATURA.map((t) => (
            <button
              key={t}
              onClick={() => {
                const q = new URLSearchParams(params);
                if (t === 'todas') q.delete('temp');
                else q.set('temp', t);
                setParams(q, { replace: true });
              }}
              aria-pressed={temperatura === t}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold transition-colors',
                temperatura === t ? 'bg-pri-soft text-pri' : 'text-tx-2 hover:text-tx',
              )}
            >
              {ehTemperatura(t) && (
                <i
                  aria-hidden
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: corDaTemperatura(t).ponto }}
                />
              )}
              {FILTRO_DE_TEMPERATURA_LABEL[t]}
            </button>
          ))}
        </div>

        {/*
          Só a gestão vê o botão. A tela esconder é conveniência; quem garante é
          o banco — `leads_exportar` recusa qualquer outro papel.
        */}
        {isAdminOrAbove() && <ExportarLeads corretores={corretores ?? []} etapas={etapas ?? []} />}
      </header>

      {board.isError && (
        <div className="flex items-start gap-3 rounded-lg bg-dng-soft p-4 text-md text-dng">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <strong className="block font-bold">Não consegui carregar o funil.</strong>
            Se as migrations 002 e 003 ainda não foram aplicadas no Supabase, é isso.
          </div>
        </div>
      )}

      {!board.data && board.isLoading && (
        <div className="grid place-items-center py-24">
          <Loader2 className="h-5 w-5 animate-spin text-pri" />
        </div>
      )}

      {board.data && (
        <div className="-mx-1 flex min-h-0 flex-1 gap-3 overflow-x-auto px-1 pb-3">
          {board.data.map((coluna) => (
            <KanbanColumn
              key={coluna.stage.id}
              coluna={coluna}
              etapas={etapas ?? []}
              equipe={equipe ?? {}}
              onSoltar={(leadId, para) => {
                const lead = porId.get(leadId);
                if (lead) pedirMover(lead, para);
              }}
              onMover={pedirMover}
              corretores={corretores ?? []}
              onAtribuir={(lead, para) => atribuir.mutate({ leadId: lead.id, para })}
              leadAtivo={previa?.lead.id ?? null}
              onPreviaAbrir={abrirPrevia}
              onPreviaFechar={fecharPrevia}
              onAbrir={(lead) => navigate(`/leads/${lead.id}`)}
            />
          ))}
        </div>
      )}

      {previa && (
        <LeadPreview
          lead={previa.lead}
          etapa={etapas?.find((s) => s.id === previa.lead.stage_id)}
          origem={previa.rect}
          onManter={cancelarFechamento}
          onFechar={fecharPrevia}
          onAbrirFicha={() => navigate(`/leads/${previa.lead.id}`)}
        />
      )}

      {pendente && (
        <StageChangeDialog
          lead={pendente.lead}
          destino={pendente.destino}
          onCancelar={() => setPendente(null)}
          onConfirmar={(dados) => {
            mover.mutate({
              lead: pendente.lead,
              paraStageId: pendente.destino.id,
              valorCents: dados.valorCents ?? null,
              motivo: dados.motivo ?? null,
              motivoTexto: dados.motivoTexto ?? null,
            });
            setPendente(null);
          }}
        />
      )}

      {agendando && (
        <ScheduleVisitDialog
          lead={agendando.lead}
          equipe={corretores}
          salvando={agendar.isPending}
          erro={agendar.error?.message ?? null}
          onCancelar={() => setAgendando(null)}
          onConfirmar={(v) => {
            // A visita é gravada ANTES de o lead mudar de etapa, e o lead só
            // anda se ela entrar. Se a trava de sobreposição recusar, a etapa
            // "Visita agendada" sem visita nenhuma seria uma mentira no funil.
            agendar.mutate(v, {
              onSuccess: () => {
                mover.mutate({ lead: agendando.lead, paraStageId: agendando.destino.id });
                setAgendando(null);
              },
            });
          }}
        />
      )}
    </div>
  );
}
