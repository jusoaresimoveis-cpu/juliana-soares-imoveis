/**
 * Uma visita por aparelho, por imóvel e por dia.
 *
 * O contador lê "pessoas que abriram a página no dia", e não recarregamentos:
 * quem volta cinco vezes à página para rever as fotos conta uma. O aparelho
 * guarda só o dia e os códigos já contados nele, e a lista zera quando o dia
 * muda.
 */

export const CHAVE_DAS_VISITAS = 'visitas-do-dia';

export function registrarNoAparelho(
  guardado: string | null,
  codigo: string,
  hoje: string,
): { contar: boolean; guardar: string } {
  let codigos: string[] = [];
  try {
    const lido = JSON.parse(guardado ?? 'null') as { dia?: unknown; codigos?: unknown } | null;
    if (lido?.dia === hoje && Array.isArray(lido.codigos)) {
      codigos = lido.codigos.filter((c): c is string => typeof c === 'string');
    }
  } catch {
    // Guardado ilegível: começa do zero.
  }

  if (codigos.includes(codigo)) return { contar: false, guardar: JSON.stringify({ dia: hoje, codigos }) };
  return { contar: true, guardar: JSON.stringify({ dia: hoje, codigos: [...codigos, codigo] }) };
}

/** Robô que executa JavaScript não é visita (o do Google executa). */
export function pareceRobo(userAgent: string): boolean {
  return /bot|crawl|spider|slurp|headless|lighthouse|inspection/i.test(userAgent);
}

/** O dia no relógio do aparelho. Quem fecha o dia no banco é o horário de Brasília. */
export function diaDoAparelho(agora = new Date()): string {
  const dois = (n: number) => String(n).padStart(2, '0');
  return `${agora.getFullYear()}-${dois(agora.getMonth() + 1)}-${dois(agora.getDate())}`;
}
