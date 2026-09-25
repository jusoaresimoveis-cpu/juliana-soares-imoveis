import {
  LEAD_SOURCE_LABEL,
  LEAD_SOURCE_HUE,
  LEAD_SOURCES_NEUTRAS,
  type LeadSource,
} from '@contracts';

export interface Origem {
  source: string;
  n: number;
}

/*
 * O raio e a espessura são fixos; o que muda é o comprimento de cada arco.
 *
 * Desenhar com `stroke-dasharray` num círculo só — em vez de um `path` por
 * fatia — evita a matemática de arco elíptico e, principalmente, evita as
 * costuras claras que aparecem entre dois arcos adjacentes quando cada um é um
 * `path` fechado com a própria borda.
 */
const R = 42;
const CIRC = 2 * Math.PI * R;

export interface FatiaDaRosca extends Origem {
  fracao: number;
  offset: number;
  comprimento: number;
  cor: string;
}

/**
 * Onde cada arco começa e termina.
 *
 * As fatias precisam LADRILHAR: a soma dos comprimentos tem de fechar a
 * circunferência exata, e cada uma começar onde a anterior parou. Meio grau de
 * sobra vira um fio do trilho cinza aparecendo no meio da rosca; meio grau de
 * sobreposição escurece a emenda. Nos dois casos o desenho fica com um defeito
 * que ninguém consegue nomear, e a tabela ao lado continua certa — então a
 * suspeita cai sobre o dado.
 */
export function fatiasDaRosca(origens: Origem[], circunferencia = CIRC): FatiaDaRosca[] {
  const total = origens.reduce((s, o) => s + o.n, 0);
  if (total === 0) return [];

  let acumulado = 0;
  return origens.map((o) => {
    const fracao = o.n / total;
    const fatia: FatiaDaRosca = {
      ...o,
      fracao,
      // O traço começa onde o anterior terminou. Negativo porque o dasharray
      // anda no sentido do desenho, e o giro de -90° já pôs o início no topo.
      offset: -acumulado * circunferencia,
      comprimento: fracao * circunferencia,
      cor: corDaOrigem(o.source),
    };
    acumulado += fracao;
    return fatia;
  });
}

/**
 * De onde os leads vieram.
 *
 * Rosca em SVG, com um arco por canal. A leitura que interessa é "quanto do
 * meu funil depende de um canal só" — por isso o total fica no miolo e a
 * porcentagem ao lado de cada nome, em vez de dentro das fatias, onde não cabe
 * quando o canal tem 3%.
 */
export function CanaisDeAquisicao({ origens }: { origens: Origem[] }) {
  const total = origens.reduce((s, o) => s + o.n, 0);

  if (total === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-1 py-10 text-center">
        <p className="text-base font-semibold text-tx-2">Nenhum lead no período</p>
        <p className="text-sm text-tx-3">
          Assim que o primeiro entrar, a origem dele aparece aqui.
        </p>
      </div>
    );
  }

  const fatias = fatiasDaRosca(origens, CIRC);

  return (
    <div className="flex flex-1 flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-5">
      <div className="relative shrink-0">
        <svg viewBox="0 0 100 100" className="h-[132px] w-[132px] -rotate-90" role="img"
          aria-label={`${total} leads, ${origens.length} ${origens.length === 1 ? 'origem' : 'origens'}`}>
          {/* O trilho de trás fecha a rosca quando o arredondamento das fatias
              deixa um fio de fundo aparecendo entre a última e a primeira. */}
          <circle cx="50" cy="50" r={R} fill="none" stroke="hsl(var(--line))" strokeWidth="14" />
          {fatias.map((f) => (
            <circle
              key={f.source}
              cx="50"
              cy="50"
              r={R}
              fill="none"
              stroke={f.cor}
              strokeWidth="14"
              strokeDasharray={`${f.comprimento} ${CIRC - f.comprimento}`}
              strokeDashoffset={f.offset}
            />
          ))}
        </svg>

        <span className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <b className="text-2xl font-extrabold leading-none tabular-nums">{total}</b>
          <span className="mt-0.5 text-2xs text-tx-3">
            {total === 1 ? 'lead' : 'leads'}
          </span>
        </span>
      </div>

      <ul className="flex w-full min-w-0 flex-col gap-1.5">
        {fatias.map((f) => (
          <li key={f.source} className="flex items-center gap-2 text-sm">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: f.cor }}
              aria-hidden
            />
            <span className="min-w-0 flex-1 truncate text-tx-2">{rotulo(f.source)}</span>
            <span className="shrink-0 tabular-nums text-tx-3">{f.n}</span>
            <span className="w-12 shrink-0 text-right font-semibold tabular-nums">
              {porcento(f.fracao)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Origem que o banco tem e o dicionário não.
 *
 * Acontece entre uma migração e o deploy da tela. Mostrar a chave crua é feio,
 * e é melhor do que esconder a linha: um canal que some do gráfico faz a soma
 * das porcentagens não fechar em 100%, e ninguém descobre por quê.
 */
function rotulo(source: string): string {
  return LEAD_SOURCE_LABEL[source as LeadSource] ?? source;
}

export function corDaOrigem(source: string): string {
  const matiz = LEAD_SOURCE_HUE[source as LeadSource];
  // Origem desconhecida ganha o cinza dos neutros — nunca a cor de outro canal,
  // que faria duas fatias diferentes parecerem a mesma.
  if (matiz === undefined) return 'hsl(220 9% 60%)';
  const neutra = (LEAD_SOURCES_NEUTRAS as readonly string[]).includes(source);
  // 58% de luminosidade é o ponto em que a mesma cor continua legível sobre o
  // cartão branco e sobre o cartão escuro, sem precisar de duas paletas.
  return neutra ? `hsl(${matiz} 9% 60%)` : `hsl(${matiz} 68% 58%)`;
}

/**
 * "100%", "62,5%", "0,4%".
 *
 * Uma casa decimal só abaixo de 10%: sem ela, um canal com 4 de 900 leads vira
 * "0%" e some — e a soma das porcentagens visíveis não fecha.
 */
export function porcento(fracao: number): string {
  const p = fracao * 100;
  if (p >= 99.95) return '100%';
  const casas = p < 10 ? 1 : p % 1 === 0 ? 0 : 1;
  return `${p.toFixed(casas).replace('.', ',')}%`;
}
