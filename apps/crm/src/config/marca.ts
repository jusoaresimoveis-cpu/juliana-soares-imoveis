/**
 * A marca do CRM, num lugar só.
 *
 * Antes do login não existe organização para ler do banco, então o nome que a
 * tela de entrada mostra mora aqui. É o único arquivo a trocar (com os ícones em
 * `public/` e o `index.html`) para este código servir a outro cliente.
 */
export const MARCA = {
  nome: 'Juliana Soares',
  subtitulo: 'CRM Imobiliário',
  /**
   * O quadrado bronze com o símbolo, o mesmo da tela de início do celular. Em
   * SVG, e não o PNG do app: no topo ele tem 22px, e o telhado do símbolo é um
   * traço fino que o PNG reduzido borra.
   */
  icone: '/favicon.svg',
} as const;
