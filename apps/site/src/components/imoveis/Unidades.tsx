import { nomeDoMesDaTabela, rotuloDaUnidade, UNIT_STATUS_LABEL } from '@juliana/contracts';
import { MessageCircle } from 'lucide-react';
import { Suspense } from 'react';

import { faixaDeArea, plural, reaisParaBaixo } from '@/lib/formato';
import { ofertaDaPlanta, precoDaUnidade } from '@/lib/imoveis/empreendimento';
import { textoDosDormitorios } from '@/lib/imoveis/numeros';
import type { Imovel, PlantaDoEmpreendimento, UnidadeDoEmpreendimento } from '@/lib/imoveis/tipos';
import { linkDoWhatsApp, mensagemDaUnidade } from '@/lib/whatsapp';

import { DestaqueDaUnidade } from './DestaqueDaUnidade';

/**
 * "Unidades disponíveis": as unidades à venda do empreendimento, por planta,
 * cada uma com o preço da tabela do mês e o seu botão de WhatsApp.
 *
 * A unidade não tem página nem código: a linha tem o id `unidade-804`, e o link
 * `?unidade=804` da mensagem chega nela (`DestaqueDaUnidade`). O preço vai com
 * os centavos, como na tabela da construtora: aqui a pessoa compara unidade com
 * unidade. Sem a tabela do mês, "Consulte" nas disponíveis; a reservada fica só
 * com o selo (`precoDaUnidade`).
 *
 * Sem lista (antes da primeira tabela as unidades nascem vendidas, e vendida
 * não sai do banco), a seção some, e o "Consulte" do preço fica sozinho.
 */
export function Unidades({ imovel }: { imovel: Imovel }) {
  const empreendimento = imovel.empreendimento;
  if (!empreendimento || empreendimento.plantas.length === 0) return null;
  const { tabelaVigente, tabelaDoMes, unidadesDisponiveis } = empreendimento;

  return (
    <section id="unidades" className="space-y-4">
      <div className="space-y-1">
        {/* Só com reservadas, nem "disponíveis" no título nem de que tabela são
            os valores: nenhuma linha tem preço. */}
        <h2 className="font-serif text-2xl">{unidadesDisponiveis > 0 ? 'Unidades disponíveis' : 'Unidades'}</h2>
        {unidadesDisponiveis > 0 && (
          <p className="text-sm text-suave">
            {tabelaVigente && tabelaDoMes
              ? `Valores da tabela de ${nomeDoMesDaTabela(tabelaDoMes)}.`
              : 'Preços em atualização com a tabela do mês. Consulte pelo WhatsApp.'}
          </p>
        )}
      </div>

      {empreendimento.plantas.map((planta) => (
        <Planta key={planta.nome} imovel={imovel} planta={planta} />
      ))}

      {/* Lê o `?unidade=` no navegador: sem o Suspense, a página deixaria de ser estática. */}
      <Suspense fallback={null}>
        <DestaqueDaUnidade />
      </Suspense>
    </section>
  );
}

/** "8º andar"; o térreo e o subsolo pelo nome. */
function andar(numero: number): string {
  if (numero === 0) return 'Térreo';
  return numero > 0 ? `${numero}º andar` : `${-numero}º subsolo`;
}

