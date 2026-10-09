/**
 * A volta: o que o CRM devolve à Meta pela API de Conversões. Morava no fim de
 * `meta.ts`, que reexporta tudo daqui; "o resto deste arquivo", no comentário
 * abaixo, é o `meta.ts`.
 */

/* -------------------------------------------------------------------------- */
/* A volta — a 141 e a 142                                                     */
/* -------------------------------------------------------------------------- */

/**
 * O QUE O CRM DEVOLVE À META.
 *
 * Todo o resto deste arquivo é a Meta contando coisas para o CRM: o lead do
 * formulário, o gasto por anúncio. Esta lista é o caminho contrário, e ela
 * existe porque a medição de 24/09 encontrou um silêncio completo: dos 187
 * leads vivos, TODOS vieram do anúncio que abre o WhatsApp, e nenhum deles
 * jamais foi contado de volta.
 *
 * O que a Meta sabia até aqui era "176 pessoas clicaram e abriram conversa".
 * Conversa inclui o "oi" que sumiu, o engano e quem queria emprego — e era com
 * esse público que o algoritmo estava aprendendo a procurar mais gente
 * parecida.
 *
 * SÃO OS FATOS DO CRM, e não os nomes da Meta. A diferença custou uma migração
 * inteira: a API de Conversões tem DOIS vocabulários, um para evento de site e
 * outro para evento de conversa, e `Lead` só existe no primeiro. Guardar o nome
 * da Meta faria a mesma linha estar certa para uma porta e errada para a outra.
 * Quem traduz é o trabalhador, que sabe por onde o lead entrou.
 */
export const CONVERSOES_DEVOLVIDAS = [
  'lead',
  'visita_agendada',
  'visita_realizada',
  'proposta',
  'venda',
] as const;
export type ConversaoDevolvida = (typeof CONVERSOES_DEVOLVIDAS)[number];

/** Como cada uma se chama para quem lê, e o fato do CRM que a dispara. */
export const CONVERSAO_META: Record<ConversaoDevolvida, { label: string; fato: string }> = {
  lead: {
    label: 'Virou lead',
    fato: 'o clique no anúncio virou ficha no CRM',
  },
  visita_agendada: {
    label: 'Visita agendada',
    fato: 'o cartão entrou na etapa de visita agendada',
  },
  visita_realizada: {
    label: 'Visita realizada',
    fato: 'o cliente esteve no imóvel — o sinal mais forte que a casa produz',
  },
  proposta: {
    label: 'Proposta',
    fato: 'o cliente ofereceu um preço',
  },
  venda: {
    label: 'Fechado',
    fato: 'a venda aconteceu — vai com o valor do negócio',
  },
};

/**
 * OS DOIS VOCABULÁRIOS DA META, E POR QUE ELES EXISTEM.
 *
 * O evento que nasce num site aceita `Lead`, `Schedule`, `Purchase`. O que
 * nasce numa CONVERSA aceita outra lista, de gosto mais comercial —
 * `LeadSubmitted`, `QualifiedLead`, `InitiateCheckout`, `Purchase` — e recusa
 * `Lead` com um 400 seco. Foi assim que os 42 primeiros eventos voltaram.
 *
 * As escolhas do lado da conversa, uma por uma:
 *
 *   `LeadSubmitted` para a ficha — é o nome dela mesma;
 *   `QualifiedLead` para a visita agendada — marcar visita É o critério de
 *     qualificação da casa, então o nome diz a verdade;
 *   `InitiateCheckout` para a proposta — não é sinônimo, é a mesma POSIÇÃO:
 *     o degrau imediatamente antes da compra, dos dois lados;
 *   `Purchase` para a venda, com o valor do negócio.
 */
