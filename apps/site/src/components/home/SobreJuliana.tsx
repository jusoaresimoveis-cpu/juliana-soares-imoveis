import { ArrowRight, FileText, Handshake, MapPinned, UserRound } from 'lucide-react';
import Image from 'next/image';

import { Botao } from '@/components/ui/Botao';
import { MIDIA } from '@/config/midia';
import { SITE } from '@/config/site';

/** Os diferenciais do briefing, na ordem do modelo. */
export const DIFERENCIAIS = [
  { Icone: UserRound, texto: 'Atendimento personalizado' },
  { Icone: FileText, texto: 'Acompanhamento documental' },
  { Icone: Handshake, texto: 'Suporte na negociação' },
  { Icone: MapPinned, texto: 'Conhecimento do mercado local' },
] as const;

/**
 * Sem o retrato, fica o monograma num bloco de areia: é marca, não é um buraco
 * de foto. Some sozinho quando `MIDIA.julianaRetrato` for preenchido.
 */
export function RetratoDaJuliana({ className = '' }: { className?: string }) {
  const retrato = MIDIA.julianaRetrato;
  return (
    <div className={`relative overflow-hidden rounded-lg bg-areia ${className}`}>
      {retrato ? (
        <Image src={retrato.src} alt={retrato.alt} fill sizes="(min-width: 1024px) 420px, 100vw" className="object-cover" />
      ) : (
        <div aria-hidden className="flex h-full flex-col items-center justify-center gap-3 text-bronze">
          <span className="font-serif text-8xl leading-none tracking-tighter">
            J<span className="-ml-4 italic">S</span>
          </span>
          <span className="text-xs tracking-[0.3em] text-suave uppercase">{SITE.creci}</span>
        </div>
      )}
    </div>
  );
}

export function SobreJuliana() {
  return (
    <section aria-labelledby="titulo-sobre" className="mt-16 bg-white py-16">
      <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 lg:grid-cols-[minmax(0,26rem)_1fr] lg:gap-16 lg:px-8">
        <RetratoDaJuliana className="aspect-[4/3] w-full sm:aspect-[5/4]" />

        <div className="space-y-6">
          <p className="text-xs font-semibold tracking-[0.3em] text-bronze uppercase">Sobre Juliana</p>
          <h2 id="titulo-sobre" className="font-serif text-3xl leading-tight sm:text-4xl">
            Mais do que vender imóveis, meu objetivo é ajudar pessoas a encontrarem o lugar certo para viver ou
            investir.
          </h2>

          <ul className="grid grid-cols-2 gap-5 sm:grid-cols-4 sm:gap-0 sm:divide-x sm:divide-linha">
            {DIFERENCIAIS.map(({ Icone, texto }) => (
              <li key={texto} className="flex items-center gap-3 sm:flex-col sm:items-start sm:px-4 sm:first:pl-0">
                <Icone aria-hidden className="size-7 shrink-0 text-caramelo" strokeWidth={1.5} />
                <span className="text-sm leading-snug">{texto}</span>
              </li>
            ))}
          </ul>

          <Botao href="/sobre" icone={null}>
            Saiba mais sobre mim <ArrowRight aria-hidden className="size-4" />
          </Botao>
        </div>
      </div>
    </section>
  );
}
