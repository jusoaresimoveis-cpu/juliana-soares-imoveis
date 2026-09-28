import { useState } from 'react';
import { Copy, KeyRound, Loader2, TriangleAlert, Check } from 'lucide-react';
import { useNovoWebhook } from '@/hooks/useMeta';

/**
 * O endereço do webhook, recuperável.
 *
 * A primeira versão mostrava a URL uma única vez, no painel de sucesso da
 * conexão — e esse painel some no instante em que a conexão é salva, porque a
 * consulta recarrega e a tela troca para o estado conectado. Na prática ninguém
 * conseguia copiar.
 *
 * O segredo continua existindo só como resumo no banco, o que é o certo. O que
 * muda é ter um caminho honesto para gerar outro, com o aviso do que isso
 * quebra.
 *
 * O token de verificação aparece SEPARADO. A `meta-webhook` confere o
 * `hub.verify_token` contra o segredo do fim do endereço, e não contra o
 * endereço inteiro; a tela dizia "o mesmo valor serve", e quem colava o
 * endereço nos dois campos via a Meta recusar a verificação (28/09).
 */
export function EnderecoWebhook({ conexaoId }: { conexaoId: string }) {
  const gerar = useNovoWebhook(conexaoId);

  const url = (gerar.data as { webhookUrl?: string } | undefined)?.webhookUrl;
  const token = url?.split('/').pop();

  return (
    <section className="rounded-lg bg-card p-5 shadow-card">
      <h2 className="flex items-center gap-2 text-lg font-bold">
        <KeyRound className="h-4 w-4 text-pri" />
        Endereço do webhook
      </h2>
      <p className="mt-0.5 text-base text-tx-2">
        Vai no seu aplicativo da Meta, em <b>Webhooks → Page</b>: o endereço em <b>URL de callback</b> e o token em{' '}
        <b>Verificar token</b>. Depois de salvar, assine o campo <b>leadgen</b>.
      </p>

      {url && token ? (
        <>
          <Copiavel rotulo="URL de callback" valor={url} />
          <Copiavel rotulo="Verificar token" valor={token} />

          <p className="mt-2.5 flex items-start gap-2 rounded-xl bg-warn-soft p-3 text-sm text-warn">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Guarde agora — o banco tem só o resumo. E se você tinha um endereço antigo configurado
            na Meta, ele <b>parou de valer neste instante</b>: troque lá.
          </p>
        </>
      ) : (
        <>
          <button
            onClick={() => gerar.mutate()}
            disabled={gerar.isPending}
            className="mt-3 inline-flex items-center gap-2 rounded-full bg-pri px-4 py-2 text-base font-semibold text-pri-fg transition-colors hover:bg-pri-deep disabled:opacity-60"
          >
            {gerar.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Gerar endereço
          </button>

          <p className="mt-2.5 text-sm text-tx-3">
            Gerar um endereço novo <b>invalida o anterior</b>. Use quando ainda não configurou na
            Meta, quando perdeu o endereço, ou quando suspeitar que ele vazou.
          </p>
        </>
      )}

      {gerar.error && (
        <p className="mt-3 text-sm text-dng">{(gerar.error as Error).message}</p>
      )}
    </section>
  );
}

/** Um valor para copiar, com o nome do campo da Meta onde ele vai. */
function Copiavel({ rotulo, valor }: { rotulo: string; valor: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <div className="mt-3">
      <span className="text-sm font-semibold text-tx-2">{rotulo}</span>
      <div className="mt-1 flex items-start gap-2 rounded-xl bg-card-2 p-3">
        <code className="min-w-0 flex-1 break-all font-mono text-sm">{valor}</code>
        <button
          onClick={() => {
            void navigator.clipboard.writeText(valor);
            setCopiado(true);
          }}
          className="shrink-0 rounded-lg border border-line-2 bg-card p-1.5 text-tx-2 hover:text-tx"
          aria-label={`Copiar ${rotulo}`}
        >
          {copiado ? <Check className="h-3.5 w-3.5 text-ok" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  );
}
