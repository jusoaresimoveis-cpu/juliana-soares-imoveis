import { Loader2, Link2 } from 'lucide-react';
import { formatarGasto } from '@contracts';
import { useCadeiaPorAnuncio } from '@/hooks/useInteligencia';
import {
  CADEIA_MINIMO_PARA_LER,
  aproveitamentoDaConversa,
  type AnuncioDaCadeia,
  type DegrauDaCadeia,
} from '@/inteligencia';
import { cn } from '@/lib/utils';

/**
 * A CADEIA INTEIRA, POR ANÚNCIO.
 *
 * As outras duas seções desta tela param em "lead" — e lead é o número que já
 * se sabe barato. Na conta de origem, em trinta dias, o anúncio mais eficiente
 * em custo por lead trouxe duas dúzias de leads e **nenhum deles marcou
 * visita**; outro, com o dobro do custo por lead, marcou.
 *
 * A pergunta que só esta tabela faz: de que adianta o anúncio mais barato se o
 * lead dele não anda?
 *
 * POR QUE AS COLUNAS DE BAIXO FICAM QUASE TODAS EM ZERO, e por que isso não é
 * defeito: de 190 leads vivos, 159 pararam em "Em atendimento". O funil de
 * baixo não é medido porque ninguém o registra — o CRM tem 2 lembretes e 1
 * anotação em toda a sua história, e 133 das 182 mudanças de etapa foram
 * automáticas. Esconder a coluna vazia deixaria a casa decidir verba pelo custo
 * por lead e nunca descobrir isso.
 */
