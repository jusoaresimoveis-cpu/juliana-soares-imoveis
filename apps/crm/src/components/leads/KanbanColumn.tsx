import { memo, useState } from 'react';
import type { ColunaDoQuadro } from '@/hooks/useLeadsBoard';
import { PAGE } from '@/hooks/useLeadsBoard';
import type { BoardLead, PipelineStage, TeamMember } from '@/types/db';
import { LeadCard } from './LeadCard';
import { cn } from '@/lib/utils';

interface Props {
  coluna: ColunaDoQuadro;
  etapas: PipelineStage[];
  equipe: Record<string, TeamMember>;
  onSoltar: (leadId: string, paraStageId: string) => void;
  onMover: (lead: BoardLead, paraStageId: string) => void;
  corretores: TeamMember[];
  onAtribuir: (lead: BoardLead, para: string | null) => void;
  leadAtivo: string | null;
  onPreviaAbrir: (lead: BoardLead, rect: DOMRect) => void;
  onPreviaFechar: () => void;
  onAbrir: (lead: BoardLead) => void;
}

export const KanbanColumn = memo(function KanbanColumn({
  coluna,
  etapas,
  equipe,
  onSoltar,
  onMover,
  corretores,
  onAtribuir,
  onAbrir,
  leadAtivo,
  onPreviaAbrir,
  onPreviaFechar,
}: Props) {
  const [alvo, setAlvo] = useState(false);
  const restantes = coluna.total - coluna.leads.length;

  return (
    <section
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (!alvo) setAlvo(true);
      }}
      onDragLeave={() => setAlvo(false)}
      onDrop={(e) => {
        e.preventDefault();
        setAlvo(false);
        const id = e.dataTransfer.getData('text/lead-id');
        if (id) onSoltar(id, coluna.stage.id);
      }}
      className={cn(
        'flex w-[286px] shrink-0 flex-col rounded-lg bg-card-2 p-2.5 transition-colors',
        alvo && 'bg-pri-soft ring-2 ring-pri',
      )}
      aria-label={coluna.stage.label}
    >
      <header className="mb-2.5 flex items-center gap-2 px-1">
        <i className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: coluna.stage.color }} />
        <h2 className="text-base font-bold">{coluna.stage.label}</h2>
        <span className="ml-auto rounded-full bg-card px-2 py-0.5 text-xs font-bold tabular-nums text-tx-2">
          {coluna.total}
        </span>
      </header>

      {/* A coluna rola por dentro, ocupando a altura que sobrou. Sem isso, uma
          etapa com muitos cards estica a página inteira e o custo de layout
          cresce junto — e o cabeçalho das outras colunas some da vista. */}
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-0.5">
        {coluna.leads.length === 0 && (
          <p className="rounded-md border border-dashed border-line-2 py-6 text-center text-sm text-tx-3">
            Nenhum lead
          </p>
        )}

        {coluna.leads.map((lead) => (
          <LeadCard
            key={lead.id}
            lead={lead}
            responsavel={lead.assigned_to ? equipe[lead.assigned_to] : undefined}
            etapas={etapas}
            ativo={leadAtivo === lead.id}
            onPreviaAbrir={(r) => onPreviaAbrir(lead, r)}
            onPreviaFechar={onPreviaFechar}
            onMover={(para) => onMover(lead, para)}
            corretores={corretores}
            onAtribuir={(para) => onAtribuir(lead, para)}
            onAbrir={() => onAbrir(lead)}
          />
        ))}

        {restantes > 0 && (
          <p className="py-2 text-center text-sm text-tx-3">
            + {restantes} {restantes === 1 ? 'lead' : 'leads'} nesta etapa
            <br />
            <span className="text-xs opacity-70">
              mostrando os {PAGE} mais recentes — use a busca para encontrar
            </span>
          </p>
        )}
      </div>
    </section>
  );
});