function Planta({ imovel, planta }: { imovel: Imovel; planta: PlantaDoEmpreendimento }) {
  const areas = planta.unidades.map((u) => u.areaM2 ?? planta.areaM2).filter((area) => area !== null);
  // O total, como o "2 ou 3 dormitórios" do topo, com as suítes dentro dele:
  // "3 dormitórios (1 suíte)" (ver `numeros.ts`).
  const numeros = [
    areas.length ? `${faixaDeArea(areas)} m²` : null,
    textoDosDormitorios(planta),
    planta.banheiros ? plural(planta.banheiros, 'banheiro', 'banheiros') : null,
    planta.vagas ? plural(planta.vagas, 'vaga', 'vagas') : null,
  ].filter((numero) => numero !== null);

  const { disponiveis, reservadas, aPartirDeCents } = ofertaDaPlanta(planta);
  const oferta = [
    disponiveis ? plural(disponiveis, 'disponível', 'disponíveis') : null,
    reservadas ? plural(reservadas, 'reservada', 'reservadas') : null,
    aPartirDeCents !== null ? `a partir de ${reaisParaBaixo(aPartirDeCents)}` : null,
  ].filter((parte) => parte !== null);

  return (
    <div className="overflow-hidden rounded-lg bg-white ring-1 ring-linha">
      <div className="space-y-1 bg-areia/50 px-4 py-3">
        <h3 className="font-semibold">{planta.nome}</h3>
        {numeros.length > 0 && <p className="text-sm text-suave">{numeros.join(' · ')}</p>}
        <p className="text-sm">{oferta.join(' · ')}</p>
      </div>
      <ul className="divide-y divide-linha">
        {planta.unidades.map((unidade) => (
          <LinhaDaUnidade key={unidade.rotulo} imovel={imovel} planta={planta} unidade={unidade} />
        ))}
      </ul>
    </div>
  );
}

function LinhaDaUnidade({
  imovel,
  planta,
  unidade,
}: {
  imovel: Imovel;
  planta: PlantaDoEmpreendimento;
  unidade: UnidadeDoEmpreendimento;
}) {
  const nome = rotuloDaUnidade(imovel.tipo, unidade.rotulo);
  // A área só aparece na linha quando a unidade foge da planta (sala comercial).
  const areaPropria = unidade.areaM2 !== null && unidade.areaM2 !== planta.areaM2 ? unidade.areaM2 : null;
  const detalhes = [
    nome,
    unidade.andar !== null ? andar(unidade.andar) : null,
    areaPropria !== null ? `${areaPropria.toLocaleString('pt-BR')} m²` : null,
  ].filter((parte) => parte !== null);
  const link = linkDoWhatsApp(mensagemDaUnidade(imovel, { rotulo: unidade.rotulo, planta: planta.nome }));
  const preco = precoDaUnidade(unidade);

  // `tabIndex={-1}`: o `DestaqueDaUnidade` põe o foco na linha do link, e só
  // ele (o Tab não para aqui). O contorno do foco sai porque o anel do
  // destaque, que chega junto, já mostra onde a pessoa está.
  return (
    <li
      id={`unidade-${unidade.rotulo}`}
      tabIndex={-1}
      className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 outline-hidden transition-colors data-[destaque=sim]:bg-areia data-[destaque=sim]:ring-2 data-[destaque=sim]:ring-bronze data-[destaque=sim]:ring-inset"
    >
      {/* No celular, a unidade ocupa a primeira linha e o preço e o botão a segunda:
          os três lado a lado espremiam "Apto 804 · 8º andar" em cinco linhas. */}
      <p className="w-full sm:w-auto sm:min-w-0 sm:flex-1">
        <span className="font-medium">{detalhes[0]}</span>
        {detalhes.length > 1 && <span className="text-suave"> · {detalhes.slice(1).join(' · ')}</span>}
        {unidade.situacao === 'reservado' && (
          <span className="ml-2 inline-block rounded bg-tinta/80 px-2 py-0.5 align-middle text-[0.6875rem] font-semibold tracking-wider text-white uppercase">
            {UNIT_STATUS_LABEL.reservado}
          </span>
        )}
      </p>
      {preco !== null && <p className="flex-1 font-semibold tabular-nums sm:flex-none">{preco}</p>}
      {/* `ml-auto`: na reservada, sem o preço ao lado, o botão continua à direita. */}
      <a
        href={link}
        target="_blank"
        rel="noopener"
        className="ml-auto inline-flex min-h-10 items-center gap-1.5 rounded-md bg-whatsapp px-3 text-sm font-semibold text-white transition-colors hover:bg-whatsapp-escuro focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-caramelo"
      >
        <MessageCircle aria-hidden className="size-4" />
        Tenho interesse<span className="sr-only">: {nome}, pelo WhatsApp</span>
      </a>
    </li>
  );
}
