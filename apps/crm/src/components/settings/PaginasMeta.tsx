import { useState } from 'react';
import { Loader2, AlertCircle, Check, Link2, History, TriangleAlert } from 'lucide-react';
import {
  usePaginasMeta,
  useAssinarPagina,
  useBuscarLeadsAntigos,
  type Pagina,
} from '@/hooks/useMeta';
import { cn } from '@/lib/utils';

/**
 * A entrada de leads, e os dois passos que ninguém lembra.
 *
 * Configurar o webhook no painel da Meta faz o endereço ser aceito — e só. A
 * Página ainda precisa ser ASSINADA pelo aplicativo, e essa chamada não existe
 * em tela nenhuma da Meta: é API. Sem ela, o painel dela fica todo verde e
 * nenhum lead chega. Por isso o estado aparece aqui, em vez de a pessoa
 * descobrir pela ausência.
 */
export function PaginasMeta({ conexaoId }: { conexaoId: string }) {
  const paginas = usePaginasMeta(conexaoId);
  const assinar = useAssinarPagina(conexaoId);
  const antigos = useBuscarLeadsAntigos(conexaoId);
  const [dias, setDias] = useState(30);

  const lista = paginas.data ?? [];
  const algumaAssinada = lista.some((p) => p.subscribed_at);

  return (
    <section className="rounded-lg bg-card p-5 shadow-card">
      <h2 className="text-lg font-bold">Entrada de leads</h2>
      <p className="mt-0.5 text-base text-tx-2">
        A Página precisa ser assinada pelo aplicativo. É um passo de API, sem tela na Meta — e sem
        ele o painel dela fica verde e nenhum lead chega.
      </p>

      {paginas.isLoading ? (
        <p className="mt-3 flex items-center gap-2 text-base text-tx-3">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
        </p>
      ) : lista.length === 0 ? (
        <p className="mt-3 text-base text-tx-3">
          Nenhuma página ainda. Clique em <b>Buscar da Meta</b> acima.
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {lista.map((p) => (
            <Linha key={p.id} pagina={p} onAssinar={() => assinar.mutate(p.page_id)} ocupado={assinar.isPending} />
          ))}
        </ul>
      )}

      {assinar.error && (
        <p className="mt-3 flex items-start gap-2 rounded-xl bg-dng-soft p-3 text-sm text-dng">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {(assinar.error as Error).message}
        </p>
      )}

      {/* -------------------------------------------------------------- */}

      <div className="mt-4 border-t border-line pt-4">
        <h3 className="flex items-center gap-2 text-base font-bold">
          <History className="h-4 w-4 text-pri" />
          Trazer os leads que já entraram
        </h3>
        <p className="mt-0.5 text-sm text-tx-2">
          A assinatura só entrega o que acontecer <b>daqui para frente</b>. Se a campanha já estava
          rodando, os leads anteriores precisam ser buscados uma vez.
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              onClick={() => setDias(d)}
              className={cn(
                'rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors',
                dias === d
                  ? 'border-pri bg-pri text-pri-fg'
                  : 'border-line-2 bg-card text-tx-2 hover:border-pri-light hover:text-tx',
              )}
            >
              {d} dias
            </button>
          ))}

          <button
            onClick={() => antigos.mutate(dias)}
            disabled={antigos.isPending || !algumaAssinada}
            title={algumaAssinada ? undefined : 'Assine a Página primeiro'}
            className="ml-auto inline-flex items-center gap-2 rounded-full bg-pri px-4 py-2 text-base font-semibold text-pri-fg transition-colors hover:bg-pri-deep disabled:opacity-60"
          >
            {antigos.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Buscar agora
          </button>
        </div>

        {antigos.data && <Resultado dados={antigos.data as Record<string, unknown>} />}

        {antigos.error && (
          <p className="mt-3 flex items-start gap-2 rounded-xl bg-dng-soft p-3 text-sm text-dng">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {(antigos.error as Error).message}
          </p>
        )}

        <p className="mt-3 text-sm text-tx-3">
          Pode rodar quantas vezes quiser: um lead já conhecido não entra duas vezes. A chave de
          idempotência é a mesma do webhook.
        </p>
      </div>
    </section>
  );
}

function Linha({
  pagina,
  onAssinar,
  ocupado,
}: {
  pagina: Pagina;
  onAssinar: () => void;
  ocupado: boolean;
}) {
  const assinadaEm = pagina.subscribed_at;
  const assinada = !!assinadaEm;

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line-2 p-3">
      <span className="min-w-0">
        <span className="block truncate text-base font-semibold">
          {pagina.page_name ?? pagina.page_id}
        </span>
        {assinada ? (
          <span className="flex items-center gap-1 text-sm text-ok">
            <Check className="h-3 w-3" />
            Assinada em{' '}
            {new Date(assinadaEm).toLocaleDateString('pt-BR', {
              day: '2-digit',
              month: '2-digit',
              year: '2-digit',
            })}
          </span>
        ) : (
          <span className="flex items-center gap-1 text-sm text-warn">
            <TriangleAlert className="h-3 w-3" />
            Não assinada — nenhum lead vai chegar
          </span>
        )}
        {pagina.subscribe_error && (
          <span className="block text-2xs text-dng">{pagina.subscribe_error}</span>
        )}
      </span>

      <button
        onClick={onAssinar}
        disabled={ocupado}
        className={cn(
          'inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold transition-colors',
          assinada
            ? 'border border-line-2 bg-card text-tx-2 hover:text-tx'
            : 'bg-pri text-pri-fg hover:bg-pri-deep',
        )}
      >
        {ocupado ? <Loader2 className="h-3 w-3 animate-spin" /> : <Link2 className="h-3 w-3" />}
        {assinada ? 'Assinar de novo' : 'Assinar'}
      </button>
    </li>
  );
}

function Resultado({ dados }: { dados: Record<string, unknown> }) {
  const encontrados = Number(dados.encontrados ?? 0);
  const enfileirados = Number(dados.enfileirados ?? 0);
  const problemas = (dados.problemas as string[] | undefined) ?? [];

  return (
    <div className="mt-3 rounded-xl bg-card-2 p-3 text-sm">
      <p className="font-semibold">
        {encontrados} lead{encontrados === 1 ? '' : 's'} encontrado
        {encontrados === 1 ? '' : 's'} em {String(dados.formularios ?? 0)} formulário
        {Number(dados.formularios ?? 0) === 1 ? '' : 's'}.
      </p>
      <p className="mt-0.5 text-tx-2">
        {enfileirados === 0
          ? 'Nenhum novo — todos já estavam no CRM.'
          : `${enfileirados} entraram na fila e estão sendo processados.`}
      </p>

      {/* Truncar em silêncio faria a pessoa achar que trouxe tudo. */}
      {dados.truncado === true && (
        <p className="mt-1.5 flex items-start gap-1.5 text-warn">
          <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" />
          Havia mais leads do que cabe numa rodada. Rode de novo para continuar.
        </p>
      )}

      {problemas.length > 0 && (
        <ul className="mt-1.5 flex flex-col gap-0.5 text-dng">
          {problemas.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
