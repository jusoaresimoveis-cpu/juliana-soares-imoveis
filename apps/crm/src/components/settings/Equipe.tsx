import { useState } from 'react';
import { Loader2, UserPlus, AlertCircle, ShieldCheck, KeyRound } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import {
  useEquipe,
  useAcoesEquipe,
  useRedefinirSenha,
  type ContaCriada,
  type SenhaRedefinida,
} from '@/hooks/useEquipe';
import { APP_ROLES, ROLE_LABEL, ROLE_DESCRIPTION, papelPrincipal, type AppRole } from '@contracts';
import { cn, initials } from '@/lib/utils';
import { DialogoNovaConta } from './DialogoNovaConta';
import { SenhaEmTela } from './SenhaEmTela';

export function Equipe() {
  const { profile, roles } = useAuth();
  const orgId = profile?.organization_id;
  const meuPapel = papelPrincipal(roles);
  const souAdmin = meuPapel === 'admin';

  const equipe = useEquipe(orgId);
  const { trocarPapel, alternarAtivo } = useAcoesEquipe(orgId);
  const redefinir = useRedefinirSenha();
  const [criando, setCriando] = useState(false);
  const [criada, setCriada] = useState<ContaCriada | null>(null);
  const [redefinida, setRedefinida] = useState<SenhaRedefinida | null>(null);
  /*
   * Confirmação por LINHA, e não um `confirm()` do navegador.
   *
   * O botão fica encostado no "Desativar", e redefinir senha por engano derruba
   * o acesso de alguém que está atendendo. Guardar o id de quem está sendo
   * confirmado troca o botão só naquela linha — sem modal, e sem chance de a
   * confirmação cair na pessoa errada, que é o que aconteceria com um booleano.
   */
  const [confirmando, setConfirmando] = useState<string | null>(null);

  if (meuPapel !== 'admin' && meuPapel !== 'gerente') {
    return (
      <Cartao>
        <p className="text-base text-tx-2">
          A gestão de equipe é de gerente e administrador. Seu perfil é {ROLE_LABEL[meuPapel ?? 'corretor']}.
        </p>
      </Cartao>
    );
  }

  const lista = equipe.data ?? [];
  const ativos = lista.filter((m) => m.is_active);
  const inativos = lista.filter((m) => !m.is_active);

  return (
    <div className="flex flex-col gap-4">
      {criada && (
        <SenhaEmTela
          titulo="Conta criada"
          descricao={
            <>
              Passe estes dados para <b>{criada.email}</b>. A senha não aparece de novo.
            </>
          }
          senha={criada.senhaTemporaria}
          onFechar={() => setCriada(null)}
        />
      )}

      {redefinida && (
        <SenhaEmTela
          titulo="Senha redefinida"
          descricao={
            <>
              Entregue a <b>{redefinida.nome ?? 'a pessoa'}</b> e peça para trocar em Configurações →
              Senha. Ela não aparece de novo.
            </>
          }
          senha={redefinida.senhaTemporaria}
          onFechar={() => setRedefinida(null)}
        />
      )}

      <Cartao>
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <div>
            <h2 className="text-lg font-bold">Equipe</h2>
            <p className="mt-0.5 text-base text-tx-2">
              {ativos.length} {ativos.length === 1 ? 'pessoa ativa' : 'pessoas ativas'}
              {inativos.length > 0 && ` · ${inativos.length} inativa${inativos.length > 1 ? 's' : ''}`}
            </p>
          </div>
          <button
            onClick={() => setCriando(true)}
            className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-pri px-4 py-2 text-base font-semibold text-pri-fg hover:bg-pri-deep"
          >
            <UserPlus className="h-3.5 w-3.5" />
            Adicionar
          </button>
        </div>

        {equipe.isLoading && (
          <p className="flex items-center gap-2 py-6 text-base text-tx-3">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando…
          </p>
        )}

        {[...ativos, ...inativos].map((m) => {
          const euMesmo = m.id === profile?.id;
          // O gatilho da 007 recusa de qualquer forma; a tela evita oferecer o
          // que vai ser negado.
          const podeMexerNoPapel = souAdmin || (m.role !== 'admin' && !euMesmo);

          return (
            <div
              key={m.id}
              className={cn(
                'flex flex-wrap items-center gap-3 border-b border-line py-3 last:border-0',
                !m.is_active && 'opacity-55',
              )}
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-pri-light to-pri-deep text-xs font-bold text-pri-fg">
                {initials(m.full_name)}
              </span>

              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 truncate text-base font-bold">
                  {m.full_name}
                  {euMesmo && <span className="text-sm font-semibold text-tx-3">(você)</span>}
                  {!m.is_active && (
                    <span className="rounded bg-card-2 px-1.5 py-0.5 text-2xs font-bold text-tx-3">
                      inativo
                    </span>
                  )}
                </p>
                <p className="truncate text-sm text-tx-3">
                  {m.email}
                  {m.creci && ` · CRECI ${m.creci}`}
                </p>
              </div>

              {/*
                Os controles num grupo só, e de largura cheia no celular.

                Soltos, eles dividiam a linha com o bloco do nome — que é
                `flex-1`, de base zero, e por isso nunca força a quebra: o nome e
                o e-mail ficavam com uns vinte pixels e viravam reticências. O
                mesmo defeito do cabeçalho da ficha do lead.
              */}
              <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                <select
                  value={m.role ?? 'corretor'}
                  disabled={!podeMexerNoPapel || trocarPapel.isPending}
                  onChange={(e) => trocarPapel.mutate({ userId: m.id, papel: e.target.value as AppRole })}
                  className="rounded-full border border-line-2 bg-card px-3 py-1.5 text-sm font-semibold outline-none focus:border-pri disabled:opacity-50"
                >
                  {APP_ROLES.map((r) => (
                    <option key={r} value={r} disabled={r === 'admin' && !souAdmin}>
                      {ROLE_LABEL[r]}
                    </option>
                  ))}
                </select>

                {/*
                  Só para quem está ATIVO. Senha nova para conta desativada é
                  credencial que não abre nada — e a pessoa ainda ia guardá-la
                  achando que abre. Quem voltou, reativa primeiro.

                  A mesma regra de papel vale aqui, e o servidor a repete: gerente
                  não redefine senha de administrador, senão o painel tem uma
                  escada para virar admin.
                */}
                {m.is_active && podeMexerNoPapel && !euMesmo && (
                  confirmando === m.id ? (
                    <span className="flex items-center gap-1.5">
                      <button
                        onClick={() => {
                          redefinir.mutate(m.id, {
                            onSuccess: (r) => {
                              setRedefinida(r);
                              setConfirmando(null);
                            },
                          });
                        }}
                        disabled={redefinir.isPending}
                        className="inline-flex items-center gap-1.5 rounded-full border border-dng px-3 py-1.5 text-sm font-semibold text-dng hover:bg-dng-soft disabled:opacity-40"
                      >
                        {redefinir.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                        Confirmar
                      </button>
                      <button
                        onClick={() => setConfirmando(null)}
                        className="rounded-full px-2 py-1.5 text-sm font-semibold text-tx-3 hover:text-tx"
                      >
                        Cancelar
                      </button>
                    </span>
                  ) : (
                    <button
                      onClick={() => setConfirmando(m.id)}
                      title={`Gerar nova senha para ${m.full_name}`}
                      className="inline-flex items-center gap-1.5 rounded-full border border-line-2 px-3 py-1.5 text-sm font-semibold text-tx-2 transition-colors hover:border-pri hover:text-pri"
                    >
                      <KeyRound className="h-3.5 w-3.5" />
                      Nova senha
                    </button>
                  )
                )}

                <button
                  onClick={() => alternarAtivo.mutate({ userId: m.id, ativo: !m.is_active })}
                  disabled={euMesmo || alternarAtivo.isPending}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors disabled:opacity-40',
                    m.is_active
                      ? 'border-line-2 text-tx-2 hover:border-dng hover:text-dng'
                      : 'border-ok text-ok hover:bg-ok-soft',
                  )}
                >
                  {m.is_active ? 'Desativar' : 'Reativar'}
                </button>
              </div>
            </div>
          );
        })}

        {(trocarPapel.isError || alternarAtivo.isError || redefinir.isError) && (
          <p className="mt-3 flex items-start gap-2 rounded-xl bg-dng-soft p-3 text-sm text-dng">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {((trocarPapel.error ?? alternarAtivo.error ?? redefinir.error) as Error).message}
          </p>
        )}

        <p className="mt-4 border-t border-line pt-3 text-sm text-tx-3">
          Quem sai é <b>desativado</b>, nunca apagado: ele continua sendo o autor das anotações e o
          responsável pelas visitas que fez, e é esse histórico que responde quem trouxe cada cliente.
        </p>
      </Cartao>

      <Cartao>
        <h2 className="mb-2 text-lg font-bold">O que cada papel faz</h2>
        {APP_ROLES.map((r) => (
          <div key={r} className="border-b border-line py-2 last:border-0">
            <p className="flex items-center gap-1.5 text-base font-bold">
              <ShieldCheck className="h-3.5 w-3.5 text-pri" />
              {ROLE_LABEL[r]}
            </p>
            <p className="mt-0.5 text-sm text-tx-2">{ROLE_DESCRIPTION[r]}</p>
          </div>
        ))}
      </Cartao>

      {criando && (
        <DialogoNovaConta
          souAdmin={souAdmin}
          orgId={orgId}
          onFechar={() => setCriando(false)}
          onCriada={(c) => {
            setCriando(false);
            setCriada(c);
          }}
        />
      )}
    </div>
  );
}

function Cartao({ children }: { children: React.ReactNode }) {
  return <section className="max-w-[680px] rounded-lg bg-card p-5 shadow-card">{children}</section>;
}
