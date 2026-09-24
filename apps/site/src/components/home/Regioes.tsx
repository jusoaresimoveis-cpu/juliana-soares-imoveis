import { MapPin } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

import { MIDIA } from '@/config/midia';
import { SITE } from '@/config/site';
import { urlDaListagem } from '@/lib/imoveis/listagem';

/**
 * "Regiões atendidas": Itapema e Porto Belo, iguais ao Perfil da Empresa.
 *
 * O modelo tinha um botão por cidade. Aqui cada cidade leva a comprar OU a
 * alugar, porque não existe listagem que misture as duas: cada uma é a página
 * que ranqueia no Google ("imóveis à venda em Itapema").
 */
export function Regioes() {
  const fundo = MIDIA.fundoRegioes;

  return (
    <section aria-labelledby="titulo-regioes" className="relative isolate overflow-hidden bg-grafite text-white">
      {fundo && <Image src={fundo.src} alt="" fill sizes="100vw" className="-z-20 object-cover" />}
      <div aria-hidden className="absolute inset-0 -z-10 bg-linear-to-r from-grafite via-grafite/85 to-grafite/40" />

      <div className="mx-auto max-w-7xl space-y-6 px-4 py-14 lg:px-8">
        <h2 id="titulo-regioes" className="font-serif text-3xl sm:text-4xl">
          Regiões atendidas
        </h2>
        <p className="max-w-md text-white/85">
          Conheça as regiões onde atuo e encontre o imóvel ideal para você.
        </p>
        <ul className="flex flex-wrap gap-3">
          {SITE.areaAtendida.map((cidade) => (
            <li key={cidade.slug} className="flex items-center gap-3 rounded-md border border-white/40 px-4 py-2.5">
              <span className="flex items-center gap-2 font-medium">
                <MapPin aria-hidden className="size-4 text-caramelo" />
                {cidade.nome}
              </span>
              <span aria-hidden className="h-4 w-px bg-white/30" />
              <Link href={urlDaListagem({ finalidade: 'venda', cidade })} className="py-1 text-sm text-white/85 hover:text-white">
                Comprar
              </Link>
              <Link href={urlDaListagem({ finalidade: 'aluguel', cidade })} className="py-1 text-sm text-white/85 hover:text-white">
                Alugar
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
