/**
 * A marca do CRM, num lugar só.
 *
 * Antes do login não existe organização para ler do banco, então o nome que a
 * tela de entrada mostra mora aqui. É o único arquivo a trocar (com o ícone em
 * `public/` e o `index.html`) para este código servir a outro cliente.
 */
export const MARCA = {
  nome: 'Juliana Soares',
  subtitulo: 'CRM Imobiliário',
  /** Ícone quadrado com o monograma, o mesmo da tela de início do celular. */
  icone: '/icone-192.png',
} as const;
