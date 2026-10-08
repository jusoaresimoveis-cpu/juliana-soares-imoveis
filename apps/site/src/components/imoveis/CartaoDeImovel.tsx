import { CONSTRUCTION_STATUS_LABEL, type FinalidadeDoSite } from '@juliana/contracts';
import { ArrowRight, Building2 } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

import { numerosDoImovel } from '@/lib/imoveis/numeros';
import type { Imovel } from '@/lib/imoveis/tipos';

import { AvisoIlustrativa } from './AvisoIlustrativa';
import { BotaoFavorito } from './BotaoFavorito';
import { ICONE_DO_NUMERO } from './Caracteristicas';
import { Preco } from './Preco';

interface Props {
  imovel: Imovel;
  /** A listagem em que o cartão aparece. Decide a etiqueta e qual preço vem primeiro. */
  finalidade?: FinalidadeDoSite;
  /** Só os primeiros cartões visíveis carregam a foto com prioridade. */
  prioridade?: boolean;
}

function Etiqueta({ imovel, finalidade }: { imovel: Imovel; finalidade?: FinalidadeDoSite }) {
  const qual = finalidade ?? (imovel.finalidades.length > 1 ? null : imovel.finalidades[0]);
  if (qual === 'aluguel') return <span className="bg-marinho px-2.5 py-1">Para alugar</span>;
  if (qual === 'venda') return <span className="bg-bronze px-2.5 py-1">À venda</span>;
  return <span className="bg-grafite px-2.5 py-1">Venda e aluguel</span>;
}

/**
 * O cartão do modelo: foto com etiqueta e favorito, preço, lugar, quartos,
 * banheiros, vagas, área e "Ver detalhes".
 *
 * O cartão inteiro é clicável pelo link do título (que se estica por cima de
 * tudo), e o coração fica fora do link: botão dentro de link é HTML inválido e
 * confunde leitor de tela.
 */
export function CartaoDeImovel({ imovel, finalidade, prioridade = false }: Props) {
  const capa = imovel.fotos[0];
  const onde = [imovel.cidade, imovel.bairro].filter(Boolean).join(' - ');
  // "Na planta", "Em obras": no lançamento, é o que a pessoa filtra de olho.
  const obra = imovel.empreendimento?.obra ?? null;

  // Os mesmos números da página do imóvel, na mesma ordem, com quartos e
  // suítes lado a lado. A área entra na lista: numa linha à parte, o cartão
  // ficava com três linhas quando a vaga não cabia na primeira.
  const itens = numerosDoImovel(imovel).map((numero) => ({
    Icone: ICONE_DO_NUMERO[numero.tipo],
    texto: `${numero.valor} ${numero.rotulo}`,
  }));

  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-linha transition hover:shadow-md">
      <div className="relative aspect-[4/3] bg-areia">
        {capa ? (
          <Image
            src={capa.url}
            alt={capa.alt}
            fill
            sizes="(min-width: 1280px) 300px, (min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
            className="object-cover transition duration-500 group-hover:scale-[1.03]"
            // `priority` foi descontinuado no Next 16. Numa grade, qual cartão é
            // o maior elemento da tela muda com a largura: nada de `preload`.
            loading={prioridade ? 'eager' : 'lazy'}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-suave">
            <Building2 aria-hidden className="size-10 opacity-40" />
            <span className="sr-only">Sem foto</span>
          </div>
        )}
        {capa?.ilustrativa && <AvisoIlustrativa />}
        <div className="absolute left-3 top-3 flex flex-col items-start gap-1 text-[0.6875rem] font-semibold tracking-wider text-white uppercase">
          <Etiqueta imovel={imovel} finalidade={finalidade} />
          {obra && <span className="bg-white/90 px-2.5 py-1 text-tinta">{CONSTRUCTION_STATUS_LABEL[obra]}</span>}
          {imovel.status === 'reservado' && <span className="bg-tinta/80 px-2.5 py-1">Reservado</span>}
        </div>
        <div className="absolute right-3 top-3 z-10">
          <BotaoFavorito codigo={imovel.codigo} titulo={imovel.titulo} />
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <Preco imovel={imovel} finalidade={finalidade} />
        {onde && <p className="text-sm text-suave">{onde}</p>}
        <h3 className="line-clamp-2 text-sm leading-snug">
          <Link href={`/imovel/${imovel.slug}`} className="after:absolute after:inset-0">
            {imovel.titulo}
          </Link>
        </h3>

        {itens.length > 0 && (
          <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-suave">
            {itens.map(({ Icone, texto }) => (
              <li key={texto} className="flex items-center gap-1">
                <Icone aria-hidden className="size-3.5" />
                {texto}
              </li>
            ))}
          </ul>
        )}

        {/* Só aparência: quem leva ao imóvel é o link esticado do título. */}
        <span
          aria-hidden
          className="mt-auto flex min-h-10 items-center justify-center gap-2 rounded-md bg-bronze text-sm font-semibold text-white transition-colors group-hover:bg-bronze-escuro"
        >
          Ver detalhes <ArrowRight className="size-4" />
        </span>
      </div>
    </article>
  );
}
