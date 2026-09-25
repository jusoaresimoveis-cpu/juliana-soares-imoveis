import { memo, useRef } from 'react';
import { MessageCircle, MoveRight } from 'lucide-react';
import type { BoardLead, PipelineStage, TeamMember } from '@/types/db';
import { cn, initials, brl } from '@/lib/utils';
import { SeloDeTemperatura } from './SeloDeTemperatura';
import {
  LOSS_REASON_LABEL,
  LEAD_SOURCE_LABEL_CURTO,
  LEAD_SOURCE_HUE,
  LEAD_SOURCES_NEUTRAS,
  type LeadSource,
} from '@contracts';

// A cópia local do dicionário saiu daqui: ela escrevia "Meta Ads" onde o painel
// escrevia "Meta", e duas telas com rótulos diferentes para o mesmo canal
// parecem falar de canais diferentes.
const ORIGEM_LABEL = LEAD_SOURCE_LABEL_CURTO as Record<string, string>;

/**
 * A bolinha do canal usa o MESMO matiz do gráfico de aquisição.
 *
 * Antes eram classes do tema — `bg-ok` para Google e para WhatsApp, `bg-warn`
 * para Portal e para Indicação. Dois canais com a mesma cor, e nenhuma delas
 * batendo com a do painel: o azul do Meta no gráfico virava roxo no Kanban.
 */
function corDaOrigem(source: string): string {
  const matiz = LEAD_SOURCE_HUE[source as LeadSource];
  if (matiz === undefined) return 'hsl(220 9% 60%)';
  const neutra = (LEAD_SOURCES_NEUTRAS as readonly string[]).includes(source);
  return neutra ? `hsl(${matiz} 9% 60%)` : `hsl(${matiz} 68% 58%)`;
}

/**
 * Atraso até a prévia abrir.
 *
 * 450 ms, não os 2 s de um "segurar o mouse". Dois segundos são longos demais
 * para a pessoa entender que algo vai acontecer — ela desiste e clica antes.
 * E, mais importante, num Kanban segurar o mouse sobre um card é o começo de
 * um arraste: a prévia abriria no meio do movimento. Por isso o arraste
 * cancela o timer.
 */
const ATRASO_PREVIA = 450;

interface Props {
  lead: BoardLead;
  responsavel: TeamMember | undefined;
  etapas: PipelineStage[];
  ativo: boolean;
  onMover: (paraStageId: string) => void;
  /** Quem pode ser dono de lead. O admin fica de fora: ele não atende. */
  corretores: TeamMember[];
  onAtribuir: (para: string | null) => void;
  onAbrir: () => void;
  onPreviaAbrir: (rect: DOMRect) => void;
  onPreviaFechar: () => void;
}

/**
 * Card em arquivo próprio e memoizado.
 *
 * No sistema de referência mais rápido, o card são ~280 linhas de JSX dentro
 * da página — impossível de memoizar, então mover um card redesenha todos.
 */