export const CONVERSAO_NA_CONVERSA: Partial<Record<ConversaoDevolvida, string>> = {
  lead: 'LeadSubmitted',
  visita_agendada: 'QualifiedLead',
  proposta: 'InitiateCheckout',
  venda: 'Purchase',
  /*
   * `visita_realizada` NÃO TEM ENTRADA AQUI, e o `Partial` existe por ela.
   *
   * A lista da conversa não tem nada que queira dizer "o cliente entrou no
   * apartamento". O mais parecido é `ViewContent`, que para a Meta é alguém
   * olhando uma página de produto — barato, abundante, de intenção baixa.
   *
   * Fora da conversa o problema some: `CONVERSAO_NO_SITE` usa um nome NOSSO,
   * que a Meta aceita em qualquer origem que não seja `business_messaging`.
   * Então este é o único evento que existe numa rota e não na outra, e o
   * trabalhador o descarta dizendo por quê se a rota virar conversa.
   */
};

/**
 * O VOCABULÁRIO COMUM — vale para `website`, `chat` e qualquer origem que não
 * seja `business_messaging`.
 *
 * É mais largo de propósito: aqui a Meta aceita nome PRÓPRIO, e é por isso que
 * `VisitaRealizada` cabe. A restrição que obrigou a inventar equivalências
 * existe só do lado do CTWA.
 */
export const CONVERSAO_NO_SITE: Record<ConversaoDevolvida, string> = {
  lead: 'Lead',
  visita_agendada: 'Schedule',
  visita_realizada: 'VisitaRealizada',
  proposta: 'InitiateCheckout',
  venda: 'Purchase',
};

/**
 * A ETAPA QUE NÃO VIRA EVENTO, e é metade da decisão.
 *
 * `em_atendimento` anda sozinha desde a 122, no instante em que um humano
 * responde. Em 24/09 isso era 158 das 179 mudanças de etapa de toda a história
 * do CRM, e 156 dos 187 leads vivos estavam parados nela. Um evento que
 * acontece com quase todo mundo não separa ninguém de ninguém — seria o lead de
 * novo com outro nome, abafando os poucos que realmente distinguem.
 *
 * `perdido` também não vai: a Meta não tem o que fazer com derrota.
 *
 * `visita_realizada` VOLTOU, depois de ter saído por um motivo que deixou de
 * valer. Ela foi cortada quando a única rota era a da conversa, onde a lista da
 * Meta não tem nome para "o cliente entrou no apartamento". Pela rota comum o
 * nome pode ser NOSSO, então ela volta sendo o que é — e é o sinal mais forte
 * que uma imobiliária produz.
 */
export const ETAPAS_QUE_NAO_VOLTAM: readonly string[] = ['novo', 'em_atendimento', 'perdido'];

/** De que etapa nasce cada evento. O banco repete isto no gatilho da 142. */
export const CONVERSAO_DA_ETAPA: Record<string, ConversaoDevolvida> = {
  visita_agendada: 'visita_agendada',
  visita_realizada: 'visita_realizada',
  proposta: 'proposta',
  fechado: 'venda',
};

/**
 * QUANTO TEMPO A META ACEITA OLHAR PARA TRÁS.
 *
 * Sete dias, e é o limite dela. Quem envelhece na fila — porque o token caiu,
 * porque a Graph ficou fora — é marcado `expirado` em vez de ser retentado para
 * sempre. Foi o defeito da 133: uma fila que se reporta ocupada para sempre
 * porque o critério de saída nunca chega.
 *
 * É também por isso que não houve recuperação de histórico: dos 187 leads, 145
 * são mais velhos que isto. Carimbá-los com a data de hoje seria inventar 145
 * conversões num dia em que elas não aconteceram.
 */
export const CONVERSAO_JANELA_DIAS = 7;

/**
 * QUANTAS CONVERSÕES POR SEMANA A META PRECISA PARA APRENDER.
 *
 * Cinquenta é o número que a própria Meta publica para uma campanha sair da
 * fase de aprendizado. Ele está aqui para a tela poder dizer a verdade em vez
 * de sugerir o que não dá: com ~26 leads por semana nem o "virou lead" chega
 * lá, e visita e proposta, que aconteceram 4 vezes em toda a história, nunca
 * vão chegar.
 *
 * O que estes eventos servem HOJE é para RESPONDER qual criativo traz quem
 * avança, no relatório. Otimizar por eles é conversa para quando o volume vier.
 */
export const CONVERSAO_MINIMO_SEMANAL = 50;
