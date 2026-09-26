import { House, KeyRound } from 'lucide-react';
import Image, { getImageProps } from 'next/image';

import { BotaoWhatsApp } from '@/components/BotaoWhatsApp';
import { Botao } from '@/components/ui/Botao';
import { MIDIA, type Foto } from '@/config/midia';
import { SITE } from '@/config/site';
import { urlDaListagem } from '@/lib/imoveis/listagem';

/*
 * Desktop: sombra PRETA só atrás do texto, como no modelo, e a foto com a cor
 * real da metade para a direita (a Juliana e o mar não podem ficar apagados).
 *
 * Os pontos do degradê são medidos a partir do MEIO da tela, e não da borda:
 * o texto mora num contêiner centralizado, então em qualquer largura ele
 * termina perto do meio. Medido da borda, a sombra acabaria no meio da frase
 * numa tela larga, ou cobriria a Juliana numa tela estreita.
 */
const SOMBRA_DO_TEXTO =
  'linear-gradient(90deg, rgb(0 0 0 / 0.8) 0%, rgb(0 0 0 / 0.62) calc(50% - 80px), rgb(0 0 0 / 0.28) calc(50% + 70px), rgb(0 0 0 / 0) calc(50% + 200px))';
/* O desfoque leve do modelo acompanha a sombra e some antes dela. */
const MASCARA_DO_DESFOQUE =
  'linear-gradient(90deg, #000 0%, #000 calc(50% - 60px), transparent calc(50% + 140px))';

/*
 * A largura em que o fundo é DESENHADO, que é o que o navegador precisa para
 * escolher o arquivo. Com `object-cover`, a foto mais "larga" que a caixa é
 * escalada pela altura e fica mais larga que a tela:
 *  - celular (<640px): faixa de 384px × 1,10 (corte quase quadrado) ≈ 424px,
 *    ou a tela, se maior;
 *  - tablet (640px a 1023px): faixa de 448px × 1,64 (corte largo) ≈ 734px,
 *    ou a tela, se maior;
 *  - desktop: topo de ~680px × 2,78 (panorâmica) ≈ 1900px, ou a tela, se maior.
 */
const TAMANHOS_CELULAR = '(min-width: 425px) 100vw, 424px';
const TAMANHOS_TABLET = '(min-width: 734px) 100vw, 734px';
const TAMANHOS_DESKTOP = '(min-width: 1900px) 100vw, 1900px';
const TELA_TABLET = '(min-width: 640px)';
const TELA_DESKTOP = '(min-width: 1024px)';

/**
 * Fundo com direção de arte: um corte por tamanho de tela, cada um na
 * proporção da caixa em que aparece (panorâmica no desktop, corte largo da
 * janela no tablet, corte quase quadrado no celular). O `<picture>` faz o
 * navegador baixar só UM deles. É o caminho que a documentação do Next indica
 * (`getImageProps`), e o `<img>` sai com o mesmo srcset otimizado do `Image`.
 */
function FundoDoHero({ foto }: { foto: Foto }) {
  const comum = { alt: '', fill: true } as const;
  const srcSetDe = (src: Foto['src'], sizes: string) => getImageProps({ ...comum, src, sizes }).props.srcSet;
  const { props } = getImageProps({
    ...comum,
    src: foto.celular ?? foto.src,
    sizes: TAMANHOS_CELULAR,
    // É o maior elemento da tela no celular e no desktop.
    loading: 'eager',
    fetchPriority: 'high',
  });

  return (
    <picture>
      <source media={TELA_DESKTOP} srcSet={srcSetDe(foto.src, TAMANHOS_DESKTOP)} sizes={TAMANHOS_DESKTOP} />
      {foto.tablet && (
        <source media={TELA_TABLET} srcSet={srcSetDe(foto.tablet, TAMANHOS_TABLET)} sizes={TAMANHOS_TABLET} />
      )}
      <img {...props} alt="" className="object-cover object-center sm:object-[65%_50%] lg:object-[55%_50%]" />
    </picture>
  );
}

/**
 * O topo da home, no desenho do modelo.
 *
 * Desktop: o fundo cobre tudo, escurecido à esquerda (onde está o texto), e a
 * Juliana fica à direita, apoiada na base: a caixa de busca sobe por cima da
 * cintura dela.
 *
 * Celular, como no modelo: a foto vem primeiro, com a cor viva no alto, e o
 * texto SOBE por cima da parte de baixo dela. Da metade da faixa para baixo o
 * fundo escurece até o preto, e o corpo da Juliana também se funde nele onde o
 * texto passa por cima (a blusa preta ajuda). Ela fica um pouco à direita.
 *
 * O fundo é o maior elemento da tela tanto no celular (a faixa da foto) quanto
 * no desktop (o topo inteiro): carrega na frente, com prioridade alta. A foto
 * da Juliana, menor que ele nas duas telas, carrega logo mas com prioridade
 * normal, para não disputar banda com o fundo no 4G.
 */
