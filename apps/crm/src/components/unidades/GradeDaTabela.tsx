import type { KeyboardEvent } from 'react';
import type { Unidade } from '@/hooks/useUnidades';
import { COR_DA_SITUACAO } from '@/components/properties/Empreendimento';
import { legendaDaCelula, type Vista } from '@/lib/legendaDaCelula';
import { lerCelula, montarGrade } from '@/lib/unidades';
import { cn } from '@/lib/utils';

/**
 * A grade, como a tabela da construtora: andares nas linhas (do mais alto para
 * o mais baixo) e finais nas colunas. Tab anda para o lado, Enter desce.
 */
export function GradeDaTabela({
  grade,
  texto,
  vista,
  editar,
  rotulo,
  nomeDaPlanta,
}: {
  grade: ReturnType<typeof montarGrade<Unidade>>;
  texto: (u: Unidade) => string;
  vista: (u: Unidade) => Vista;
  editar: (u: Unidade, valor: string) => void;
  rotulo: (u: Unidade) => string;
  nomeDaPlanta: Map<string, string>;
}) {
  const totalDeLinhas = grade.linhas.length;

  function mover(e: KeyboardEvent<HTMLInputElement>, linha: number, coluna: number) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const passo = e.shiftKey ? -1 : 1;
    // Pula o buraco (o andar que não tem aquele final).
    for (let l = linha + passo; l >= 0 && l < totalDeLinhas; l += passo) {
      const alvo = document.querySelector<HTMLInputElement>(`[data-celula="${l}-${coluna}"]`);
      if (alvo) {
        alvo.focus();
        return;
      }
    }
  }

  return (
    <table className="border-separate border-spacing-1">
      <thead>
        <tr>
          <th className="px-1 text-left text-2xs font-bold uppercase text-tx-3">Andar</th>
          {grade.finais.map((f) => (
            <th key={f} className="px-1 text-left text-2xs font-bold uppercase text-tx-3">
              Final {f}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {grade.linhas.map(({ andar, celulas }, l) => (
          <tr key={andar}>
            <th scope="row" className="pr-1 text-left text-sm font-semibold tabular-nums text-tx-3">
              {andar}º
            </th>
            {celulas.map((u, c) => {
              if (!u) return <td key={`vazio-${c}`} />;
              const t = texto(u);
              const base = vista(u);
              const leg = legendaDaCelula(base, t);
              const erro = lerCelula(t, base.price_cents);
              return (
                <td key={u.id}>
                  {/* O foco fica na célula inteira (o contorno escuro), e não no
                      campo de dentro: o anel do campo cobriria o valor. */}
                  <label
                    title={erro.ok ? undefined : erro.erro}
                    className={cn(
                      'block w-[7.75rem] rounded-md border px-1.5 pb-1 pt-0.5 focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-tx',
                      leg.status ? COR_DA_SITUACAO[leg.status] : 'border-dng bg-dng-soft text-dng',
                      leg.mudou && leg.ok && 'ring-2 ring-pri',
                    )}
                  >
                    <span className="flex items-baseline justify-between text-2xs font-bold">
                      <span>{u.label}</span>
                      {leg.mudou && leg.ok && <span className="text-pri">mudou</span>}
                    </span>
                    <input
                      value={t}
                      onChange={(e) => editar(u, e.target.value)}
                      onFocus={(e) => e.currentTarget.select()}
                      onKeyDown={(e) => mover(e, l, c)}
                      data-celula={`${l}-${c}`}
                      aria-label={`${rotulo(u)}, ${nomeDaPlanta.get(u.floorplan_id) ?? ''}`}
                      aria-invalid={!erro.ok || undefined}
                      spellCheck={false}
                      autoComplete="off"
                      className="w-full bg-transparent text-sm font-semibold tabular-nums text-tx outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
                    />
                    <span className={cn('block truncate text-2xs', leg.alerta && 'font-bold text-dng')}>{leg.texto}</span>
                  </label>
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
