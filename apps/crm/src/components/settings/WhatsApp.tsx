import { useEffect, useState } from 'react';
import { Loader2, Plus, X, RefreshCw, Trash2, AlertCircle, Smartphone } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import {
  useInstancias,
  useConectar,
  useDesconectar,
  useStatusAoVivo,
  QR_VALIDADE_MS,
  type Instancia,
} from '@/hooks/useWhatsApp';
import { WA_INSTANCE_META, papelPrincipal } from '@contracts';
import { cn } from '@/lib/utils';

const TOM = {
  ok: 'bg-ok-soft text-ok',
  warn: 'bg-warn-soft text-warn',
  dng: 'bg-dng-soft text-dng',
  neutro: 'bg-card-2 text-tx-3',
} as const;

export function WhatsApp() {
  const { profile, roles } = useAuth();
  const orgId = profile?.organization_id;
  const papel = papelPrincipal(roles);
  const gestor = papel === 'admin' || papel === 'gerente';

  const instancias = useInstancias(orgId);
  const conectar = useConectar(orgId);
  const desconectar = useDesconectar(orgId);

  const [pareando, setPareando] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [novo, setNovo] = useState('');

  const aoVivo = useStatusAoVivo(pareando, orgId);

  // Conectou: fecha o QR. O código na tela depois de pareado só confunde.
  useEffect(() => {
    if (aoVivo.data?.status === 'conectada') {
      setPareando(null);
      setQr(null);
    } else if (aoVivo.data?.qrcode) {
      setQr(aoVivo.data.qrcode);
    }
  }, [aoVivo.data]);

  // O código expira no provedor. Renova antes disso.
  useEffect(() => {
    if (!pareando) return;
    const t = setInterval(() => {
      conectar.mutate(
        { instanciaId: pareando },
        { onSuccess: (r) => setQr((r.qrcode as string) ?? null) },
      );
    }, QR_VALIDADE_MS);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pareando]);

  /*
   * A lista já vem recortada pelo BANCO.
   *
   * A policy da 080 devolve ao corretor só o número dele; à gestão, todos. Não
   * há filtro aqui de propósito — filtrar de novo na tela criaria uma segunda
   * versão da regra, e seria esta a ficar para trás.
   */
  const lista = instancias.data ?? [];

  /*
   * O corretor conecta UM número, e o cadastro some depois disso.
   *
   * O teto de verdade está no gatilho da 080; isto aqui só evita oferecer um
   * botão que vai responder erro. Enquanto a lista não chegou, o formulário
   * fica fora: aparecer e sumir é pior do que aparecer meio segundo depois.
   */
  const podeAdicionar = gestor || (!instancias.isLoading && lista.length === 0);

  return (
    <div className="flex flex-col gap-4">
      <Cartao>
        <h2 className="text-lg font-bold">{gestor ? 'Números conectados' : 'Seu WhatsApp'}</h2>
        <p className="mt-0.5 text-base text-tx-2">
          {gestor ? (
            <>
              Cada número é de um corretor. A conversa fica com quem atendeu, e a resposta sai
              sempre pelo mesmo número que o cliente conhece.
            </>
          ) : (
            <>
              Conecte o seu celular para que as conversas entrem no CRM. O lead que chegar por ele
              já nasce no seu nome.
            </>
          )}
        </p>

        {/*
          A promessa de privacidade fica na tela em que a decisão é tomada.
          Está escrita no banco desde a 067 — conversa marcada como pessoal só é
          visível para o dono do número, sem exceção para gerente nem para
          administrador — e é justamente a dúvida de quem vai conectar o próprio
          celular ao sistema do patrão.
        */}
        {!gestor && (
          <p className="mt-2 rounded-xl bg-card-2 p-3 text-sm text-tx-2">
            Conversa que você marcar como <b>pessoal</b> fica só com você. Nem a gerência nem a
            administração conseguem abrir — a trava é do banco de dados, não da tela.
          </p>
        )}

        {instancias.isLoading && (
          <p className="mt-4 flex items-center gap-2 text-base text-tx-3">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando…
          </p>
        )}

        {!instancias.isLoading && lista.length === 0 && (
          <p className="mt-4 rounded-xl border border-dashed border-line-2 p-5 text-center text-base text-tx-3">
            {gestor ? 'Nenhum número conectado ainda.' : 'Você ainda não conectou um número.'}
          </p>
        )}

        <div className="mt-3 flex flex-col gap-2">
          {lista.map((i) => (
            <Numero
              key={i.id}
              instancia={i}
              ocupado={conectar.isPending || desconectar.isPending}
              onParear={() =>
                conectar.mutate(
                  { instanciaId: i.id },
                  {
                    onSuccess: (r) => {
                      setPareando(i.id);
                      setQr((r.qrcode as string) ?? null);
                    },
                  },
                )
              }
              onDesconectar={() => desconectar.mutate({ instanciaId: i.id })}
              /*
               * Remover é da gestão, e a função recusa com 403 de qualquer
               * forma. Some o botão porque desconectar e remover parecem a
               * mesma coisa e não são: desconectar encerra a sessão e o número
               * volta com o mesmo QR; remover apaga a instância paga no
               * provedor e o token no cofre.
               */
              onRemover={
                gestor ? () => desconectar.mutate({ instanciaId: i.id, remover: true }) : undefined
              }
            />
          ))}
        </div>

        {podeAdicionar && (
          <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
            {/*
              O rótulo é uma pergunta que só a gestão precisa responder: é ela
              que vai olhar uma lista de números e ter de saber qual é qual. Para
              quem conecta o próprio celular, o nome dele É a resposta — e uma
              pergunta a menos entre a pessoa e o QR code.
            */}
            {gestor && (
              <input
                value={novo}
                onChange={(e) => setNovo(e.target.value)}
                placeholder="Nome do número (ex: Plantão Moema)"
                className="min-w-[220px] flex-1 rounded-xl border border-line-2 bg-card px-3.5 py-2.5 text-base outline-none focus:border-pri"
              />
            )}
            <button
              disabled={(gestor && novo.trim().length < 2) || conectar.isPending}
              onClick={() =>
                conectar.mutate(
                  { rotulo: gestor ? novo.trim() : (profile?.full_name?.trim() ?? 'Meu número') },
                  {
                    onSuccess: (r) => {
                      setNovo('');
                      setPareando(String(r.id));
                      setQr((r.qrcode as string) ?? null);
                    },
                  },
                )
              }
              className="inline-flex items-center gap-1.5 rounded-xl bg-pri px-4 py-2.5 text-md font-semibold text-pri-fg hover:bg-pri-deep disabled:opacity-50"
            >
              {conectar.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Plus className="h-3.5 w-3.5" />
              )}
              {gestor ? 'Conectar número' : 'Conectar meu WhatsApp'}
            </button>
          </div>
        )}

        {(conectar.isError || desconectar.isError) && (
          <p className="mt-3 flex items-start gap-2 rounded-xl bg-dng-soft p-3 text-sm text-dng">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {((conectar.error ?? desconectar.error) as Error).message}
          </p>
        )}
      </Cartao>

      <Cartao>
        <h2 className="text-lg font-bold">Sobre o envio</h2>
        <p className="mt-0.5 text-base text-tx-2">
          O sistema responde <b>dentro de conversas que o cliente iniciou</b>. Não existe disparo
          para lista.
        </p>
        <p className="mt-2 text-sm text-tx-3">
          Isso não é uma tela que falta: a fila de envio exige uma conversa existente. É a proteção
          do próprio número — prospecção fria é o que faz o WhatsApp banir, e recuperar um número
          que os clientes já salvaram não depende de nós.
        </p>
      </Cartao>

      {pareando && (
        <DialogoQR
          qrcode={qr}
          carregando={conectar.isPending || (!qr && aoVivo.isFetching)}
          onFechar={() => {
            setPareando(null);
            setQr(null);
          }}
        />
      )}
    </div>
  );
}

