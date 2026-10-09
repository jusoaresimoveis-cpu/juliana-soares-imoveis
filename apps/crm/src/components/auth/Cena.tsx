import { ShieldCheck } from 'lucide-react';
import { MARCA } from '@/config/marca';
import { ENTRADA } from '@/config/temaEntrada';

/**
 * A ilustração, sangrando pelo canto de cima à esquerda.
 *
 * A forma orgânica vem no ALFA do PNG, e não de `clip-path` nem de
 * `border-radius`: é um contorno desenhado, com reentrâncias e bolhas soltas,
 * que nenhuma primitiva de CSS reproduz. O que o CSS faz é o segundo corte —
 * o canto arredondado da moldura passa por cima do desenho, e é dele que vem a
 * sensação de janela.
 *
 * O sangramento é feito com MARGEM NEGATIVA, e não com `translate`.
 *
 * A primeira versão usava `absolute` e ficou bonita e errada: fora do fluxo, a
 * ilustração não ocupava a linha da grade, a linha colapsou, e o bloco de marca
 * subiu para debaixo do desenho. Medi onde o logo caía — 99% opaco, sobre a
 * folhagem índigo `rgb(34,31,146)` — e o nome da marca, em índigo escuro,
 * ficava sobre índigo escuro. Ilegível, e sem nenhum aviso: as duas coisas
 * apareciam na tela, só que uma dentro da outra.
 *
 * Com margem, o navegador desconta o deslocamento da altura da célula. A
 * ilustração continua sangrando para fora da moldura, e a linha de baixo
 * começa exatamente onde ela termina.
 *
 * `aria-hidden` e `alt` vazio: é cenário. Quem usa leitor de tela não ganha
 * nada com "ilustração de cidade litorânea" antes do formulário de entrada.
 */
export function Cena() {
  return (
    /*
     * `min-h-0` é o que permite esta célula ENCOLHER.
     *
     * Item de grade tem tamanho mínimo automático igual ao conteúdo, então uma
     * linha `1fr` com uma imagem grande dentro não encolhe: ela empurra a
     * moldura para baixo e a tela de login passa a rolar. Ajustei a largura da
     * ilustração duas vezes tentando fazer caber em 1440 antes de ver que o
     * problema não era o número — era a célula não poder ceder.
     */
    <div className="pointer-events-none lg:col-start-1 lg:row-start-1 lg:min-h-0">
      <img
        src="/marca/login-cena-1170.webp"
        srcSet="/marca/login-cena-700.webp 700w, /marca/login-cena-1170.webp 1170w"
        sizes="(min-width: 1024px) 58vw, 118vw"
        alt=""
        aria-hidden
        width={1170}
        height={1024}
        /*
         * A altura vem da TELA, não da célula — e a diferença não é estilo.
         *
         * A versão anterior media a imagem em `100% + 2.5rem` da própria linha
         * da grade. Isso é circular: a linha depende do conteúdo e o conteúdo
         * depende da linha. O navegador desempata pelo tamanho intrínseco, a
         * linha travou em 347px onde cabiam 328, e a tela voltou a rolar — 19px
         * que nenhum ajuste de porcentagem ia resolver, porque o problema era a
         * referência, não o número.
         *
         * `100svh - 332px` fecha a conta: 56 de respiro da página, 316 do bloco
         * de marca abaixo, menos os 40 que o topo sangra para fora. O `0.95`
         * é a redução de 5% pedida. Se o texto da marca mudar de altura, o 332
         * é o número a revisitar.
         *
         * O DESLOCAMENTO é grande de propósito. O canto de cima à esquerda do
         * DESENHO é vazio — medido no arquivo: na primeira linha a tinta só
         * começa aos 30,9% da largura, e na altura de 10% aos 13,8%. O recorte
         * curva para dentro justamente ali. Encostar a imagem no canto da
         * moldura deixaria a curva à mostra e a areia do cartão apareceria por
         * trás; empurrando, é a barriga da forma que passa pelo canto.
         */
        className="-ml-[16%] -mt-9 w-[132%] max-w-none select-none lg:-ml-[15%] lg:-mt-[74px] lg:h-[calc((100svh-332px)*0.95)] lg:w-auto lg:object-contain lg:object-left-top"
      />
    </div>
  );
}

/** Logo, promessa e o selo — o que diz de quem é este sistema. */
export function Marca() {
  return (
    /* Centralizado no celular, alinhado à esquerda no computador: lá o bloco
       se apoia na margem da coluna; aqui ele é a última coisa da tela, sozinho
       na largura, e encostado à esquerda ficaria torto sob um cartão centrado. */
    <div className="relative px-6 pb-9 text-center sm:px-8 lg:col-start-1 lg:row-start-2 lg:px-12 lg:pb-11 lg:pt-2 lg:text-left">
      <div className="mx-auto max-w-[420px] lg:mx-0 lg:max-w-[480px]">
        <div className="flex items-center justify-center gap-3 lg:justify-start">
          <img src={MARCA.icone} alt="" className="h-11 w-11 shrink-0 rounded-[13px]" />
          <span>
            <span className="block text-xl font-bold leading-none" style={{ color: ENTRADA.titulo }}>
              {MARCA.nome}
            </span>
            <span className="block text-base" style={{ color: ENTRADA.apagado }}>
              {MARCA.subtitulo}
            </span>
          </span>
        </div>

        <h2
          className="mt-6 text-2xl font-bold leading-[1.2] sm:text-3xl"
          style={{ color: ENTRADA.titulo }}
        >
          Seus clientes,
          <br />
          seus imóveis,
          <br />
          <span style={{ color: ENTRADA.marca }}>num lugar só.</span>
        </h2>

        <p className="mx-auto mt-3 max-w-[40ch] text-md lg:mx-0" style={{ color: ENTRADA.texto }}>
          Leads, imóveis, visitas e conversas do WhatsApp, de venda e de aluguel.
        </p>

        <p
          className="mt-6 flex items-center justify-center gap-2 text-base lg:justify-start"
          style={{ color: ENTRADA.apagado }}
        >
          <ShieldCheck className="h-4 w-4 shrink-0" style={{ color: ENTRADA.marca }} aria-hidden />
          Seus dados 100% seguros
        </p>
      </div>
    </div>
  );
}
