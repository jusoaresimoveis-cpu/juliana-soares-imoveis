'use client';

import type { FinalidadeDoSite } from '@juliana/contracts';
import { X } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import type { ReactNode } from 'react';

import { algumPrecoNaFaixa, interpretarFaixa, rotuloDaFaixa } from '@/lib/imoveis/preco';

export interface ItemDaGrade {
  codigo: string;
  /**
   * Os preços na finalidade da listagem, em centavos: um no imóvel comum, o de
   * cada unidade disponível no empreendimento, nenhum no "Consulte".
   */
  precosCents: number[];
  cartao: ReactNode;
}

export function Grade({ itens }: { itens: ItemDaGrade[] }) {
  return (
    <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
      {itens.map(({ codigo, cartao }) => (
        <li key={codigo}>{cartao}</li>
      ))}
    </ul>
  );
}

/**
 * A grade da listagem com a faixa de preço (`?preco=`) aplicada.
 *
 * A página continua estática: o servidor manda TODOS os imóveis daquela
 * listagem (é o que o Google indexa), e o filtro de preço roda aqui, no
 * navegador. Filtrar no servidor faria cada combinação de preço virar uma
 * página nova, sem ganho nenhum de busca.
 */
export function GradeComFaixa({ finalidade, itens }: { finalidade: FinalidadeDoSite; itens: ItemDaGrade[] }) {
  const caminho = usePathname();
  const valor = useSearchParams().get('preco');
  const faixa = interpretarFaixa(valor);

  if (!faixa || !valor) return <Grade itens={itens} />;

  const visiveis = itens.filter((item) => algumPrecoNaFaixa(item.precosCents, faixa));
  const rotulo = `${rotuloDaFaixa(finalidade, valor)}${finalidade === 'aluguel' ? ' /mês' : ''}`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="text-suave">
          {visiveis.length} {visiveis.length === 1 ? 'imóvel' : 'imóveis'} na faixa
        </span>
        <Link
          href={caminho}
          className="inline-flex items-center gap-1.5 rounded-full bg-bronze py-1.5 pr-2.5 pl-3.5 text-white hover:bg-bronze-escuro"
        >
          {rotulo}
          <X aria-hidden className="size-4" />
          <span className="sr-only">(tirar o filtro de preço)</span>
        </Link>
      </div>

      {visiveis.length > 0 ? (
        <Grade itens={visiveis} />
      ) : (
        <p className="rounded-lg bg-white p-6 ring-1 ring-linha">
          Nenhum imóvel nessa faixa de preço.{' '}
          <Link href={caminho} className="font-medium text-bronze hover:underline">
            Ver todos desta busca
          </Link>
        </p>
      )}
    </div>
  );
}
