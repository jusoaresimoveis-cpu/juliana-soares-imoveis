/**
 * Os cinco ângulos de criativo.
 *
 * Vêm do método que o Guto trouxe em 17/09/2026: cinco ARGUMENTOS diferentes
 * para vender a mesma oportunidade — e não cinco variações estéticas do mesmo
 * argumento, que é o erro que o método nomeia logo no começo ("trocar a cor do
 * prédio é variação estética; a proposta dele é a mesma").
 *
 * ---------------------------------------------------------------------------
 * POR QUE ISTO EXISTE COMO DIMENSÃO, E NÃO COMO NOME DE ANÚNCIO
 * ---------------------------------------------------------------------------
 *
 * Na conta de origem, em 30 dias, foram cinco dezenas de anúncios com gasto, e
 * os nomes eram do tipo "Prédio X BRANCO", "Prédio X (sem branco e amarelo)",
 * "PAÍS" e "Novo anúncio de Engajamento". Quase todos descrevem a ARTE. Dois
 * descreviam o argumento ("DOR 1 - Prédio X").
 *
 * Com 145 leads espalhados por 51 anúncios, nenhum anúncio tem volume para um
 * veredito — a média é menos de três leads cada. Cinco ângulos, não. É por isso
 * que o ângulo não é etiqueta de organização: é a UNIDADE que junta volume
 * suficiente para uma decisão significar alguma coisa.
 *
 * ---------------------------------------------------------------------------
 * DIGITADO, NUNCA ADIVINHADO
 * ---------------------------------------------------------------------------
 *
 * A tentação é ler o nome do anúncio e deduzir ("começa com DOR, então é dor").
 * Este projeto já fechou essa porta duas vezes — no tipo de campanha (017) e no
 * empreendimento (105) — pelo mesmo motivo: nome de anúncio é texto que o
 * gestor reescreve no meio do mês, e uma chave que muda sozinha parte o
 * histórico em dois sem ninguém perceber.
 *
 * A tela SUGERE a partir do nome e a pessoa confirma. A sugestão é conveniência;
 * o que fica gravado é a escolha de alguém.
 */

export const ANGULOS_DE_CRIATIVO = [
  'dor',
  'desejo',
  'comparacao',
  'objecao',
  'curiosidade',
] as const;

export type AnguloDeCriativo = (typeof ANGULOS_DE_CRIATIVO)[number];

export const ANGULO_DE_CRIATIVO_META: Record<
  AnguloDeCriativo,
  { label: string; nota: string; exemplo: string }
> = {
  dor: {
    label: 'Dor',
    nota: 'Nomeia um problema que a pessoa já tem. Ela se reconhece antes de ver o imóvel.',
    exemplo: 'Seu dinheiro está parado e perdendo poder de compra?',
  },
  desejo: {
    label: 'Desejo',
    nota: 'Mostra o que ela quer conquistar. O foco sai do problema e vai para o resultado.',
    exemplo: 'Um imóvel a poucos minutos da praia — e que ainda vira renda.',
  },
  comparacao: {
    label: 'Comparação',
    nota: 'Põe duas escolhas lado a lado. A comparação obriga a pessoa a raciocinar.',
    exemplo: 'R$ 5.000 por mês de aluguel ou uma parcela construindo patrimônio?',
  },
  objecao: {
    label: 'Objeção',
    nota: 'Pega o que trava a decisão e responde na hora, com a condição que quebra a trava.',
    exemplo: 'Acha que precisa de R$ 500 mil para começar?',
  },
  curiosidade: {
    label: 'Curiosidade',
    nota: 'Abre uma lacuna de informação e não fecha. A conversa é o jeito de fechar.',
    exemplo: 'Tem um detalhe neste empreendimento que muda a conta inteira.',
  },
};

export function ehAnguloDeCriativo(v: unknown): v is AnguloDeCriativo {
  return typeof v === 'string' && (ANGULOS_DE_CRIATIVO as readonly string[]).includes(v);
}

/**
 * O que o NOME do anúncio sugere — sugestão, e só.
 *
 * Devolve o ângulo quando o nome começa com a palavra dele, que é a convenção
 * que o gestor de tráfego adotou ("DOR 1 - Prédio X"). Nunca grava nada: quem grava é a pessoa
 * que clicou.
 *
 * Deliberadamente burra. Uma heurística mais esperta — procurar a palavra em
 * qualquer posição, aceitar sinônimos — acerta mais vezes e erra pior, porque
 * passa a sugerir com confiança em nomes que não seguem convenção nenhuma.
 */
export function anguloSugeridoPeloNome(nome: string | null | undefined): AnguloDeCriativo | null {
  if (!nome) return null;
  const limpo = nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trimStart();
  for (const a of ANGULOS_DE_CRIATIVO) {
    if (limpo.startsWith(a)) return a;
  }
  return null;
}
