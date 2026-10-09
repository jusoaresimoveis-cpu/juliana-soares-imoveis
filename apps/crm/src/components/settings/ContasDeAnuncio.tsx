import { Loader2, AlertCircle, Check, RefreshCw, DownloadCloud, Unplug } from 'lucide-react';
import {
  useContasDeAnuncio,
  useBuscarAtivos,
  useLigarConta,
  useDesconectar,
  useImportarGasto,
} from '@/hooks/useMeta';

export function ContasDeAnuncio({ conexaoId }: { conexaoId: string }) {
  const contas = useContasDeAnuncio(conexaoId);
  const buscar = useBuscarAtivos(conexaoId);
  const importar = useImportarGasto(conexaoId);
  // A resposta de "Buscar da Meta" diz o que foi recusado por já pertencer a
  // outra imobiliária. Vem como `unknown` do invoke, então o estreitamento é aqui.
  const recusadas = ((buscar.data as { recusadas?: unknown })?.recusadas ?? []) as {
    nome: string;
    motivo: string;
  }[];
  const deOutraCasa = recusadas.filter((r) => r.motivo === 'de_outra_casa');
  const deOutraConexao = recusadas.filter((r) => r.motivo === 'de_outra_conexao');
  const ligar = useLigarConta(conexaoId);
  const desconectar = useDesconectar(conexaoId);

  return (
    <section className="rounded-lg bg-card p-5 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">Contas de anúncio</h2>
          <p className="mt-0.5 text-base text-tx-2">
            Ligue só as contas desta imobiliária. O gasto das desligadas não entra em conta nenhuma.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {/* O texto da tabela vazia prometia este botão e ele não existia. O
              cron de hora em hora está certo para o dia a dia e errado no
              minuto seguinte à conexão, que é quando se quer ver número. */}
          <button
            onClick={() => importar.mutate()}
            disabled={importar.isPending}
            className="inline-flex items-center gap-1.5 rounded-full bg-pri px-3 py-1.5 text-sm font-semibold text-pri-fg transition-colors hover:bg-pri-deep disabled:opacity-60"
          >
            {importar.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <DownloadCloud className="h-3 w-3" />
            )}
            Importar agora
          </button>

          <button
            onClick={() => buscar.mutate()}
            disabled={buscar.isPending}
            className="inline-flex items-center gap-1.5 rounded-full border border-line-2 bg-card px-3 py-1.5 text-sm font-semibold text-tx-2 hover:text-tx"
          >
            {buscar.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
            Buscar da Meta
          </button>
          <button
            onClick={() => desconectar.mutate()}
            disabled={desconectar.isPending}
            className="inline-flex items-center gap-1.5 rounded-full border border-line-2 bg-card px-3 py-1.5 text-sm font-semibold text-tx-3 hover:text-dng"
          >
            <Unplug className="h-3 w-3" />
            Desconectar
          </button>
        </div>
      </div>

      {(buscar.error || importar.error) && (
        <p className="mt-3 flex items-start gap-2 rounded-xl bg-dng-soft p-3 text-sm text-dng">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {((buscar.error ?? importar.error) as Error).message}
        </p>
      )}

      {importar.data != null && (
        <p className="mt-3 flex items-start gap-2 rounded-xl bg-card-2 p-3 text-sm text-tx-2">
          <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ok" />
          Importação disparada. O resultado aparece em <b>Desempenho</b>, logo abaixo.
        </p>
      )}

      {/*
        O que a Meta mostrou e o CRM NÃO pegou.
        Sem esta linha, a conta aparece no Gerenciador de Anúncios e não aparece
        aqui, e o gerente clica em "Buscar da Meta" de novo achando que falhou.
        Antes o sistema pegava mesmo assim — reescrevia a linha da outra
        imobiliária e ficava com ela. Recusar é a decisão certa; recusar em
        silêncio, não.
      */}
      {deOutraCasa.length > 0 && (
        <p className="mt-3 flex items-start gap-2 rounded-xl bg-warn-soft p-3 text-sm text-warn">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Fora da lista: <b>{deOutraCasa.map((r) => r.nome).join(', ')}</b> — já
            {deOutraCasa.length === 1 ? ' está cadastrado' : ' estão cadastrados'} em{' '}
            <b>outra imobiliária</b> deste sistema. Quem registrou primeiro fica com o ativo.
          </span>
        </p>
      )}

      {/*
        A recusa por "outra conexão" é INFORMAÇÃO, não problema.
        Ela diz duas coisas de uma vez: a conta já tem dono aqui dentro, e este
        token consegue enxergá-la — que é exatamente o que se precisa saber para
        decidir se dá para movê-la de BM.
      */}
      {deOutraConexao.length > 0 && (
        <p className="mt-3 flex items-start gap-2 rounded-xl bg-card-2 p-3 text-sm text-tx-2">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-tx-3" />
          <span>
            <b>{deOutraConexao.map((r) => r.nome).join(', ')}</b> —{' '}
            {deOutraConexao.length === 1 ? 'está administrada' : 'estão administradas'} por outra
            conexão desta imobiliária, então {deOutraConexao.length === 1 ? 'ficou' : 'ficaram'} de
            fora desta lista. Este token enxerga{deOutraConexao.length === 1 ? '' : 'm'} — o que
            muda é qual BM responde por {deOutraConexao.length === 1 ? 'ela' : 'elas'}.
          </span>
        </p>
      )}

      {(contas.data ?? []).length === 0 ? (
        <p className="mt-3 text-base text-tx-3">
          Nenhuma conta ainda. Clique em <b>Buscar da Meta</b>.
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {(contas.data ?? []).map((c) => (
            <li
              key={c.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-line-2 p-3"
            >
              <span>
                <span className="block text-base font-semibold">{c.name ?? c.ad_account_id}</span>
                <span className="block text-sm text-tx-3">
                  {c.ad_account_id}
                  {c.currency && ` · ${c.currency}`}
                  {c.timezone_name && ` · ${c.timezone_name}`}
                </span>
              </span>
              <label className="flex shrink-0 cursor-pointer items-center gap-2 text-sm font-semibold">
                <input
                  type="checkbox"
                  checked={c.enabled}
                  disabled={ligar.isPending}
                  onChange={(e) =>
                    ligar.mutate({ adAccountId: c.ad_account_id, ligada: e.target.checked })
                  }
                  className="h-4 w-4 accent-pri"
                />
                {c.enabled ? 'Em uso' : 'Desligada'}
              </label>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
