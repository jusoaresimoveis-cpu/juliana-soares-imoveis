import {
  META_AD_LEVEL_LABEL,
  META_ENTREGA_META,
  formatarGasto,
  entregaDoStatus,
  type MetaAdLevel,
  type MetaEntrega,
} from '@contracts';
import type { LinhaDeGasto } from '@/hooks/useMeta';
import { cn } from '@/lib/utils';

/**
 * O que o filtro escondeu — e quanto isso custou no período.
 *
 * Sem esta linha o filtro seria uma armadilha. A tabela continua somando um
 * "Total", e com metade das linhas fora ele deixa de ser o gasto do período
 * sem nada na tela dizendo isso: um número errado com cara de certo, na tela
 * onde se decide verba.
 *
 * E o que está "com problema" aparece em destaque. É o pior caso possível de
 * esconder: gastou, parou de entregar, e ninguém mandou parar — a única linha
 * aqui que pede alguém hoje.
 */
export function Ocultas({ linhas, nivel }: { linhas: LinhaDeGasto[]; nivel: MetaAdLevel }) {
  if (linhas.length === 0) return null;

  const moeda = linhas[0]?.currency ?? 'BRL';
  // Moedas diferentes não se somam — o mesmo cuidado do total da tabela.
  const umaMoeda = linhas.every((l) => l.currency === moeda);
  const gasto = linhas.reduce((s, l) => s + l.spend_minor, 0);

  const porEstado = new Map<MetaEntrega, number>();
  for (const l of linhas) {
    const e = entregaDoStatus(l.status);
    porEstado.set(e, (porEstado.get(e) ?? 0) + 1);
  }

  const pedeAtencao = [...porEstado.keys()].some((e) => META_ENTREGA_META[e].atencao);
  const substantivo = META_AD_LEVEL_LABEL[nivel].toLowerCase() + (linhas.length === 1 ? '' : 's');

  return (
    <p
      className={cn(
        'mb-3 rounded-xl px-3 py-2 text-sm',
        pedeAtencao ? 'bg-warn-soft text-warn' : 'bg-card-2 text-tx-2',
      )}
    >
      <b>{linhas.length}</b> {substantivo} fora do ar
      {umaMoeda && (
        <>
          {' '}
          {linhas.length === 1 ? 'gastou' : 'gastaram'} <b>{formatarGasto(gasto, moeda)}</b> no
          período
        </>
      )}{' '}
      e {linhas.length === 1 ? 'está oculto' : 'estão ocultos'} —{' '}
      {[...porEstado.entries()]
        .map(([e, n]) => `${n} ${META_ENTREGA_META[e].rotulo.toLowerCase()}`)
        .join(' · ')}
      .
    </p>
  );
}