function Numero({
  instancia,
  ocupado,
  onParear,
  onDesconectar,
  onRemover,
}: {
  instancia: Instancia;
  ocupado: boolean;
  onParear: () => void;
  onDesconectar: () => void;
  /** Ausente para quem não é gestão: o botão de apagar nem aparece. */
  onRemover?: () => void;
}) {
  const meta = WA_INSTANCE_META[instancia.status];
  const conectada = instancia.status === 'conectada';

  return (
    <article className="rounded-xl border border-line-2 p-3.5">
      <div className="flex flex-wrap items-center gap-2.5">
        <Smartphone className="h-4 w-4 shrink-0 text-tx-3" />
        <b className="text-base font-bold">{instancia.label}</b>
        <span className={cn('rounded-full px-2.5 py-1 text-2xs font-bold', TOM[meta.tom])}>
          {meta.label}
        </span>
        {instancia.connected_phone_e164 && (
          <span className="text-sm tabular-nums text-tx-3">{instancia.connected_phone_e164}</span>
        )}

        <div className="ml-auto flex gap-1.5">
          {!conectada && (
            <button
              onClick={onParear}
              disabled={ocupado}
              className="inline-flex items-center gap-1 rounded-full border border-line-2 px-3 py-1.5 text-sm font-semibold text-tx-2 hover:border-pri hover:text-pri disabled:opacity-50"
            >
              <RefreshCw className="h-3 w-3" />
              Conectar
            </button>
          )}
          {conectada && (
            <button
              onClick={onDesconectar}
              disabled={ocupado}
              className="rounded-full border border-line-2 px-3 py-1.5 text-sm font-semibold text-tx-2 hover:border-dng hover:text-dng disabled:opacity-50"
            >
              Desconectar
            </button>
          )}
          {onRemover && (
            <button
              onClick={onRemover}
              disabled={ocupado}
              aria-label={`Remover ${instancia.label}`}
              className="grid h-8 w-8 place-items-center rounded-full text-tx-3 hover:bg-dng-soft hover:text-dng disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* A instrução é o motivo de o estado existir: "sem internet" e "escaneie
          o QR" pedem ações opostas do corretor. */}
      <p className="mt-1.5 text-sm text-tx-3">{meta.instrucao}</p>

      {instancia.last_error && (
        <p className="mt-1.5 text-sm text-dng">{instancia.last_error}</p>
      )}

      {conectada && !instancia.webhook_configured_at && (
        <p className="mt-1.5 flex items-start gap-1.5 text-sm text-warn">
          <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
          Conectado, mas o recebimento não foi confirmado pelo provedor. Clique em Conectar para
          reconfigurar — sem isso, mensagens que chegam não entram no CRM.
        </p>
      )}
    </article>
  );
}

function DialogoQR({
  qrcode,
  carregando,
  onFechar,
}: {
  qrcode: string | null;
  carregando: boolean;
  onFechar: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Ler código para conectar"
      className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4"
      onClick={(e) => e.target === e.currentTarget && onFechar()}
    >
      <div className="w-full max-w-[380px] rounded-[22px] bg-sheet p-6 text-center shadow-sheet">
        <div className="mb-4 flex items-start justify-between gap-3 text-left">
          <div>
            <h2 className="text-xl font-bold">Leia o código</h2>
            <p className="mt-0.5 text-sm text-tx-2">
              No celular: WhatsApp → Aparelhos conectados → Conectar aparelho.
            </p>
          </div>
          <button
            onClick={onFechar}
            aria-label="Fechar"
            className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-tx-3 hover:bg-card-2 hover:text-tx"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid aspect-square w-full place-items-center rounded-2xl bg-white p-4">
          {qrcode ? (
            <img
              src={qrcode.startsWith('data:') ? qrcode : `data:image/png;base64,${qrcode}`}
              alt="Código para conectar o WhatsApp"
              className="h-full w-full object-contain"
            />
          ) : (
            <span className="flex items-center gap-2 text-base text-tx-3">
              <Loader2 className="h-4 w-4 animate-spin" />
              {carregando ? 'Gerando código…' : 'Sem código disponível'}
            </span>
          )}
        </div>

        <p className="mt-3 text-sm text-tx-3">
          O código se renova sozinho a cada 20 segundos. A tela fecha quando conectar.
        </p>
      </div>
    </div>
  );
}

function Cartao({ children }: { children: React.ReactNode }) {
  return <section className="max-w-[680px] rounded-lg bg-card p-5 shadow-card">{children}</section>;
}
