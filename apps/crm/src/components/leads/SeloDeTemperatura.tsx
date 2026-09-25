import { TEMPERATURA_LABEL, TEMPERATURA_MATIZ, type Temperatura } from '@contracts';
import { cn } from '@/lib/utils';

/**
 * As duas cores de uma temperatura: o ponto e o fundo do selo.
 *
 * Mesmo desenho da bolinha de origem do cartão — matiz fixo vindo do contrato,
 * luminosidade decidida aqui. O fundo é o próprio matiz com transparência, e é
 * isso que o faz funcionar nos dois temas sem um par de cores para cada um: ele
 * clareia o cartão claro e acende o cartão escuro. O TEXTO fica na cor neutra
 * da tela, que já tem contraste garantido nos dois.
 */
export function corDaTemperatura(t: Temperatura): { ponto: string; fundo: string } {
  const matiz = TEMPERATURA_MATIZ[t];
  return { ponto: `hsl(${matiz} 82% 52%)`, fundo: `hsl(${matiz} 85% 55% / 0.16)` };
}

export function ehTemperatura(valor: unknown): valor is Temperatura {
  return typeof valor === 'string' && valor in TEMPERATURA_LABEL;
}

interface Props {
  valor: string | null | undefined;
  /** Marcada à mão pelo corretor, e não saída da regra. */
  manual?: boolean;
  /**
   * O que mostrar quando ninguém qualificou.
   *
   * No cartão do quadro, nada: no primeiro dia TODOS os leads estão sem
   * qualificação, e um selo cinza em cem cartões vira papel de parede. Na ficha
   * e na prévia há espaço, e ali a ausência é informação — é o convite para
   * perguntar.
   */
  vazio?: 'nada' | 'avisar';
  className?: string;
}

export function SeloDeTemperatura({ valor, manual, vazio = 'nada', className }: Props) {
  if (!ehTemperatura(valor)) {
    if (vazio === 'nada') return null;
    return (
      <span className={cn('rounded bg-card-2 px-1.5 py-0.5 text-xs font-bold text-tx-3', className)}>
        Sem qualificação
      </span>
    );
  }

  const cor = corDaTemperatura(valor);
  return (
    <span
      title={manual ? 'Marcada à mão' : undefined}
      className={cn(
        'inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 text-xs font-bold text-tx',
        className,
      )}
      style={{ background: cor.fundo }}
    >
      <i aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: cor.ponto }} />
      {TEMPERATURA_LABEL[valor]}
      {manual && <span className="font-semibold text-tx-3">· à mão</span>}
    </span>
  );
}
