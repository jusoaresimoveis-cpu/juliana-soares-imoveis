import { useEffect, useRef, useState, type FormEvent } from 'react';
import { X, Loader2 } from 'lucide-react';
import { aPartirDe, normalizarCaracteristicas, precoDeTabela, resumoDoEmpreendimento } from '@contracts';
import type { CaracteristicasDoImovel, PaymentMethod, PropertyType, RentalGuarantee } from '@contracts';
import { useDefinirProprietario, useSalvarImovel, type Property, type Proprietario } from '@/hooks/useProperties';
import { useUnidades } from '@/hooks/useUnidades';
import { telefoneLegivel } from '@/exportacao';
import { MediaManager } from './MediaManager';
import { SobreOImovel } from './SobreOImovel';
import { AbaDados } from './AbaDados';
import { AbaPagamento } from './AbaPagamento';
import { AbaProprietario } from './AbaProprietario';
import { campoParaCents, campoParaEntrega, centsParaCampo, montarDados } from './formularioDoImovel';
import { cn } from '@/lib/utils';

export type AbaDoImovel = 'dados' | 'sobre' | 'pagamento' | 'proprietario' | 'midia';

interface Props {
  orgId: string | undefined;
  // Aceita a linha inteira (vinda da ficha) ou nada (criação). A lista deixou
  // de abrir este formulário para editar — ela navega para a ficha.
  imovel: (Property & { description?: string | null }) | null;
  /** O dono já cadastrado, que a ficha carregou. */
  proprietario?: Proprietario | null;
  abaInicial?: AbaDoImovel;
  onFechar: () => void;
}

/**
 * Os valores iniciais, da linha do imóvel ou vazios (criação). Fica no .tsx: num
 * .ts cada `?.` e `??` contaria na complexidade, e a lista não tem o que separar.
 */
function estadoInicial(imovel: Props['imovel']) {
  return {
    title: imovel?.title ?? '',
    public_title: imovel?.public_title ?? '',
    property_type: imovel?.property_type ?? 'apartamento',
    // Regime: à venda, para alugar, ou os dois. Cada um tem o seu valor.
    for_sale: imovel?.for_sale ?? true,
    for_rent: imovel?.for_rent ?? false,
    status: imovel?.status ?? 'disponivel',
    preco: imovel?.price_cents ? String(Math.round(imovel.price_cents / 100)) : '',
    tabela: imovel?.original_price_cents ? String(Math.round(imovel.original_price_cents / 100)) : '',
    aluguel: imovel?.rent_cents ? String(Math.round(imovel.rent_cents / 100)) : '',
    condominio: imovel?.condo_fee_cents ? String(Math.round(imovel.condo_fee_cents / 100)) : '',
    iptu: imovel?.iptu_year_cents ? String(Math.round(imovel.iptu_year_cents / 100)) : '',
    bedrooms: imovel?.bedrooms?.toString() ?? '',
    suites: imovel?.suites?.toString() ?? '',
    bathrooms: imovel?.bathrooms?.toString() ?? '',
    parking_spots: imovel?.parking_spots?.toString() ?? '',
    area_built: imovel?.area_built?.toString() ?? '',
    area_total: imovel?.area_total?.toString() ?? '',
    neighborhood: imovel?.neighborhood ?? '',
    city: imovel?.city ?? '',
    state: imovel?.state ?? 'SC',
    // Ficava fixo em '' porque a projeção da LISTA não trazia `description`, e
    // era a lista que abria este formulário. O corretor via o campo vazio num
    // imóvel descrito e precisava redigitar tudo. Agora quem abre é a ficha,
    // que carrega a linha inteira.
    description: imovel?.description ?? '',
    is_published: imovel?.is_published ?? false,
    is_featured: imovel?.is_featured ?? false,

    // Empreendimento com várias unidades: preço e situação vêm delas.
    has_units: imovel?.has_units ?? false,
    construction_status: imovel?.construction_status ?? '',
    entrega: imovel?.delivery_at?.slice(0, 4) ?? '',
    developer: imovel?.developer ?? '',
    incorporation_registry: imovel?.incorporation_registry ?? '',
    incorporation_registry_office: imovel?.incorporation_registry_office ?? '',

    // Plano de pagamento. Guardado como TEXTO no formulário e convertido a
    // centavos só no envio, para o campo aceitar o que a pessoa digita sem
    // brigar com a máscara a cada tecla.
    entrada: centsParaCampo(imovel?.down_payment_cents),
    parcelas: imovel?.installments_count?.toString() ?? '',
    parcela: centsParaCampo(imovel?.installment_cents),
    reforcos: imovel?.reinforcement_count?.toString() ?? '',
    reforco: centsParaCampo(imovel?.reinforcement_cents),
    periodo: imovel?.reinforcement_period ?? 'semestral',
    chaves: centsParaCampo(imovel?.keys_cents),
    payment_notes: imovel?.payment_notes ?? '',
  };
}

