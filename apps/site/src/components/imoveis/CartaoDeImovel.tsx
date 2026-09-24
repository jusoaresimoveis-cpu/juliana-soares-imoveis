import type { FinalidadeDoSite } from '@juliana/contracts';
import Image from 'next/image';
import Link from 'next/link';

import type { Imovel } from '@/lib/imoveis/tipos';

import { Caracteristicas } from './Caracteristicas';
import { Preco } from './Preco';

interface Props {
  imovel: Imovel;
  finalidade?: FinalidadeDoSite;
  /** Só os primeiros cartões visíveis carregam a foto com prioridade. */
  prioridade?: boolean;
}

export function CartaoDeImovel({ imovel, finalidade, prioridade = false }: Props) {
  const capa = imovel.fotos[0];
  const onde = [imovel.bairro, imovel.cidade].filter(Boolean).join(', ');

  return (
    <article className="overflow-hidden rounded-xl border border-linha bg-white">
      <Link href={`/imovel/${imovel.slug}`} className="block">
        <div className="relative aspect-[4/3] bg-linha">
          {capa ? (
            <Image
              src={capa.url}
              alt={capa.alt}
              fill
              sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
              className="object-cover"
              priority={prioridade}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-suave">Sem foto</div>
          )}
          {imovel.status === 'reservado' && (
            <span className="absolute left-3 top-3 rounded-full bg-destaque px-3 py-1 text-xs font-semibold text-white">
              Reservado
            </span>
          )}
        </div>

        <div className="space-y-2 p-4">
          <Preco imovel={imovel} finalidade={finalidade} />
          <h3 className="font-medium leading-snug">{imovel.titulo}</h3>
          {onde && <p className="text-sm text-suave">{onde}</p>}
          <Caracteristicas imovel={imovel} />
          <p className="text-xs text-suave">Cód. {imovel.codigo}</p>
        </div>
      </Link>
    </article>
  );
}
