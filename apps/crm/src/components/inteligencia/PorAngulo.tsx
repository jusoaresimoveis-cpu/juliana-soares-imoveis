import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Loader2, Sparkles } from 'lucide-react';
import {
  ANGULOS_DE_CRIATIVO,
  ANGULO_DE_CRIATIVO_META,
  anguloSugeridoPeloNome,
  formatarGasto,
  type AnguloDeCriativo,
} from '@contracts';
import { useInteligenciaPorAngulo, useMarcarAngulo } from '@/hooks/useInteligencia';
import {
  SEM_ANGULO,
  VEREDITO_META,
  type AnguloInteligencia,
  type AnuncioInteligencia,
} from '@/inteligencia';
import { Faixa } from '@/components/inteligencia/Faixa';
import { cn } from '@/lib/utils';

/**
 * QUAL ARGUMENTO TRAZ GENTE.
 *
 * O método pede cinco criativos com cinco argumentos diferentes — dor, desejo,
 * comparação, objeção, curiosidade — e esta seção é onde eles se comparam.
 *
 * Por que a comparação é por ÂNGULO e não por anúncio: medido em 23/09, a casa
 * tinha 145 leads espalhados por 51 anúncios. Menos de três cada, e a faixa de
 * confiança precisa de dez para dizer qualquer coisa. Cinco ângulos juntam
 * volume; cinquenta e um anúncios nunca vão juntar.
 *
 * O ângulo é MARCADO por gente. A tela sugere quando o nome do anúncio começa
 * com a palavra (a convenção que o Guto adotou), e a sugestão é um botão — não
 * um valor já gravado. Nome de anúncio muda no meio do mês; uma chave que muda
 * sozinha parte o histórico em dois sem ninguém perceber.
 */
export function PorAngulo({ de, ate, moeda }: { de: string; ate: string; moeda: string }) {
  const { data, isLoading } = useInteligenciaPorAngulo(de, ate);
  const marcar = useMarcarAngulo();
  const [listaAberta, setListaAberta] = useState(false);

  const porChave = useMemo(() => {
    const mapa = new Map<string, AnguloInteligencia>();
    for (const a of data?.angulos ?? []) mapa.set(a.angulo, a);
    return mapa;
  }, [data]);

  if (isLoading) {
    return (
      <p className="flex items-center gap-2 py-6 text-base text-tx-3">
        <Loader2 className="h-4 w-4 animate-spin" />
        Juntando gasto e lead por ângulo…
      </p>
    );
  }

  if (!data || data.erro) return null;

  const semAngulo = porChave.get(SEM_ANGULO);
  const marcados = ANGULOS_DE_CRIATIVO.flatMap((chave) => {
    const linha = porChave.get(chave);
    return linha ? [{ chave, linha }] : [];
  });
  const anuncios = data.anuncios ?? [];

  return (
    <section className="rounded-md bg-card p-5 shadow-card">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">Por ângulo do criativo</h2>
          <p className="mt-0.5 text-sm text-tx-2">
            Qual <b>argumento</b> traz gente — não qual arte. Cinco anúncios com a mesma promessa em
            cores diferentes são um anúncio só.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setListaAberta((v) => !v)}
          className="flex items-center gap-1.5 rounded-full border border-line-2 px-3.5 py-1.5 text-sm font-semibold text-tx-2 hover:border-pri hover:text-pri"
        >
          {listaAberta ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          Marcar anúncios
          {semAngulo ? (
            <span className="rounded-full bg-card-2 px-1.5 py-0.5 text-2xs font-bold text-tx-3">
              {semAngulo.anuncios} sem ângulo
            </span>
          ) : null}
        </button>
      </header>

      {marcados.length === 0 ? (
        <p className="mt-4 rounded-xl bg-card-2 p-3.5 text-base text-tx-2">
          Nenhum anúncio tem ângulo marcado ainda. Abra <b>Marcar anúncios</b> e diga qual argumento
          cada criativo usa — a comparação aparece aqui assim que houver dois.
        </p>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {marcados.map(({ chave, linha }) => (
            <CartaoDeAngulo
              key={chave}
              chave={chave}
              linha={linha}
              alvo={data.meta_cpl}
              teto={data.teto_cpl}
              moeda={moeda}
            />
          ))}
        </div>
      )}

      {semAngulo && semAngulo.leads > 0 ? (
        <div className="mt-3 rounded-xl border border-line-2 p-3.5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-base font-semibold text-tx-2">
              Ainda sem ângulo — {semAngulo.anuncios} anúncio{semAngulo.anuncios === 1 ? '' : 's'}
            </span>
            <span className="text-sm text-tx-3">
              {formatarGasto(semAngulo.gasto, moeda)} · {semAngulo.leads} lead
              {semAngulo.leads === 1 ? '' : 's'}
            </span>
          </div>
          <Faixa
            cpl={semAngulo.cpl}
            piso={semAngulo.cpl_piso}
            teto={semAngulo.cpl_teto}
            alvo={data.meta_cpl}
            limite={data.teto_cpl}
            moeda={moeda}
          />
        </div>
      ) : null}

      {listaAberta ? (
        <ListaDeAnuncios
          anuncios={anuncios}
          moeda={moeda}
          ocupado={marcar.isPending}
          onMarcar={(anuncio, angulo) => marcar.mutate({ anuncio, angulo })}
        />
      ) : null}
    </section>
  );
}

