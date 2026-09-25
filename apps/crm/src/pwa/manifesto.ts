import type { ManifestOptions } from 'vite-plugin-pwa';

/**
 * O manifesto — o que realmente faz o site virar app.
 *
 * Fora do `vite.config.ts` por um motivo: aqui ele pode ser LIDO por teste. É
 * um arquivo que ninguém abre por meses e cuja quebra é silenciosa — trocar
 * `display` ou perder o ícone de 192 não derruba nada, não aparece no build,
 * não aparece na tela. O botão "Instalar app" simplesmente para de instalar, e
 * o iPhone para de aceitar push junto, porque lá o push depende do app na tela
 * de início.
 */
export const manifesto: Partial<ManifestOptions> = {
  name: 'Juliana Soares · CRM',
  short_name: 'CRM Juliana',
  description: 'CRM da Juliana Soares: leads, imóveis, visitas e conversas.',
  lang: 'pt-BR',

  /*
   * Identidade estável do app instalado.
   *
   * Sem `id`, o Chrome identifica o app pela `start_url` — e no dia em que ela
   * mudar (um `?origem=app`, uma tela inicial diferente), o aparelho passa a
   * ver um app NOVO: o ícone antigo fica órfão na tela e a inscrição de push
   * ligada a ele morre junto. Fixar agora custa uma linha.
   */
  id: '/',
  start_url: '/',
  scope: '/',

  // O item que faz a janela abrir sem barra de endereço. É este, e só este.
  display: 'standalone',

  /*
   * `any` e não `portrait`.
   *
   * Travar em retrato faria sentido num app de consulta rápida. Aqui o funil é
   * uma tabela larga: no tablet do corretor, retrato forçado espreme as colunas
   * e o aparelho ainda ignora o giro físico, o que parece defeito do CRM.
   */
  orientation: 'any',

  // O areia do fundo e o bronze da marca (`hslParaHex` do bronze de cores.ts).
  background_color: '#F7F1E9',
  theme_color: '#8c6b40',

  icons: [
    // O Chrome exige um 192 e um 512 de propósito padrão para considerar o site
    // instalável. Sem os dois, o `beforeinstallprompt` nunca dispara e o botão
    // cai no passo a passo manual em TODO aparelho.
    { src: '/icone-192.png', sizes: '192x192', type: 'image/png' },
    { src: '/icone-512.png', sizes: '512x512', type: 'image/png' },
    {
      /*
       * O maskable fica separado, e não como `purpose: 'any maskable'` no mesmo
       * ícone — que é o que a maioria dos exemplos faz.
       *
       * Um ícone maskable é desenhado com margem de segurança, porque o Android
       * recorta as bordas para encaixar no formato do sistema. Reaproveitá-lo
       * como `any` entrega essa margem intacta para quem não recorta nada: no
       * Windows e no Linux a marca aparece pequena, boiando no meio de um
       * quadrado vazio.
       */
      src: '/icone-maskable-512.png',
      sizes: '512x512',
      type: 'image/png',
      purpose: 'maskable',
    },
  ],
};
