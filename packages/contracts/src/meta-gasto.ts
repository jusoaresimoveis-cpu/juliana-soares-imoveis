import type { MetaHealth } from './meta';

/**
 * O que chega da Graph e é conferido antes de virar dado: a chave do gasto, o
 * código de erro, o gasto que vem em string (e o custo por lead e por resultado
 * feito com ele), o telefone do formulário e o id que vira URL. `meta.ts`
 * reexporta tudo daqui.
 */

/**
 * Sentinela para id ausente na chave do gasto.
 *
 * No Postgres, `null` nunca é igual a `null` numa constraint única. A tabela do
 * sistema auditado usava `unique(org, campaign_id, adset_id, ad_id, date)` com
 * as três últimas anuláveis — qualquer linha sem `ad_id` escapava da restrição
 * e era inserida DE NOVO a cada importação. O gasto do dia dobrava, e o número
 * continuava plausível na tela.
 */
export const SEM_ID = '';

/**
 * O token morreu. Só reconectar resolve.
 *
 * Só o 190 mora aqui. Os códigos 200 e 10 estavam nesta lista e NÃO deviam:
 * eles não falam do token, falam do objeto. Um token perfeitamente válido leva
 * 200 ao pedir os formulários de uma Página em que o usuário do sistema não tem
 * cargo — foi exatamente o que aconteceu na primeira busca de leads desta
 * instalação. Com os dois juntos, a tela mandava reconectar, reconectar não
 * mudava nada, e o erro real (falta de acesso à Página) nunca era dito.
 */
export const META_ERROS_DE_TOKEN = [190] as const;
/** O token vale; falta acesso ao objeto. Reconectar não muda nada. */
export const META_ERROS_DE_PERMISSAO = [10, 200] as const;
/** E os que significam "tente de novo mais tarde". */
export const META_ERROS_DE_LIMITE = [4, 17, 32, 613] as const;

export function saudeDoErro(codigo: number | null | undefined): MetaHealth {
  if (codigo == null) return 'erro';
  if ((META_ERROS_DE_TOKEN as readonly number[]).includes(codigo)) return 'precisa_reconectar';
  if ((META_ERROS_DE_PERMISSAO as readonly number[]).includes(codigo)) return 'sem_permissao';
  if ((META_ERROS_DE_LIMITE as readonly number[]).includes(codigo)) return 'throttled';
  return 'erro';
}

/**
 * O erro da Graph em português, para quem está olhando a tela.
 *
 * "Graph 200" foi o que a tela mostrou quando a busca de leads falhou — um
 * número que não diz nem o que houve nem o que fazer, e que ainda por cima se
 * parece com o status HTTP de sucesso. Quem lê precisa saber se a bola está com
 * ele, com a Meta, ou com o tempo.
 */
export function mensagemDoErro(codigo: number | null | undefined, status?: number): string {
  switch (codigo) {
    case 190:
      return 'o acesso da Meta expirou ou foi revogado — reconecte';
    case 200:
    case 10:
      return 'a Meta negou acesso: a Página precisa estar atribuída ao usuário do sistema com controle total';
    case 4:
    case 17:
    case 32:
    case 613:
      return 'limite de consultas da Meta atingido — tente de novo mais tarde';
    case 100:
      return 'a Meta não reconheceu o pedido (campo ou id inválido)';
    case 803:
      return 'a Meta não encontrou este objeto, ou o acesso a ele não foi concedido';
    default:
      return codigo != null ? `erro ${codigo} da Meta` : `a Meta respondeu ${status ?? '?'}`;
  }
}

/**
 * Dinheiro em unidade mínima, sempre.
 *
 * A Meta devolve `spend` como STRING ("12.34"). O sistema auditado fazia
 * `parseFloat(insight.spend) || 0` — e `|| 0` transforma tanto o campo ausente
 * quanto o NaN em gasto zero, gravando por cima do valor correto do dia. Aqui,
 * valor que não converte ABORTA a linha em vez de virar zero.
 */
