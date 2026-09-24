/**
 * Dicionário compartilhado entre o site e o CRM.
 *
 * Mesma regra do CRM de origem: se um valor aparece em duas camadas (banco,
 * CRM, site, funções), ele é exportado daqui ou não existe. Quando o clone do
 * CRM chegar, o `packages/contracts` dele é mesclado neste, e não o contrário.
 */

export * from './imovel';
export * from './localidades';
