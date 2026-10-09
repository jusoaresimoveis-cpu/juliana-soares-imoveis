/**
 * O valor sem o qual a consulta não tem como seguir. Faz o papel do `!`, mas
 * falha AQUI, antes da rede, dizendo o que faltou.
 *
 * O `enabled: !!x` do React Query não basta: ele segura a busca automática,
 * mas o `refetch()` manual passa por cima dele, e a mutation nem o tem. Com o
 * `!`, o null seguia para o banco e voltava como erro do servidor (ou estourava
 * num TypeError adiante).
 */
export function exigir<T>(valor: T, oQue: string): NonNullable<T> {
  if (valor === null || valor === undefined) throw new Error(`faltou ${oQue}`);
  return valor;
}
