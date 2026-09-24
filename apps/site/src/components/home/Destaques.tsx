import type { FinalidadeDoSite } from '@juliana/contracts';

import { CartaoDeImovel } from '@/components/imoveis/CartaoDeImovel';
import { filtrarImoveis, urlDaListagem } from '@/lib/imoveis/listagem';
import { STATUS_NA_VITRINE, type Imovel } from '@/lib/imoveis/tipos';

import { AbasDeDestaques, type Aba } from './AbasDeDestaques';

const POR_ABA = 4;

/** Destaques primeiro, depois os atualizados mais recentemente. */
function ordenar(imoveis: Imovel[]): Imovel[] {
  return [...imoveis].sort(
    (a, b) => Number(b.destaque) - Number(a.destaque) || b.atualizadoEm.localeCompare(a.atualizadoEm),
  );
}

function Grade({ imoveis, finalidade }: { imoveis: Imovel[]; finalidade?: FinalidadeDoSite }) {
  return (
    <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
      {imoveis.map((imovel, indice) => (
        <li key={imovel.codigo}>
          <CartaoDeImovel imovel={imovel} finalidade={finalidade} prioridade={indice === 0} />
        </li>
      ))}
    </ul>
  );
}

/**
 * "Imóveis em destaque". Sem imóvel publicado, a seção não aparece: nada de
 * vitrine vazia nem de imóvel de mentira.
 */
export function Destaques({ imoveis }: { imoveis: Imovel[] }) {
  const naVitrine = imoveis.filter((imovel) => STATUS_NA_VITRINE.includes(imovel.status));
  const semFiltro = { tipo: null, cidade: null, bairro: null };

  const venda = ordenar(filtrarImoveis(imoveis, { finalidade: 'venda', ...semFiltro })).slice(0, POR_ABA);
  const aluguel = ordenar(filtrarImoveis(imoveis, { finalidade: 'aluguel', ...semFiltro })).slice(0, POR_ABA);
  const destaques = ordenar(naVitrine).slice(0, POR_ABA);

  if (destaques.length === 0) return null;

  const abas: Aba[] = [
    { chave: 'destaques', rotulo: 'Destaques', verTodos: urlDaListagem({ finalidade: 'venda' }), conteudo: <Grade imoveis={destaques} /> },
  ];
  if (venda.length > 0) {
    abas.push({ chave: 'venda', rotulo: 'Venda', verTodos: urlDaListagem({ finalidade: 'venda' }), conteudo: <Grade imoveis={venda} finalidade="venda" /> });
  }
  if (aluguel.length > 0) {
    abas.push({ chave: 'aluguel', rotulo: 'Aluguel', verTodos: urlDaListagem({ finalidade: 'aluguel' }), conteudo: <Grade imoveis={aluguel} finalidade="aluguel" /> });
  }

  return (
    <section aria-label="Imóveis em destaque" className="mx-auto max-w-7xl px-4 pt-14 lg:px-8">
      <AbasDeDestaques titulo="Imóveis em destaque" abas={abas} />
    </section>
  );
}
