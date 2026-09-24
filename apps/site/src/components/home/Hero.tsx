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
 * Celular: a foto vem primeiro, numa faixa com o fundo atrás, e o texto logo
 * abaixo, sobre o grafite. O preto da blusa se funde com o fundo escuro.
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
    <section className="relative isolate overflow-hidden bg-grafite text-white">
      {fundoHero && (
        // Sem desfoque provisório (`placeholder="blur"`): ele é um filtro SVG,
        // caro de desenhar no celular. O grafite de fundo faz o papel de espera.
        <div aria-hidden className={`absolute inset-x-0 top-0 -z-20 lg:bottom-0 ${faixaDaFoto}`}>
          <FundoDoHero foto={fundoHero} />
        </div>
      )}
      <div
        aria-hidden
        className={`absolute inset-x-0 top-0 -z-10 bg-linear-to-b from-grafite/10 via-grafite/35 to-grafite lg:bottom-0 lg:bg-linear-to-r lg:from-grafite lg:from-25% lg:via-grafite/80 lg:to-grafite/15 ${faixaDaFoto}`}
      />

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
          <p className="text-xs font-medium tracking-[0.3em] text-caramelo uppercase">Corretora de Imóveis</p>
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
