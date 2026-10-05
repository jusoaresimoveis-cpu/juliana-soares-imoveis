import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { MessageCircle, ExternalLink, Loader2, AlertTriangle, Home, Clock } from 'lucide-react';
import { useLeadPreview, diasDesde, tempoAte } from '@/hooks/useLeadPreview';
import type { BoardLead, PipelineStage } from '@/types/db';
import { brl, cn, valoresDoImovel } from '@/lib/utils';
import { LEAD_SOURCE_LABEL_CURTO, explicarTemperatura, resumoDaQualificacao } from '@contracts';
import { SeloDeTemperatura } from './SeloDeTemperatura';

const LARGURA = 320;
const MARGEM = 12;

interface Props {
  lead: BoardLead;
  etapa: PipelineStage | undefined;
  origem: DOMRect;
  onFechar: () => void;
  /** Cancela o fechamento pendente quando o mouse entra na própria prévia. */
  onManter: () => void;
  onAbrirFicha: () => void;
}

/**
 * Prévia do lead ao passar o mouse.
 *
 * Renderizada em portal, fora da árvore do quadro. Sem isso ela seria cortada
 * pela rolagem da coluna e pela rolagem horizontal do board — os dois criam
 * contexto de recorte.
 */
export function LeadPreview({ lead, etapa, origem, onFechar, onManter, onAbrirFicha }: Props) {
  const { data, isLoading } = useLeadPreview(lead.id);
  const [pos, setPos] = useState({ left: 0, top: 0 });

  useEffect(() => {
    // À direita do card, a menos que não caiba — aí à esquerda.
    const cabeDireita = origem.right + MARGEM + LARGURA <= window.innerWidth;
    const left = cabeDireita ? origem.right + MARGEM : Math.max(MARGEM, origem.left - MARGEM - LARGURA);
    const alturaEstimada = 360;
    const top = Math.min(
      Math.max(MARGEM, origem.top - 20),
      window.innerHeight - alturaEstimada - MARGEM,
    );
    setPos({ left, top });
  }, [origem]);

  // Rolagem em qualquer lugar fecha: a prévia ficaria pendurada no vazio.
  useEffect(() => {
    const fechar = () => onFechar();
    window.addEventListener('scroll', fechar, true);
    window.addEventListener('resize', fechar);
    return () => {
      window.removeEventListener('scroll', fechar, true);
      window.removeEventListener('resize', fechar);
    };
  }, [onFechar]);

  const criadoHa = diasDesde(lead.created_at);
  const naEtapaHa = diasDesde(lead.stage_changed_at);
  const respostaEm = data ? tempoAte(data.created_at, data.first_contact_at) : null;

  return createPortal(
    <div
      role="dialog"
      aria-label={`Resumo de ${lead.full_name}`}
      style={{ left: pos.left, top: pos.top, width: LARGURA }}
      onMouseEnter={onManter}
      onMouseLeave={onFechar}
      className="fixed z-50 overflow-hidden rounded-[18px] border border-line bg-sheet shadow-pop"
    >
      <header className="flex items-start justify-between gap-2 border-b border-line px-4 py-3">
        <div className="min-w-0">
          <h3 className="truncate text-lg font-bold">{lead.full_name}</h3>
          <p className="mt-0.5 flex items-center gap-1.5 text-sm text-tx-3">
            <i className="h-2 w-2 rounded-full" style={{ backgroundColor: etapa?.color }} />
            {etapa?.label ?? '—'}
          </p>
        </div>
        {lead.deal_value_cents != null && (
          <span className="shrink-0 text-md font-extrabold text-ok">
            {brl.format(lead.deal_value_cents / 100)}
          </span>
        )}
      </header>

      {isLoading && (
        <div className="grid place-items-center py-10">
          <Loader2 className="h-4 w-4 animate-spin text-pri" />
        </div>
      )}

      {data && (
        <div className="flex flex-col gap-3 px-4 py-3">
          {/* Jornada — o que diz se o lead está esfriando */}
          <div className="grid grid-cols-3 gap-2">
            <Metrica rotulo="Entrou há" valor={criadoHa != null ? `${criadoHa}d` : '—'} />
            <Metrica
              rotulo="1º contato"
              valor={respostaEm ?? 'pendente'}
              alerta={!data.first_contact_at}
            />
            <Metrica
              rotulo="Nesta etapa"
              valor={naEtapaHa != null ? `${naEtapaHa}d` : '—'}
              alerta={(naEtapaHa ?? 0) > 7}
            />
          </div>

          {/* O que a pessoa disse. Aparece mesmo vazio: na prévia, "falta
              saber quando pretende comprar" é o convite para perguntar. */}
          <div className="rounded-xl bg-card-2 px-3 py-2.5">
            <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
              <p className="text-2xs font-bold uppercase text-tx-3">Qualificação</p>
              <SeloDeTemperatura
                valor={data.temperatura}
                manual={Boolean(data.temperatura_manual)}
                vazio="avisar"
                className="bg-card"
              />
            </div>
            {resumoDaQualificacao(data) && (
              <p className="text-sm font-semibold text-tx-2">{resumoDaQualificacao(data)}</p>
            )}
            <p className="mt-0.5 text-sm leading-snug text-tx-3">{explicarTemperatura(data)}</p>
          </div>

          {/* Atribuição — a razão de o CRM existir */}
          <div className="rounded-xl bg-card-2 px-3 py-2.5">
            <p className="mb-1.5 text-2xs font-bold uppercase text-tx-3">
              De onde veio
            </p>
            <div className="flex flex-wrap items-center gap-1.5">
              <Etiqueta>{ORIGEM[data.source] ?? data.source}</Etiqueta>
              {data.ft_variant && <Etiqueta tom="pri">Template {data.ft_variant.toUpperCase()}</Etiqueta>}
              {data.ft_locale && data.ft_locale !== 'pt-BR' && (
                <Etiqueta tom="warn">{data.ft_locale.toUpperCase()}</Etiqueta>
              )}
              {data.attribution_method === 'none' && <Etiqueta tom="dng">sem atribuição</Etiqueta>}
            </div>
            {data.ft_utm_campaign && (
              <p className="mt-1.5 truncate text-sm text-tx-2">{data.ft_utm_campaign}</p>
            )}
            {data.ab_contaminated && (
              <p className="mt-1.5 flex items-start gap-1.5 text-xs leading-snug text-warn">
                <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
                Viu mais de um template — fora da leitura do teste A/B.
              </p>
            )}
          </div>

          {data.interesses.length > 0 && (
            <div>
              <p className="mb-1 text-2xs font-bold uppercase text-tx-3">
                Interesse
              </p>
              {data.interesses.map((p) => (
                <p key={p.public_code} className="flex items-center gap-1.5 text-base text-tx-2">
                  <Home className="h-3 w-3 shrink-0 text-tx-3" />
                  <span className="truncate">{p.title}</span>
                  {valoresDoImovel(p).length > 0 && (
                    <span className="ml-auto shrink-0 font-semibold">{valoresDoImovel(p).join(' · ')}</span>
                  )}
                </p>
              ))}
            </div>
          )}

          {data.timeline.length > 0 && (
            <div>
              <p className="mb-1 text-2xs font-bold uppercase text-tx-3">
                Últimas movimentações
              </p>
              <ul className="flex flex-col gap-1">
                {data.timeline.map((e, i) => (
                  <li key={i} className="flex items-center gap-1.5 text-sm text-tx-2">
                    <Clock className="h-3 w-3 shrink-0 text-tx-3" />
                    <span className="truncate">{e.title}</span>
                    <span className="ml-auto shrink-0 text-xs text-tx-3">
                      {diasDesde(e.occurred_at)}d
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <footer className="flex gap-2 border-t border-line px-4 py-3">
        {lead.phone_e164 && (
          <a
            href={`https://wa.me/${lead.phone_e164.replace('+', '')}`}
            target="_blank"
            rel="noreferrer"
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-line-2 bg-card py-2 text-base font-semibold text-tx-2 transition-colors hover:border-ok hover:text-ok"
          >
            <MessageCircle className="h-3.5 w-3.5" />
            WhatsApp
          </a>
        )}
        <button
          onClick={onAbrirFicha}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-pri py-2 text-base font-semibold text-pri-fg transition-colors hover:bg-pri-deep"
        >
          Abrir ficha
          <ExternalLink className="h-3.5 w-3.5" />
        </button>
      </footer>
    </div>,
    document.body,
  );
}

// A lista dos contratos. A cópia que morava aqui tinha ficado sem cinco origens
// (bio, Facebook, placa, Google, Marketplace), que apareciam com o código cru.
const ORIGEM: Record<string, string> = LEAD_SOURCE_LABEL_CURTO;

function Metrica({ rotulo, valor, alerta }: { rotulo: string; valor: string; alerta?: boolean }) {
  return (
    <div className="rounded-xl bg-card-2 px-2 py-1.5 text-center">
      <p className="text-2xs font-semibold uppercase text-tx-3">{rotulo}</p>
      <p className={cn('mt-0.5 text-base font-bold tabular-nums', alerta ? 'text-dng' : 'text-tx')}>
        {valor}
      </p>
    </div>
  );
}

function Etiqueta({ children, tom }: { children: React.ReactNode; tom?: 'pri' | 'warn' | 'dng' }) {
  const cores = {
    pri: 'bg-pri-soft text-pri',
    warn: 'bg-warn-soft text-warn',
    dng: 'bg-dng-soft text-dng',
  };
  return (
    <span
      className={cn(
        'rounded px-1.5 py-0.5 text-xs font-bold',
        tom ? cores[tom] : 'bg-card text-tx-2',
      )}
    >
      {children}
    </span>
  );
}
