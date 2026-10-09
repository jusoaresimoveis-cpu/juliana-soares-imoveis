import { useId } from 'react';

export interface PontoDaSerie {
  dia: string;
  n: number;
}

/**
 * A entrada de leads ao longo do período.
 *
 * SVG escrito à mão, como o funil. Uma biblioteca de gráfico traria 80 kB de
 * JavaScript, um tema próprio para brigar com os nossos tokens de cor, e a
 * necessidade de reconfigurar tudo a cada troca de paleta do sistema — para
 * desenhar uma linha e um preenchimento.
 *
 * O desenho usa `viewBox` com `preserveAspectRatio="none"`: a área estica com o
 * cartão sem precisar medir o contêiner em JavaScript.
 */
export function SerieDeLeads({
  pontos,
  passo,
}: {
  pontos: PontoDaSerie[];
  passo: 'dia' | 'semana';
}) {
  const id = useId();

  if (pontos.length === 0) {
    return <p className="py-10 text-center text-base text-tx-3">Sem período para desenhar.</p>;
  }

  const valores = pontos.map((p) => p.n);
  const maximo = Math.max(...valores);

  /*
   * Período inteiro em zero não vira uma linha rastejando no chão.
   *
   * Com `maximo = 0` toda coordenada Y cairia na base, e o desenho ficaria
   * idêntico ao de um período com um lead por dia — dois estados diferentes com
   * a mesma imagem. Dizer "nenhum lead" é mais honesto do que desenhar o nada.
   */
  if (maximo === 0) {
    return (
      <div className="flex h-[200px] flex-col items-center justify-center gap-1">
        <p className="text-base font-semibold text-tx-2">Nenhum lead no período</p>
        <p className="text-sm text-tx-3">
          {pontos.length} {passo === 'semana' ? 'semanas' : 'dias'} sem entrada.
        </p>
      </div>
    );
  }

  const L = 100;
  const A = 40;
  // O topo do gráfico fica um pouco acima do maior valor: com o pico encostando
  // na borda, ele parece cortado e some a noção de "quanto faltava para bater o
  // recorde".
  const teto = escalaDoTopo(maximo);

  const x = (i: number) => (pontos.length === 1 ? L / 2 : (i / (pontos.length - 1)) * L);
  const y = (n: number) => A - (n / teto) * A;

  const linha = caminhoSuave(pontos.map((p, i) => [x(i), y(p.n)] as const));
  const area = `${linha} L ${L} ${A} L 0 ${A} Z`;

  // Três marcas no eixo: zero, meio e topo. Mais que isso vira grade, e grade
  // densa num cartão pequeno compete com a própria linha.
  const marcas = [teto, Math.round(teto / 2), 0];
  const rotulos = rotulosDoEixo(pontos);

  return (
    <div className="mt-2">
      <div className="flex gap-2">
        {/* Os números do eixo ficam FORA do SVG esticado — dentro, eles
            deformariam junto com o desenho. */}
        <div
          className="flex w-7 shrink-0 flex-col justify-between py-px text-right text-2xs tabular-nums text-tx-3"
          aria-hidden
        >
          {marcas.map((m) => (
            <span key={m}>{m}</span>
          ))}
        </div>

        <div className="relative min-w-0 flex-1">
          {/* As linhas de grade são divs, não SVG: assim ficam com 1px de
              espessura de verdade em qualquer largura de cartão. */}
          <div className="pointer-events-none absolute inset-0 flex flex-col justify-between" aria-hidden>
            {marcas.map((m) => (
              <span key={m} className="h-px w-full bg-line" />
            ))}
          </div>

          <svg
            viewBox={`0 0 ${L} ${A}`}
            preserveAspectRatio="none"
            className="relative h-[200px] w-full overflow-visible"
            role="img"
            aria-label={`Entrada de leads: ${somar(valores)} no período, pico de ${maximo}`}
          >
            <defs>
              <linearGradient id={`g${id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--pri))" stopOpacity="0.38" />
                <stop offset="100%" stopColor="hsl(var(--pri))" stopOpacity="0.02" />
              </linearGradient>
            </defs>

            <path d={area} fill={`url(#g${id})`} />
            <path
              d={linha}
              fill="none"
              stroke="hsl(var(--pri))"
              // `non-scaling-stroke` mede a espessura em pixels de tela, não em
              // unidades do viewBox. Sem ele, o esticamento desigual dos eixos
              // deixa a linha grossa na horizontal e fina na vertical — o mesmo
              // traço com duas espessuras.
              vectorEffect="non-scaling-stroke"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </div>

      <div className="ml-9 mt-1.5 flex justify-between text-2xs tabular-nums text-tx-3">
        {rotulos.map((r) => (
          <span key={r.chave}>{r.texto}</span>
        ))}
      </div>
    </div>
  );
}

function somar(v: number[]): number {
  return v.reduce((s, n) => s + n, 0);
}

/**
 * Um topo redondo acima do pico.
 *
 * Eixo terminando em 11 ou 17 obriga a pessoa a fazer conta para ler a altura
 * de um ponto. Terminando em 12 ou 20, ela lê de relance.
 */
export function escalaDoTopo(maximo: number): number {
  if (maximo <= 4) return maximo + 1;
  const passo = maximo <= 10 ? 2 : maximo <= 50 ? 5 : maximo <= 200 ? 20 : 100;
  return Math.ceil((maximo + passo / 2) / passo) * passo;
}

/**
 * Curva suave por Catmull-Rom convertida em Bézier.
 *
 * Uma poligonal reta entre pontos diários fica serrilhada e pesada de ler; a
 * curva é como o painel de referência desenha, e é o que a pessoa reconhece.
 *
 * A conversão é fechada em cima dos vizinhos imediatos, então a curva PASSA por
 * todos os pontos — uma spline que apenas se aproxima deles mostraria um pico
 * de 11 onde o dia teve 12.
 */
export function caminhoSuave(p: readonly (readonly [number, number])[]): string {
  if (p.length === 0) return '';
  const primeiro = p[0];
  if (primeiro === undefined) return '';
  if (p.length === 1) return `M ${primeiro[0]} ${primeiro[1]}`;

  let d = `M ${primeiro[0]} ${primeiro[1]}`;
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[i === 0 ? 0 : i - 1];
    const p1 = p[i];
    const p2 = p[i + 1];
    const p3 = p[i + 2 < p.length ? i + 2 : i + 1];
    // Só num array com buraco (não acontece): os segmentos em volta do buraco
    // somem e a curva emenda no ponto seguinte, em vez de estourar TypeError.
    if (p0 === undefined || p1 === undefined || p2 === undefined || p3 === undefined) continue;

    // 1/6 é o fator canônico da conversão Catmull-Rom → Bézier cúbica.
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;

    d += ` C ${arred(c1x)} ${arred(c1y)}, ${arred(c2x)} ${arred(c2y)}, ${arred(p2[0])} ${arred(p2[1])}`;
  }
  return d;
}

const arred = (n: number) => Math.round(n * 100) / 100;

/**
 * Umas seis datas no eixo, espalhadas.
 *
 * Trinta rótulos de "12/07" não cabem em cartão nenhum: eles se sobrepõem e
 * viram uma tarja cinza. Seis dão a referência sem disputar espaço com a linha.
 */
export function rotulosDoEixo(pontos: PontoDaSerie[]): { chave: string; texto: string }[] {
  const quantos = Math.min(6, pontos.length);
  const passo = (pontos.length - 1) / Math.max(1, quantos - 1);

  const saida: { chave: string; texto: string }[] = [];
  for (let i = 0; i < quantos; i++) {
    const p = pontos[Math.round(i * passo)];
    if (!p) continue;
    const [, m, d] = p.dia.split('-');
    saida.push({ chave: p.dia, texto: `${d}/${m}` });
  }
  return saida;
}
