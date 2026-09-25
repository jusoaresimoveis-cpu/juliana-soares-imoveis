import type { Config } from 'tailwindcss';

/**
 * Os valores reais das cores vivem em CSS variables no index.css, e o Tailwind
 * apenas as referencia. É o que permite trocar o tema claro/escuro sem
 * recompilar classe nenhuma, e o que deixa o design system em um lugar só.
 *
 * O `<alpha-value>` não é decoração: sem ele, toda classe com barra
 * (`bg-pri/40`, `text-tx/70`) gera uma declaração inválida que o navegador
 * descarta em silêncio — a classe aparece no HTML e não pinta nada. Foi
 * exatamente o que aconteceu com o realce do card no Kanban.
 */
const cor = (nome: string) => `hsl(var(--${nome}) / <alpha-value>)`;

export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: cor('bg'),
        sheet: cor('sheet'),
        card: { DEFAULT: cor('card'), 2: cor('card-2') },
        line: { DEFAULT: cor('line'), 2: cor('line-2') },

        tx: { DEFAULT: cor('tx'), 2: cor('tx-2'), 3: cor('tx-3') },

        pri: {
          DEFAULT: cor('pri'),
          deep: cor('pri-2'),
          light: cor('pri-3'),
          soft: cor('pri-soft'),
          fg: cor('pri-fg'),
        },

        ok: { DEFAULT: cor('ok'), soft: cor('ok-soft') },
        warn: { DEFAULT: cor('warn'), soft: cor('warn-soft') },
        dng: { DEFAULT: cor('dng'), soft: cor('dng-soft') },
      },
      borderRadius: {
        lg: '22px',
        md: '16px',
        sm: '11px',
      },
      boxShadow: {
        sheet: '0 32px 80px -24px hsl(var(--shadow-sheet))',
        card: '0 2px 4px hsl(var(--shadow-card-a)), 0 12px 28px -14px hsl(var(--shadow-card-b))',
        pop: '0 8px 24px -6px hsl(var(--shadow-pop))',
      },
      fontFamily: {
        /*
         * Poppins, hospedada no projeto (ver o topo de `index.css`).
         *
         * Geométrica, com contraste forte entre o 300 e o 700 — é essa
         * diferença que o material da imobiliária usa: linha fina em cima,
         * linha encorpada embaixo. A pilha de sistema fica atrás como reserva
         * para o instante antes de a fonte carregar.
         */
        sans: ['Poppins', 'Segoe UI Variable Display', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },

      /**
       * Escala tipográfica. Cada degrau carrega o próprio entrelinha E o próprio
       * espaçamento entre letras — e isso resolve dois problemas de uma vez.
       *
       * 1. O espaçamento acompanha o tamanho. Tracking negativo serve para texto
       *    grande, onde as letras já se tocam; no miúdo ele fecha justamente o
       *    branco que o olho usa para separar as formas. Por isso a curva sai de
       *    +0.03em nos rótulos de 10px e só fica negativa a partir de 14px.
       *    Antes a tela usava `tracking-tight` (-0.025em) em tudo, do título de
       *    32px à etiqueta de 10px.
       *
       * 2. Quebra a herança em pixel. `letter-spacing` declarado em `em` vira
       *    pixel NO ELEMENTO QUE DECLARA, e os filhos herdam o pixel já
       *    resolvido — não o `em`. Uma etiqueta de 10.5px dentro de um nome de
       *    13.5px com -0.025em herdava -0.344px, ou seja -0.032em: mais apertada
       *    que o pai. Como aqui todo degrau redeclara o espaçamento, a cadeia de
       *    herança morre em cada elemento.
       *
       * Mexer nestes valores muda a tela inteira. É de propósito.
       */
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '1.35', letterSpacing: '0.03em' }],
        xs: ['0.6875rem', { lineHeight: '1.45', letterSpacing: '0.012em' }],
        sm: ['0.75rem', { lineHeight: '1.5', letterSpacing: '0.004em' }],
        base: ['0.8125rem', { lineHeight: '1.55', letterSpacing: '0em' }],
        md: ['0.875rem', { lineHeight: '1.45', letterSpacing: '-0.008em' }],
        lg: ['1rem', { lineHeight: '1.35', letterSpacing: '-0.016em' }],
        xl: ['1.125rem', { lineHeight: '1.3', letterSpacing: '-0.021em' }],
        '2xl': ['1.375rem', { lineHeight: '1.22', letterSpacing: '-0.026em' }],
        '3xl': ['1.75rem', { lineHeight: '1.18', letterSpacing: '-0.03em' }],
      },
    },
  },
  plugins: [],
} satisfies Config;
