import {
  RESULTADO_META,
  META_ENTREGA_META,
  formatarGasto,
  entregaDoStatus,
  type MetaAdLevel,
} from '@contracts';
import type { LinhaCalculada } from '@/lib/anuncios';
import { cn } from '@/lib/utils';

function EtiquetaDeEstado({ status }: { status: string | null }) {
  if (!status) return null;
  const entrega = entregaDoStatus(status);
  if (entrega === 'ativo') return null;

  const meta = META_ENTREGA_META[entrega];
  return (
    <span
      // O status cru no `title`: "CAMPAIGN_PAUSED" diz em qual degrau alguém
      // pausou, e é o que faz a pessoa procurar no lugar certo do gerenciador.
      title={status}
      className={cn(
        'ml-2 rounded-full px-2 py-0.5 text-2xs font-bold',
        meta.atencao ? 'bg-warn-soft text-warn' : 'bg-card-2 text-tx-3',
      )}
    >
      {meta.rotulo}
    </span>
  );
}

/**
 * "Esta campanha conta no painel?"
 *
 * Existe porque nem toda verba da Meta é verba de captação. A imobiliária de origem rodava uma
 * campanha para CONTRATAR corretor: o dinheiro é despesa de recrutamento e quem
 * responde é candidato a vaga, não comprador de apartamento. Somados ao resto,
 * os dois estragam o custo por lead — o gasto pelo numerador, os candidatos pelo
 * denominador.
 *
 * Desligar não apaga nada: os candidatos continuam no funil e nas conversas,
 * porque é gente de verdade com quem alguém precisa falar. O que sai é a
 * MEDIÇÃO.
 */
function BotaoNoPainel({
  conta,
  ocupado,
  onAlternar,
}: {
  conta: boolean;
  ocupado: boolean;
  onAlternar: (conta: boolean) => void;
}) {
  return (
    <button
      onClick={() => onAlternar(!conta)}
      disabled={ocupado}
      title={
        conta
          ? 'Esta campanha entra no painel. Clique para tirar o gasto e os leads dela das contas.'
          : 'Fora do painel: o gasto não soma e os leads dela não contam. Nada foi apagado — clique para voltar.'
      }
      className={cn(
        'ml-2 rounded-full border px-2 py-0.5 text-2xs font-bold transition-colors disabled:opacity-50',
        conta
          ? 'border-line-2 text-tx-3 hover:border-dng hover:text-dng'
          : 'border-warn bg-warn-soft text-warn',
      )}
    >
      {conta ? 'no painel' : 'fora do painel'}
    </button>
  );
}

export function LinhaDeDesempenho({
  x: { l, tipo, resultados, custo },
  nivel,
  mostrarCampanha,
  noPainel,
  ocupado,
  onAlternar,
}: {
  x: LinhaCalculada;
  nivel: MetaAdLevel;
  mostrarCampanha: boolean;
  noPainel: boolean;
  ocupado: boolean;
  onAlternar: (conta: boolean) => void;
}) {
  /*
   * Gasto sem resultado nenhum é o achado mais acionável da tela, e
   * por isso fica MARCADO. O sistema auditado montava a tabela a
   * partir dos leads, e por isso o anúncio que gastou e não converteu
   * simplesmente não aparecia — sumia justo o que precisa ser
   * desligado.
   *
   * O que conta é o resultado DAQUELE tipo de campanha. Antes isto
   * olhava só o lead do CRM, e os 21 anúncios de mensagem desta conta
   * ficavam todos vermelhos para sempre: eles nunca produziriam
   * formulário, e o alarme que dispara sempre deixa de ser lido.
   *
   * E nulo não é zero: enquanto os resultados não foram importados,
   * não há acusação a fazer.
   */
  const queimando = l.spend_minor > 0 && resultados === 0;

  return (
    <tr
      className={cn('border-b border-line-2 last:border-0', queimando && 'bg-dng-soft/40')}
    >
      <td className="px-2 py-2.5">
        <span className="font-medium">{l.nome ?? `#${l.object_id}`}</span>
        {/*
          O estado só aparece quando NÃO está no ar, e só quando é
          conhecido. Uma etiqueta "No ar" em toda linha viraria ruído
          de fundo; uma etiqueta "Sem estado" em todas, antes da
          primeira importação, seria ruído E alarme falso.
        */}
        <EtiquetaDeEstado status={l.status} />
        {queimando && (
          <span className="ml-2 rounded-full bg-dng-soft px-2 py-0.5 text-2xs font-bold text-dng">
            sem {RESULTADO_META[tipo].singular}
          </span>
        )}
        {!l.nome && (
          <span className="ml-2 text-sm text-tx-3">nome ainda não sincronizado</span>
        )}

        {/*
          O interruptor fica DENTRO da célula do nome, e não numa coluna
          própria: coluna nova mexeria no `colSpan` do rodapé e nas
          larguras de tudo, para um controle que só existe num dos três
          níveis. Colado no nome ele também lê melhor — a decisão é
          sobre AQUELA campanha.
        */}
        {nivel === 'campaign' && (
          <BotaoNoPainel
            conta={noPainel}
            ocupado={ocupado}
            onAlternar={onAlternar}
          />
        )}
      </td>

      {mostrarCampanha && (
        <td className="max-w-[240px] px-2 py-2.5 text-sm text-tx-2">
          {/* Nome de campanha é longo por natureza — "LEADS | Azure |
              Cidades Invest Imov — CTV4". Truncado com o texto
              completo no `title`, para não empurrar as colunas de
              número para fora da tela. */}
          <span className="block truncate" title={l.campanha ?? undefined}>
            {l.campanha ?? '—'}
          </span>
        </td>
      )}

      <td className="whitespace-nowrap px-2 py-2.5 text-sm text-tx-2">
        {l.conta ?? '—'}
      </td>

      <td className="px-2 py-2.5 text-right tabular-nums">
        {formatarGasto(l.spend_minor, l.currency)}
      </td>

      <td className="px-2 py-2.5 text-right tabular-nums">
        {resultados == null ? (
          <span className="text-tx-3" title="Ainda não importado">
            —
          </span>
        ) : (
          <>
            {resultados}
            {/* O tipo vem junto do número: sem ele, a coluna mistura
                cadastro com conversa e ninguém sabe o que leu. */}
            <span className="ml-1 text-2xs text-tx-3">
              {resultados === 1
                ? RESULTADO_META[tipo].singular
                : RESULTADO_META[tipo].plural}
            </span>
          </>
        )}
      </td>

      <td className="px-2 py-2.5 text-right tabular-nums">
        {/* Sem resultado o custo é '—', nunca R$ 0,00 — que leria
            como anúncio de graça. */}
        <span className={cn(!custo.confiavel && 'text-tx-3')}>
          {formatarGasto(custo.valor, l.currency)}
        </span>
        {custo.valor !== null && !custo.confiavel && (
          <span
            className="ml-1 text-2xs text-tx-3"
            title={`Menos de 5 ${RESULTADO_META[tipo].plural}`}
          >
            ~
          </span>
        )}
      </td>

      <td className="px-2 py-2.5 text-right tabular-nums text-tx-2">{l.clicks ?? '—'}</td>

      {nivel === 'ad' && (
        <td className="px-2 py-2.5 text-right tabular-nums text-tx-2">
          {l.leads_atribuidos}
        </td>
      )}
    </tr>
  );
}
