import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  MessageCircle,
  Mail,
  Loader2,
  AlertTriangle,
  Home,
  Plus,
  Trash2,
  Save,
  Clock,
  Wand2,
  ExternalLink,
  BellRing,
  Check,
  X,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { usePipelineStages, useTeamMap } from '@/hooks/useLeadsBoard';
import {
  useLead,
  useOrigemMeta,
  usePaginaDoLead,
  useTimeline,
  useInteresses,
  useSalvarLead,
  useAnotar,
  useInteresseActions,
  useBuscaImoveis,
  type PaginaDoLead,
} from '@/hooks/useLead';
import { StageChangeDialog } from '@/components/leads/StageChangeDialog';
import { Qualificacao } from '@/components/leads/Qualificacao';
import { SeloDeTemperatura } from '@/components/leads/SeloDeTemperatura';
import { ReminderDialog } from '@/components/reminders/ReminderDialog';
import { useLembretes, useCriarLembrete, useAcoesLembrete } from '@/hooks/useReminders';
import { diasDesde, tempoAte } from '@/hooks/useLeadPreview';
import type { PipelineStage, TeamMember } from '@/types/db';
import { brl, cn, initials, valoresDoImovel } from '@/lib/utils';
import {
  LEAD_SOURCE_LABEL_CURTO,
  LOSS_REASON_LABEL,
  atendeLead,
  parseReminderHint,
  REMINDER_STATUS_LABEL,
  SNOOZE_OPCOES,
  type DicaDeLembrete,
  ATTRIBUTION_METHOD_LABEL,
  type AttributionMethod,
  regiaoDoTelefone,
  PAISES_DO_TELEFONE,
} from '@contracts';

/**
 * Fuso da imobiliária.
 *
 * A coluna organizations.timezone existe desde a 001 e já vale
 * America/Sao_Paulo. O valor fica aqui como constante enquanto o produto
 * atende UMA imobiliária; quando atender várias, é daqui que se lê a coluna —
 * e nunca do fuso do navegador, porque o corretor pode estar viajando e o
 * cliente continua onde sempre esteve.
 */
const FUSO = 'America/Sao_Paulo';

type Aba = 'geral' | 'historico' | 'imoveis';

// A lista dos contratos. A cópia que morava aqui tinha ficado sem cinco origens
// (bio, Facebook, placa, Google, Marketplace), que apareciam com o código cru.
const ORIGEM: Record<string, string> = LEAD_SOURCE_LABEL_CURTO;

