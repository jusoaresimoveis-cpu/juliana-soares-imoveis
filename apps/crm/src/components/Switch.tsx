import { cn } from '@/lib/utils';

/** O interruptor do CRM: no cadastro do imóvel e na marca d'água das fotos. */
export function Switch({
  marcado,
  onMudar,
  rotulo,
  desabilitado = false,
}: {
  marcado: boolean;
  onMudar: (v: boolean) => void;
  rotulo: string;
  desabilitado?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={marcado}
      disabled={desabilitado}
      onClick={() => onMudar(!marcado)}
      className="flex items-center gap-2.5 text-base font-semibold text-tx-2 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {/*
        `shrink-0` é o conserto.

        O trilho é item de um flex, e item de flex ENCOLHE por padrão quando o
        espaço aperta — os dois interruptores dividem a mesma linha. A largura
        de 36px virava vinte e poucos, enquanto a bolinha continuava andando os
        18px combinados para uma pista que não existia mais: ela saía pela
        direita e cobria a primeira letra do rótulo.

        E a posição da bolinha deixou de ser um número mágico. `left-0.5` fixa
        a folga da esquerda e `translate-x-4` anda exatamente o vão que sobra
        (36 − 16 − 2 − 2 = 16px), então mudar o tamanho do trilho não exige
        recalcular o deslocamento de cabeça.
      */}
      <span
        className={cn(
          'relative h-5 w-9 shrink-0 rounded-full transition-colors',
          marcado ? 'bg-pri' : 'bg-line-2',
        )}
      >
        <span
          className={cn(
            'absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform',
            marcado ? 'translate-x-4' : 'translate-x-0',
          )}
        />
      </span>
      {rotulo}
    </button>
  );
}
