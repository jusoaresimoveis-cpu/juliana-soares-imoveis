import type { UnidadeDaTabela } from './celula';

/**
 * A grade da tabela do mês e a ordem das listas, que a conferência também
 * segue; `unidades.ts` reexporta.
 */

/* -------------------------------------------------------------------------- */
/* A grade                                                                    */
/* -------------------------------------------------------------------------- */

export const natural = (a: string, b: string) => a.localeCompare(b, 'pt-BR', { numeric: true });

/** O final da unidade: "804" no andar 8 é o final "04". Sem andar, ou fora do padrão, não tem. */
export function finalDaUnidade(label: string, floor: number | null): string | null {
  if (floor === null) return null;
  const andar = String(floor);
  return label.startsWith(andar) && label.length > andar.length ? label.slice(andar.length) : null;
}

export interface LinhaDaGrade<U> {
  andar: number;
  /** Uma por final, na ordem de `finais`; nula onde o prédio não tem a unidade. */
  celulas: (U | null)[];
}

/**
 * A grade como a tabela da construtora: andares nas linhas, do mais alto para
 * o mais baixo, e finais nas colunas. A unidade sem andar (sala) ou com
 * rótulo fora do padrão andar + final fica fora, numa lista à parte.
 */
export function montarGrade<U extends Pick<UnidadeDaTabela, 'label' | 'floor'>>(
  unidades: readonly U[],
): { finais: string[]; linhas: LinhaDaGrade<U>[]; foraDaGrade: U[] } {
  const naGrade = new Map<string, U>();
  const andares = new Set<number>();
  const finais = new Set<string>();
  const foraDaGrade: U[] = [];

  for (const u of unidades) {
    const final = finalDaUnidade(u.label, u.floor);
    if (u.floor === null || final === null) {
      foraDaGrade.push(u);
      continue;
    }
    andares.add(u.floor);
    finais.add(final);
    naGrade.set(`${u.floor}|${final}`, u);
  }

  const colunas = [...finais].sort(natural);
  return {
    finais: colunas,
    linhas: [...andares]
      .sort((a, b) => b - a)
      .map((andar) => ({ andar, celulas: colunas.map((f) => naGrade.get(`${andar}|${f}`) ?? null) })),
    foraDaGrade: ordenarUnidades(foraDaGrade),
  };
}

/** A ordem das listas: do andar mais alto para o mais baixo, como a grade; sem andar por último, pelo rótulo. */
export function ordenarUnidades<U extends Pick<UnidadeDaTabela, 'label' | 'floor'>>(unidades: readonly U[]): U[] {
  return [...unidades].sort((a, b) => {
    if (a.floor !== b.floor) {
      if (a.floor === null) return 1;
      if (b.floor === null) return -1;
      return b.floor - a.floor;
    }
    return natural(a.label, b.label);
  });
}
