import { Loader2, ExternalLink, Clock } from 'lucide-react';
import { useTimeline, type PaginaDoLead } from '@/hooks/useLead';
import { cn } from '@/lib/utils';

export function AbaHistorico({ leadId, pagina }: { leadId: string; pagina?: PaginaDoLead }) {
  const { data, isLoading } = useTimeline(leadId);

  if (isLoading) {
    return (
      <div className="grid place-items-center py-16">
        <Loader2 className="h-4 w-4 animate-spin text-pri" />
      </div>
    );
  }

  if (!data?.length) {
    return <p className="rounded-lg bg-card p-6 text-center text-md text-tx-3 shadow-card">Sem histórico ainda.</p>;
  }

  return (
    <ol className="rounded-lg bg-card p-5 shadow-card">
      {data.map((e, i) => (
        <li key={e.id} className="relative flex gap-3 pb-4 last:pb-0">
          <div className="flex flex-col items-center">
            <span className={cn('mt-1 h-2.5 w-2.5 shrink-0 rounded-full', CATEGORIA_COR[e.category] ?? 'bg-tx-3')} />
            {i < data.length - 1 && <span className="mt-1 w-px flex-1 bg-line" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-md font-semibold leading-snug">{e.title}</p>
            {e.description && <p className="mt-0.5 text-base text-tx-2">{e.description}</p>}

            {/*
              "Lead criado · Sistema" não dizia de onde. Aqui a linha ganha a
              página, com link: o corretor abre exatamente o que a pessoa estava
              olhando quando resolveu escrever — é sobre aquilo que ela pergunta.
            */}
            {pagina && e.category === 'lead' && e.event_type === 'created' && (
              <a
                href={pagina.url}
                target="_blank"
                rel="noreferrer"
                className="mt-0.5 inline-flex items-center gap-1.5 text-base font-semibold text-pri hover:underline"
              >
                Veio de {pagina.rotulo}
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-tx-3">
              <Clock className="h-3 w-3" />
              {new Date(e.occurred_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
              {e.actor_label && ` · ${e.actor_label}`}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

const CATEGORIA_COR: Record<string, string> = {
  lead: 'bg-pri',
  etapa: 'bg-pri-light',
  marketing: 'bg-warn',
  visita: 'bg-ok',
  imovel: 'bg-ok',
  mensagem: 'bg-tx-3',
  documento: 'bg-tx-3',
  tarefa: 'bg-warn',
  sistema: 'bg-tx-3',
};
