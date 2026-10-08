import { reaisComCentavos } from '@juliana/contracts';

import type { Empreendimento, Imovel, PlantaDoEmpreendimento, UnidadeDoEmpreendimento } from './tipos';

/**
 * O que o cartão, a busca, a descrição e o Google contam de um empreendimento.
 *
 * Tudo sai das unidades DISPONÍVEIS: a reservada aparece na página, com o selo,
 * mas não é o que se oferece. Enquanto houver disponível, uma planta só com
 * reservadas não entra em "2 ou 3 dormitórios".
 *
 * Preço, só o das disponíveis: o "a partir de", a faixa da busca
 * (`precosNaFinalidade`), a descrição e a oferta para o Google. A reservada nem
 * chega com preço (`site_imoveis` não manda: é o da tabela do dia da reserva, e
 * ela não está à venda). Sem disponível com preço (só reservadas, sem a tabela
 * do mês, suspenso), não há preço em lugar nenhum: o site mostra "Consulte".
 * Os números continuam: sem disponível, valem as plantas das reservadas, e o
 * cartão ainda diz o que o imóvel é.
 */

/**
 * As plantas com unidade disponível, cada uma só com as disponíveis. Se já não
 * resta nenhuma (só reservadas), todas as que o banco mandou: o imóvel continua
 * na vitrine como reservado, e o cartão ainda diz o que ele é.
 *
 * Só precisa das plantas: o título padrão (`tituloPadrao`) usa a mesma regra
 * antes de o imóvel estar montado.
 */
export function plantasAVenda(imovel: { empreendimento: Pick<Empreendimento, 'plantas'> | null }): PlantaDoEmpreendimento[] {
  const plantas = imovel.empreendimento?.plantas ?? [];
  const comDisponivel = plantas
    .map((planta) => ({ ...planta, unidades: planta.unidades.filter((u) => u.situacao === 'disponivel') }))
    .filter((planta) => planta.unidades.length > 0);
  return comDisponivel.length > 0 ? comDisponivel : plantas;
}

/**
 * Os preços das unidades disponíveis. Sem a tabela do mês, ou fora da vitrine,
 * nenhum (os preços chegam nulos, ver `imovelDaLinha`).
 */
export function precosDisponiveis(imovel: Pick<Imovel, 'empreendimento'>): number[] {
  return (imovel.empreendimento?.plantas ?? [])
    .flatMap((planta) => planta.unidades)
    .filter((u) => u.situacao === 'disponivel')
    .map((u) => u.precoCents)
    .filter((preco) => preco !== null);
}

/**
 * O cabeçalho de uma planta em "Unidades": "3 disponíveis · 1 reservada · a
 * partir de R$ 840.569". O "a partir de" é o das disponíveis com preço, como o
 * do imóvel: com a planta só de reservadas, ou sem a tabela do mês, não há.
 */
export function ofertaDaPlanta(planta: Pick<PlantaDoEmpreendimento, 'unidades'>) {
  const disponiveis = planta.unidades.filter((u) => u.situacao === 'disponivel');
  const precos = disponiveis.map((u) => u.precoCents).filter((preco) => preco !== null);
  return {
    disponiveis: disponiveis.length,
    reservadas: planta.unidades.length - disponiveis.length,
    aPartirDeCents: precos.length > 0 ? Math.min(...precos) : null,
  };
}

/**
 * O preço na linha da unidade, com os centavos, como na tabela da construtora.
 * A disponível sem a tabela do mês é "Consulte"; a reservada não tem preço nem
 * "Consulte", só o selo: não está à venda, e pedir que consultem o preço dela
 * diria o contrário.
 */
export function precoDaUnidade(unidade: Pick<UnidadeDoEmpreendimento, 'situacao' | 'precoCents'>): string | null {
  if (unidade.situacao !== 'disponivel') return null;
  return unidade.precoCents !== null ? reaisComCentavos(unidade.precoCents) : 'Consulte';
}

/** Os dormitórios de uma planta (ou de um imóvel): os quartos do cadastro não contam as suítes. */
export function dormitoriosDaPlanta(planta: Pick<PlantaDoEmpreendimento, 'quartos' | 'suites'>): number | null {
  return planta.quartos === null && planta.suites === null ? null : (planta.quartos ?? 0) + (planta.suites ?? 0);
}

const conhecidos = (valores: (number | null)[]) => valores.filter((valor) => valor !== null);

/**
 * Os números de cada planta à venda, para virar "70 m²", "2 ou 3 dormitórios".
 * Cada lista tem só o que foi cadastrado; a área é a de cada unidade, porque a
 * sala comercial tem a sua.
 */
export function numerosDasPlantas(plantas: readonly PlantaDoEmpreendimento[]) {
  return {
    areas: conhecidos(plantas.flatMap((planta) => planta.unidades.map((u) => u.areaM2 ?? planta.areaM2))),
    dormitorios: conhecidos(plantas.map(dormitoriosDaPlanta)),
    suites: conhecidos(plantas.map((planta) => planta.suites)),
    banheiros: conhecidos(plantas.map((planta) => planta.banheiros)),
    vagas: conhecidos(plantas.map((planta) => planta.vagas)),
  };
}

/**
 * Os dormitórios que o imóvel oferece, já somadas as suítes: [3] no imóvel
 * comum, [2, 3] no empreendimento com as duas plantas à venda.
 */
export function dormitoriosDoImovel(imovel: Imovel): number[] {
  const plantas = plantasAVenda(imovel);
  const lista = plantas.length > 0 ? numerosDasPlantas(plantas).dormitorios : conhecidos([dormitoriosDaPlanta(imovel)]);
  return lista.filter((n) => n > 0);
}
