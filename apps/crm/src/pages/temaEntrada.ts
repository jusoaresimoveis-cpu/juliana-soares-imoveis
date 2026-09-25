/**
 * A paleta da porta de entrada — e ela NÃO é a do painel.
 *
 * Todo o resto do CRM veste tokens (`bg-bg`, `text-tx`) que viram com o tema
 * claro/escuro do corretor. Aqui isso não faz sentido por dois motivos, e o
 * segundo é o que decide:
 *
 *   1. Antes do login não existe corretor, logo não existe preferência. O que
 *      aparecia era o padrão do app vazando numa tela que devia ser da marca.
 *   2. Esta é a única tela que diz de quem é o SISTEMA. Uma porta de entrada
 *      que muda de cara conforme quem chega não é identidade, é reflexo.
 *
 * A areia, o bronze e a tinta são os do site da Juliana (`apps/site`,
 * `globals.css`): o CRM é a mesma marca vista por dentro. A cena do login é a
 * foto do topo do site, recortada na forma que esta tela foi medida.
 */
export const ENTRADA = {
  /** O papel atrás de tudo. */
  papel: '#FFFFFF',
  /** O cartão grande que emoldura a tela inteira. */
  moldura: '#F4EEE5',
  /*
   * O cartão do formulário, sobre a moldura.
   *
   * 0,64: vidro, com a foto atravessando. O piso é o TEXTO: sobre a moldura
   * areia, o título dá 14:1 e o cinza do apoio 5,6:1. Abaixo disso a foto
   * começa a competir com a leitura.
   */
  vidro: 'rgb(255 255 255 / 0.64)',
  vidroBorda: 'rgb(255 255 255 / 0.85)',

  /** O bronze da marca: botão, links e as palavras em destaque. 4,9:1 com branco. */
  marca: '#8B6A40',
  marcaFunda: '#735732',
  marcaTinta: '#FFFFFF',

  /** Tinta dos títulos: o grafite do site, e não preto. */
  titulo: '#1E2229',
  texto: '#5F5A52',
  apagado: '#6F685F',

  /** Campos. */
  campo: '#FFFFFF',
  campoBorda: '#E4DCD0',
} as const;
