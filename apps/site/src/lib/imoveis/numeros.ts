import type { Imovel } from './tipos';

export type TipoDeNumero = 'area' | 'quartos' | 'suites' | 'banheiros' | 'vagas';

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
  const numeros: NumeroDoImovel[] = [];

  if (imovel.areaM2) {
    const total = imovel.areaTotalM2 && imovel.areaTotalM2 !== imovel.areaM2 ? imovel.areaTotalM2 : null;
    numeros.push({ tipo: 'area', valor: m2(imovel.areaM2), rotulo: 'm²', extra: total ? `${m2(total)} m² total` : null });
  }

  /*
   * Quartos e suítes lado a lado, do mesmo tamanho. No cadastro da Juliana,
   * "Dormitórios" são os quartos que NÃO são suíte: 2 quartos e 1 suíte são 3
   * dormitórios, e a pessoa precisa ver os dois números para somar.
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
