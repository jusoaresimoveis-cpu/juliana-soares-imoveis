import { Heart } from 'lucide-react';
import type { Metadata } from 'next';

import { CartaoDeImovel } from '@/components/imoveis/CartaoDeImovel';
import { Botao } from '@/components/ui/Botao';
import { carregarImoveisPublicados } from '@/lib/imoveis/dados';
import { urlDaListagem } from '@/lib/imoveis/listagem';

import { ListaDeFavoritos } from './ListaDeFavoritos';

export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Meus favoritos',
  // Cada visitante vê a própria lista: não é página para o Google.
  robots: { index: false, follow: true },
};

export default async function Page() {
  const imoveis = await carregarImoveisPublicados();

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 lg:px-8 lg:py-12">
      <header className="space-y-2">
        <h1 className="font-serif text-3xl">Meus favoritos</h1>
        <p className="text-suave">Os imóveis que você salvou ficam guardados neste aparelho.</p>
      </header>

      <ListaDeFavoritos
        cartoes={imoveis.map((imovel) => ({ codigo: imovel.codigo, cartao: <CartaoDeImovel imovel={imovel} /> }))}
        vazio={
          <div className="flex flex-col items-center gap-4 rounded-lg bg-white px-6 py-12 text-center ring-1 ring-linha">
            <Heart aria-hidden className="size-10 text-caramelo" strokeWidth={1.5} />
            <p className="max-w-sm text-suave">
              Nenhum favorito ainda. Toque no coração de um imóvel para guardar aqui.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Botao href={urlDaListagem({ finalidade: 'venda' })}>Ver imóveis à venda</Botao>
              <Botao href={urlDaListagem({ finalidade: 'aluguel' })} estilo="contorno">
                Ver imóveis para alugar
              </Botao>
            </div>
          </div>
        }
      />
    </div>
  );
}