export const LeadCard = memo(function LeadCard({
  lead,
  responsavel,
  etapas,
  ativo,
  onMover,
  corretores,
  onAtribuir,
  onAbrir,
  onPreviaAbrir,
  onPreviaFechar,
}: Props) {
  const ref = useRef<HTMLElement>(null);
  const timer = useRef<number | null>(null);

  const cancelar = () => {
    if (timer.current) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  };

  return (
    <article
      ref={ref}
      draggable
      onDragStart={(e) => {
        // Arrastando: mata a prévia antes que ela apareça no meio do gesto.
        cancelar();
        onPreviaFechar();
        e.dataTransfer.setData('text/lead-id', lead.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
      onMouseEnter={() => {
        cancelar();
        timer.current = window.setTimeout(() => {
          const r = ref.current?.getBoundingClientRect();
          if (r) onPreviaAbrir(r);
        }, ATRASO_PREVIA);
      }}
      onMouseLeave={() => {
        cancelar();
        onPreviaFechar();
      }}
      className={cn(
        'group cursor-grab rounded-md border bg-card p-3 shadow-card transition-colors active:cursor-grabbing',
        ativo ? 'border-pri bg-pri-soft/40 ring-1 ring-pri/30' : 'border-transparent hover:border-pri-light',
      )}
    >
      <button onClick={onAbrir} className="block w-full text-left">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-md font-bold leading-tight">{lead.full_name}</h3>
          {lead.deal_value_cents != null && (
            <span className="shrink-0 text-sm font-bold text-ok">
              {brl.format(lead.deal_value_cents / 100)}
            </span>
          )}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {/* Primeiro da fileira: é o que diz quem atender antes. Sem
              qualificação não aparece nada — ver `SeloDeTemperatura`. */}
          <SeloDeTemperatura valor={lead.temperatura} />

          <span className="inline-flex items-center gap-1.5 rounded bg-card-2 px-1.5 py-0.5 text-xs font-semibold text-tx-2">
            <i
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: corDaOrigem(lead.source) }}
            />
            {ORIGEM_LABEL[lead.source] ?? lead.source}
          </span>

          {/* A variante do template. É a informação que o corretor não tem
              em nenhum dos dois sistemas atuais, e é o eixo do teste A/B/C. */}
          {lead.ft_variant && (
            <span className="rounded bg-pri-soft px-1.5 py-0.5 text-xs font-bold uppercase text-pri">
              Template {lead.ft_variant}
            </span>
          )}

          {lead.ft_locale && lead.ft_locale !== 'pt-BR' && (
            <span className="rounded bg-warn-soft px-1.5 py-0.5 text-xs font-bold uppercase text-warn">
              {lead.ft_locale}
            </span>
          )}

          {lead.loss_reason && (
            <span className="rounded bg-dng-soft px-1.5 py-0.5 text-xs font-semibold text-dng">
              {LOSS_REASON_LABEL[lead.loss_reason]}
            </span>
          )}
        </div>

        {lead.ft_utm_campaign && (
          <p className="mt-1.5 truncate text-xs text-tx-3">{lead.ft_utm_campaign}</p>
        )}
      </button>

      <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-line pt-2">
        {/*
          O dono do lead vira um seletor no próprio cartão.
          
          Mesmo padrão do botão de mover ao lado: um `select` invisível por cima
          do rótulo. Ele resolve de uma vez o dedo no celular, o teclado e o
          leitor de tela — e é nativo, então no telefone abre a roda do sistema
          em vez de um menu que a gente teria de desenhar e manter.
        */}
        <label
          className="relative flex items-center gap-1.5 rounded text-xs text-tx-3 transition-colors hover:bg-pri-soft"
          onClick={(e) => e.stopPropagation()}
        >
          {responsavel ? (
            <>
              <span className="grid h-5 w-5 place-items-center rounded-full bg-gradient-to-br from-pri-light to-pri-deep text-2xs font-bold text-pri-fg">
                {initials(responsavel.full_name)}
              </span>
              <span className="max-w-[9ch] truncate">{responsavel.full_name.split(' ')[0]}</span>
            </>
          ) : (
            <span className="font-semibold text-warn">Sem responsável</span>
          )}
          <span className="sr-only">Responsável por {lead.full_name}</span>
          <select
            value={lead.assigned_to ?? ''}
            onChange={(e) => onAtribuir(e.target.value || null)}
            onClick={(e) => e.stopPropagation()}
            className="absolute inset-0 cursor-pointer opacity-0"
            aria-label={`Escolher responsável por ${lead.full_name}`}
          >
            <option value="">Sem responsável</option>
            {corretores.map((c) => (
              <option key={c.id} value={c.id}>
                {c.full_name}
              </option>
            ))}
          </select>
        </label>

        <div className="flex items-center gap-1">
          {lead.phone_e164 && (
            <a
              href={`https://wa.me/${lead.phone_e164.replace('+', '')}`}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              aria-label={`Abrir WhatsApp de ${lead.full_name}`}
              className="grid h-6 w-6 place-items-center rounded text-tx-3 transition-colors hover:bg-ok-soft hover:text-ok"
            >
              <MessageCircle className="h-3.5 w-3.5" />
            </a>
          )}

          {/* Alternativa de teclado e de celular ao arrastar. O sistema de
              referência só tem arraste, o que deixa a operação inacessível. */}
          <label className="relative grid h-6 w-6 place-items-center rounded text-tx-3 transition-colors hover:bg-pri-soft hover:text-pri">
            <MoveRight className="h-3.5 w-3.5" />
            <span className="sr-only">Mover {lead.full_name} de etapa</span>
            <select
              value={lead.stage_id}
              onChange={(e) => onMover(e.target.value)}
              className="absolute inset-0 cursor-pointer opacity-0"
              aria-label={`Mover ${lead.full_name} de etapa`}
            >
              {etapas.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
    </article>
  );
});
