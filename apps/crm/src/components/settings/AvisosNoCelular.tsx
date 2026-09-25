import { Loader2, Bell, BellOff, Smartphone, AlertCircle, Check } from 'lucide-react';
import { usePush } from '@/hooks/usePush';
import { PassosDeInstalacao } from '@/components/InstalarApp';
import { env } from '@/lib/env';

/**
 * Avisos no celular.
 *
 * Cada estado tem uma frase e uma ação diferentes. O CRM auditado resolvia
 * tudo com "Seu navegador não suporta push notifications" — que é a mensagem
 * ERRADA para o usuário de iPhone, o mais comum entre corretores: o navegador
 * suporta, falta instalar o app na tela de início. Quem lê aquilo desiste.
 */
export function AvisosNoCelular() {
  const { estado, ocupado, erro, ligar, desligar, ehIOS } = usePush();

  if (!env.vapidPublicKey) {
    return (
      <Cartao>
        <Titulo />
        <p className="mt-2 flex items-start gap-2 rounded-xl bg-warn-soft p-3 text-sm text-warn">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Push ainda não configurado neste ambiente.
        </p>
      </Cartao>
    );
  }

  return (
    <Cartao>
      <Titulo />

      {estado === 'carregando' && (
        <p className="mt-3 flex items-center gap-2 text-base text-tx-3">
          <Loader2 className="h-4 w-4 animate-spin" />
          Verificando…
        </p>
      )}

      {/* O estado que importa: iPhone fora da tela de início. */}
      {estado === 'precisa_instalar' && (
        <div className="mt-3 rounded-xl bg-pri-soft p-4">
          <p className="flex items-center gap-2 text-base font-bold text-pri">
            <Smartphone className="h-4 w-4" />
            Instale o app primeiro
          </p>
          <p className="mt-1 text-sm text-tx-2">
            No iPhone, o aviso no celular só funciona com o CRM na tela de início. É rápido:
          </p>
          {/* A mesma lista do botão "Instalar app": escrita uma vez, num lugar
              só. Duas cópias envelheceriam separadas, e é instrução que a
              pessoa segue com o aparelho na mão. */}
          <div className="mt-3">
            <PassosDeInstalacao ios />
          </div>
          <p className="mt-3 flex items-start gap-1.5 text-sm text-tx-2">
            <Bell className="mt-0.5 h-3.5 w-3.5 shrink-0 text-pri" />
            Depois abra o CRM pelo ícone novo e volte aqui para ligar os avisos.
          </p>
        </div>
      )}

      {estado === 'sem_suporte' && (
        <p className="mt-3 text-base text-tx-2">
          Este navegador não tem push. O sino dentro do CRM continua funcionando normalmente —
          {ehIOS ? ' tente pelo Safari.' : ' tente pelo Chrome, Edge ou Firefox.'}
        </p>
      )}

      {estado === 'bloqueado' && (
        <div className="mt-3 rounded-xl bg-dng-soft p-3.5">
          <p className="text-base font-bold text-dng">Aviso bloqueado neste navegador</p>
          <p className="mt-1 text-sm text-tx-2">
            A permissão foi negada antes, e só as configurações do navegador revertem: abra o
            cadeado ao lado do endereço, encontre <b>Notificações</b> e mude para <b>Permitir</b>.
            Depois recarregue.
          </p>
        </div>
      )}

      {(estado === 'desligado' || estado === 'ligado') && (
        <>
          <label className="mt-3 flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-line-2 p-3.5">
            <span className="flex items-center gap-2 text-base font-semibold">
              {estado === 'ligado' ? (
                <Bell className="h-4 w-4 text-ok" />
              ) : (
                <BellOff className="h-4 w-4 text-tx-3" />
              )}
              Receber avisos neste aparelho
            </span>
            <input
              type="checkbox"
              checked={estado === 'ligado'}
              disabled={ocupado}
              onChange={() => (estado === 'ligado' ? void desligar() : void ligar())}
              className="h-4 w-4 accent-pri"
            />
          </label>

          {estado === 'ligado' && (
            <p className="mt-2 flex items-center gap-1.5 text-sm font-semibold text-ok">
              <Check className="h-3.5 w-3.5" />
              Este aparelho vai avisar mesmo com o CRM fechado.
            </p>
          )}
        </>
      )}

      {erro && (
        <p className="mt-2 flex items-start gap-2 rounded-xl bg-dng-soft p-2.5 text-sm text-dng">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {erro}
        </p>
      )}

      <p className="mt-3 border-t border-line pt-3 text-sm text-tx-3">
        O aviso no celular é <b>reforço</b>, não o canal principal: mesmo sem ele, tudo aparece no
        sino ao abrir o CRM. É por isso que a permissão só é pedida quando você clica — pedir na
        entrada queima o direito de pedir, e um &ldquo;não&rdquo; no Chrome é permanente.
      </p>
    </Cartao>
  );
}

function Titulo() {
  return (
    <>
      <h2 className="text-lg font-bold">Avisos no celular</h2>
      <p className="mt-0.5 text-base text-tx-2">
        Vale só <b>neste aparelho</b>. Cada celular ou computador liga o seu.
      </p>
    </>
  );
}

function Cartao({ children }: { children: React.ReactNode }) {
  return <section className="max-w-[680px] rounded-lg bg-card p-5 shadow-card">{children}</section>;
}
