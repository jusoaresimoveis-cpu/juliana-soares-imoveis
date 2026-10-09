import type { Home } from 'lucide-react';
import { Link } from 'react-router-dom';

/**
 * Atalho do painel.
 *
 * `para` é obrigatório de propósito. Estes três cartões nasceram sem destino
 * nenhum: pareciam botões, tinham `hover`, e não faziam nada. Um controle que
 * parece clicável e não responde ensina a pessoa a desconfiar do resto da tela
 * — e ela para de tentar antes de descobrir o que funciona.
 *
 * Com o destino no tipo, criar outro atalho morto deixa de compilar.
 *
 * O ROXO é o mesmo do menu lateral e do funil — `pri-light` a `pri-deep`, na
 * mesma direção. Eles eram cartões brancos entre outros cartões brancos, e o
 * painel inteiro é feito de cartão branco: nada dizia que ali se clicava. Cheio
 * de cor, o atalho para de ser mais um bloco de leitura e vira botão.
 *
 * A sombra usa a própria cor da marca, e não preto. Sombra preta embaixo de
 * roxo saturado suja o tom; a mesma cor mais fundo mantém a peça inteira.
 */
export function Atalho({
  icon: Icon,
  titulo,
  titulo2,
  sub,
  para,
}: {
  icon: typeof Home;
  /** Primeira metade do rótulo. No celular ela fica sozinha na linha de cima. */
  titulo: string;
  /** Segunda metade. Desce no celular e volta a fluir ao lado no computador. */
  titulo2: string;
  sub: string;
  para: string;
}) {
  return (
    <Link
      to={para}
      className="flex min-h-[84px] flex-col justify-between gap-2 rounded-lg bg-gradient-to-br from-pri-light via-pri to-pri-deep p-3 text-left text-pri-fg shadow-[0_10px_22px_-12px_var(--brilho)] transition-transform hover:-translate-y-0.5 sm:min-h-[92px] sm:p-3.5"
    >
      {/* O véu branco por cima do roxo, e não uma cor sólida: assim o quadrado
          do ícone acompanha o degradê em vez de brigar com ele. */}
      <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-pri-fg/20">
        <Icon className="h-4 w-4" />
      </span>
      <span>
        {/*
          A quebra é ESCRITA, não deixada para a largura decidir.

          Três botões numa tela de 375 dão ~105px cada, e o rótulo caberia em
          duas linhas por acaso — até um aparelho mais estreito, uma fonte
          maior por acessibilidade ou uma tradução mudarem a conta e "Agenda de
          visitas" virar três linhas, desalinhando o trio. Com as metades
          declaradas, a quebra é a mesma em qualquer aparelho.

          `sm:inline` devolve a frase inteira numa linha só no computador, onde
          o botão é medido pelo conteúdo e não há aperto.
        */}
        <b className="block text-base font-bold leading-tight">
          {titulo}
          <span className="block sm:inline"> {titulo2}</span>
        </b>
        {/* O apoio some no celular: em 105px ele viraria três linhas de 12px e
            o botão deixaria de ser botão para virar parágrafo. */}
        <small className="mt-0.5 hidden text-sm leading-snug text-pri-fg/75 sm:block">{sub}</small>
      </span>
    </Link>
  );
}
