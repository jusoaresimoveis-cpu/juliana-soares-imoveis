import { House, KeyRound } from 'lucide-react';
import Image from 'next/image';

import { BotaoWhatsApp } from '@/components/BotaoWhatsApp';
import { Botao } from '@/components/ui/Botao';
import { MIDIA } from '@/config/midia';
import { urlDaListagem } from '@/lib/imoveis/listagem';

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
 * no desktop (o topo inteiro): é o caso de `preload`, que começa o download já
 * no <head>. A foto da Juliana, menor que ele nas duas telas, carrega logo mas
 * com prioridade normal, para não disputar banda com o fundo no 4G.
 */
export function Hero() {
  const { julianaHero, fundoHero } = MIDIA;
  // Mesma altura para a faixa da foto e para o fundo no celular.
  const faixaDaFoto = 'h-80 sm:h-96 lg:h-auto';

  return (
    <section className="relative isolate overflow-hidden bg-grafite text-white">
      {fundoHero && (
        <div aria-hidden className={`absolute inset-x-0 top-0 -z-20 lg:bottom-0 ${faixaDaFoto}`}>
          <Image
            src={fundoHero.src}
            alt=""
            fill
            sizes="100vw"
            preload
            // Sem `placeholder="blur"`: o desfoque provisório é um filtro SVG,
            // caro de desenhar no celular, e atrasava a primeira pintura. O
            // grafite de fundo já faz o papel de espera.
            // No celular a faixa é estreita: mostra a janela e o mar, não o sofá.
            className="object-cover object-[72%_40%] lg:object-center"
          />
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