export function Cadeia({ de, ate, moeda }: { de: string; ate: string; moeda: string }) {
  const { data, isLoading } = useCadeiaPorAnuncio(de, ate);

  if (isLoading) {
    return (
      <section className="rounded-md bg-card p-4 shadow-card">
        <p className="flex items-center gap-2 text-sm text-tx-3">
          <Loader2 className="h-4 w-4 animate-spin" />
          Montando a cadeia…
        </p>
      </section>
    );
  }

  if (!data || data.erro) return null;

  const degraus = data.degraus ?? [];
  const linhas = data.anuncios ?? [];
  const total = data.total;
  const aproveita = aproveitamentoDaConversa(total);

  return (
    <section className="rounded-md bg-card shadow-card">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 pt-4">
        <h2 className="flex items-center gap-2 text-md font-bold">
          <Link2 className="h-4 w-4 text-pri" />A cadeia inteira, por anúncio
        </h2>
        <span className="text-2xs text-tx-3">
          ordenada por gasto — não por eficiência, para a primeira linha não parecer recomendação
        </span>
      </div>

      <p className="px-4 pt-2 text-sm text-tx-2">
        Cada linha segue os leads que <strong>aquele anúncio</strong> trouxe no período e mostra até
        onde eles chegaram — mesmo que a visita tenha acontecido depois.
      </p>

      {aproveita !== null && (
        <p className="mx-4 mt-3 rounded border border-line px-3 py-2 text-2xs text-tx-2">
          {/*
            O número que não existe em nenhuma outra tela. A Meta conta conversa
            aberta; o CRM conta ficha com origem provada. A distância entre os
            dois é a qualidade do tráfego, e ela aparece ANTES do custo por lead
            — um anúncio com conversa barata e ficha cara está comprando
            conversa errada.
          */}
          A Meta contou <strong className="tabular-nums">{total.conversas}</strong> conversas e o
          CRM fez <strong className="tabular-nums">{total.leads}</strong> fichas —{' '}
          <strong className="tabular-nums">{Math.round(aproveita * 100)}%</strong>. O resto é
          engano, “oi” que some e quem não veio pelo anúncio.
        </p>
      )}

      {/* Larga por natureza: a cadeia tem um degrau por etapa do funil. O
          rolamento fica NESTE contêiner para a página nunca andar de lado. */}
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="border-y border-line text-2xs uppercase text-tx-3">
              <th className="px-4 py-2 text-left font-bold">Anúncio</th>
              <th className="px-2 py-2 text-right font-bold">Gasto</th>
              <th className="px-2 py-2 text-right font-bold">Conversas</th>
              <th className="px-2 py-2 text-right font-bold">Leads</th>
              {degraus.map((d) => (
                <th key={d.key} className="px-2 py-2 text-right font-bold">
                  {d.label}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {linhas.map((a) => (
              <Linha key={a.ad_id} a={a} degraus={degraus} moeda={moeda} />
            ))}
          </tbody>

          <tfoot>
            <tr className="border-t border-line font-bold">
              <td className="px-4 py-2.5">
                {total.anuncios} anúncios
                <span className="ml-2 text-2xs font-normal text-tx-3">
                  {/*
                    O custo por lead do TOTAL é o único desta tabela que tem
                    volume para significar alguma coisa. Por anúncio, com três
                    leads cada, a conta existe mas não decide nada — por isso
                    ela só aparece na linha de baixo.
                  */}
                  {total.leads > 0
                    ? `${formatarGasto(Math.round(total.gasto / total.leads), moeda)} por lead`
                    : 'nenhum lead no período'}
                </span>
              </td>
              <td className="px-2 py-2.5 text-right tabular-nums">
                {formatarGasto(total.gasto, moeda)}
              </td>
              <td className="px-2 py-2.5 text-right tabular-nums">{total.conversas}</td>
              <td className="px-2 py-2.5 text-right tabular-nums">{total.leads}</td>
              {degraus.map((d) => (
                <td key={d.key} className="px-2 py-2.5 text-right tabular-nums">
                  {total.passos?.[d.key] ?? 0}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="border-t border-line px-4 py-3 text-2xs text-tx-3">
        {/*
          A frase que impede a leitura errada da coluna vazia. Sem ela, "zero
          visitas" parece defeito da tela — e a pessoa volta a decidir pelo
          custo por lead, que é exatamente o que esta tabela existe para
          questionar.
        */}
        Os degraus abaixo de <strong>Leads</strong> só enchem quando alguém move o cartão. Hoje a
        maior parte do funil anda sozinha, quando o cliente responde: o que estiver em zero aqui
        pode ter acontecido e não ter sido registrado. Abaixo de {CADEIA_MINIMO_PARA_LER} leads,
        nenhum custo por etapa é leitura — é coincidência com vírgula.
      </p>
    </section>
  );
}

function Linha({
  a,
  degraus,
  moeda,
}: {
  a: AnuncioDaCadeia;
  degraus: DegrauDaCadeia[];
  moeda: string;
}) {
  const aproveita = aproveitamentoDaConversa(a);

  return (
    <tr className="border-b border-line last:border-0">
      <td className="max-w-[260px] px-4 py-2.5">
        <p className="truncate font-bold">{a.nome ?? '(sem nome)'}</p>
        <p className="truncate text-2xs text-tx-3">
          {a.angulo ? `${a.angulo} · ` : ''}
          {a.campanha ?? 'sem campanha'}
          {a.estado && a.estado !== 'ACTIVE' ? ' · parado' : ''}
        </p>
      </td>

      <td className="px-2 py-2.5 text-right tabular-nums">{formatarGasto(a.gasto, moeda)}</td>

      <td className="px-2 py-2.5 text-right tabular-nums">
        {a.conversas || '—'}
        {aproveita !== null && (
          <span className="ml-1 text-2xs text-tx-3">{Math.round(aproveita * 100)}%</span>
        )}
      </td>

      <td className="px-2 py-2.5 text-right tabular-nums">
        {/*
          Gasto sem lead nenhum é a única linha que se lê sozinha, e por isso é
          a única marcada. Na medição de 24/09 havia três assim, somando quase
          R$ 350 — dinheiro que saiu e não virou ficha.
        */}
        <span className={cn('font-bold', a.leads === 0 && a.gasto > 0 && 'text-dng')}>
          {a.leads}
        </span>
        {a.leads > 0 && (
          <span className="ml-1 text-2xs text-tx-3">
            {formatarGasto(Math.round(a.gasto / a.leads), moeda)}
          </span>
        )}
      </td>

      {degraus.map((d) => {
        const n = a.passos?.[d.key] ?? 0;
        return (
          <td
            key={d.key}
            className={cn('px-2 py-2.5 text-right tabular-nums', n === 0 && 'text-tx-3')}
          >
            {n}
          </td>
        );
      })}
    </tr>
  );
}
