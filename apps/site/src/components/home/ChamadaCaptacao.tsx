import { ArrowRight, ClipboardList } from 'lucide-react';
import Image from 'next/image';

import { Botao } from '@/components/ui/Botao';
import { MIDIA } from '@/config/midia';

/** A chamada para o proprietário, que o briefing marca como seção muito importante. */
export function ChamadaCaptacao() {
  const fundo = MIDIA.fundoCaptacao;

  return (
    <section aria-labelledby="titulo-captacao" className="relative isolate overflow-hidden bg-tinta text-white">
      {fundo && <Image src={fundo.src} alt="" fill sizes="100vw" className="-z-20 object-cover object-right" />}
      <div aria-hidden className="absolute inset-0 -z-10 bg-linear-to-r from-tinta via-tinta/95 to-tinta/60" />

      <div className="mx-auto flex max-w-7xl flex-col items-center gap-6 px-4 py-14 text-center md:flex-row md:justify-between md:text-left lg:px-8">
        <div className="max-w-xl space-y-3">
          <h2 id="titulo-captacao" className="font-serif text-3xl sm:text-4xl">
            Quer vender ou alugar seu imóvel?
          </h2>
          <p className="text-white/85">
            Conte com minha experiência para avaliar, divulgar e encontrar o melhor negócio para você.
          </p>
        </div>
        <Botao href="/cadastrar-imovel" icone={<ClipboardList aria-hidden className="size-4" />} className="w-full sm:w-auto">
          Cadastrar meu imóvel <ArrowRight aria-hidden className="size-4" />
        </Botao>
      </div>
    </section>
  );
}
