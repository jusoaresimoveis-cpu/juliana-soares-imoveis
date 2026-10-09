import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Check, Volume2, VolumeX } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import {
  usePreferencias,
  useSalvarPreferencias,
  useCobrancaDeResposta,
  useSalvarCobrancaDeResposta,
} from '@/hooks/useSettings';
import {
  papelPrincipal,
  LEAD_SCOPE_LABEL,
  alcancesDisponiveis,
  NOTIFICATION_TYPES,
  NOTIFICATION_META,
  NOTIFICATION_SOUNDS,
  AVISO_ESPERA_OPCOES,
  AVISO_ESPERA_JANELA,
  rotuloDoAvisoDeEspera,
  type LeadScope,
  type NotificationType,
} from '@contracts';
import { Equipe } from '@/components/settings/Equipe';
import { AvisosNoCelular } from '@/components/settings/AvisosNoCelular';
import { CartaoInstalarApp } from '@/components/InstalarApp';
import { WhatsApp } from '@/components/settings/WhatsApp';
import { Perfil } from '@/components/settings/Perfil';
import { Senha } from '@/components/settings/SenhaDaConta';
import { Cartao, Carregando, Erro } from '@/components/settings/PecasDasConfiguracoes';
import { somLigado, definirSom, ouvir } from '@/lib/notificationSounds';
import { cn } from '@/lib/utils';

const ABAS = [
  { key: 'perfil', label: 'Perfil' },
  { key: 'notificacoes', label: 'Notificações' },
  { key: 'senha', label: 'Senha' },
  { key: 'equipe', label: 'Equipe' },
  { key: 'whatsapp', label: 'WhatsApp' },
] as const;

type Aba = (typeof ABAS)[number]['key'];

