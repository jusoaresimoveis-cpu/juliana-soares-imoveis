import { TriangleAlert } from 'lucide-react';
import { useUltimaSincronizacao } from '@/hooks/useMeta';
import { frescorDoConjunto } from '@/lib/anuncios';
import { cn } from '@/lib/utils';

/**
 * De onde vem o "atualizado às".
 *
 * Do HISTÓRICO de sincronização, nunca do conteúdo da tabela. O sistema
 * auditado desenhava um selo fixo de "Tempo real" e calculava a última
 * atualização como a data máxima das linhas — que é a data do GASTO, não a da
 * importação. Com a integração parada há uma semana, o selo continuava verde.
 */
export function Frescor() {
  const sync = useUltimaSincronizacao();
  const f = frescorDoConjunto(sync.data ?? []);

  if (f.vazio) return <p className="mt-0.5 text-sm text-tx-3">Nenhuma importação ainda.</p>;

  const quando = f.maisAtrasada
    ? new Date(f.maisAtrasada).toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'em andamento';

  const problema = f.problemas > 0;
  // "1 de 2 contas" só quando há mais de uma: com uma conta só, o número seria
  // ruído sobre uma informação que não tem alternativa.
  const quantas = f.total > 1 ? ` de ${f.total} contas` : '';

  return (
    <p className={cn('mt-0.5 flex items-center gap-1.5 text-sm', problema ? 'text-warn' : 'text-tx-3')}>
      {problema && <TriangleAlert className="h-3 w-3 shrink-0" />}
      Importado em {quando}
      {problema && ` — ${f.problemas}${quantas} com problema`}
      {f.falhou && ' (falhou)'}
      {f.truncado && ' (interrompido pelo limite da Meta)'}
      {!problema && f.emAndamento > 0 && ` — ${f.emAndamento} importando agora`}
    </p>
  );
}
