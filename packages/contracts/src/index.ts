/**
 * Dicionário canônico do site e do CRM.
 *
 * Tudo que tem nome e atravessa mais de uma camada mora aqui: tipo de imóvel,
 * etapa do funil, origem do lead, chave de atribuição, tipo de evento. O site,
 * o CRM, as edge functions e as migrations leem destes arquivos. O banco repete
 * os mesmos valores em CHECK, e `contracts.test.ts` compara os dois: renomear de
 * um lado só quebra o CI de propósito.
 *
 * Regra: nada de string solta. Se um valor aparece em duas camadas, ele é
 * exportado daqui ou não existe.
 *
 * Os módulos em inglês vieram do CRM de origem (SelectusConnect) junto com o
 * clone; `aluguel.ts`, `imovel.ts`, `localidades.ts` e `rastreio.ts` são deste
 * projeto.
 */

export * from './locales';
export * from './mercados';
export * from './landing';
export * from './events';
export * from './attribution';
export * from './pipeline';
export * from './qualificacao';
export * from './property';
export * from './visits';
export * from './roles';
export * from './notifications';
export * from './reminders';
export * from './whatsapp';
export * from './meta';
export * from './regiao';
export * from './angulos';

export * from './aluguel';
export * from './imovel';
export * from './caracteristicas';
export * from './localidades';
export * from './rastreio';