export default function Settings() {
  const [params, setParams] = useSearchParams();
  const aba = (params.get('aba') as Aba) ?? 'perfil';

  return (
    <div className="flex h-full flex-col gap-4">
      <header>
        <h1 className="text-2xl font-bold">Configurações</h1>
        <p className="mt-0.5 text-base text-tx-2">Seu perfil, seus avisos e sua senha.</p>
      </header>

      <nav className="flex gap-1 border-b border-line">
        {ABAS.map((a) => (
          <button
            key={a.key}
            onClick={() => {
              const p = new URLSearchParams(params);
              p.set('aba', a.key);
              setParams(p, { replace: true });
            }}
            className={cn(
              '-mb-px border-b-2 px-3.5 py-2 text-base font-semibold transition-colors',
              aba === a.key
                ? 'border-pri text-pri'
                : 'border-transparent text-tx-2 hover:text-tx',
            )}
          >
            {a.label}
          </button>
        ))}
      </nav>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {aba === 'perfil' && <Perfil />}
        {aba === 'notificacoes' && <Notificacoes />}
        {aba === 'senha' && <Senha />}
        {aba === 'equipe' && <Equipe />}
        {aba === 'whatsapp' && <WhatsApp />}
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------

function Notificacoes() {
  const { profile, roles } = useAuth();
  const papel = papelPrincipal(roles) ?? 'corretor';
  const prefs = usePreferencias(profile?.id, profile?.organization_id);
  const salvar = useSalvarPreferencias(profile?.id ?? '', profile?.organization_id ?? '');
  const [som, setSom] = useState(somLigado);

  if (!profile || prefs.isLoading) return <Carregando />;
  if (!prefs.data) return <Erro texto="Não foi possível carregar suas preferências." />;

  const p = prefs.data;
  const opcoes = alcancesDisponiveis(papel);

  const alternarTipo = (t: NotificationType) => {
    const mudos = p.muted_types.includes(t)
      ? p.muted_types.filter((x) => x !== t)
      : [...p.muted_types, t];
    salvar.mutate({ muted_types: mudos });
  };

  return (
    <div className="flex flex-col gap-4">
      <Cartao>
        <h2 className="text-lg font-bold">De quais leads quero saber</h2>
        <p className="mt-0.5 text-base text-tx-2">
          {papel === 'corretor'
            ? 'Seu perfil recebe avisos da própria carteira.'
            : 'Como gestor, você pode acompanhar a operação inteira.'}
        </p>

        <div className="mt-3 flex flex-col gap-2">
          {opcoes.map((o: LeadScope) => (
            <label
              key={o}
              className={cn(
                'flex cursor-pointer items-center gap-2.5 rounded-xl border p-3 transition-colors',
                p.lead_scope === o ? 'border-pri bg-pri-soft/40' : 'border-line-2 hover:border-pri/40',
              )}
            >
              <input
                type="radio"
                name="alcance"
                checked={p.lead_scope === o}
                onChange={() => salvar.mutate({ lead_scope: o })}
                className="accent-pri"
              />
              <span className="text-base font-semibold">{LEAD_SCOPE_LABEL[o]}</span>
            </label>
          ))}
        </div>

        {papel === 'corretor' && (
          <p className="mt-2.5 text-sm text-tx-3">
            Receber aviso de todos os leads é exclusivo de gerente. A carteira dos colegas não
            aparece aqui.
          </p>
        )}
      </Cartao>

      <Cartao>
        <h2 className="text-lg font-bold">O que me avisa</h2>
        <p className="mt-0.5 text-base text-tx-2">Desligue o que virar ruído.</p>

        <div className="mt-3 flex flex-col gap-1.5">
          {NOTIFICATION_TYPES.map((t) => {
            const ligado = !p.muted_types.includes(t);
            return (
              <label
                key={t}
                className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-line-2 p-3"
              >
                <span className="text-base font-semibold">{NOTIFICATION_META[t].label}</span>
                <input
                  type="checkbox"
                  checked={ligado}
                  onChange={() => alternarTipo(t)}
                  className="h-4 w-4 accent-pri"
                />
              </label>
            );
          })}
        </div>
      </Cartao>

      {/* Combinação da casa, e não preferência de quem está olhando: fica atrás
          do papel, como a RLS de `organizations`. */}
      {(papel === 'gerente' || papel === 'admin') && (
        <CobrancaDeResposta orgId={profile.organization_id} />
      )}

      {/* Antes do aviso no celular de propósito: no iPhone, instalar é
          pré-requisito do push, não preferência. */}
      <CartaoInstalarApp />

      <AvisosNoCelular />

      <Cartao>
        <h2 className="text-lg font-bold">Som</h2>
        <p className="mt-0.5 text-base text-tx-2">
          Vale só <b>neste aparelho</b>. Desligar aqui não desliga no celular — som depende de onde
          você está, não da sua conta.
        </p>

        <label className="mt-3 flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-line-2 p-3">
          <span className="flex items-center gap-2 text-base font-semibold">
            {som ? <Volume2 className="h-4 w-4 text-pri" /> : <VolumeX className="h-4 w-4 text-tx-3" />}
            Tocar som ao receber
          </span>
          <input
            type="checkbox"
            checked={som}
            onChange={(e) => {
              setSom(e.target.checked);
              definirSom(e.target.checked);
              if (e.target.checked) ouvir('lead');
            }}
            className="h-4 w-4 accent-pri"
          />
        </label>

        <p className="mb-2 mt-4 text-sm font-semibold text-tx-2">Ouvir cada um</p>
        <div className="flex flex-wrap gap-2">
          {NOTIFICATION_SOUNDS.map((s) => (
            <button
              key={s}
              type="button"
              // Ignora o mudo de propósito: botão de teste que não toca parece quebrado.
              onClick={() => ouvir(s)}
              className="rounded-full border border-line-2 bg-card px-3.5 py-1.5 text-sm font-semibold capitalize text-tx-2 hover:border-pri hover:text-pri"
            >
              {s}
            </button>
          ))}
        </div>
      </Cartao>

      {salvar.isError && <Erro texto={(salvar.error as Error).message} />}
      {salvar.isSuccess && !salvar.isPending && (
        <p className="flex items-center gap-1.5 text-sm font-semibold text-ok">
          <Check className="h-3.5 w-3.5" />
          Salvo
        </p>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------

/**
 * Depois de quanto tempo o CRM cobra a casa por um cliente sem resposta.
 *
 * Um botão por opção, e não um campo de digitar: o número não é livre (o banco
 * aceita de 1 a 72) e "quanto tempo é demais" é uma escolha entre poucas, não
 * uma medida. Salva no clique — não há o que revisar antes.
 */
function CobrancaDeResposta({ orgId }: { orgId: string }) {
  const atual = useCobrancaDeResposta(orgId);
  const salvar = useSalvarCobrancaDeResposta(orgId);

  if (atual.isLoading) return <Carregando />;

  const valor = atual.data ?? null;

  return (
    <Cartao>
      <h2 className="text-lg font-bold">Cobrar resposta</h2>
      <p className="mt-0.5 text-base text-tx-2">
        Quando um cliente escreve e ninguém volta, o CRM avisa quem atende. Vale para a
        imobiliária inteira.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        {AVISO_ESPERA_OPCOES.map((h) => {
          const escolhida = valor === h;
          return (
            <button
              key={String(h)}
              type="button"
              disabled={salvar.isPending}
              onClick={() => salvar.mutate(h)}
              className={cn(
                'rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors disabled:opacity-60',
                escolhida
                  ? 'border-pri bg-pri-soft/40 text-pri'
                  : 'border-line-2 bg-card text-tx-2 hover:border-pri/40',
              )}
            >
              {rotuloDoAvisoDeEspera(h)}
            </button>
          );
        })}
      </div>

      <p className="mt-3 text-sm text-tx-3">
        O aviso sai <b>uma vez por espera</b>, e só das {AVISO_ESPERA_JANELA.inicio}h às{' '}
        {AVISO_ESPERA_JANELA.fim}h — o que estourar de madrugada toca de manhã. Lead fechado ou
        perdido não é cobrado. Para não receber, cada um desliga “Sem resposta” na lista acima.
      </p>

      {salvar.isError && <Erro texto={(salvar.error as Error).message} />}
    </Cartao>
  );
}
