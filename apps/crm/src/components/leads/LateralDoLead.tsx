import { AlertTriangle, ExternalLink } from 'lucide-react';
import type { LeadFull, OrigemMeta, PaginaDoLead, useSalvarLead } from '@/hooks/useLead';
import { diasDesde, tempoAte } from '@/hooks/useLeadPreview';
import type { TeamMember } from '@/types/db';
import { brl, cn, initials } from '@/lib/utils';
import {
  LEAD_SOURCE_LABEL_CURTO,
  LOSS_REASON_LABEL,
  ATTRIBUTION_METHOD_LABEL,
  type AttributionMethod,
} from '@contracts';

// O mesmo apelido de pages/LeadDetail.tsx: a lista dos contratos, com chave
// `string` para que um código fora dela caia no `?? lead.source`.
const ORIGEM: Record<string, string> = LEAD_SOURCE_LABEL_CURTO;

/**
 * A lateral da ficha do lead: de onde veio, a jornada e o responsável.
 *
 * Recebe o `salvar` da página em vez de abrir uma mutação própria: é a mesma
 * que muda a etapa no cabeçalho.
 */
export function LateralDoLead({
  lead,
  origem,
  pagina,
  responsavel,
  equipe,
  salvar,
}: {
  lead: LeadFull;
  origem: OrigemMeta | null | undefined;
  pagina: PaginaDoLead | undefined;
  responsavel: TeamMember | undefined;
  equipe: Record<string, TeamMember> | undefined;
  salvar: ReturnType<typeof useSalvarLead>;
}) {
  return (
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
  );
}

/* ------------------------------------------------------------- auxiliares */

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