/** O estado do formulário: um objeto só, com o tipo que `estadoInicial` produz. */
export type EstadoDoImovel = ReturnType<typeof estadoInicial>;
/** O `set` que todas as abas recebem: `set('preco')(valor)`. */
export type MudarCampo = (k: keyof EstadoDoImovel) => (v: string | boolean) => void;

export function PropertyFormDialog({ orgId, imovel, proprietario, abaInicial, onFechar }: Props) {
  const [aba, setAba] = useState<AbaDoImovel>(abaInicial ?? 'dados');
  const barraDeAbas = useRef<HTMLElement>(null);

  // No celular a barra rola: a aba ativa (inclusive a que abriu o formulário)
  // tem que aparecer, e não ficar escondida à direita.
  useEffect(() => {
    barraDeAbas.current?.querySelector('[data-ativa]')?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [aba]);
  const [id, setId] = useState<string | null>(imovel?.id ?? null);
  const salvar = useSalvarImovel(orgId);
  const definirDono = useDefinirProprietario();

  const [dono, setDono] = useState({
    nome: proprietario?.full_name ?? '',
    cidade: proprietario?.city ?? '',
    telefone: proprietario ? (telefoneLegivel(proprietario.phone_e164, null) ?? '') : '',
  });
  const setDonoCampo = (k: keyof typeof dono) => (v: string) => setDono((d) => ({ ...d, [k]: v }));

  const [f, setF] = useState(estadoInicial(imovel));

  // A aba "Sobre o imóvel": itens marcados e texto livre por categoria.
  const [sobre, setSobre] = useState<CaracteristicasDoImovel>(() => normalizarCaracteristicas(imovel?.features));

  const [formas, setFormas] = useState<PaymentMethod[]>(
    (imovel?.payment_methods as PaymentMethod[] | undefined) ?? [],
  );

  const set = (k: keyof typeof f) => (v: string | boolean) => setF((s) => ({ ...s, [k]: v }));

  const [garantias, setGarantias] = useState<RentalGuarantee[]>(
    (imovel?.rental_guarantees as RentalGuarantee[] | undefined) ?? [],
  );

  /*
   * O imóvel está sempre em pelo menos um regime (o banco recusa nenhum).
   * Desligar o último seria um clique que só dá erro ao salvar.
   */
  const alternarRegime = (k: 'for_sale' | 'for_rent') => (v: boolean) => {
    const outro = k === 'for_sale' ? f.for_rent : f.for_sale;
    if (!v && !outro) return;
    set(k)(v);
  };

  /*
   * Empreendimento é venda: o aluguel e o "de/por" são de imóvel único, e o
   * banco recusa os dois com unidades (`properties_unidades_ck`).
   */
  const alternarEmpreendimento = (v: boolean) =>
    setF((s) => ({ ...s, has_units: v, ...(v ? { for_sale: true, for_rent: false } : {}) }));

  // O "a partir de" calculado, para mostrar no lugar do preço. Aberto da ficha,
  // as unidades já estão carregadas.
  const { data: doEmpreendimento } = useUnidades(id, f.has_units);
  const resumo = doEmpreendimento ? resumoDoEmpreendimento(doEmpreendimento.unidades) : null;
  const aPartir = resumo ? aPartirDe(resumo) : null;

  /*
   * O "de R$ X por R$ Y" da venda com desconto. Preço de tabela que não fica
   * acima do de venda não é desconto: o banco recusaria, e aqui ele vira aviso
   * antes de salvar, e não um erro do Postgres.
   */
  const precoCents = campoParaCents(f.preco);
  const tabelaCents = f.for_sale && !f.has_units ? campoParaCents(f.tabela) : null;
  const deCents = precoDeTabela(precoCents, tabelaCents);
  const tabelaSemDesconto = tabelaCents !== null && deCents === null;
  const entrega = campoParaEntrega(f.entrega);
  const entregaInvalida = f.has_units && entrega === undefined;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!f.title.trim()) return;
    if (tabelaSemDesconto || entregaInvalida) {
      // O aviso está na aba de dados; salvar de outra aba precisa mostrá-lo.
      setAba('dados');
      return;
    }

    const dados = montarDados({ f, precoCents, tabelaCents, entrega, garantias, sobre, formas });

    const novoId = await salvar.mutateAsync({ id, dados });

    /*
     * O dono vai depois do imóvel, pela função do banco: é ela que acha o
     * cadastro pelo telefone. Chama quando há dono para gravar, ou um que
     * existia e foi apagado do formulário (aí o imóvel fica sem dono).
     */
    if (dono.nome.trim() || dono.telefone.trim() || proprietario) {
      try {
        await definirDono.mutateAsync({ imovel: novoId, ...dono });
      } catch {
        // O imóvel já está salvo. A frase do erro aparece e a aba do dono abre.
        setId(novoId);
        setAba('proprietario');
        return;
      }
    }

    if (!id) {
      // Recém-criado: fica aberto na aba de mídia, que é o passo seguinte
      // natural e o que trava o cadastro se o corretor fechar agora.
      setId(novoId);
      setAba('midia');
      return;
    }
    onFechar();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={imovel ? 'Editar imóvel' : 'Novo imóvel'}
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/45 p-4"
      onClick={(e) => e.target === e.currentTarget && onFechar()}
    >
      <form
        onSubmit={(e) => void onSubmit(e)}
        // `min-w-0`: no grid do fundo, o formulário cresceria até caber a barra
        // de abas inteira e passaria da tela do celular. Assim a barra rola.
        className="my-auto w-full min-w-0 max-w-[720px] rounded-[24px] bg-sheet p-6 shadow-sheet"
      >
        <header className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold">
              {imovel ? 'Editar imóvel' : 'Novo imóvel'}
            </h2>
            {imovel && (
              <p className="mt-0.5 font-mono text-sm text-tx-3">
                {imovel.public_code} · /{imovel.slug}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onFechar}
            aria-label="Fechar"
            className="grid h-8 w-8 place-items-center rounded-full text-tx-3 hover:bg-card-2 hover:text-tx"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        {/* Cinco abas não cabem lado a lado num celular: lá a barra corre para o
            lado, em vez de quebrar as palavras. */}
        <nav ref={barraDeAbas} className="mb-5 flex gap-1 overflow-x-auto rounded-full bg-card-2 p-1">
          {(
            [
              ['dados', 'Dados'],
              ['sobre', 'Sobre o imóvel'],
              ['pagamento', 'Pagamento'],
              ['proprietario', 'Proprietário'],
              ['midia', 'Mídia'],
            ] as const
          ).map(([k, rotulo]) => (
            <button
              key={k}
              type="button"
              onClick={() => setAba(k)}
              data-ativa={aba === k || undefined}
              className={cn(
                'flex-1 whitespace-nowrap rounded-full px-3 py-2 text-base font-semibold transition-colors',
                aba === k ? 'bg-card text-pri shadow-card' : 'text-tx-2 hover:text-tx',
              )}
            >
              {rotulo}
            </button>
          ))}
        </nav>

        {aba === 'dados' && (
          <AbaDados
            imovel={imovel}
            f={f}
            set={set}
            alternarRegime={alternarRegime}
            alternarEmpreendimento={alternarEmpreendimento}
            resumo={resumo}
            aPartir={aPartir}
            precoCents={precoCents}
            tabelaCents={tabelaCents}
            deCents={deCents}
            tabelaSemDesconto={tabelaSemDesconto}
            entregaInvalida={entregaInvalida}
          />
        )}

        {aba === 'sobre' && (
          <SobreOImovel valor={sobre} onMudar={setSobre} tipo={f.property_type as PropertyType} />
        )}

        {aba === 'pagamento' && (
          <AbaPagamento
            f={f}
            set={set}
            garantias={garantias}
            setGarantias={setGarantias}
            formas={formas}
            setFormas={setFormas}
          />
        )}

        {aba === 'proprietario' && <AbaProprietario dono={dono} setDonoCampo={setDonoCampo} />}

        {aba === 'midia' && <MediaManager orgId={orgId} propertyId={id} />}

        {salvar.isError && (
          <p className="mt-4 rounded-md bg-dng-soft px-3 py-2 text-base text-dng">
            {(salvar.error as Error).message}
          </p>
        )}
        {definirDono.isError && (
          <p className="mt-4 rounded-md bg-dng-soft px-3 py-2 text-base text-dng">
            {(definirDono.error as Error).message}
          </p>
        )}

        <footer className="mt-6 flex gap-2.5">
          <button
            type="button"
            onClick={onFechar}
            className="flex-1 rounded-xl border border-line-2 bg-card py-2.5 text-md font-semibold text-tx-2 hover:text-tx"
          >
            {id && aba === 'midia' ? 'Fechar' : 'Cancelar'}
          </button>
          <button
            type="submit"
            disabled={salvar.isPending || definirDono.isPending}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-pri py-2.5 text-md font-semibold text-pri-fg hover:bg-pri-deep disabled:opacity-60"
          >
            {(salvar.isPending || definirDono.isPending) && <Loader2 className="h-4 w-4 animate-spin" />}
            {id ? 'Salvar' : 'Criar e adicionar fotos'}
          </button>
        </footer>
      </form>
    </div>
  );
}
