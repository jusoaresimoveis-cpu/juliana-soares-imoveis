import { faixaDeArea, faixaDeContagem, plural } from '@/lib/formato';

import { dormitoriosDaPlanta, numerosDasPlantas, plantasAVenda } from './empreendimento';
import type { Imovel, PlantaDoEmpreendimento } from './tipos';

/*
 * "Quartos" e "dormitórios" são números diferentes no site, de propósito.
 *
 * - "quartos" é o número do cadastro, que NÃO conta as suítes. Só aparece ao
 *   lado das suítes, no imóvel comum: "2 quartos · 1 suíte" são 3 dormitórios,
 *   e a pessoa vê os dois números para somar.
 * - "dormitórios" é o total, quartos + suítes. É a palavra de todo lugar onde o
 *   número já vem somado: os números do empreendimento (cartão e topo da
 *   página), a descrição dele para o Google, o título padrão dele e o
 *   cabeçalho de cada planta em "Unidades" ("3 dormitórios (1 suíte)").
 *
 * Com a mesma palavra para os dois, "2 ou 3 quartos" ao lado de "1 ou 2 suítes"
 * no empreendimento lia como até 5 dormitórios. O título padrão do imóvel
 * comum ("Apartamento com 3 quartos") ainda soma com "quartos", como decidido
 * em 25/09 (`docs/DECISOES.md`).
 */

export type TipoDeNumero = 'area' | 'quartos' | 'dormitorios' | 'suites' | 'banheiros' | 'vagas';

export interface NumeroDoImovel {
  tipo: TipoDeNumero;
  valor: string;
  rotulo: string;
  /** A segunda linha, menor: a área total embaixo da área. */
  extra: string | null;
}

const m2 = (area: number) => area.toLocaleString('pt-BR');

/**
 * Os números do topo da página do imóvel.
 *
 * Só o que foi preenchido: um "—" no site pareceria imóvel com defeito, e não
 * cadastro incompleto.
 */
export function numerosDoImovel(imovel: Imovel): NumeroDoImovel[] {
  const plantas = plantasAVenda(imovel);
  if (plantas.length > 0) return numerosDoEmpreendimento(plantas);

  const numeros: NumeroDoImovel[] = [];

  if (imovel.areaM2) {
    const total = imovel.areaTotalM2 && imovel.areaTotalM2 !== imovel.areaM2 ? imovel.areaTotalM2 : null;
    numeros.push({ tipo: 'area', valor: m2(imovel.areaM2), rotulo: 'm²', extra: total ? `${m2(total)} m² total` : null });
  }

  /*
   * Quartos e suítes lado a lado, do mesmo tamanho. No cadastro, "Quartos (sem
   * as suítes)": 2 quartos e 1 suíte são 3 dormitórios, e a pessoa precisa ver
   * os dois números para somar (a convenção está no topo do arquivo).
   */
  if (imovel.quartos) {
    numeros.push({ tipo: 'quartos', valor: String(imovel.quartos), rotulo: imovel.quartos === 1 ? 'quarto' : 'quartos', extra: null });
  }
  if (imovel.suites) {
    numeros.push({ tipo: 'suites', valor: String(imovel.suites), rotulo: imovel.suites === 1 ? 'suíte' : 'suítes', extra: null });
  }

  if (imovel.banheiros) {
    numeros.push({ tipo: 'banheiros', valor: String(imovel.banheiros), rotulo: imovel.banheiros === 1 ? 'banheiro' : 'banheiros', extra: null });
  }

  if (imovel.vagas) {
    numeros.push({ tipo: 'vagas', valor: String(imovel.vagas), rotulo: imovel.vagas === 1 ? 'vaga' : 'vagas', extra: null });
  }

  return numeros;
}

/**
 * O empreendimento junta as plantas à venda: "70 m²", "2 ou 3 dormitórios", "1
 * ou 2 suítes".
 *
 * Aqui o número JÁ soma as suítes, e por isso é "dormitórios". Lado a lado, "0
 * ou 2 quartos" e "1 ou 2 suítes" não deixariam a pessoa somar (não dá para
 * saber qual vai com qual); o total por planta, sim, e as suítes ficam ao lado
 * dizendo quantos deles são suíte. O detalhe de cada planta está em "Unidades".
 */
function numerosDoEmpreendimento(plantas: readonly PlantaDoEmpreendimento[]): NumeroDoImovel[] {
  const { areas, dormitorios, suites, banheiros, vagas } = numerosDasPlantas(plantas);
  const numeros: NumeroDoImovel[] = [];

  if (areas.length > 0) numeros.push({ tipo: 'area', valor: faixaDeArea(areas), rotulo: 'm²', extra: null });

  const contagem = (tipo: TipoDeNumero, valores: number[], singular: string, pluralDaPalavra: string) => {
    const maior = Math.max(0, ...valores);
    if (maior === 0) return;
    numeros.push({ tipo, valor: faixaDeContagem(valores), rotulo: maior === 1 ? singular : pluralDaPalavra, extra: null });
  };
  contagem('dormitorios', dormitorios, 'dormitório', 'dormitórios');
  contagem('suites', suites, 'suíte', 'suítes');
  contagem('banheiros', banheiros, 'banheiro', 'banheiros');
  contagem('vagas', vagas, 'vaga', 'vagas');

  return numeros;
}

/**
 * O total de uma planta, com as suítes dentro: "3 dormitórios (1 suíte)", "2
 * dormitórios (2 suítes)", "2 dormitórios". É o cabeçalho da planta em
 * "Unidades", que fica embaixo do "2 ou 3 dormitórios" do topo e tem que
 * falar a mesma língua. Os parênteses dizem que a suíte é um dos dormitórios, e
 * não um a mais. Nulo sem quarto nem suíte cadastrados.
 */
export function textoDosDormitorios(planta: Pick<PlantaDoEmpreendimento, 'quartos' | 'suites'>): string | null {
  const total = dormitoriosDaPlanta(planta);
  if (!total) return null;
  const dormitorios = plural(total, 'dormitório', 'dormitórios');
  return planta.suites ? `${dormitorios} (${plural(planta.suites, 'suíte', 'suítes')})` : dormitorios;
}