export function gastoParaMenor(valor: unknown, casas = 2): number | null {
  if (typeof valor === 'number') {
    return Number.isFinite(valor) && valor >= 0 ? Math.round(valor * 10 ** casas) : null;
  }
  if (typeof valor !== 'string') return null;

  /*
   * String vazia NÃO é zero.
   *
   * `Number('')` devolve 0, e aceitar isso seria repetir o defeito de cabeça
   * para baixo: o campo ausente vira um zero legítimo que depois é gravado por
   * cima do gasto correto do dia. Campo em branco significa "a Meta não
   * respondeu", e quem não respondeu não gastou zero — não se sabe.
   */
  const texto = valor.trim();
  if (texto === '') return null;

  const n = Number(texto);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 10 ** casas);
}

export function formatarGasto(menor: number | null | undefined, moeda: string): string {
  if (menor == null) return '—';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: moeda }).format(menor / 100);
}

/**
 * Custo por lead — e a razão de ele receber o denominador junto.
 *
 * Só entra no denominador o lead que TEM `ft_meta_ad_id`. O sistema auditado
 * dividia o gasto pelo total de leads da organização, incluindo os que vieram
 * de indicação e de placa na rua: o custo por lead saía barato e a decisão de
 * verba era tomada em cima disso.
 *
 * Devolver `null` quando não há lead atribuído é deliberado: a tela mostra "—",
 * nunca "R$ 0,00", que leria como anúncio de graça.
 */
export function custoPorLead(
  gastoMenor: number,
  leadsAtribuidos: number,
): { valor: number | null; confiavel: boolean } {
  if (leadsAtribuidos <= 0) return { valor: null, confiavel: false };
  return { valor: Math.round(gastoMenor / leadsAtribuidos), confiavel: leadsAtribuidos >= 5 };
}

/**
 * A mesma conta, para o resultado que a linha realmente produz.
 *
 * Existe separada porque o número de resultados pode ser NULO — a linha foi
 * importada antes de pedirmos `actions` à Meta. Nulo dividindo vira `Infinity`
 * em JavaScript, e `Infinity` formatado em real sai como "R$ ∞".
 */
export function custoPorResultado(
  gastoMenor: number,
  resultados: number | null | undefined,
): { valor: number | null; confiavel: boolean } {
  if (resultados == null || resultados <= 0) return { valor: null, confiavel: false };
  return { valor: Math.round(gastoMenor / resultados), confiavel: resultados >= 5 };
}

/**
 * Telefone da Meta para E.164.
 *
 * A lista de DDDs vem do sistema de referência — é conhecimento acumulado sobre
 * formulário brasileiro de verdade e vale portar. O que não vale é a regra
 * aplicada sem olhar o DDI: lá, um número português apanhava a regra do nono
 * dígito e virava outro número.
 */
const DDD_VALIDOS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35, 37, 38, 41, 42, 43,
  44, 45, 46, 47, 48, 49, 51, 53, 54, 55, 61, 62, 63, 64, 65, 66, 67, 68, 69, 71, 73, 74, 75, 77,
  79, 81, 82, 83, 84, 85, 86, 87, 88, 89, 91, 92, 93, 94, 95, 96, 97, 98, 99,
]);

export function telefoneE164(bruto: string | null | undefined): string | null {
  if (!bruto) return null;
  const d = bruto.replace(/\D/g, '');
  if (d.length < 8) return null;

  // Só mexe no formato brasileiro quando o número REALMENTE é brasileiro.
  const comDDI = d.startsWith('55') ? d.slice(2) : d;
  const pareceBR = (d.startsWith('55') && comDDI.length >= 10) || d.length === 10 || d.length === 11;

  if (!pareceBR) return `+${d}`;

  const ddd = Number(comDDI.slice(0, 2));
  if (!DDD_VALIDOS.has(ddd)) return `+${d}`;

  let resto = comDDI.slice(2);
  // Celular brasileiro tem 9 dígitos desde 2016; fixo continua com 8.
  if (resto.length === 8 && /^[6-9]/.test(resto)) resto = `9${resto}`;
  return `+55${ddd}${resto}`;
}

/**
 * Id da Meta que pode virar URL.
 *
 * O sistema auditado validava `^\d+$` em quatro ids e ESQUECIA do `leadgen_id`,
 * que era interpolado cru no caminho da Graph API junto com o token da
 * organização. Aqui não há id privilegiado: ou passa por esta função, ou não
 * toca em URL.
 */
export function idDaMeta(valor: unknown): string | null {
  return typeof valor === 'string' && /^\d{1,20}$/.test(valor) ? valor : null;
}
