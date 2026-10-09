import { TriangleAlert } from 'lucide-react';
import type { MetaAdLevel } from '@contracts';
import { cn } from '@/lib/utils';

/**
 * O denominador, ao lado do número.
 *
 * Custo por lead só significa alguma coisa com a cobertura da atribuição
 * visível. O sistema auditado dividia o gasto por TODOS os leads da
 * organização, indicação e placa na rua incluídas: o custo saía barato e a
 * decisão de verba era tomada em cima disso.
 */
export function Cobertura({ com, total, nivel }: { com: number; total: number; nivel: MetaAdLevel }) {
  if (nivel !== 'ad') {
    return (
      <p className="mb-3 rounded-xl bg-card-2 p-3 text-sm text-tx-2">
        O lead carrega o id do <b>anúncio</b>, não o da campanha. Por isso a coluna de leads e o
        custo por lead só aparecem no nível de anúncio — somar por campanha aqui inventaria um
        número.
      </p>
    );
  }

  const pct = total > 0 ? Math.round((com / total) * 100) : 0;
  const pouco = total > 0 && pct < 60;

  return (
    <p
      className={cn(
        'mb-3 flex items-start gap-2 rounded-xl p-3 text-sm',
        pouco ? 'bg-warn-soft text-warn' : 'bg-card-2 text-tx-2',
      )}
    >
      {pouco && <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
      <span>
        <b>
          {com} de {total} leads
        </b>{' '}
        do período têm atribuição da Meta ({pct}%). O custo por lead divide o gasto só por esses —
        os outros {total - com} vieram de outro caminho ou não puderam ser atribuídos.
      </span>
    </p>
  );
}
