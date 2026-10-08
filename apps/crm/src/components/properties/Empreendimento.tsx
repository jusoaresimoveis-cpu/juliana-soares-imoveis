import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import {
  UNIT_STATUSES,
  UNIT_STATUS_LABEL,
  mesCorrente,
  nomeDoMesDaTabela,
  rotuloDaUnidade,
  type PropertyType,
  type UnitStatus,
} from '@contracts';
import type { Unidade } from '@/hooks/useUnidades';
import { consulteDesde, formatarPreco, montarGrade } from '@/lib/unidades';
import { cn } from '@/lib/utils';

/** A cor de cada situação, a mesma na ficha, na lista e na grade da tabela. */
export const COR_DA_SITUACAO: Record<UnitStatus, string> = {
  disponivel: 'border-ok/40 bg-ok-soft text-ok',
  reservado: 'border-warn/40 bg-warn-soft text-warn',
  vendido: 'border-line bg-card-2 text-tx-3',
};

/**
 * A letra de cada situação no espelho, além da cor: quem não separa o verde do
 * amarelo, ou imprime em preto e branco, lê a letra. São as mesmas d, r e v
 * que a Juliana digita na tabela do mês.
 */
export const LETRA_DA_SITUACAO: Record<UnitStatus, string> = {
  disponivel: 'D',
  reservado: 'R',
  vendido: 'V',
};

/**
 * O aviso do mês da tabela. A construtora solta a tabela nova no 1º dia útil
 * do mês (com o CUB/SC), e no dia 1 o site já troca os preços por "Consulte"
 * (decisão do usuário, 08/10): preço de tabela vencida é preço errado.
 *
 * Antes da primeira tabela é outro caso: as unidades nascem vendidas, e o
 * banco não deriva nada delas (tiraria da vitrine, como vendido, um
 * empreendimento no ar). O imóvel fica com a situação que tinha, sem preço, e
 * o site mostra "Consulte" sem a lista de unidades.
 */
export function AvisoDaTabela({
  mesAplicado,
  temUnidades,
  className,
}: {
  mesAplicado: string | null | undefined;
  temUnidades: boolean;
  className?: string;
}) {
  if (!temUnidades) return null;
  const atual = mesCorrente();
  const vigente = !!mesAplicado && mesAplicado.slice(0, 10) >= atual;

  if (vigente && mesAplicado) {
    return (
      <p className={cn('flex items-center gap-1.5 text-sm font-semibold text-ok', className)}>
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
        Tabela de {nomeDoMesDaTabela(mesAplicado)} aplicada: o site mostra os preços.
      </p>
    );
  }

  const desde = consulteDesde(mesAplicado, atual);
  return (
    <p role="status" className={cn('flex items-start gap-2 rounded-xl bg-warn-soft p-3 text-sm font-semibold text-warn', className)}>
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>
        {desde
          ? `O site mostra “Consulte” no lugar dos preços desde 1º de ${nomeDoMesDaTabela(desde)}: aplique a tabela de ${nomeDoMesDaTabela(atual)}.`
          : `Nenhuma tabela aplicada ainda: o imóvel fica com a situação que tinha, e o site mostra “Consulte” no lugar do preço, sem a lista de unidades. Aplique a tabela de ${nomeDoMesDaTabela(atual)}.`}
      </span>
    </p>
  );
}

/**
 * O espelho do prédio: andar por final, cada unidade com a cor da situação,
 * como o mapa de vendas da construtora. Sala sem andar fica embaixo.
 *
 * A cor não basta sozinha: cada célula leva a letra da situação e se anuncia
 * inteira ao leitor de tela ("Apto 804, disponível, R$ 840.569,40"), que de
 * outro jeito leria só o número.
 */
export function EspelhoDasUnidades({ unidades, tipo }: { unidades: readonly Unidade[]; tipo: PropertyType }) {
  const { finais, linhas, foraDaGrade } = montarGrade(unidades);
  const descricao = (u: Unidade) =>
    `${rotuloDaUnidade(tipo, u.label)}, ${UNIT_STATUS_LABEL[u.status].toLowerCase()}${
      u.status !== 'vendido' && u.price_cents != null ? `, R$ ${formatarPreco(u.price_cents)}` : ''
    }`;
  const letra = (s: UnitStatus) => (
    <span aria-hidden className="text-2xs font-bold">
      {LETRA_DA_SITUACAO[s]}
    </span>
  );

  return (
    <div className="flex flex-col gap-3">
      {linhas.length > 0 && (
        <div className="overflow-x-auto">
          <table className="border-separate border-spacing-1">
            <thead>
              <tr>
                <th className="px-1 text-left text-2xs font-bold uppercase text-tx-3">Andar</th>
                {finais.map((f) => (
                  <th key={f} className="px-1 text-center text-2xs font-bold uppercase text-tx-3">
                    {f}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {linhas.map(({ andar, celulas }) => (
                <tr key={andar}>
                  <th scope="row" className="pr-1 text-left text-xs font-semibold tabular-nums text-tx-3">
                    {andar}º
                  </th>
                  {celulas.map((u, i) =>
                    u ? (
                      <td key={u.id}>
                        <span
                          role="img"
                          title={descricao(u)}
                          aria-label={descricao(u)}
                          className={cn(
                            'flex min-w-[2.75rem] items-baseline justify-center gap-0.5 rounded border px-1 py-0.5 text-xs font-semibold tabular-nums',
                            COR_DA_SITUACAO[u.status],
                          )}
                        >
                          {u.label}
                          {letra(u.status)}
                        </span>
                      </td>
                    ) : (
                      <td key={`vazio-${i}`} />
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {foraDaGrade.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {foraDaGrade.map((u) => (
            <span
              key={u.id}
              role="img"
              title={descricao(u)}
              aria-label={descricao(u)}
              className={cn(
                'inline-flex items-baseline gap-1 rounded border px-1.5 py-0.5 text-xs font-semibold',
                COR_DA_SITUACAO[u.status],
              )}
            >
              {rotuloDaUnidade(tipo, u.label)}
              {letra(u.status)}
            </span>
          ))}
        </div>
      )}

      <p className="flex flex-wrap gap-x-3 gap-y-1 text-2xs font-semibold uppercase text-tx-3">
        {UNIT_STATUSES.map((s) => (
          <span key={s} className="inline-flex items-center gap-1">
            <span aria-hidden className={cn('rounded-sm border px-1 font-bold', COR_DA_SITUACAO[s])}>
              {LETRA_DA_SITUACAO[s]}
            </span>
            {UNIT_STATUS_LABEL[s]}
          </span>
        ))}
      </p>
    </div>
  );
}
