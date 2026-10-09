import { useMemo, useState } from 'react';
import {
  FileText,
  Loader2,
  AlertCircle,
  Printer,
  ArrowLeft,
  Scale,
  Eye,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import {
  useModelos,
  useDocumentos,
  useEmitirDocumento,
  type Modelo,
  type CampoDeModelo,
  useImobiliaria,
} from '@/hooks/useDocumentos';
import {
  preencher,
  valoresAutomaticos,
  faltando,
  montarFolha,
  formatarValores,
} from '@/lib/documentos';
import { Previa, abrirParaImprimir } from '@/components/documentos/Previa';
import { Historico } from '@/components/documentos/Historico';

export default function Documentos() {
  const [modelo, setModelo] = useState<Modelo | null>(null);
  const modelos = useModelos();
  const emitidos = useDocumentos();

  if (modelo) return <Emitir modelo={modelo} onVoltar={() => setModelo(null)} />;

  return (
    <div className="flex flex-col gap-4 pb-6">
      <header>
        <h1 className="text-2xl font-bold">Documentos</h1>
        <p className="mt-0.5 text-base text-tx-2">
          Modelos prontos, preenchidos com os dados do negócio e guardados como estão no dia da
          emissão.
        </p>
      </header>

      <section className="rounded-lg bg-card p-5 shadow-card">
        <h2 className="text-lg font-bold">Emitir</h2>

        {modelos.isLoading ? (
          <p className="mt-3 flex items-center gap-2 text-base text-tx-3">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
          </p>
        ) : (
          <ul className="mt-3 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {(modelos.data ?? []).map((m) => (
              <li key={m.id}>
                <button
                  onClick={() => setModelo(m)}
                  className="flex h-full w-full flex-col rounded-xl border border-line-2 p-3.5 text-left transition-colors hover:border-pri-light hover:bg-pri-soft/40"
                >
                  <span className="flex items-center gap-2 text-base font-bold">
                    <FileText className="h-4 w-4 shrink-0 text-pri" />
                    {m.name}
                  </span>
                  {m.description && (
                    <span className="mt-1 text-sm leading-snug text-tx-2">{m.description}</span>
                  )}
                  <span className="mt-2 text-2xs font-semibold uppercase text-tx-3">
                    {m.fields.length} campo{m.fields.length === 1 ? '' : 's'}
                    {m.is_system && ' · modelo do sistema'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Historico documentos={emitidos.data ?? []} carregando={emitidos.isLoading} />
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function Emitir({ modelo, onVoltar }: { modelo: Modelo; onVoltar: () => void }) {
  const { profile } = useAuth();
  const imobiliaria = useImobiliaria().data;

  const [valores, setValores] = useState<Record<string, string>>({});
  const [comTimbre, setComTimbre] = useState(true);
  const emitir = useEmitirDocumento();

  const automaticos = useMemo(
    () =>
      valoresAutomaticos({
        imobiliaria: imobiliaria?.name ?? 'Imobiliária',
        cnpj: imobiliaria?.cnpj ?? null,
        corretor: profile?.full_name ?? '',
        creci: profile?.creci ?? null,
      }),
    [imobiliaria, profile],
  );

  // Formata pelo tipo antes de entrar no papel: data vira dd/mm/aaaa,
  // dinheiro vira R$ 450.000,00.
  const todos = { ...automaticos, ...formatarValores(modelo.fields, valores) };
  const pendentes = faltando(modelo.fields, valores);

  const folha = useMemo(
    () =>
      montarFolha({
        corpo: preencher(modelo.body_html, todos),
        comTimbre,
        imobiliaria: imobiliaria?.name ?? 'Imobiliária',
        cnpj: imobiliaria?.cnpj ?? null,
        endereco: imobiliaria?.address ?? null,
        cor: imobiliaria?.brand_color ?? null,
        cidade: imobiliaria?.city ?? null,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [modelo.body_html, JSON.stringify(todos), comTimbre, imobiliaria],
  );

  function imprimir() {
    abrirParaImprimir(folha, modelo.name);
  }

  async function salvarEImprimir() {
    if (!profile || !imobiliaria) return;
    await emitir.mutateAsync({
      organizationId: imobiliaria.id,
      criadoPor: profile.id,
      criadoPorNome: profile.full_name,
      modelo,
      titulo: modelo.name,
      leadId: null,
      valores: todos,
      html: folha,
      comTimbre,
      comAssinatura: true,
    });
    imprimir();
  }

  return (
    <div className="flex flex-col gap-4 pb-6">
      <header className="flex flex-wrap items-center gap-3">
        <button
          onClick={onVoltar}
          className="grid h-8 w-8 place-items-center rounded-full border border-line-2 bg-card text-tx-2 hover:text-tx"
          aria-label="Voltar"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div>
          <h1 className="text-xl font-bold">{modelo.name}</h1>
          {modelo.description && <p className="text-sm text-tx-2">{modelo.description}</p>}
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(280px,380px)_1fr]">
        <section className="rounded-lg bg-card p-5 shadow-card">
          <h2 className="text-lg font-bold">Preencher</h2>
          <p className="mt-0.5 text-sm text-tx-3">
            O que ficar em branco vira uma lacuna para preencher à caneta.
          </p>

          <div className="mt-3 flex flex-col gap-3">
            {modelo.fields.map((c) => (
              <Campo
                key={c.k}
                campo={c}
                valor={valores[c.k] ?? ''}
                onChange={(v) => setValores((a) => ({ ...a, [c.k]: v }))}
              />
            ))}
          </div>

          <label className="mt-4 flex cursor-pointer items-center gap-2 border-t border-line pt-3 text-base font-semibold">
            <input
              type="checkbox"
              checked={comTimbre}
              onChange={(e) => setComTimbre(e.target.checked)}
              className="h-4 w-4 accent-pri"
            />
            Imprimir com timbre da imobiliária
          </label>

          {pendentes.length > 0 && (
            <p className="mt-3 flex items-start gap-2 rounded-xl bg-warn-soft p-3 text-sm text-warn">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Falta preencher: <b>{pendentes.map((c) => c.r).join(', ')}</b>.
            </p>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={() => void salvarEImprimir()}
              disabled={pendentes.length > 0 || emitir.isPending}
              className="inline-flex items-center gap-2 rounded-full bg-pri px-4 py-2 text-base font-semibold text-pri-fg transition-colors hover:bg-pri-deep disabled:opacity-60"
            >
              {emitir.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Printer className="h-3.5 w-3.5" />
              )}
              Emitir e imprimir
            </button>
            <button
              onClick={imprimir}
              className="inline-flex items-center gap-2 rounded-full border border-line-2 bg-card px-4 py-2 text-base font-semibold text-tx-2 hover:text-tx"
            >
              <Eye className="h-3.5 w-3.5" />
              Só visualizar
            </button>
          </div>

          <p className="mt-3 text-sm text-tx-3">
            <b>Emitir</b> guarda uma cópia exata no histórico, com quem emitiu e quando.{' '}
            <b>Visualizar</b> não guarda nada.
          </p>

          {/* Um CRM não substitui advogado, e dizer isso é mais honesto do que
              deixar a pessoa descobrir depois. */}
          <p className="mt-3 flex items-start gap-2 rounded-xl bg-card-2 p-3 text-sm text-tx-2">
            <Scale className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Os modelos são ponto de partida, não peça jurídica pronta. Contrato que vai valer entre
            as partes merece uma lida do advogado da imobiliária antes de virar praxe.
          </p>
        </section>

        <section className="min-w-0 rounded-lg bg-card p-5 shadow-card">
          <h2 className="mb-3 text-lg font-bold">Como vai sair</h2>
          <Previa html={folha} />
        </section>
      </div>
    </div>
  );
}

function Campo({
  campo,
  valor,
  onChange,
}: {
  campo: CampoDeModelo;
  valor: string;
  onChange: (v: string) => void;
}) {
  const base =
    'rounded-xl border border-line-2 bg-sheet px-3 py-2 text-base outline-none focus:border-pri';

  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-semibold text-tx-2">
        {campo.r}
        {campo.obrig && <span className="ml-0.5 text-dng">*</span>}
      </span>

      {campo.t === 'longo' ? (
        <textarea rows={3} value={valor} onChange={(e) => onChange(e.target.value)} className={base} />
      ) : campo.t === 'opcao' ? (
        <select value={valor} onChange={(e) => onChange(e.target.value)} className={base}>
          <option value="">Selecione…</option>
          {(campo.opcoes ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : (
        <input
          type={campo.t === 'data' ? 'date' : campo.t === 'hora' ? 'time' : 'text'}
          inputMode={campo.t === 'numero' || campo.t === 'dinheiro' ? 'decimal' : undefined}
          value={valor}
          onChange={(e) => onChange(e.target.value)}
          className={base}
        />
      )}
    </label>
  );
}
