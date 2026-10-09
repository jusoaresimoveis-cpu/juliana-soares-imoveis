import { useState } from 'react';
import { Loader2, Printer, Trash2, Eye } from 'lucide-react';
import { useApagarDocumento, type DocumentoEmitido } from '@/hooks/useDocumentos';
import { cn } from '@/lib/utils';
import { Previa, abrirParaImprimir } from './Previa';

export function Historico({
  documentos,
  carregando,
}: {
  documentos: DocumentoEmitido[];
  carregando: boolean;
}) {
  const apagar = useApagarDocumento();
  const [vendo, setVendo] = useState<DocumentoEmitido | null>(null);

  return (
    <section className="rounded-lg bg-card p-5 shadow-card">
      <h2 className="text-lg font-bold">Emitidos</h2>
      <p className="mt-0.5 text-sm text-tx-3">
        Cada linha é uma cópia exata do que foi impresso. Editar o modelo depois não muda o que já
        saiu.
      </p>

      {carregando ? (
        <p className="mt-3 flex items-center gap-2 text-base text-tx-3">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
        </p>
      ) : documentos.length === 0 ? (
        <p className="mt-3 text-base text-tx-3">Nenhum documento emitido ainda.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {documentos.map((d) => (
            <li
              key={d.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line-2 p-3"
            >
              <span className="min-w-0">
                <span className="block truncate text-base font-semibold">{d.title}</span>
                <span className="block text-sm text-tx-3">
                  {new Date(d.created_at).toLocaleString('pt-BR', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                  {d.created_by_name && ` · ${d.created_by_name}`}
                </span>
              </span>
              <span className="flex shrink-0 gap-1.5">
                <BotaoIcone rotulo="Ver" onClick={() => setVendo(d)}>
                  <Eye className="h-3.5 w-3.5" />
                </BotaoIcone>
                <BotaoIcone
                  rotulo="Imprimir"
                  onClick={() => abrirParaImprimir(d.rendered_html, d.title)}
                >
                  <Printer className="h-3.5 w-3.5" />
                </BotaoIcone>
                <BotaoIcone
                  rotulo="Apagar"
                  perigo
                  onClick={() => apagar.mutate(d.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </BotaoIcone>
              </span>
            </li>
          ))}
        </ul>
      )}

      {vendo && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={vendo.title}
          className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4"
          onClick={(e) => e.target === e.currentTarget && setVendo(null)}
        >
          <div className="flex max-h-[86vh] w-full max-w-[760px] flex-col rounded-[22px] bg-sheet p-5 shadow-sheet">
            <h3 className="mb-3 text-lg font-bold">{vendo.title}</h3>
            <div className="min-h-0 flex-1 overflow-hidden">
              <Previa html={vendo.rendered_html} />
            </div>
            <button
              onClick={() => setVendo(null)}
              className="mt-3 self-end rounded-full border border-line-2 bg-card px-4 py-2 text-base font-semibold text-tx-2 hover:text-tx"
            >
              Fechar
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function BotaoIcone({
  children,
  rotulo,
  onClick,
  perigo,
}: {
  children: React.ReactNode;
  rotulo: string;
  onClick: () => void;
  perigo?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={rotulo}
      title={rotulo}
      className={cn(
        'grid h-8 w-8 place-items-center rounded-full border border-line-2 bg-card text-tx-2 transition-colors',
        perigo ? 'hover:border-dng hover:text-dng' : 'hover:border-pri-light hover:text-tx',
      )}
    >
      {children}
    </button>
  );
}
