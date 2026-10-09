/**
 * O valor sem o qual o teste não tem como seguir. Faz o papel do `!`, mas
 * falha AQUI, dizendo o que faltou, e não num "Cannot read properties of
 * undefined" linhas adiante.
 */
export function exigir<T>(valor: T, oQue = 'o valor esperado'): NonNullable<T> {
  if (valor === null || valor === undefined) throw new Error(`faltou ${oQue}`);
  return valor;
}
