import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSearchParams } from 'react-router-dom';
import { Search, Plus, Loader2, ImageOff, AlertCircle, BedDouble, BedSingle, Bath, Car, Ruler } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useProperties, useCovers, type Property } from '@/hooks/useProperties';
import { PropertyFormDialog } from '@/components/properties/PropertyFormDialog';
import { PROPERTY_TYPE_LABEL, PROPERTY_STATUS_LABEL } from '@contracts';
import { cn, valoresDoImovel } from '@/lib/utils';

export default function Properties() {
  const { profile } = useAuth();
  const orgId = profile?.organization_id;
  const navigate = useNavigate();

  const [params, setParams] = useSearchParams();
  const [buscaBruta, setBuscaBruta] = useState(params.get('q') ?? '');
  const [busca, setBusca] = useState(buscaBruta);
  const [apenasPublicados, setApenasPublicados] = useState(false);
  const [pagina, setPagina] = useState(0);
  const [editando, setEditando] = useState<Property | null | undefined>(undefined);

  useEffect(() => {
    const t = setTimeout(() => {
      setBusca(buscaBruta);
      setPagina(0);
    }, 300);
    return () => clearTimeout(t);
  }, [buscaBruta]);

  /*
   * `?novo=1` abre o cadastro já ao chegar.
   *
   * É como o atalho do painel e o botão do topo chamam esta tela, em vez de
   * cada um montar o próprio diálogo. Formulário de imóvel tem abas, upload de
   * foto e validação; duas cópias divergem na primeira correção feita só numa
   * delas, e a pessoa passa a ter dois cadastros diferentes para a mesma coisa.
   *
   * O parâmetro é REMOVIDO logo em seguida: sem isso, fechar o diálogo e dar
   * F5 o abriria de novo, e voltar pelo histórico do navegador também.
   */
  useEffect(() => {
    if (params.get('novo') === null) return;
    setEditando(null);
    const p = new URLSearchParams(params);
    p.delete('novo');
    setParams(p, { replace: true });
  }, [params, setParams]);

  const lista = useProperties({ orgId, busca, apenasPublicados, pagina });
  const ids = useMemo(() => lista.data?.itens.map((p) => p.id) ?? [], [lista.data]);
  const { data: capas } = useCovers(ids);

  const total = lista.data?.total ?? 0;
  const porPagina = lista.data?.porPagina ?? 24;
  const paginas = Math.max(1, Math.ceil(total / porPagina));

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold">Imóveis</h1>
          <p className="mt-0.5 text-base text-tx-2">
            {lista.isFetching ? 'Carregando…' : `${total} ${total === 1 ? 'imóvel' : 'imóveis'}`}
          </p>
        </div>

        <label className="ml-auto flex min-w-[220px] items-center gap-2 rounded-full border border-line-2 bg-card px-3.5 py-2">
          <Search className="h-3.5 w-3.5 shrink-0 text-tx-3" />
          <input
            value={buscaBruta}
            onChange={(e) => {
              setBuscaBruta(e.target.value);
              const p = new URLSearchParams(params);
              if (e.target.value) p.set('q', e.target.value);
              else p.delete('q');
              setParams(p, { replace: true });
            }}
            placeholder="Título, bairro, cidade ou código"
            className="w-full bg-transparent text-base outline-none placeholder:text-tx-3"
          />
        </label>

        <button
          onClick={() => {
            setApenasPublicados((v) => !v);
            setPagina(0);
          }}
          className={cn(
            'rounded-full border px-3.5 py-2 text-base font-semibold transition-colors',
            apenasPublicados
              ? 'border-pri bg-pri-soft text-pri'
              : 'border-line-2 bg-card text-tx-2 hover:text-tx',
          )}
        >
          Só publicados
        </button>

        <button
          onClick={() => setEditando(null)}
          className="inline-flex items-center gap-1.5 rounded-full bg-pri px-4 py-2 text-base font-semibold text-pri-fg shadow-[0_6px_16px_-6px_var(--brilho)] hover:bg-pri-deep"
        >
          <Plus className="h-3.5 w-3.5" />
          Novo imóvel
        </button>
      </header>

      {lista.isError && (
        <div className="flex items-start gap-3 rounded-lg bg-dng-soft p-4 text-md text-dng">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <strong className="block font-bold">Não consegui carregar os imóveis.</strong>
            Se a migration 002 ainda não foi aplicada no Supabase, é isso.
          </div>
        </div>
      )}

      {!lista.data && lista.isLoading && (
        <div className="grid place-items-center py-24">
          <Loader2 className="h-5 w-5 animate-spin text-pri" />
        </div>
      )}

      {lista.data && lista.data.itens.length === 0 && (
        <div className="rounded-lg border border-dashed border-line-2 py-16 text-center">
          <p className="text-md font-semibold">Nenhum imóvel ainda</p>
          <p className="mx-auto mt-1 max-w-[38ch] text-base text-tx-3">
            Cada landing page é de um imóvel. Cadastre o primeiro para destravar o gerador de páginas.
          </p>
        </div>
      )}

      {lista.data && lista.data.itens.length > 0 && (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {lista.data.itens.map((p) => (
            <li key={p.id}>
              <button
                onClick={() => navigate(`/imoveis/${p.id}`)}
                className="group flex h-full w-full flex-col overflow-hidden rounded-lg border border-transparent bg-card text-left shadow-card transition-colors hover:border-pri-light"
              >
                {/*
                  A foto fica POR CIMA da caixa (absolute), e não dentro do fluxo.
                  No fluxo, uma foto em pé é mais alta do que a caixa 4:3, e o CSS
                  deixa a caixa crescer até caber o conteúdo: o cartão esticava e
                  a lista ficava desalinhada. Assim toda capa sai do mesmo tamanho.
                */}
                <div className="relative aspect-[4/3] w-full overflow-hidden bg-card-2">
                  {capas?.[p.id] ? (
                    <img src={capas[p.id]} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
                  ) : (
                    <div className="absolute inset-0 grid place-items-center text-tx-3">
                      <ImageOff className="h-6 w-6" />
                    </div>
                  )}

                  <div className="absolute left-2 top-2 flex gap-1.5">
                    {!p.is_published && (
                      <span className="rounded bg-tx/85 px-1.5 py-0.5 text-2xs font-bold uppercase text-sheet">
                        Rascunho
                      </span>
                    )}
                    {p.status !== 'disponivel' && (
                      <span className="rounded bg-warn px-1.5 py-0.5 text-2xs font-bold uppercase text-white">
                        {PROPERTY_STATUS_LABEL[p.status]}
                      </span>
                    )}
                    {p.is_featured && (
                      <span className="rounded bg-pri px-1.5 py-0.5 text-2xs font-bold uppercase text-pri-fg">
                        Destaque
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex flex-1 flex-col gap-2 p-3.5">
                  <div>
                    <p className="text-xs font-semibold uppercase text-tx-3">
                      {PROPERTY_TYPE_LABEL[p.property_type]}
                      {p.neighborhood && ` · ${p.neighborhood}`}
                    </p>
                    <h2 className="mt-0.5 line-clamp-2 text-md font-bold leading-snug">
                      {p.title}
                    </h2>
                  </div>

                  {valoresDoImovel(p).length > 0 && (
                    <p className="text-lg font-extrabold text-pri">
                      {valoresDoImovel(p).join(' · ')}
                    </p>
                  )}

                  <div className="mt-auto flex flex-wrap items-center gap-3 border-t border-line pt-2.5 text-sm text-tx-2">
                    {/* Quartos e suítes lado a lado, com os ícones do site: no cadastro,
                        os quartos não contam as suítes (2 quartos e 1 suíte são 3).
                        No empreendimento os números são das plantas; os do imóvel
                        podem ser de quando ele era imóvel único, e ficam de fora. */}
                    {!p.has_units && (
                      <>
                        {!!p.bedrooms && <Ficha icone={BedSingle} valor={`${p.bedrooms}`} rotulo={p.bedrooms === 1 ? 'quarto' : 'quartos'} />}
                        {!!p.suites && <Ficha icone={BedDouble} valor={`${p.suites}`} rotulo={p.suites === 1 ? 'suíte' : 'suítes'} />}
                        {p.bathrooms != null && <Ficha icone={Bath} valor={`${p.bathrooms}`} rotulo="banh" />}
                        {p.parking_spots != null && <Ficha icone={Car} valor={`${p.parking_spots}`} rotulo={p.parking_spots === 1 ? 'vaga' : 'vagas'} />}
                        {p.area_total != null && <Ficha icone={Ruler} valor={`${p.area_total}`} rotulo="m²" />}
                      </>
                    )}
                    <span className="ml-auto font-mono text-xs text-tx-3">{p.public_code}</span>
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {paginas > 1 && (
        <nav className="flex items-center justify-center gap-2 pt-2">
          <button
            disabled={pagina === 0}
            onClick={() => setPagina((p) => p - 1)}
            className="rounded-full border border-line-2 bg-card px-4 py-2 text-base font-semibold text-tx-2 disabled:opacity-40"
          >
            Anterior
          </button>
          <span className="text-base tabular-nums text-tx-3">
            {pagina + 1} de {paginas}
          </span>
          <button
            disabled={pagina >= paginas - 1}
            onClick={() => setPagina((p) => p + 1)}
            className="rounded-full border border-line-2 bg-card px-4 py-2 text-base font-semibold text-tx-2 disabled:opacity-40"
          >
            Próxima
          </button>
        </nav>
      )}

      {editando !== undefined && (
        <PropertyFormDialog orgId={orgId} imovel={editando} onFechar={() => setEditando(undefined)} />
      )}
    </div>
  );
}

function Ficha({ icone: Icone, valor, rotulo }: { icone: typeof BedDouble; valor: string; rotulo: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <Icone className="h-3.5 w-3.5 text-tx-3" />
      <b className="font-semibold">{valor}</b>
      <span className="text-tx-3">{rotulo}</span>
    </span>
  );
}
