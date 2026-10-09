import { useState, type FormEvent } from 'react';
import { Loader2, AlertCircle, Check, Copy, Plug, TriangleAlert } from 'lucide-react';
import { useSalvarCredenciais } from '@/hooks/useMeta';

export function ConectarMeta() {
  const salvar = useSalvarCredenciais();
  const [appId, setAppId] = useState('');
  const [appSecret, setAppSecret] = useState('');
  const [token, setToken] = useState('');

  function enviar(e: FormEvent) {
    e.preventDefault();
    salvar.mutate({ appId: appId.trim(), appSecret: appSecret.trim(), accessToken: token.trim() });
  }

  const url = (salvar.data as { webhookUrl?: string } | undefined)?.webhookUrl;

  if (url) {
    return (
      <section className="max-w-[760px] rounded-lg bg-card p-5 shadow-card">
        <h2 className="flex items-center gap-2 text-lg font-bold text-ok">
          <Check className="h-4 w-4" /> Conectado
        </h2>

        {/* Verde que promete mais do que entrega é pior do que amarelo honesto. */}
        {(salvar.data as { leadsHabilitados?: boolean } | undefined)?.leadsHabilitados === false && (
          <p className="mt-2 flex items-start gap-2 rounded-xl bg-warn-soft p-3 text-sm text-warn">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              O <b>gasto</b> já vai aparecer. Os <b>leads</b> ainda não: falta a permissão{' '}
              <b>leads_retrieval</b> no token. Quando o cliente liberar o acesso a leads da Página,
              gere o token de novo e cole aqui — o resto continua valendo.
            </span>
          </p>
        )}
        <p className="mt-1 text-base text-tx-2">
          Falta um passo, e ele só aparece <b>agora</b>: cole este endereço no seu aplicativo da
          Meta, em <b>Webhooks → Page</b>, como URL de callback. O token de verificação é só o
          trecho depois da última barra. Depois assine o campo <b>leadgen</b>.
        </p>

        <div className="mt-3 flex items-start gap-2 rounded-xl bg-card-2 p-3">
          <code className="min-w-0 flex-1 break-all font-mono text-sm">{url}</code>
          <button
            onClick={() => void navigator.clipboard.writeText(url)}
            className="shrink-0 rounded-lg border border-line-2 bg-card p-1.5 text-tx-2 hover:text-tx"
            aria-label="Copiar endereço"
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
        </div>

        <p className="mt-3 flex items-start gap-2 rounded-xl bg-warn-soft p-3 text-sm text-warn">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Guarde agora. O segredo dentro deste endereço <b>não é gravado em lugar nenhum</b> — o
          banco tem só o resumo dele. Se perder, é preciso gerar outro.
        </p>
      </section>
    );
  }

  return (
    <form onSubmit={enviar} className="max-w-[760px] rounded-lg bg-card p-5 shadow-card">
      <h2 className="flex items-center gap-2 text-lg font-bold">
        <Plug className="h-4 w-4 text-pri" /> Conectar a Meta
      </h2>
      <p className="mt-1 text-base text-tx-2">
        No <b>Gerenciador de Negócios</b> da imobiliária: crie um Usuário do Sistema, atribua o
        aplicativo, a Página e as contas de anúncio como ativos dele, e gere um token.
      </p>

      {/* As duas metades conectam separado, e dizer isso evita a espera à toa:
          quando a Página é de outro portfólio, o acesso a leads depende do
          cliente liberar e pode levar dias. O gasto não espera por isso. */}
      <div className="mt-3 flex flex-col gap-1.5 rounded-xl bg-card-2 p-3 text-sm">
        <span className="flex items-start gap-2">
          <b className="shrink-0 text-tx">ads_read</b>
          <span className="text-tx-2">
            obrigatória — é o gasto das campanhas
          </span>
        </span>
        <span className="flex items-start gap-2">
          <b className="shrink-0 text-tx">leads_retrieval</b>
          <span className="text-tx-2">
            para receber lead. Pode vir depois: conecte agora com o que tiver, que o gasto já
            aparece e os leads entram quando a permissão chegar.
          </span>
        </span>
      </div>

      <div className="mt-4 flex flex-col gap-3">
        <Campo rotulo="ID do aplicativo" valor={appId} onChange={setAppId} />
        <Campo rotulo="Chave secreta do aplicativo" valor={appSecret} onChange={setAppSecret} secreto />
        <Campo rotulo="Token de acesso" valor={token} onChange={setToken} secreto />
      </div>

      {salvar.error && (
        <p className="mt-3 flex items-start gap-2 rounded-xl bg-dng-soft p-3 text-sm text-dng">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {(salvar.error as Error).message}
        </p>
      )}

      <button
        type="submit"
        disabled={salvar.isPending || !appId || !appSecret || !token}
        className="mt-4 inline-flex items-center gap-2 rounded-full bg-pri px-4 py-2 text-base font-semibold text-pri-fg transition-colors hover:bg-pri-deep disabled:opacity-60"
      >
        {salvar.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        Conectar
      </button>

      <p className="mt-3 border-t border-line pt-3 text-sm text-tx-3">
        O token é <b>conferido com a Meta antes de ser guardado</b>: se faltar permissão, a conexão
        é recusada na hora em vez de aparecer conectada e não funcionar. Depois disso ele vive
        cifrado no cofre do banco — nunca volta para esta tela, nem para nenhuma outra.
      </p>
    </form>
  );
}

function Campo({
  rotulo,
  valor,
  onChange,
  secreto,
}: {
  rotulo: string;
  valor: string;
  onChange: (v: string) => void;
  secreto?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-semibold text-tx-2">{rotulo}</span>
      <input
        type={secreto ? 'password' : 'text'}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
        spellCheck={false}
        className="rounded-xl border border-line-2 bg-sheet px-3 py-2 font-mono text-base outline-none focus:border-pri"
      />
    </label>
  );
}
