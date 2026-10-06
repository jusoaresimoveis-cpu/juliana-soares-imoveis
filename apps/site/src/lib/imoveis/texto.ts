import { FINALIDADE_NA_FRASE, PROPERTY_TYPE_LABEL } from '@juliana/contracts';

import { plural, reais } from '@/lib/formato';

import type { Imovel } from './tipos';

/** ["72 m²", "2 quartos", "1 vaga"]: só o que foi preenchido. */
export function textoDasCaracteristicas(imovel: Imovel): string[] {
  return [
    imovel.areaM2 ? `${imovel.areaM2.toLocaleString('pt-BR')} m²` : null,
    imovel.quartos ? plural(imovel.quartos, 'quarto', 'quartos') : null,
    imovel.suites ? plural(imovel.suites, 'suíte', 'suítes') : null,
    imovel.banheiros ? plural(imovel.banheiros, 'banheiro', 'banheiros') : null,
    imovel.vagas ? plural(imovel.vagas, 'vaga', 'vagas') : null,
  ].filter((item) => item !== null);
}

/**
 * A descrição que aparece no resultado do Google e no cartão do link no
 * WhatsApp. Montada dos dados, e não da descrição livre: é a frase que responde
 * de cara o que a pessoa quer saber (o quê, onde, quanto).
 *
 * "Apartamento para alugar em Meia Praia, Itapema: 72 m², 2 quartos. R$ 3.500/mês. Cód. EX1."
 */
export function resumoDoImovel(imovel: Imovel): string {
  const finalidades = imovel.finalidades.map((f) => FINALIDADE_NA_FRASE[f]).join(' ou ');
  const onde = [imovel.bairro, imovel.cidade].filter(Boolean).join(', ');
  const caracteristicas = textoDasCaracteristicas(imovel).join(', ');

  const venda = imovel.finalidades.includes('venda') ? imovel.precoVendaCents : null;
  const valores = [
    imovel.finalidades.includes('aluguel') && imovel.aluguelCents ? `${reais(imovel.aluguelCents)}/mês` : null,
    // O desconto também no resultado do Google e na prévia do link no WhatsApp.
    venda
      ? imovel.precoDeTabelaCents
        ? `de ${reais(imovel.precoDeTabelaCents)} por ${reais(venda)}`
        : reais(venda)
      : null,
  ].filter((valor) => valor !== null);

  let frase = `${PROPERTY_TYPE_LABEL[imovel.tipo]} ${finalidades}`;
  if (onde) frase += ` em ${onde}`;
  if (caracteristicas) frase += `: ${caracteristicas}`;
  frase += '.';
  if (valores.length > 0) {
    const preco = valores.join(' ou ');
    // Depois do ponto, o "de" do desconto começa a frase.
    frase += ` ${preco.charAt(0).toUpperCase()}${preco.slice(1)}.`;
  }
  return `${frase} Cód. ${imovel.codigo}.`;
}
