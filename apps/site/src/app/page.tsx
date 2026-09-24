import type { FinalidadeDoSite } from '@juliana/contracts';
import Link from 'next/link';

import { CartaoDeImovel } from '@/components/imoveis/CartaoDeImovel';
import { SITE } from '@/config/site';
import { carregarImoveisPublicados } from '@/lib/imoveis/dados';
import { filtrarImoveis, urlDaListagem } from '@/lib/imoveis/listagem';
import type { Imovel } from '@/lib/imoveis/tipos';

export const revalidate = 3600;

const SECOES: { finalidade: FinalidadeDoSite; titulo: string }[] = [
  { finalidade: 'aluguel', titulo: 'Para alugar' },
  { finalidade: 'venda', titulo: 'À venda' },
];

/** Destaques primeiro, depois os atualizados mais recentemente. */
function vitrine(imoveis: Imovel[]): Imovel[] {
  return [...imoveis]
    .sort((a, b) => Number(b.destaque) - Number(a.destaque) || b.atualizadoEm.localeCompare(a.atualizadoEm))
    .slice(0, 6);
}

export default async function Home() {
  const todos = await carregarImoveisPublicados();

  return (
    <>
      <section className="bg-marca text-white">
        <div className="mx-auto max-w-6xl space-y-6 px-4 py-12 sm:py-16">
          <h1 className="max-w-2xl text-3xl font-semibold leading-tight sm:text-4xl">
            Imóveis para alugar e comprar em Itapema e Porto Belo
          </h1>
          <p className="max-w-xl text-white/85">
            Atendimento direto com a corretora {SITE.nomeCurto}, {SITE.creci}.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href={urlDaListagem({ finalidade: 'aluguel' })}
              className="inline-flex min-h-12 items-center justify-center rounded-full bg-white px-6 font-semibold text-marca"
            >
              Quero alugar
            </Link>
            <Link
              href={urlDaListagem({ finalidade: 'venda' })}
              className="inline-flex min-h-12 items-center justify-center rounded-full border border-white/60 px-6 font-semibold"
            >
              Quero comprar
            </Link>
          </div>
        </div>
      </section>

      {SECOES.map(({ finalidade, titulo }) => {
        const imoveis = vitrine(filtrarImoveis(todos, { finalidade, tipo: null, cidade: null, bairro: null }));
        if (imoveis.length === 0) return null;

        return (
          <section key={finalidade} className="mx-auto max-w-6xl space-y-4 px-4 pt-10">
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="text-2xl font-semibold">{titulo}</h2>
              <Link href={urlDaListagem({ finalidade })} className="text-sm font-medium text-marca">
                Ver todos
              </Link>
            </div>
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {imoveis.map((imovel, indice) => (
                <li key={imovel.codigo}>
                  <CartaoDeImovel imovel={imovel} finalidade={finalidade} prioridade={indice < 2} />
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      <section className="mx-auto max-w-6xl px-4 pt-10">
        <div className="space-y-3 rounded-xl border border-linha bg-white p-6">
          <h2 className="text-xl font-semibold">Tem um imóvel para alugar ou vender?</h2>
          <p className="text-suave">Fale com a Juliana para anunciar seu imóvel em Itapema ou Porto Belo.</p>
          <Link href="/anuncie" className="inline-block font-medium text-marca">
            Quero anunciar meu imóvel →
          </Link>
        </div>
      </section>
    </>
  );
}
