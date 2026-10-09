import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, MessageCircle, Mail, Loader2, AlertTriangle, Save } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { usePipelineStages, useTeamMap } from '@/hooks/useLeadsBoard';
import { useLead, useOrigemMeta, usePaginaDoLead, useSalvarLead } from '@/hooks/useLead';
import { StageChangeDialog } from '@/components/leads/StageChangeDialog';
import { Qualificacao } from '@/components/leads/Qualificacao';
import { SeloDeTemperatura } from '@/components/leads/SeloDeTemperatura';
import { LateralDoLead } from '@/components/leads/LateralDoLead';
import { AbaHistorico } from '@/components/leads/AbaHistorico';
import { AbaImoveis } from '@/components/leads/AbaImoveis';
import { AnotacaoDoLead } from '@/components/leads/AnotacaoDoLead';
import { Campo, inputCls } from '@/components/leads/CampoDaFicha';
import type { PipelineStage, TeamMember } from '@/types/db';
import { cn } from '@/lib/utils';
import { LEAD_SOURCE_LABEL_CURTO, regiaoDoTelefone, PAISES_DO_TELEFONE } from '@contracts';

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
        <LateralDoLead
          lead={lead}
          origem={origem}
          pagina={pagina}
          responsavel={responsavel}
          equipe={equipe}
          salvar={salvar}
        />
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
  const [f, setF] = useState({
    full_name: lead.full_name,
    phone: lead.phone ?? '',
    phone_country: lead.phone_country,
    email: lead.email ?? '',
    city: lead.city ?? '',
  });
  // O que o telefone permite afirmar — estado e região, nunca a cidade.
  const regiao = regiaoDoTelefone(lead.phone_e164, lead.phone_country);

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

      <AnotacaoDoLead lead={lead} equipe={equipe} />

      {Object.keys(equipe).length === 0 && null}
    </div>
  );
}
