import { formatarGasto } from '@contracts';
import { cn } from '@/lib/utils';

/**
 * A FAIXA DO CUSTO POR LEAD.
 *
 * Vivia dentro de `pages/Inteligencia.tsx` e saiu para cá quando a leitura por
 * ângulo (a 134) passou a precisar dela. Componente compartilhado, e não copiado:
 * é ele que carrega a mensagem inteira da tela.
 *
 * Um número sozinho ("R$ 8,64") convida à decisão; o mesmo número com a faixa
 * desenhada ao redor ("de R$ 4,05 a — não sabemos") desconvida na mesma olhada,
 * sem precisar de um parágrafo de aviso que ninguém lê.
 *
 * Desenha quatro coisas na mesma régua: o ALVO (onde a casa quer chegar), o
 * TETO (o máximo que ela aceita pagar), o custo medido, e a faixa onde esse
 * custo realmente pode estar. A largura da barra clara É a incerteza.
 *
 * As duas linhas existem porque o julgamento usa as duas, e usa as PONTAS da
 * faixa contra elas: vermelho quando nem o melhor caso cabe no teto, verde
 * quando o palpite bate o alvo e nem o pior caso estoura o teto. Desenhar só
 * uma linha esconderia metade do critério.
 *
 * Quando a faixa passa do fim da régua — porque o teto da faixa não existe, ou
 * porque existe e não cabe — a barra sai pela direita com um degradê, em vez de
 * terminar num ponto. Barra que termina afirma um limite; o degradê diz que
 * continua, e a legenda numérica embaixo diz qual dos dois casos é.
 *
 * A escala é fixa em 2,5× o TETO. Escala automática pelo maior valor faria a
 * mesma campanha mudar de aparência quando OUTRA campanha muda — e a pessoa
 * lendo juraria que algo aconteceu com esta.
 */
export function Faixa({
  cpl,
  piso,
  teto,
  alvo,
  limite,
  moeda,
}: {
  cpl: number | null;
  piso: number | null;
  teto: number | null;
  alvo: number | null;
  limite: number | null;
  moeda: string;
}) {
  if (cpl == null || limite == null) return null;

  const escala = limite * 2.5;
  const pct = (v: number) => Math.max(0, Math.min(100, (v / escala) * 100));
  const esq = pct(piso ?? cpl);
  const vaza = teto == null || teto > escala;
  const dir = vaza ? 100 : pct(teto);

  return (
    <div className="mt-2">
      <div className="relative h-2 rounded-full bg-card-2">
        {/* a faixa provável */}
        <div
          className={cn(
            'absolute inset-y-0 rounded-full',
            vaza ? 'bg-gradient-to-r from-tx-3/45 to-transparent' : 'bg-tx-3/35',
          )}
          style={{ left: `${esq}%`, width: `${Math.max(1.5, dir - esq)}%` }}
        />
        {/* o custo medido */}
        <div
          className="absolute inset-y-[-3px] w-[2px] rounded-full bg-tx"
          style={{ left: `${pct(cpl)}%` }}
        />
        {/* o alvo — a linha boa */}
        {alvo != null ? (
          <div
            className="absolute inset-y-[-5px] w-[2px] rounded-full bg-ok"
            style={{ left: `${pct(alvo)}%` }}
          />
        ) : null}
        {/* o teto — a linha que não se cruza */}
        <div
          className="absolute inset-y-[-5px] w-[2px] rounded-full bg-dng"
          style={{ left: `${pct(limite)}%` }}
        />
      </div>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-2 text-2xs text-tx-3">
        <span className="font-semibold text-tx">{formatarGasto(cpl, moeda)}</span>
        <span>
          {teto == null
            ? `· acima de ${formatarGasto(piso, moeda)}, sem teto estimável`
            : `· ${formatarGasto(piso, moeda)} a ${formatarGasto(teto, moeda)}`}
        </span>
        <span className="ml-auto flex gap-2">
          {alvo != null ? <span className="text-ok">alvo {formatarGasto(alvo, moeda)}</span> : null}
          <span className="text-dng">teto {formatarGasto(limite, moeda)}</span>
        </span>
      </div>
    </div>
  );
}