function CartaoDeAngulo({
  chave,
  linha,
  alvo,
  teto,
  moeda,
}: {
  chave: AnguloDeCriativo;
  linha: AnguloInteligencia;
  alvo: number | null;
  teto: number | null;
  moeda: string;
}) {
  const meta = ANGULO_DE_CRIATIVO_META[chave];
  const v = VEREDITO_META[linha.veredito];

  return (
    <article className="rounded-xl border border-line-2 p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-base font-bold">{meta.label}</h3>
          <p className="mt-0.5 text-2xs text-tx-3">{meta.nota}</p>
        </div>
        <span
          className={cn(
            'shrink-0 rounded-full px-2 py-0.5 text-2xs font-bold',
            v.cor === 'ok' && 'bg-ok-soft text-ok',
            v.cor === 'dng' && 'bg-dng-soft text-dng',
            v.cor === 'warn' && 'bg-warn-soft text-warn',
            v.cor === 'neutro' && 'bg-card-2 text-tx-3',
          )}
        >
          {v.rotulo}
        </span>
      </div>

      <div className="mt-2.5 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm text-tx-2">
        <span className="text-base font-bold text-tx">{formatarGasto(linha.gasto, moeda)}</span>
        <span>
          {linha.leads} lead{linha.leads === 1 ? '' : 's'}
        </span>
        <span className="text-tx-3">
          {linha.anuncios} anúncio{linha.anuncios === 1 ? '' : 's'}
          {linha.ativos > 0 ? ` · ${linha.ativos} no ar` : ''}
        </span>
      </div>

      <Faixa
        cpl={linha.cpl}
        piso={linha.cpl_piso}
        teto={linha.cpl_teto}
        alvo={alvo}
        limite={teto}
        moeda={moeda}
      />

      {linha.faltam > 0 ? (
        <p className="mt-1.5 text-2xs text-tx-3">
          Faltam {linha.faltam} lead{linha.faltam === 1 ? '' : 's'} para a faixa valer.
        </p>
      ) : null}
    </article>
  );
}

/**
 * A lista onde se marca.
 *
 * Ordenada por GASTO, como a tabela de campanhas e pelo mesmo motivo: a
 * primeira linha é lida como recomendação, e gasto é um fato sobre reais — não
 * sobre uma amostra de três leads que teve sorte.
 */
function ListaDeAnuncios({
  anuncios,
  moeda,
  ocupado,
  onMarcar,
}: {
  anuncios: AnuncioInteligencia[];
  moeda: string;
  ocupado: boolean;
  onMarcar: (anuncio: string, angulo: string | null) => void;
}) {
  if (anuncios.length === 0) {
    return <p className="mt-4 text-base text-tx-3">Nenhum anúncio com gasto ou lead no período.</p>;
  }

  return (
    <div className="mt-4 flex flex-col gap-1.5 border-t border-line pt-4">
      {anuncios.map((a) => {
        const sugerido = a.angulo ? null : anguloSugeridoPeloNome(a.nome);
        const cpl = a.leads > 0 ? a.gasto / a.leads : null;

        return (
          <div
            key={a.ad_id}
            className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-line-2 p-2.5"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-semibold">{a.nome ?? '(sem nome)'}</p>
              <p className="truncate text-2xs text-tx-3">
                {a.campanha ?? 'campanha não sincronizada'}
                {a.estado && a.estado !== 'ACTIVE' ? ' · pausado' : ''}
              </p>
            </div>

            <div className="flex shrink-0 items-baseline gap-2.5 text-sm text-tx-2 tabular-nums">
              <span className="font-semibold text-tx">{formatarGasto(a.gasto, moeda)}</span>
              <span>{a.leads} lead{a.leads === 1 ? '' : 's'}</span>
              <span className="text-tx-3">{cpl != null ? formatarGasto(cpl, moeda) : '—'}</span>
            </div>

            {sugerido ? (
              <button
                type="button"
                disabled={ocupado}
                onClick={() => onMarcar(a.ad_id, sugerido)}
                title="O nome do anúncio sugere este ângulo"
                className="flex shrink-0 items-center gap-1 rounded-full border border-pri/40 px-2.5 py-1 text-2xs font-bold text-pri hover:bg-pri-soft/40 disabled:opacity-50"
              >
                <Sparkles className="h-3 w-3" />
                {ANGULO_DE_CRIATIVO_META[sugerido].label}?
              </button>
            ) : null}

            <select
              value={a.angulo ?? ''}
              disabled={ocupado}
              onChange={(e) => onMarcar(a.ad_id, e.target.value || null)}
              className="shrink-0 rounded-xl border border-line-2 bg-card px-2.5 py-1.5 text-sm outline-none focus:border-pri disabled:opacity-50"
            >
              <option value="">Sem ângulo</option>
              {ANGULOS_DE_CRIATIVO.map((x) => (
                <option key={x} value={x}>
                  {ANGULO_DE_CRIATIVO_META[x].label}
                </option>
              ))}
            </select>
          </div>
        );
      })}
    </div>
  );
}
