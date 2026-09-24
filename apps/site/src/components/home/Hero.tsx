import { House, KeyRound } from 'lucide-react';
import Image from 'next/image';

import { BotaoWhatsApp } from '@/components/BotaoWhatsApp';
import { Botao } from '@/components/ui/Botao';
import { MIDIA } from '@/config/midia';
import { urlDaListagem } from '@/lib/imoveis/listagem';

/**
 * O topo da home: frase, os três botões do modelo e, quando chegar, a foto da
 * Juliana ocupando a direita. Sem a foto, o texto fica sozinho, sem coluna
 * vazia.
 */
export function Hero() {
  const { julianaHero, fundoHero } = MIDIA;

  return (
    <section className="relative isolate overflow-hidden bg-grafite text-white">
      {fundoHero && (
        <Image src={fundoHero.src} alt="" fill priority sizes="100vw" className="-z-20 object-cover" />
      )}
      {/* Escurece o fundo à esquerda, onde está o texto: a leitura vem antes da foto. */}
      <div aria-hidden className="absolute inset-0 -z-10 bg-linear-to-r from-grafite via-grafite/90 to-grafite/50" />

      <div
        className={`mx-auto grid max-w-7xl items-end gap-8 px-4 pt-12 pb-28 sm:pt-16 lg:px-8 lg:pb-36 ${julianaHero ? 'lg:grid-cols-2' : ''}`}
      >
        <div className="max-w-2xl space-y-6">
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

        {julianaHero && (
          <div className="relative mx-auto aspect-[4/5] w-full max-w-md lg:max-w-none">
            <Image
              src={julianaHero.src}
              alt={julianaHero.alt}
              fill
              priority
              sizes="(min-width: 1024px) 50vw, 100vw"
              className="object-contain object-bottom"
            />
          </div>
        )}
      </div>
    </section>
  );
}
