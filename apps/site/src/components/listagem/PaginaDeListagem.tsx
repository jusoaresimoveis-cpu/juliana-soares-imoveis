import {
  FINALIDADE_NA_FRASE,
  PROPERTY_TYPE_PLURAL,
  PROPERTY_TYPES,
  TODOS_OS_TIPOS,
  type FinalidadeDoSite,
} from '@juliana/contracts';
import Link from 'next/link';
import { Suspense } from 'react';

import { BotaoWhatsApp } from '@/components/BotaoWhatsApp';
import { CartaoDeImovel } from '@/components/imoveis/CartaoDeImovel';
import { Migalhas } from '@/components/Migalhas';
import { SITE } from '@/config/site';
import { bairrosDe, filtrarImoveis, urlDaListagem } from '@/lib/imoveis/listagem';
import { precosNaFinalidade } from '@/lib/imoveis/preco';
import { resolverListagem } from '@/lib/imoveis/resolver-listagem';
import type { Migalha } from '@/lib/seo/schema';

import { Grade, GradeComFaixa, type ItemDaGrade } from './GradeComFaixa';

const NOME_DA_FINALIDADE: Record<FinalidadeDoSite, string> = {
  aluguel: 'Aluguel',
  venda: 'Venda',
};

interface Props {
  finalidade: FinalidadeDoSite;
  segmentos: string[] | undefined;
}

export async function PaginaDeListagem({ finalidade, segmentos }: Props) {
  const { filtro, bairro, titulo, imoveis, todos } = await resolverListagem(finalidade, segmentos);

  const migalhas: Migalha[] = [{ nome: NOME_DA_FINALIDADE[finalidade], caminho: urlDaListagem({ finalidade }) }];
  if (filtro.cidade) {
    migalhas.push({ nome: filtro.cidade.nome, caminho: urlDaListagem({ finalidade, cidade: filtro.cidade }) });
  }
  if (bairro) {
    migalhas.push({ nome: bairro.nome, caminho: urlDaListagem({ ...filtro, tipo: null }) });
  }
  if (filtro.tipo) {
    migalhas.push({ nome: PROPERTY_TYPE_PLURAL[filtro.tipo].label, caminho: urlDaListagem(filtro) });
  }

  /*
   * Atalhos para as listagens vizinhas. Além de ajudar quem navega, são os
   * links internos que levam o Google a descobrir cada página de bairro e de
   * tipo. Só aparecem combinações que têm imóvel.
   */
  const tiposComImovel = PROPERTY_TYPES.filter(
    (tipo) => filtrarImoveis(todos, { ...filtro, tipo }).length > 0,
  );
  const bairrosDaCidade = filtro.cidade
    ? bairrosDe(todos).filter(
        (b) =>
          b.cidade.slug === filtro.cidade?.slug &&
          filtrarImoveis(todos, { ...filtro, bairro: b.slug }).length > 0,
      )
    : [];

  const itens: ItemDaGrade[] = imoveis.map((imovel, indice) => ({
    codigo: imovel.codigo,
    precosCents: precosNaFinalidade(imovel, finalidade),
    cartao: <CartaoDeImovel imovel={imovel} finalidade={finalidade} prioridade={indice < 2} />,
  }));

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 lg:px-8 lg:py-10">
      <Migalhas itens={migalhas} />

      <header className="space-y-2">
        <h1 className="font-serif text-3xl leading-tight sm:text-4xl">{titulo}</h1>
        <p className="text-suave">
          {imoveis.length === 0
            ? 'Nenhum imóvel com esse perfil no momento.'
            : `${imoveis.length} ${imoveis.length === 1 ? 'imóvel encontrado' : 'imóveis encontrados'}`}
        </p>
      </header>

      <nav aria-label="Refinar a busca" className="space-y-3 text-sm">
        <ListaDeAtalhos
          titulo="Tipo"
          itens={[
            { rotulo: `Todos os ${TODOS_OS_TIPOS.label.toLowerCase()}`, href: urlDaListagem({ ...filtro, tipo: null }), ativo: !filtro.tipo },
            ...tiposComImovel.map((tipo) => ({
              rotulo: PROPERTY_TYPE_PLURAL[tipo].label,
              href: urlDaListagem({ ...filtro, tipo }),
              ativo: filtro.tipo === tipo,
            })),
          ]}
        />
        <ListaDeAtalhos
          titulo="Cidade"
          itens={SITE.areaAtendida.map((cidade) => ({
            rotulo: cidade.nome,
            href: urlDaListagem({ ...filtro, cidade, bairro: null }),
            ativo: filtro.cidade?.slug === cidade.slug,
          }))}
        />
        {bairrosDaCidade.length > 0 && (
          <ListaDeAtalhos
            titulo="Bairro"
            itens={bairrosDaCidade.map((b) => ({
              rotulo: b.nome,
              href: urlDaListagem({ ...filtro, bairro: b.slug }),
              ativo: filtro.bairro === b.slug,
            }))}
          />
        )}
      </nav>

      {imoveis.length > 0 ? (
        // O HTML estático leva a grade completa (é o que o Google lê); a faixa
        // de preço da URL é aplicada no navegador.
        <Suspense fallback={<Grade itens={itens} />}>
          <GradeComFaixa finalidade={finalidade} itens={itens} />
        </Suspense>
      ) : (
        <div className="space-y-4 rounded-lg bg-white p-6 ring-1 ring-linha">
          <p>
            Procurando {filtro.tipo ? PROPERTY_TYPE_PLURAL[filtro.tipo].label.toLowerCase() : 'imóveis'}{' '}
            {FINALIDADE_NA_FRASE[finalidade]}? Conte para a Juliana o que você precisa, e ela avisa quando
            aparecer uma opção.
          </p>
          <BotaoWhatsApp mensagem={`Olá, Juliana! Estou procurando: ${titulo.toLowerCase()}.`} />
        </div>
      )}
    </div>
  );
}

interface Atalho {
  rotulo: string;
  href: string;
  ativo: boolean;
}

function ListaDeAtalhos({ titulo, itens }: { titulo: string; itens: Atalho[] }) {
  return (
    <div>
      <p className="mb-1 font-medium text-suave">{titulo}</p>
      {/* Rola na horizontal no celular em vez de empilhar dez linhas de filtro. */}
      <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {itens.map((item) => (
          <li key={item.href} className="shrink-0">
            <Link
              href={item.href}
              aria-current={item.ativo ? 'page' : undefined}
              className={
                item.ativo
                  ? 'block rounded-full bg-bronze px-3 py-1.5 text-white'
                  : 'block rounded-full border border-linha bg-white px-3 py-1.5 hover:border-bronze'
              }
            >
              {item.rotulo}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
