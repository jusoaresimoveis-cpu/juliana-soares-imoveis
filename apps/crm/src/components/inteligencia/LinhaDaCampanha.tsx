import { ExternalLink } from 'lucide-react';
import { formatarGasto, entregaDoStatus, META_ENTREGA_META } from '@contracts';
import {
  linkDoGerenciador,
  motivoDo,
  rotuloDoDestino,
  rotuloDoObjetivo,
  VEREDITO_META,
  type CampanhaInteligencia,
  type Inteligencia as Dados,
} from '@/inteligencia';
import { Faixa } from '@/components/inteligencia/Faixa';
import { cn } from '@/lib/utils';

const CHIP: Record<string, string> = {
  ok: 'bg-ok-soft text-ok',
  dng: 'bg-dng-soft text-dng',
  warn: 'bg-warn-soft text-warn',
  neutro: 'bg-card-2 text-tx-3',
};

/** O funil depois do lead — o pedaço que a Meta nunca vai saber. */
function Funil({ c }: { c: CampanhaInteligencia }) {
  const passos: Array<[string, number]> = [
    ['leads', c.leads],
    ['atendidos', c.atendidos],
    ['visitas', c.visitas_agendadas],
    ['propostas', c.propostas],
    ['vendas', c.vendas],
  ];
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs text-tx-3">
      {passos.map(([rotulo, n], i) => (
        <span key={rotulo} className="flex items-baseline gap-1">
          {i > 0 ? <span className="text-tx-3/50">›</span> : null}
          <span className={cn('font-semibold', n > 0 ? 'text-tx' : 'text-tx-3')}>{n}</span>
          <span>{rotulo}</span>
        </span>
      ))}
    </div>
  );
}

export function Linha({ c, d, moeda }: { c: CampanhaInteligencia; d: Dados; moeda: string }) {
  const v = VEREDITO_META[c.veredito];
  const entrega = entregaDoStatus(c.status);
  const destino = rotuloDoDestino(c.destino);

  return (
    <div className="border-t border-line px-4 py-4 first:border-t-0">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        <span
          className={cn('shrink-0 rounded-full px-2.5 py-1 text-2xs font-bold uppercase', CHIP[v.cor])}
        >
          {v.rotulo}
        </span>

        <div className="min-w-0 flex-1 basis-[240px]">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-md font-semibold">{c.nome ?? `#${c.id}`}</span>
            <span className="text-2xs text-tx-3">
              {META_ENTREGA_META[entrega].rotulo}
              {destino ? ` · ${destino}` : ''}
              {c.objetivo ? ` · ${rotuloDoObjetivo(c.objetivo)}` : ''}
            </span>
          </div>
          <div className="mt-0.5 text-2xs text-tx-3">
            {c.conta_nome ?? c.conta}
            {c.imovel ? ` · ${c.imovel}` : ''}
          </div>
        </div>

        <div className="flex shrink-0 items-baseline gap-4">
          <div className="text-right">
            <div className="text-2xs uppercase text-tx-3">Gasto</div>
            <div className="text-md font-bold">{formatarGasto(c.gasto, moeda)}</div>
          </div>
          <div className="text-right">
            <div className="text-2xs uppercase text-tx-3">Orçamento</div>
            <div className="text-md font-semibold">
              {c.orcamento == null ? (
                <span className="text-tx-3">—</span>
              ) : (
                <>
                  {formatarGasto(c.orcamento, moeda)}
                  <span className="text-2xs font-normal text-tx-3">
                    {c.orcamento_tipo === 'diario' ? '/dia' : ' total'}
                  </span>
                </>
              )}
            </div>
            {c.orcamento_nivel === 'conjuntos' ? (
              <div className="text-2xs text-tx-3">somando conjuntos</div>
            ) : null}
          </div>
        </div>

        <a
          href={linkDoGerenciador(c.conta, c.id)}
          target="_blank"
          rel="noreferrer"
          className="flex shrink-0 items-center gap-1 rounded-full border border-line-2 px-2.5 py-1 text-2xs font-medium text-tx-2 hover:text-tx"
        >
          Ver no Meta
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>

      <p className="mt-2 max-w-[80ch] text-sm text-tx-2">{motivoDo(c, d.meta_cpl, d.teto_cpl, moeda)}</p>

      <Faixa
        cpl={c.cpl}
        piso={c.cpl_piso}
        teto={c.cpl_teto}
        alvo={d.meta_cpl}
        limite={d.teto_cpl}
        moeda={moeda}
      />

      <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1">
        <Funil c={c} />
        <div className="flex flex-wrap items-baseline gap-x-3 text-2xs text-tx-3">
          {/*
            Os dois contadores lado a lado, e NUNCA somados.
            A Meta conta pelo clique, dentro da janela de atribuição dela; o CRM
            conta pela criação, depois de deduplicar por telefone. A diferença
            entre eles é diagnóstico, não erro.
          */}
          <span>
            Meta: <span className="font-semibold text-tx-2">{c.resultados_meta}</span>
          </span>
          {c.ctr != null ? (
            <span>
              CTR de link: <span className="font-semibold text-tx-2">{c.ctr.toFixed(2)}%</span>
            </span>
          ) : (
            <span className="text-tx-3">CTR de link: — (sem coleta)</span>
          )}
          {c.resposta_min != null ? (
            <span>
              1º contato: <span className="font-semibold text-tx-2">{c.resposta_min} min</span>
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
