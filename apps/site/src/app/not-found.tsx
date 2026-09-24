import Link from 'next/link';

import { urlDaListagem } from '@/lib/imoveis/listagem';

export default function NaoEncontrada() {
  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold">Página não encontrada</h1>
      <p className="text-suave">O endereço pode ter mudado, ou o imóvel já saiu do site.</p>
      <div className="flex flex-col justify-center gap-3 sm:flex-row">
        <Link href={urlDaListagem({ finalidade: 'aluguel' })} className="font-medium text-bronze">
          Ver imóveis para alugar
        </Link>
        <Link href={urlDaListagem({ finalidade: 'venda' })} className="font-medium text-bronze">
          Ver imóveis à venda
        </Link>
      </div>
    </div>
  );
}