export default function LeadDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { profile } = useAuth();
  const orgId = profile?.organization_id;

  const aba = (params.get('aba') as Aba) ?? 'geral';
  const setAba = (a: Aba) => {
    const p = new URLSearchParams(params);
    p.set('aba', a);
    setParams(p, { replace: true });
  };

  const { data: lead, isLoading, isError } = useLead(id);
  const { data: origem } = useOrigemMeta(id, Boolean(lead?.ft_meta_ad_id));
  const { data: paginas } = usePaginaDoLead(id ? [id] : []);
  const pagina = id ? paginas?.[id] : undefined;
  const { data: etapas } = usePipelineStages(orgId);
  const { data: equipe } = useTeamMap(orgId);
  const salvar = useSalvarLead(id);

  const [pendente, setPendente] = useState<PipelineStage | null>(null);

  const etapa = etapas?.find((s) => s.id === lead?.stage_id);
  const responsavel = lead?.assigned_to ? equipe?.[lead.assigned_to] : undefined;

  if (isLoading) {
    return (
      <div className="grid place-items-center py-24">
        <Loader2 className="h-5 w-5 animate-spin text-pri" />
      </div>
    );
  }

  if (isError || !lead) {
    return (
      <div className="rounded-lg bg-dng-soft p-5 text-md text-dng">
        <strong className="block font-bold">Lead não encontrado.</strong>
        <Link to="/leads" className="mt-1 inline-block underline">
          Voltar ao funil
        </Link>
      </div>
    );
  }

  function pedirEtapa(stageId: string) {
    const destino = etapas?.find((s) => s.id === stageId);
    if (!destino || destino.id === lead?.stage_id) return;
    if (destino.requires_value || destino.requires_reason) {
      setPendente(destino);
      return;
    }
    salvar.mutate({ stage_id: stageId });
  }

  return (
    <div className="flex flex-col gap-4 pb-4">
      {/* cabeçalho */}
      <header className="flex flex-wrap items-start gap-4">
        <button
          onClick={() => navigate(-1)}
          aria-label="Voltar"
          className="mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-full border border-line-2 bg-card text-tx-2 transition-colors hover:border-pri hover:text-pri"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold leading-tight">{lead.full_name}</h1>
            <SeloDeTemperatura valor={lead.temperatura} manual={Boolean(lead.temperatura_manual)} />
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-base text-tx-2">
            {lead.phone && <span>{lead.phone}</span>}
            {lead.email && <span>{lead.email}</span>}
            {lead.city && <span>{lead.city}</span>}
            <span className="text-tx-3">{ORIGEM[lead.source] ?? lead.source}</span>
          </p>
        </div>

        {/*
          `w-full` no celular, e é ele que faz o cabeçalho caber.

          Sem isso, os três itens brigam por uma linha só: o bloco do título é
          `flex-1`, cuja base é ZERO, então ele nunca força a quebra — quem tem
          largura de verdade são os botões, e o nome fica com o farelo. Medido
          num aparelho de 390px: o título ficava com 36 pixels e "Rogério
          Nascimento da Silva" transbordava 98 pixels para a direita, passando
          por baixo do seletor de etapa e do botão verde.

          Com a largura cheia, o grupo não cabe ao lado de ninguém e desce
          inteiro. A partir de `sm` ele volta a dividir a linha com o nome.
        */}
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <select
            value={lead.stage_id}
            onChange={(e) => pedirEtapa(e.target.value)}
            aria-label="Etapa do funil"
            className="rounded-full border-2 bg-card px-3.5 py-2 text-base font-semibold outline-none"
            style={{ borderColor: etapa?.color, color: etapa?.color }}
          >
            {etapas?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>

          {lead.phone_e164 && (
            <a
              href={`https://wa.me/${lead.phone_e164.replace('+', '')}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full bg-ok px-4 py-2 text-base font-semibold text-white transition-opacity hover:opacity-90"
            >
              <MessageCircle className="h-3.5 w-3.5" />
              WhatsApp
            </a>
          )}
          {lead.email && (
            <a
              href={`mailto:${lead.email}`}
              aria-label="Enviar e-mail"
              className="grid h-9 w-9 place-items-center rounded-full border border-line-2 bg-card text-tx-2 transition-colors hover:border-pri hover:text-pri"
            >
              <Mail className="h-4 w-4" />
            </a>
          )}
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* coluna principal */}
        <section className="lg:col-span-2">
          <nav className="mb-3 flex gap-1 rounded-full bg-card-2 p-1">
            {(
              [
                ['geral', 'Visão geral'],
                ['historico', 'Histórico'],
                ['imoveis', 'Imóveis'],
              ] as const
            ).map(([k, rot]) => (
              <button
                key={k}
                onClick={() => setAba(k)}
                className={cn(
                  'flex-1 rounded-full py-2 text-base font-semibold transition-colors',
                  aba === k ? 'bg-card text-pri shadow-card' : 'text-tx-2 hover:text-tx',
                )}
              >
                {rot}
              </button>
            ))}
          </nav>

          {aba === 'geral' && <AbaGeral lead={lead} equipe={equipe ?? {}} />}
          {aba === 'historico' && <AbaHistorico leadId={id} pagina={pagina} />}
          {aba === 'imoveis' && <AbaImoveis leadId={id} orgId={orgId} />}
        </section>

        {/* lateral */}
        <aside className="flex flex-col gap-4">
          <Cartao titulo="De onde veio">
            <div className="flex flex-wrap gap-1.5">
              <Chip>{ORIGEM[lead.source] ?? lead.source}</Chip>
              {/* "Template C" não identifica nada numa carteira com dez
                  empreendimentos: a letra sozinha não diz de qual prédio. */}
              {pagina ? (
                <Chip tom="pri">{pagina.rotulo}</Chip>
              ) : (
                lead.ft_variant && <Chip tom="pri">Template {lead.ft_variant.toUpperCase()}</Chip>
              )}
              {lead.ft_locale && lead.ft_locale !== 'pt-BR' && <Chip tom="warn">{lead.ft_locale.toUpperCase()}</Chip>}
              {lead.attribution_method === 'none' && <Chip tom="dng">sem atribuição</Chip>}
            </div>

            <dl className="mt-3 flex flex-col gap-1.5 text-base">
              {/*
                O nome da campanha da META ganha do `utm_campaign` quando existe.
                Quem clica num anúncio de Click To WhatsApp nunca passa por uma
                URL, então não há UTM nenhuma — e era justamente o lead de
                anúncio, o que mais importa, que aparecia sem campanha.
              */}
              <Linha rotulo="Conta" valor={origem?.conta ?? null} />
              <Linha rotulo="Campanha" valor={origem?.campanha ?? lead.ft_utm_campaign} />
              <Linha rotulo="Conjunto" valor={origem?.conjunto ?? null} />
              <Linha rotulo="Anúncio" valor={origem?.anuncio ?? null} />
              <Linha rotulo="Origem UTM" valor={lead.ft_utm_source} />
              {/* O id fica, mas embaixo do nome: é o que se leva para o
                  Gerenciador quando o nome não basta. */}
              <Linha rotulo="ID do anúncio" valor={lead.ft_meta_ad_id} mono />
              <Linha
                rotulo="Método"
                valor={
                  ATTRIBUTION_METHOD_LABEL[lead.attribution_method as AttributionMethod] ??
                  lead.attribution_method
                }
              />
            </dl>

            {origem?.situacao && origem.situacao !== 'ACTIVE' && (
              <p className="mt-2 text-sm text-tx-3">
                Este anúncio está {origem.situacao.toLowerCase()} — o lead chegou enquanto ele rodava.
              </p>
            )}

            {pagina && (
              /* O corretor precisa VER o que a pessoa viu antes de escrever —
                 é sobre aquilo que ela vai perguntar. */
              <a
                href={pagina.url}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex items-center gap-1.5 text-base font-semibold text-pri hover:underline"
              >
                Abrir a página que ele viu
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}

            {lead.ab_contaminated && (
              <p className="mt-3 flex items-start gap-2 rounded-xl bg-warn-soft p-2.5 text-sm leading-snug text-warn">
                <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
                Viu {lead.variants_seen.length} templates diferentes. Fora da leitura do teste A/B — o
                resultado dele contaminaria a comparação.
              </p>
            )}
          </Cartao>

          <Cartao titulo="Jornada">
            <div className="grid grid-cols-3 gap-2">
              <Metrica rotulo="Entrou há" valor={`${diasDesde(lead.created_at) ?? 0}d`} />
              <Metrica
                rotulo="1º contato"
                valor={tempoAte(lead.created_at, lead.first_contact_at) ?? 'pendente'}
                alerta={!lead.first_contact_at}
              />
              <Metrica
                rotulo="Nesta etapa"
                valor={`${diasDesde(lead.stage_changed_at) ?? 0}d`}
                alerta={(diasDesde(lead.stage_changed_at) ?? 0) > 7}
              />
            </div>

            {lead.deal_value_cents != null && (
              <p className="mt-3 text-base text-tx-2">
                Valor do negócio
                <b className="ml-2 text-lg font-extrabold text-ok">
                  {brl.format(lead.deal_value_cents / 100)}
                </b>
              </p>
            )}

            {lead.loss_reason && (
              <p className="mt-3 rounded-xl bg-dng-soft p-2.5 text-sm text-dng">
                <b className="block font-bold">{LOSS_REASON_LABEL[lead.loss_reason]}</b>
                {lead.loss_reason_text}
              </p>
            )}
          </Cartao>

          <Cartao titulo="Responsável">
            {responsavel ? (
              <div className="flex items-center gap-2.5">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-pri-light to-pri-deep text-sm font-bold text-pri-fg">
                  {initials(responsavel.full_name)}
                </span>
                <span className="text-md font-semibold">{responsavel.full_name}</span>
              </div>
            ) : (
              <p className="text-base font-semibold text-warn">Sem responsável</p>
            )}

            <select
              value={lead.assigned_to ?? ''}
              onChange={(e) => salvar.mutate({ assigned_to: e.target.value || null })}
              aria-label="Definir responsável"
              className="mt-3 w-full rounded-xl border border-line-2 bg-card px-3 py-2 text-base outline-none focus:border-pri"
            >
              <option value="">Sem responsável</option>
              {Object.values(equipe ?? {}).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.full_name}
                </option>
              ))}
            </select>
          </Cartao>
        </aside>
      </div>

      {pendente && (
        <StageChangeDialog
          lead={lead}
          destino={pendente}
          onCancelar={() => setPendente(null)}
          onConfirmar={(dados) => {
            salvar.mutate({
              stage_id: pendente.id,
              ...(dados.valorCents !== undefined ? { deal_value_cents: dados.valorCents } : {}),
              ...(dados.motivo !== undefined ? { loss_reason: dados.motivo } : {}),
              ...(dados.motivoTexto !== undefined ? { loss_reason_text: dados.motivoTexto } : {}),
            });
            setPendente(null);
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ abas */

function AbaGeral({
  lead,
  equipe,
}: {
  lead: ReturnType<typeof useLead>['data'] & object;
  equipe: Record<string, TeamMember>;
}) {
  const salvar = useSalvarLead(lead.id);
  const anotar = useAnotar(lead.id);
  const [f, setF] = useState({
    full_name: lead.full_name,
    phone: lead.phone ?? '',
    phone_country: lead.phone_country,
    email: lead.email ?? '',
    city: lead.city ?? '',
  });
  // O que o telefone permite afirmar — estado e região, nunca a cidade.
  const regiao = regiaoDoTelefone(lead.phone_e164, lead.phone_country);
  const [nota, setNota] = useState('');
  const [lembrando, setLembrando] = useState<DicaDeLembrete | null | 'novo'>(null);

  const { profile } = useAuth();
  const criar = useCriarLembrete(lead.id, profile?.organization_id);

  // A frase vira SUGESTÃO, nunca lembrete automático. Um lembrete criado errado
  // por adivinhação de texto ensina o corretor a ignorar o sino — e o sino é um
  // só, então lead novo e mensagem morrem junto.
  const dica = useMemo(
    () => (nota.trim().length > 6 ? parseReminderHint(nota, new Date(), FUSO) : null),
    [nota],
  );

  const abrirLembrete = (d?: DicaDeLembrete) => {
    criar.reset();
    setLembrando(d ?? 'novo');
  };

  const mudou =
    f.full_name !== lead.full_name ||
    f.phone !== (lead.phone ?? '') ||
    f.phone_country !== lead.phone_country ||
    f.email !== (lead.email ?? '') ||
    f.city !== (lead.city ?? '');

  return (
    <div className="flex flex-col gap-4">
      <Qualificacao lead={lead} />

      <div className="rounded-lg bg-card p-5 shadow-card">
        <h2 className="mb-3 text-lg font-bold">Dados de contato</h2>
        <div className="grid gap-3 sm:grid-cols-4">
          <Campo className="sm:col-span-4" rotulo="Nome">
            <input value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} className={inputCls} />
          </Campo>
          <Campo rotulo="País">
            <select
              value={f.phone_country}
              onChange={(e) => setF({ ...f, phone_country: e.target.value })}
              className={inputCls}
            >
              {/*
                A lista sai do dicionário, e não de sete siglas escritas aqui.
                Com a lista curta, um lead boliviano — e existem nove — abria a
                ficha com o seletor em branco: o valor do banco não estava entre
                as opções. Salvar qualquer outro campo levava o país junto, de
                volta para o errado.
              */}
              {PAISES_DO_TELEFONE.map((p) => (
                <option key={p.codigo} value={p.codigo}>
                  {p.codigo} · {p.nome}
                </option>
              ))}
            </select>
          </Campo>
          <Campo className="sm:col-span-3" rotulo="Telefone">
            <input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} className={inputCls} />
          </Campo>
          <Campo className="sm:col-span-2" rotulo="E-mail">
            <input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} className={inputCls} />
          </Campo>
          <Campo className="sm:col-span-2" rotulo="Cidade">
            <input
              value={f.city}
              maxLength={80}
              onChange={(e) => setF({ ...f, city: e.target.value })}
              placeholder="A que a pessoa informar"
              className={inputCls}
            />
          </Campo>
        </div>

        {lead.phone_e164 && (
          <p className="mt-2 font-mono text-sm text-tx-3">
            Normalizado: {lead.phone_e164}
          </p>
        )}
        {/*
          A região aparece como DICA, nunca dentro do campo. Preencher "Chapecó"
          a partir do 49 para alguém de Lages seria gravar dado inventado — e a
          planilha exportada o levaria adiante como se alguém tivesse perguntado.
        */}
        {!f.city.trim() && regiao && (
          <p className="mt-1 text-sm text-tx-3">
            Cidade não informada. Pelo telefone: {regiao}.
          </p>
        )}
        {f.phone && !lead.phone_e164 && (
          <p className="mt-2 flex items-center gap-1.5 text-sm text-warn">
            <AlertTriangle className="h-3.5 w-3.5" />
            Telefone não reconhecido para o país {f.phone_country} — o lead fica fora da deduplicação.
          </p>
        )}

        {mudou && (
          <button
            onClick={() =>
              salvar.mutate({
                full_name: f.full_name.trim(),
                phone: f.phone.trim() || null,
                phone_country: f.phone_country,
                email: f.email.trim() || null,
                city: f.city.trim() || null,
              })
            }
            disabled={salvar.isPending}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-pri px-4 py-2.5 text-md font-semibold text-pri-fg hover:bg-pri-deep disabled:opacity-60"
          >
            {salvar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar alterações
          </button>
        )}
      </div>

      <div className="rounded-lg bg-card p-5 shadow-card">
        <h2 className="mb-1 text-lg font-bold">Anotação</h2>
        <p className="mb-3 text-sm text-tx-3">
          Cada anotação entra no histórico com autor e data, em vez de sobrescrever a anterior.
        </p>
        <textarea
          rows={3}
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          placeholder="Cliente pediu para retornar depois das 18h…"
          className={cn(inputCls, 'resize-none')}
        />
        {dica && (
          <button
            type="button"
            onClick={() => abrirLembrete(dica)}
            className="mt-3 flex w-full items-start gap-2 rounded-xl bg-pri-soft p-3 text-left text-sm leading-snug text-pri transition-colors hover:brightness-95"
          >
            <Wand2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Li <b>“{dica.trecho}”</b> aqui. Quer que eu te lembre em{' '}
              <b>{dica.remindAt.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</b>?
            </span>
          </button>
        )}

        <button
          disabled={!nota.trim() || anotar.isPending}
          onClick={() => anotar.mutate(nota.trim(), { onSuccess: () => setNota('') })}
          className="mt-3 inline-flex items-center gap-2 rounded-xl bg-pri px-4 py-2 text-base font-semibold text-pri-fg hover:bg-pri-deep disabled:opacity-40"
        >
          {anotar.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Registrar
        </button>
      </div>

      <Lembretes leadId={lead.id} abrir={() => abrirLembrete()} />

      {lembrando && profile && (
        <ReminderDialog
          lead={lead}
          equipe={Object.values(equipe).filter((m) => m.role && atendeLead(m.role))}
          euId={profile.id}
          fuso={FUSO}
          dica={lembrando === 'novo' ? null : lembrando}
          salvando={criar.isPending}
          erro={criar.error ? (criar.error as Error).message : null}
          onCancelar={() => setLembrando(null)}
          onConfirmar={(l) =>
            criar.mutate(l, {
              onSuccess: () => {
                setLembrando(null);
                // A anotação que gerou a sugestão vira histórico junto, senão o
                // contexto do lembrete se perde na ficha.
                if (nota.trim()) anotar.mutate(nota.trim(), { onSuccess: () => setNota('') });
              },
            })
          }
        />
      )}

      {Object.keys(equipe).length === 0 && null}
    </div>
  );
}

function AbaHistorico({ leadId, pagina }: { leadId: string; pagina?: PaginaDoLead }) {
  const { data, isLoading } = useTimeline(leadId);

  if (isLoading) {
    return (
      <div className="grid place-items-center py-16">
        <Loader2 className="h-4 w-4 animate-spin text-pri" />
      </div>
    );
  }

  if (!data?.length) {
    return <p className="rounded-lg bg-card p-6 text-center text-md text-tx-3 shadow-card">Sem histórico ainda.</p>;
  }

  return (
    <ol className="rounded-lg bg-card p-5 shadow-card">
      {data.map((e, i) => (
        <li key={e.id} className="relative flex gap-3 pb-4 last:pb-0">
          <div className="flex flex-col items-center">
            <span className={cn('mt-1 h-2.5 w-2.5 shrink-0 rounded-full', CATEGORIA_COR[e.category] ?? 'bg-tx-3')} />
            {i < data.length - 1 && <span className="mt-1 w-px flex-1 bg-line" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-md font-semibold leading-snug">{e.title}</p>
            {e.description && <p className="mt-0.5 text-base text-tx-2">{e.description}</p>}

            {/*
              "Lead criado · Sistema" não dizia de onde. Aqui a linha ganha a
              página, com link: o corretor abre exatamente o que a pessoa estava
              olhando quando resolveu escrever — é sobre aquilo que ela pergunta.
            */}
            {pagina && e.category === 'lead' && e.event_type === 'created' && (
              <a
                href={pagina.url}
                target="_blank"
                rel="noreferrer"
                className="mt-0.5 inline-flex items-center gap-1.5 text-base font-semibold text-pri hover:underline"
              >
                Veio de {pagina.rotulo}
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-tx-3">
              <Clock className="h-3 w-3" />
              {new Date(e.occurred_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
              {e.actor_label && ` · ${e.actor_label}`}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

const CATEGORIA_COR: Record<string, string> = {
  lead: 'bg-pri',
  etapa: 'bg-pri-light',
  marketing: 'bg-warn',
  visita: 'bg-ok',
  imovel: 'bg-ok',
  mensagem: 'bg-tx-3',
  documento: 'bg-tx-3',
  tarefa: 'bg-warn',
  sistema: 'bg-tx-3',
};

function AbaImoveis({ leadId, orgId }: { leadId: string; orgId: string | undefined }) {
  const { data: interesses } = useInteresses(leadId);
  const { adicionar, remover } = useInteresseActions(leadId, orgId);
  const [termo, setTermo] = useState('');
  const [busca, setBusca] = useState('');
  const { data: achados } = useBuscaImoveis(busca);

  useEffect(() => {
    const t = setTimeout(() => setBusca(termo), 300);
    return () => clearTimeout(t);
  }, [termo]);

  const jaVinculados = useMemo(
    () => new Set((interesses ?? []).map((i) => i.property_id)),
    [interesses],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg bg-card p-5 shadow-card">
        <h2 className="mb-3 text-lg font-bold">Imóveis de interesse</h2>

        {!interesses?.length && (
          <p className="text-base text-tx-3">Nenhum imóvel vinculado.</p>
        )}

        <ul className="flex flex-col gap-2">
          {interesses?.map((i) => (
            <li key={i.id} className="flex items-center gap-3 rounded-xl bg-card-2 px-3.5 py-2.5">
              <Home className="h-4 w-4 shrink-0 text-tx-3" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-md font-semibold">{i.properties?.title ?? '—'}</p>
                <p className="text-sm text-tx-3">
                  {i.properties?.neighborhood}
                  {i.properties?.public_code && ` · ${i.properties.public_code}`}
                </p>
              </div>
              {/* Pelo regime e, no empreendimento, com as disponíveis: "A partir de R$ X · N disponíveis". */}
              {i.properties && valoresDoImovel(i.properties).length > 0 && (
                <span className="shrink-0 text-right text-base font-bold text-ok">
                  {valoresDoImovel(i.properties).join(' · ')}
                </span>
              )}
              <button
                onClick={() => remover.mutate(i.id)}
                aria-label="Remover interesse"
                className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-tx-3 transition-colors hover:bg-dng-soft hover:text-dng"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-lg bg-card p-5 shadow-card">
        <h2 className="mb-3 text-lg font-bold">Vincular imóvel</h2>
        <input
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          placeholder="Buscar por título, bairro ou código"
          className={inputCls}
        />

        {achados && achados.length > 0 && (
          <ul className="mt-3 flex flex-col gap-1.5">
            {achados.map((p) => (
              <li key={p.id}>
                <button
                  disabled={jaVinculados.has(p.id)}
                  onClick={() => adicionar.mutate({ id: p.id, title: p.title })}
                  className="flex w-full items-center gap-3 rounded-xl border border-line px-3.5 py-2.5 text-left transition-colors hover:border-pri disabled:opacity-40"
                >
                  <Plus className="h-3.5 w-3.5 shrink-0 text-pri" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-md font-semibold">{p.title}</span>
                    <span className="block text-sm text-tx-3">
                      {p.neighborhood} · {p.public_code}
                    </span>
                  </span>
                  {valoresDoImovel(p).length > 0 && (
                    <span className="shrink-0 text-right text-base font-bold text-tx-2">
                      {valoresDoImovel(p).join(' · ')}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- auxiliares */

const inputCls =
  'w-full rounded-xl border border-line-2 bg-card-2 px-3 py-2.5 text-md outline-none transition-colors focus:border-pri';

function Campo({ rotulo, children, className }: { rotulo: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn('flex flex-col gap-1.5', className)}>
      <span className="text-sm font-semibold text-tx-2">{rotulo}</span>
      {children}
    </label>
  );
}

function Cartao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-card p-4 shadow-card">
      <h2 className="mb-2.5 text-xs font-bold uppercase text-tx-3">{titulo}</h2>
      {children}
    </div>
  );
}

function Chip({ children, tom }: { children: React.ReactNode; tom?: 'pri' | 'warn' | 'dng' }) {
  const cores = { pri: 'bg-pri-soft text-pri', warn: 'bg-warn-soft text-warn', dng: 'bg-dng-soft text-dng' };
  return (
    <span className={cn('rounded px-2 py-0.5 text-xs font-bold', tom ? cores[tom] : 'bg-card-2 text-tx-2')}>
      {children}
    </span>
  );
}

function Linha({ rotulo, valor, mono }: { rotulo: string; valor: string | null; mono?: boolean }) {
  if (!valor) return null;
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-tx-3">{rotulo}</dt>
      <dd className={cn('min-w-0 truncate text-right font-medium', mono && 'font-mono text-sm')}>{valor}</dd>
    </div>
  );
}

function Metrica({ rotulo, valor, alerta }: { rotulo: string; valor: string; alerta?: boolean }) {
  return (
    <div className="rounded-xl bg-card-2 px-2 py-2 text-center">
      <p className="text-2xs font-semibold uppercase text-tx-3">{rotulo}</p>
      <p className={cn('mt-0.5 text-md font-bold tabular-nums', alerta ? 'text-dng' : 'text-tx')}>{valor}</p>
    </div>
  );
}

/**
 * Os lembretes do lead.
 *
 * Adiar soma no contador em vez de criar linha nova: um retorno adiado quatro
 * vezes é um sinal de que o lead esfriou, e essa informação some se cada
 * adiamento virar um lembrete novo.
 */
function Lembretes({ leadId, abrir }: { leadId: string; abrir: () => void }) {
  const { data, isLoading } = useLembretes(leadId);
  const { concluir, cancelar, adiar } = useAcoesLembrete(leadId);

  const lista = data ?? [];
  const abertos = lista.filter((l) => l.status === 'pendente' || l.status === 'notificado');
  const fechados = lista.filter((l) => l.status === 'concluido' || l.status === 'cancelado');

  return (
    <div className="rounded-lg bg-card p-5 shadow-card">
      <div className="mb-3 flex items-center gap-3">
        <h2 className="text-lg font-bold">Lembretes</h2>
        <button
          onClick={abrir}
          className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-line-2 bg-card px-3.5 py-1.5 text-sm font-semibold text-tx-2 transition-colors hover:border-pri hover:text-pri"
        >
          <BellRing className="h-3.5 w-3.5" />
          Lembrar-me
        </button>
      </div>

      {isLoading && <p className="text-base text-tx-3">Carregando…</p>}

      {!isLoading && lista.length === 0 && (
        <p className="rounded-xl border border-dashed border-line-2 p-4 text-center text-base text-tx-3">
          Nenhum retorno marcado. Escreva “retornar depois das 18h” na anotação e eu sugiro um.
        </p>
      )}

      {abertos.map((l) => {
        const quando = new Date(l.remind_at);
        const atrasado = quando < new Date();
        return (
          <article key={l.id} className="mb-2 rounded-xl border border-line-2 p-3 last:mb-0">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <b className="text-base font-bold">{l.title}</b>
              <span
                className={cn(
                  'rounded px-1.5 py-0.5 text-2xs font-bold',
                  atrasado ? 'bg-dng-soft text-dng' : 'bg-pri-soft text-pri',
                )}
              >
                {atrasado ? 'atrasado' : REMINDER_STATUS_LABEL[l.status]}
              </span>
              <time className="ml-auto text-sm text-tx-3">
                {quando.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
              </time>
            </div>

            {l.body && <p className="mt-1 text-sm text-tx-2">{l.body}</p>}

            {l.snooze_count > 0 && (
              <p className="mt-1 text-sm text-warn">
                Adiado {l.snooze_count}× — talvez o lead tenha esfriado.
              </p>
            )}

            <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-line pt-2.5">
              <button
                onClick={() => concluir.mutate(l.id)}
                className="inline-flex items-center gap-1 rounded px-2 py-1 text-sm font-bold text-ok hover:bg-ok-soft"
              >
                <Check className="h-3 w-3" />
                Concluir
              </button>

              {SNOOZE_OPCOES.map((m) => (
                <button
                  key={m}
                  onClick={() => adiar.mutate({ id: l.id, minutos: m })}
                  className="rounded px-2 py-1 text-sm font-semibold text-tx-3 hover:bg-card-2 hover:text-tx"
                >
                  +{m < 60 ? `${m}min` : m < 1440 ? `${m / 60}h` : '1d'}
                </button>
              ))}

              <button
                onClick={() => cancelar.mutate(l.id)}
                className="ml-auto inline-flex items-center gap-1 rounded px-2 py-1 text-sm font-semibold text-tx-3 hover:bg-dng-soft hover:text-dng"
              >
                <X className="h-3 w-3" />
                Cancelar
              </button>
            </div>
          </article>
        );
      })}

      {fechados.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-sm font-semibold text-tx-3">
            {fechados.length} encerrado{fechados.length > 1 ? 's' : ''}
          </summary>
          <div className="mt-2 flex flex-col gap-1">
            {fechados.map((l) => (
              <p key={l.id} className="flex items-baseline gap-2 text-sm text-tx-3">
                <span className="truncate">{l.title}</span>
                <span className="ml-auto shrink-0">{REMINDER_STATUS_LABEL[l.status]}</span>
              </p>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
