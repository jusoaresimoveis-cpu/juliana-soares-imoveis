/**
 * O formato do que `painel_indicadores` devolve. Mora fora do hook porque os
 * formatos do painel também o leem; `hooks/usePainel.ts` reexporta.
 */

export interface JanelaDoPainel {
  leads: number;
  leads_meta: number;
  investido_menor: number;
  /** Quantas moedas entraram na soma. Mais de uma torna o total sem sentido. */
  moedas: number;
  vendas: number;
  vgv_centavos: number;
  propostas: number;
  visitas: number;
  minutos_ate_contato: number | null;
  contatados: number;
  /*
   * O que ainda VAI acontecer, sem filtro de período.
   *
   * `visitas` conta o que foi MARCADO na janela — trabalho feito, como os
   * cartões ao lado. Este conta o que está pela frente, que é a resposta certa
   * para a pergunta que a saudação faz. Contar visita futura dentro de uma
   * janela que termina hoje dava sempre zero: a visita marcada para 5 de
   * setembro não cabe em nenhum período retrospectivo.
   */
  visitas_proximas: number;
}

export interface EtapaDoPainel {
  key: string;
  label: string;
  total: number;
}

export interface SerieDoPainel {
  /** Acima de 92 dias a série vira semanal — 2.400 pontos não são um gráfico. */
  passo: 'dia' | 'semana';
  /** Já vem com os dias vazios preenchidos com zero, direto do banco. */
  pontos: { dia: string; n: number }[];
}

export interface OrigemDoPainel {
  source: string;
  n: number;
}

/**
 * De quem sao os numeros que este painel esta mostrando.
 *
 * Quem decide e o BANCO, e nao a tela: `painel_indicadores` compara o papel de
 * quem chamou e ja devolve os totais recortados. O front recebe isto pronto
 * para poder ser honesto sobre o que esta exibindo — e para tirar do ar os dois
 * cartoes de midia, que o corretor nao pode ler e que apareceriam zerados.
 */
export type EscopoDoPainel = 'meus' | 'todos';

export interface Painel {
  periodo: { de: string; ate: string; dias: number };
  /** 'meus' para o corretor; 'todos' para gerente e administrador. */
  escopo: EscopoDoPainel;
  /*
   * Existe verba que ESTA pessoa pode ler?
   *
   * Era o `escopo` que decidia isso, e ele responde outra pergunta: de quem são
   * os LEADS. As duas andavam juntas enquanto verba era coisa só da gestão. Com
   * a corretora tendo a BM dela, elas se separam — os leads dela são dela, e o
   * dinheiro dela também.
   *
   * Quem responde é o banco, pela policy: "existe conta de anúncio que você
   * enxerga?". Assim a tela não tem como discordar de quem manda.
   */
  ve_verba: boolean;
  atual: JanelaDoPainel;
  anterior: JanelaDoPainel;
  funil: EtapaDoPainel[];
  serie: SerieDoPainel;
  origens: OrigemDoPainel[];
}
