/**
 * O que é teste, e de onde veio, num lead de formulário da Meta.
 *
 * Arquivo sem import nenhum de propósito. É a regra que decide se um contato de
 * verdade entra na operação ou fica de fora, e assim o teste do CRM a importa
 * direto, em vez de ler o texto da função de borda.
 */

type Campo = { name?: unknown; values?: unknown };

/**
 * O lead da ferramenta de testes da Meta.
 *
 * Ela preenche todo campo com "<test lead: dummy data for …>", e é por aí que
 * ele se reconhece. `is_organic` NÃO serve para isso: orgânico é quem preencheu
 * o formulário fora de um anúncio (pelo link da bio, do Marketplace, do Google,
 * de um post), e esse é cliente de verdade. Até 28/09 os dois eram descartados
 * juntos; o de teste também chega como orgânico, e só a marca o separa.
 */
export function ehLeadDeTeste(campos: Campo[]): boolean {
  return campos.some((c) =>
    (Array.isArray(c.values) ? c.values : []).some((v) => typeof v === 'string' && v.startsWith('<test lead:')),
  );
}

/**
 * A origem do lead de formulário.
 *
 * Com anúncio, `meta_ads`: é o que tem gasto, e o custo por lead divide o gasto
 * por ele. Sem anúncio, o perfil ORGÂNICO da plataforma em que a pessoa
 * preencheu. A Meta nem sempre diz a plataforma (o lead de teste veio sem); o
 * formulário é do Facebook, e na dúvida fica ele.
 */
export function origemDoFormulario(lead: {
  is_organic?: unknown;
  platform?: unknown;
}): 'meta_ads' | 'instagram' | 'facebook' {
  if (lead.is_organic !== true) return 'meta_ads';
  return lead.platform === 'ig' ? 'instagram' : 'facebook';
}
