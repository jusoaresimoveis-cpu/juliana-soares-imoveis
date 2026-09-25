import { Fragment } from 'react';
import { cn } from '@/lib/utils';

export interface EtapaDoFunil {
  key: string;
  label: string;
  total: number;
  ganho?: boolean;
}

/**
 * O funil, desenhado como funil.
 *
 * A versão anterior eram seis barras de progresso empilhadas. Barra comunica
 * "quanto de um total", e não era isso: a leitura que importa aqui é o
 * ESTREITAMENTO — quanto se perde de uma etapa para a próxima. Com barras, a
 * queda de 142 para 87 e a de 12 para 5 pareciam a mesma coisa; no funil, a
 * segunda é visivelmente um fio.
 *
 * Duas decisões de desenho:
 *
 * 1. Cada faixa termina na largura da faixa DE BAIXO, não na própria. É o que
 *    faz o contorno ficar contínuo em vez de virar uma escada de blocos soltos
 *    — e é a inclinação de cada trecho que mostra onde o funil aperta.
 * 2. O nome fica FORA, alternando os lados; dentro vai só o número. Nome e
 *    número dentro de uma faixa que estreita brigam por um espaço que some, e
 *    o número, que é o dado, é sempre o que perde.
 */
export function FunilVisual({ etapas }: { etapas: EtapaDoFunil[] }) {
  const topo = Math.max(...etapas.map((e) => e.total), 1);

  /*
   * A largura sai da RAIZ da proporção, não da proporção.
   *
   * Com escala linear e um funil real — 142 no topo, 5 no fim — as quatro
   * últimas faixas batem todas no piso mínimo e o desenho PARA DE ESTREITAR
   * justamente onde a perda é maior. Vira um retângulo com um chapéu.
   *
   * A raiz preserva a ordem e a distância relativa, e mantém o estreitamento
   * visível até embaixo. O custo é que a largura deixa de ser proporcional ao
   * valor — por isso o número exato fica DENTRO de cada faixa e a perda para a
   * etapa seguinte vem escrita ao lado. Quem lê o valor lê o valor; a forma
   * conta a história.
   */
  const largura = (v: number) => Math.round(22 + 78 * Math.sqrt(Math.max(v, 0) / topo));

  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-x-2.5">
      {etapas.map((etapa, i) => {
        const proxima = etapas[i + 1];
        const w = largura(etapa.total);
        // A última fecha num bico, para o funil ter fim em vez de ser cortado.
        const wBaixo = proxima ? largura(proxima.total) : Math.round(w * 0.62);

        // Quanto cada lado do trapézio recolhe, em % da largura desta faixa.
        const recuo = ((w - wBaixo) / 2 / w) * 100;

        const naEsquerda = i % 2 === 0;

        /*
         * A faixa é pintada com a cor QUE SE LÊ sobre o acento, não com branco
         * literal. No tema escuro o acento é claro e o `--pri-fg` é escuro:
         * faixas brancas sumiriam dentro do próprio cartão.
         *
         * A opacidade cai de cima para baixo — o topo é o volume, o fundo é o
         * que sobrou.
         */
        const opacidade = 0.96 - i * 0.055;

        const perda =
          proxima && etapa.total > 0
            ? Math.round(((etapa.total - proxima.total) / etapa.total) * 100)
            : null;

        return (
          <Fragment key={etapa.key}>
            <Rotulo
              lado="esquerda"
              mostrar={naEsquerda}
              nome={etapa.label}
              perda={perda}
            />

            <div className="w-[150px] sm:w-[176px]">
              <div
                className="relative mx-auto flex h-[38px] items-center justify-center"
                style={{
                  width: `${w}%`,
                  clipPath: `polygon(0 0, 100% 0, ${100 - recuo}% 100%, ${recuo}% 100%)`,
                  backgroundColor: etapa.ganho
                    ? 'hsl(var(--ok))'
                    : `hsl(var(--pri-fg) / ${opacidade})`,
                }}
              >
                <b
                  className={cn(
                    'text-md font-extrabold tabular-nums',
                    // Na faixa de ganho o fundo é a cor de sucesso, não o acento.
                    etapa.ganho ? 'text-white' : 'text-pri-deep',
                  )}
                >
                  {etapa.total}
                </b>
              </div>
            </div>

            <Rotulo lado="direita" mostrar={!naEsquerda} nome={etapa.label} perda={perda} />
          </Fragment>
        );
      })}
    </div>
  );
}

function Rotulo({
  lado,
  mostrar,
  nome,
  perda,
}: {
  lado: 'esquerda' | 'direita';
  mostrar: boolean;
  nome: string;
  perda: number | null;
}) {
  // A célula existe mesmo vazia: é ela que mantém o funil no centro da coluna
  // quando o rótulo está do outro lado.
  if (!mostrar) return <span aria-hidden="true" />;

  return (
    <span
      className={cn(
        'flex min-w-0 flex-col leading-tight',
        lado === 'esquerda' ? 'items-end text-right' : 'items-start text-left',
      )}
    >
      <span className="truncate text-xs font-semibold text-pri-fg">{nome}</span>
      {/* A perda para a etapa seguinte é o que o funil está tentando contar.
          Escrita, ela para de depender de o olho medir a inclinação. */}
      {perda !== null && (
        <span className="text-2xs font-medium text-pri-fg/60">−{perda}%</span>
      )}
    </span>
  );
}
