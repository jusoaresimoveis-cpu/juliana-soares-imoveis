/**
 * Os atalhos de período e a conta de data que os transforma em janela. Moram
 * fora do hook do painel porque Anúncios, Inteligência, a exportação de leads e
 * os campos de período também os usam; `hooks/usePainel.ts` reexporta.
 */

export const PERIODOS = [
  /*
   * "Hoje" com `dias: 1` cai na mesma conta dos outros.
   *
   * `janelaDe` subtrai `dias - 1` da data de hoje porque o período INCLUI o dia
   * corrente. Com 1, a subtração é zero e a janela vira hoje..hoje — sem
   * nenhum caso especial. É o mesmo motivo de "7 dias" ser hoje e os seis
   * anteriores.
   */
  /*
   * QUATRO atalhos, e o quarto abre uma janela qualquer.
   *
   * Eram seis — hoje, 7, 30, 90, este mês, máximo — e três deles respondiam
   * quase a mesma pergunta. Seis pastilhas também quebravam em duas linhas num
   * celular, e havia um mecanismo (`curto`) só para esconder duas delas ali; com
   * quatro, todas cabem e o mecanismo deixa de existir.
   *
   * `personalizado` não tem janela própria: quem a define são as duas datas que
   * a tela mostra quando ele é escolhido. `dias: 0` aqui é só para a lista ter
   * um formato só.
   */
  { key: 'hoje', rotulo: 'Hoje', dias: 1 },
  { key: '7', rotulo: '7 dias', dias: 7 },
  { key: 'max', rotulo: 'Máximo', dias: 0 },
  { key: 'personalizado', rotulo: 'Personalizado', dias: 0 },
] as const;

/**
 * O período em que o painel abre.
 *
 * Era diferente por tamanho de tela — um remendo para o celular não abrir num
 * período cujo botão estava escondido. Com quatro pastilhas não há botão
 * escondido, e a resposta volta a ser uma só.
 *
 * Sete dias: é a janela em que uma decisão de tráfego ainda cabe. "Hoje" varia
 * demais para servir de padrão, e "Máximo" mistura o mês passado com o começo do
 * projeto.
 */
export function periodoInicial(): ChaveDePeriodo {
  return '7';
}

export type ChaveDePeriodo = (typeof PERIODOS)[number]['key'];

/** Data local em YYYY-MM-DD. `toISOString` daria o dia errado à noite, no fuso. */
function dia(d: Date): string {
  const z = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}

/**
 * Hoje, em `YYYY-MM-DD` local.
 *
 * É o teto dos dois campos de data do período personalizado. `toISOString()`
 * daria o dia errado à noite, no nosso fuso — o mesmo motivo pelo qual `dia()`
 * existe logo acima.
 */
export function hojeISO(): string {
  return dia(new Date());
}

/**
 * A janela que as duas datas escolhidas à mão descrevem.
 *
 * Normaliza em vez de recusar: data invertida vira intervalo na ordem certa, e
 * data no futuro é aparada em hoje. Recusar exigiria uma mensagem de erro para
 * um engano que o próprio campo já torna óbvio — e um painel que fica vazio
 * enquanto a pessoa termina de digitar parece quebrado.
 *
 * Comparação de texto funciona porque o formato é `YYYY-MM-DD`, que ordena
 * igual à data.
 */
export function janelaPersonalizada(de: string, ate: string): { de: string; ate: string } {
  const limite = dia(new Date());
  const a = de || limite;
  const b = ate || limite;
  const ini = a <= b ? a : b;
  const fim = a <= b ? b : a;
  return { de: ini > limite ? limite : ini, ate: fim > limite ? limite : fim };
}

export function janelaDe(chave: ChaveDePeriodo): { de: string; ate: string } {
  const hoje = new Date();
  const ate = dia(hoje);

  if (chave === 'max') {
    // Antes de existir CRM não há dado. Uma data fixa é mais honesta do que
    // uma consulta a mais só para descobrir o primeiro lead.
    return { de: '2020-01-01', ate };
  }

  /*
   * `personalizado` cai no padrão de sete dias.
   *
   * Ele não tem janela própria — quem a define são as duas datas da tela. Esta
   * função existe para os atalhos, e devolver algo válido aqui é o que impede a
   * tela de pedir um período inválido no instante entre escolher
   * "Personalizado" e escolher as datas.
   */
  const dias = PERIODOS.find((p) => p.key === chave)?.dias || 7;
  return janelaDeDias(dias);
}

/**
 * Os últimos N dias, INCLUINDO hoje, em datas locais.
 *
 * Separada de `janelaDe` porque cada tela tem os seus atalhos — o painel tem
 * Hoje, 7 dias e Máximo; Anúncios tem Hoje, 7, 30 e 90. A conta de data é uma
 * só e mora aqui, com o fuso local e o `dias - 1` que o teste guarda.
 *
 * Anúncios tinha a própria, e errava nas duas coisas: usava `toISOString()`,
 * que é UTC e à noite devolve o dia seguinte, e subtraía `dias` em vez de
 * `dias - 1`, então "7 dias" cobria oito.
 */
export function janelaDeDias(dias: number): { de: string; ate: string } {
  const hoje = new Date();
  const inicio = new Date(hoje);
  // `dias - 1` porque o período INCLUI hoje: "7 dias" é hoje e os seis
  // anteriores, não hoje e os sete. Menos de um dia não existe.
  inicio.setDate(inicio.getDate() - (Math.max(1, dias) - 1));
  return { de: dia(inicio), ate: dia(hoje) };
}

/**
 * Os atalhos das telas que leem JANELAS — Anúncios e a exportação de leads.
 *
 * Não são os do painel, e é de propósito. O painel responde "como está a
 * operação" e mora em Hoje, 7 dias e Máximo. Verba e lista de contatos se leem
 * em janelas de mídia — 7, 30, 90 —, que é também como o gerenciador da Meta as
 * oferece. Moravam dentro de Anúncios; a exportação precisou dos mesmos, e
 * copiar a lista seria o começo de duas telas com atalhos diferentes para a
 * mesma pergunta.
 *
 * "Hoje" é parcial por natureza: o dia ainda está acontecendo.
 */
export const PERIODOS_DE_JANELA = [
  { key: 'hoje', rotulo: 'Hoje', dias: 1 },
  { key: '7', rotulo: '7 dias', dias: 7 },
  { key: '30', rotulo: '30 dias', dias: 30 },
  { key: '90', rotulo: '90 dias', dias: 90 },
  { key: 'personalizado', rotulo: 'Personalizado', dias: 0 },
] as const;

export type PeriodoDeJanela = (typeof PERIODOS_DE_JANELA)[number]['key'];

/**
 * A janela que um desses atalhos pede ao banco.
 *
 * A versão original, dentro de Anúncios, subtraía `dias` em vez de `dias - 1` —
 * "7 dias" cobria oito — e usava `toISOString()`, que à noite, no nosso fuso,
 * já é o dia seguinte. O teste guarda as duas coisas.
 */
export function janelaDoPeriodo(
  periodo: PeriodoDeJanela,
  aMao: { de: string; ate: string },
): { de: string; ate: string } {
  if (periodo === 'personalizado') return janelaPersonalizada(aMao.de, aMao.ate);
  return janelaDeDias(PERIODOS_DE_JANELA.find((p) => p.key === periodo)?.dias ?? 30);
}
