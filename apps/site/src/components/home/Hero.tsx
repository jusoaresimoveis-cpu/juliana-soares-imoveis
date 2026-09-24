import { House, KeyRound } from 'lucide-react';
import Image, { getImageProps } from 'next/image';

import { BotaoWhatsApp } from '@/components/BotaoWhatsApp';
import { Botao } from '@/components/ui/Botao';
import { MIDIA, type Foto } from '@/config/midia';
import { urlDaListagem } from '@/lib/imoveis/listagem';

/*
 * A largura em que o fundo é DESENHADO, que é o que o navegador precisa para
 * escolher o arquivo. Com `object-cover`, a foto é escalada pela altura e fica
 * mais larga que a própria caixa:
 *  - celular (<640px): faixa de 320px × 1,64 (proporção do corte) ≈ 525px;
 *  - de 640px a 1023px: a largura da tela vence;
 *  - desktop: topo de ~680px × 2,78 (panorâmica) ≈ 1900px, ou a tela, se maior.
 */
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

const TAMANHOS_CELULAR = '(min-width: 640px) 100vw, 530px';
const TAMANHOS_DESKTOP = '(min-width: 1900px) 100vw, 1900px';
const TELA_DESKTOP = '(min-width: 1024px)';

/**
 * Fundo com direção de arte: a panorâmica inteira no desktop e, abaixo dele, o
 * corte da janela com o mar. O `<picture>` faz o navegador baixar só UMA das
 * duas. É o caminho que a documentação do Next indica (`getImageProps`), e o
 * `<img>` sai com o mesmo srcset otimizado do componente `Image`.
 */
function FundoDoHero({ foto }: { foto: Foto }) {
  const comum = { alt: '', fill: true } as const;
  const {
    props: { srcSet: srcSetDesktop },
  } = getImageProps({ ...comum, src: foto.src, sizes: TAMANHOS_DESKTOP });
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
      <source media={TELA_DESKTOP} srcSet={srcSetDesktop} sizes={TAMANHOS_DESKTOP} />
      <img {...props} alt="" className="object-cover object-[65%_50%] lg:object-[55%_50%]" />
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
 * Celular: a foto vem primeiro, numa faixa com o fundo atrás e sem nenhum
 * escurecimento em cima; só o pé da faixa escurece, para emendar com o preto
 * onde fica o texto. A blusa preta se funde com esse preto.
 *
 * O fundo é o maior elemento da tela tanto no celular (a faixa da foto) quanto
 * no desktop (o topo inteiro): carrega na frente, com prioridade alta. A foto
 * da Juliana, menor que ele nas duas telas, carrega logo mas com prioridade
 * normal, para não disputar banda com o fundo no 4G.
 */
export function Hero() {
  const { julianaHero, fundoHero } = MIDIA;
  // Mesma altura para a faixa da foto e para o fundo no celular.
  const faixaDaFoto = 'h-80 sm:h-96 lg:h-auto';

  return (
    <section className="relative isolate overflow-hidden bg-noite text-white">
      {fundoHero && (
        // Sem desfoque provisório (`placeholder="blur"`): ele é um filtro SVG,
        // caro de desenhar no celular. O preto de fundo faz o papel de espera.
        <div aria-hidden className={`absolute inset-x-0 top-0 -z-20 lg:bottom-0 ${faixaDaFoto}`}>
          <FundoDoHero foto={fundoHero} />
        </div>
      )}

      {/* Celular: só o pé da faixa escurece, para emendar com o preto do texto. */}
      <div
        aria-hidden
        className={`absolute inset-x-0 top-0 -z-10 bg-linear-to-b from-transparent from-55% to-noite lg:hidden ${faixaDaFoto}`}
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
          <div className={`relative lg:order-2 ${faixaDaFoto}`}>
            <Image
              src={julianaHero.src}
              alt={julianaHero.alt}
              fill
              sizes="(min-width: 1024px) 420px, 260px"
              loading="eager"
              className="object-contain object-bottom lg:object-[70%_100%]"
            />
          </div>
        )}

        <div
          className={`max-w-2xl space-y-6 pb-28 lg:order-1 lg:pb-40 ${julianaHero ? 'pt-6 lg:pt-20' : 'pt-12 sm:pt-16 lg:pt-20'}`}
        >
          {/* Sobre a foto (desktop), o caramelo não tem contraste para letra desse tamanho: fica branco, como no modelo. */}
          <p className="text-xs font-medium tracking-[0.3em] text-caramelo uppercase lg:text-white/90">
            Corretora de Imóveis
          </p>
          <h1 className="font-serif text-4xl leading-[1.12] sm:text-5xl lg:text-[3.5rem]">
            Encontre o imóvel ideal com atendimento direto e personalizado.
          </h1>
          <p className="max-w-lg text-base text-white/85 sm:text-lg">
            Compra, venda e locação de imóveis com acompanhamento completo do início ao fechamento.
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
            <BotaoWhatsApp mensagem="Olá, Juliana! Vim pelo site." />
          </div>
        </div>
      </div>
    </section>
  );
}