export function Hero() {
  const { julianaHero, fundoHero } = MIDIA;
  // Mesma altura para a faixa da foto e para o fundo no celular.
  const faixaDaFoto = 'h-96 sm:h-[28rem] lg:h-auto';

  return (
    <section className="relative isolate overflow-hidden bg-noite text-white">
      {fundoHero && (
        // Sem desfoque provisório (`placeholder="blur"`): ele é um filtro SVG,
        // caro de desenhar no celular. O preto de fundo faz o papel de espera.
        <div aria-hidden className={`absolute inset-x-0 top-0 -z-20 lg:bottom-0 ${faixaDaFoto}`}>
          <FundoDoHero foto={fundoHero} />
        </div>
      )}

      {/* Celular: foto viva até a metade da faixa; dali escurece até o preto, onde o texto sobe por cima. */}
      <div
        aria-hidden
        className={`absolute inset-x-0 top-0 -z-10 bg-linear-to-b from-transparent from-40% to-noite lg:hidden ${faixaDaFoto}`}
      />
      {/* Desktop: desfoque leve e sombra preta atrás do texto, sumindo até o meio. */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10 hidden backdrop-blur-[3px] lg:block"
        style={{ maskImage: MASCARA_DO_DESFOQUE, WebkitMaskImage: MASCARA_DO_DESFOQUE }}
      />
      <div aria-hidden className="absolute inset-0 -z-10 hidden lg:block" style={{ backgroundImage: SOMBRA_DO_TEXTO }} />

      <div className={`mx-auto grid max-w-7xl px-4 lg:px-8 ${julianaHero ? 'lg:grid-cols-[1.15fr_0.85fr]' : ''}`}>
        {julianaHero && (
          // No celular, o `after` escurece o pé da foto dela até o preto: é
          // onde o texto sobe por cima. Ele sai da margem do contêiner
          // (-inset-x-4) e vai de borda a borda: preso à largura do conteúdo,
          // deixava uma linha clara nas laterais.
          <div
            className={`relative lg:order-2 ${faixaDaFoto} after:absolute after:-inset-x-4 after:bottom-0 after:h-1/4 after:bg-linear-to-b after:from-transparent after:to-noite lg:after:hidden`}
          >
            <Image
              src={julianaHero.src}
              alt={julianaHero.alt}
              fill
              sizes="(min-width: 1024px) 420px, 260px"
              loading="eager"
              className="object-contain object-[80%_100%] lg:object-[70%_100%]"
            />
          </div>
        )}

        {/* `relative` põe o texto por cima da foto dela quando ele sobe (margem negativa, no celular). */}
        <div
          className={`relative max-w-2xl space-y-6 pb-28 lg:order-1 lg:pb-40 ${julianaHero ? '-mt-16 sm:-mt-20 lg:mt-0 lg:pt-20' : 'pt-12 sm:pt-16 lg:pt-20'}`}
        >
          {/* Sobre a foto, o caramelo não tem contraste para letra desse tamanho: fica branco, como no modelo.
              No celular o CRECI desce de linha: em versal espaçada, a frase inteira não cabe na largura. */}
          <p className="text-xs font-medium tracking-[0.3em] text-white/90 uppercase">
            Corretora de imóveis
            <span aria-hidden className="hidden sm:inline"> · </span>
            <span className="block sm:inline">{SITE.creci}</span>
          </p>
          {/* O título diz o quê e onde, com as palavras de quem busca: depois do título da aba, é o texto
              que mais pesa para o Google. O jeito de atender, que era o título do briefing, foi para o
              subtítulo (decisão de 26/09). O nome da cidade não quebra no meio: no desktop, "Belo"
              ficava sozinho na última linha, longe do "Porto". */}
          <h1 className="font-serif text-4xl leading-[1.12] text-balance sm:text-5xl lg:text-[3.5rem]">
            Imóveis à venda e para alugar em{' '}
            {SITE.areaAtendida.map((cidade) => cidade.nome.replaceAll(' ', ' ')).join(' e ')}
          </h1>
          {/* "Aluguel anual": em Itapema, quem busca aluguel quase sempre quer temporada, e aqui o aluguel é anual. */}
          <p className="max-w-lg text-base text-white/85 sm:text-lg">
            Compra, venda e aluguel anual com atendimento direto e personalizado, do primeiro contato ao fechamento.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Botao href={urlDaListagem({ finalidade: 'venda' })} icone={<House aria-hidden className="size-4" />}>
              Ver imóveis à venda
            </Botao>
            <Botao
              href={urlDaListagem({ finalidade: 'aluguel' })}
              estilo="contorno-claro"
              icone={<KeyRound aria-hidden className="size-4" />}
            >
              Ver imóveis para alugar
            </Botao>
            <BotaoWhatsApp />
          </div>
        </div>
      </div>
    </section>
  );
}
