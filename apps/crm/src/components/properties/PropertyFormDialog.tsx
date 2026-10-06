import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { X, Loader2 } from 'lucide-react';
import {
  CIDADES_ATENDIDAS,
  PROPERTY_TYPES,
  PROPERTY_TYPE_LABEL,
  PROPERTY_STATUSES,
  PROPERTY_STATUS_LABEL,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABEL,
  REINFORCEMENT_PERIODS,
  REINFORCEMENT_PERIOD_LABEL,
  RENTAL_GUARANTEES,
  RENTAL_GUARANTEE_LABEL,
  precoDeTabela,
  resumoDoPlano,
  type PaymentMethod,
  type RentalGuarantee,
} from '@contracts';
import {
  useDefinirProprietario,
  useSalvarImovel,
  type Property,
  type PropertyUpdate,
  type Proprietario,
} from '@/hooks/useProperties';
import { telefoneLegivel } from '@/exportacao';
import { MediaManager } from './MediaManager';
import { Switch } from '@/components/Switch';
import { brlCents, cn } from '@/lib/utils';

export type AbaDoImovel = 'dados' | 'local' | 'pagamento' | 'proprietario' | 'midia';

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

function apenasDigitos(v: string) {
  return v.replace(/\D/g, '');
}

function mascaraBRL(v: string) {
  const d = apenasDigitos(v);
  return d ? Number(d).toLocaleString('pt-BR') : '';
}

/**
 * Centavos do banco para o campo em reais.
 *
 * Zero vira campo VAZIO, não "0". Entrada de zero e entrada não informada são
 * coisas diferentes — a primeira é uma condição de venda, a segunda é falta de
 * dado — e o campo com "0" faria a página anunciar "R$ 0 de entrada" para um
 * imóvel que ninguém preencheu.
 */
function centsParaCampo(cents: number | null | undefined): string {
  if (typeof cents !== 'number' || cents <= 0) return '';
  return Math.round(cents / 100).toLocaleString('pt-BR');
}

/** Campo em reais para centavos. Vazio é nulo, não zero. */
function campoParaCents(v: string): number | null {
  const d = apenasDigitos(v);
  return d ? Number(d) * 100 : null;
}

/** Campo de contagem. Vazio e zero são nulo: "0 parcelas" não é um plano. */
function campoParaInteiro(v: string): number | null {
  const n = Number(apenasDigitos(v));
  return Number.isFinite(n) && n > 0 ? n : null;
}

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

  const [f, setF] = useState({
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
  });

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
   * O "de R$ X por R$ Y" da venda com desconto. Preço de tabela que não fica
   * acima do de venda não é desconto: o banco recusaria, e aqui ele vira aviso
   * antes de salvar, e não um erro do Postgres.
   */
  const precoCents = campoParaCents(f.preco);
  const tabelaCents = f.for_sale ? campoParaCents(f.tabela) : null;
  const deCents = precoDeTabela(precoCents, tabelaCents);
  const tabelaSemDesconto = tabelaCents !== null && deCents === null;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!f.title.trim()) return;
    if (tabelaSemDesconto) {
      // O aviso está na aba de dados; salvar de outra aba precisa mostrá-lo.
      setAba('dados');
      return;
    }

    const dados: PropertyUpdate = {
      title: f.title.trim(),
      public_title: f.public_title.trim() || null,
      property_type: f.property_type,
      for_sale: f.for_sale,
      for_rent: f.for_rent,
      status: f.status,
      // Centavos, sempre inteiro. O valor de um regime desligado vai nulo: o
      // campo some da tela, e um preço que ninguém vê não pode ficar gravado.
      price_cents: f.for_sale ? precoCents : null,
      original_price_cents: tabelaCents,
      rent_cents: f.for_rent ? campoParaCents(f.aluguel) : null,
      rental_guarantees: f.for_rent ? garantias : [],
      condo_fee_cents: campoParaCents(f.condominio),
      iptu_year_cents: campoParaCents(f.iptu),
      bedrooms: f.bedrooms ? Number(f.bedrooms) : null,
      suites: f.suites ? Number(f.suites) : null,
      bathrooms: f.bathrooms ? Number(f.bathrooms) : null,
      parking_spots: f.parking_spots ? Number(f.parking_spots) : null,
      area_built: f.area_built ? Number(f.area_built.replace(',', '.')) : null,
      area_total: f.area_total ? Number(f.area_total.replace(',', '.')) : null,
      neighborhood: f.neighborhood.trim() || null,
      city: f.city.trim() || null,
      state: f.state.trim().toUpperCase() || null,
      is_published: f.is_published,
      is_featured: f.is_featured,

      payment_methods: formas,
      down_payment_cents: campoParaCents(f.entrada),
      keys_cents: campoParaCents(f.chaves),
      payment_notes: f.payment_notes.trim() || null,
    };

    /*
     * Quantidade e valor vão JUNTOS, ou nenhum dos dois vai.
     *
     * O banco recusa metade do par — "60 parcelas" sem valor é meia informação,
     * e meia informação numa página pública vira uma pergunta que o corretor
     * responde de novo por WhatsApp. Zerar os dois aqui evita que a pessoa
     * receba um erro do Postgres por ter apagado só um campo.
     */
    const parcelas = campoParaInteiro(f.parcelas);
    const parcela = campoParaCents(f.parcela);
    dados.installments_count = parcelas !== null && parcela !== null ? parcelas : null;
    dados.installment_cents = parcelas !== null && parcela !== null ? parcela : null;

    const reforcos = campoParaInteiro(f.reforcos);
    const reforco = campoParaCents(f.reforco);
    const temReforco = reforcos !== null && reforco !== null;
    dados.reinforcement_count = temReforco ? reforcos : null;
    dados.reinforcement_cents = temReforco ? reforco : null;
    // Periodicidade só faz sentido com reforço, e o banco exige que ela exista
    // quando há reforço: "8 reforços de R$ 15.000" de quanto em quanto tempo?
    dados.reinforcement_period = temReforco ? (f.periodo as 'semestral' | 'anual') : null;
    // Enviado sempre, inclusive vazio: agora o formulário conhece o valor atual,
    // então limpar a descrição de propósito passou a ser possível.
    dados.description = f.description.trim() || null;

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
        onSubmit={onSubmit}
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
              ['local', 'Localização'],
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
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Campo className="col-span-2 sm:col-span-4" rotulo="Título (no CRM)">
              <input
                autoFocus
                required
                value={f.title}
                onChange={(e) => set('title')(e.target.value)}
                placeholder="Apto 302 do Ed. Mar Azul"
                className={inputCls}
              />
            </Campo>

            {/*
              O nome público é outro campo porque o título do CRM é de uso
              interno (costuma ter nome de dono e de prédio). Trocar o nome
              público muda o endereço da página; o antigo continua levando a
              ela.
            */}
            <Campo className="col-span-2 sm:col-span-4" rotulo="Nome no site (opcional)">
              <input
                value={f.public_title}
                onChange={(e) => set('public_title')(e.target.value)}
                placeholder="Vazio: o site monta, como “Apartamento com 2 quartos em Meia Praia, Itapema”"
                className={inputCls}
              />
            </Campo>

            <Campo className="col-span-2" rotulo="Tipo">
              <select value={f.property_type} onChange={(e) => set('property_type')(e.target.value)} className={inputCls}>
                {PROPERTY_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {PROPERTY_TYPE_LABEL[t]}
                  </option>
                ))}
              </select>
            </Campo>

            <Campo className="col-span-2" rotulo="Situação">
              <select value={f.status} onChange={(e) => set('status')(e.target.value)} className={inputCls}>
                {PROPERTY_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {PROPERTY_STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </Campo>

            <div className="col-span-2 flex items-center gap-4 sm:col-span-4">
              <Switch marcado={f.for_sale} onMudar={alternarRegime('for_sale')} rotulo="À venda" />
              <Switch marcado={f.for_rent} onMudar={alternarRegime('for_rent')} rotulo="Para alugar (anual)" />
            </div>

            {f.for_sale && (
              <>
                <Campo className="col-span-2" rotulo="Preço de venda (R$)">
                  <input
                    inputMode="numeric"
                    value={mascaraBRL(f.preco)}
                    onChange={(e) => set('preco')(apenasDigitos(e.target.value))}
                    placeholder="1.850.000"
                    className={inputCls}
                  />
                </Campo>
                <Campo className="col-span-2" rotulo="Preço de tabela (R$)">
                  <input
                    inputMode="numeric"
                    value={mascaraBRL(f.tabela)}
                    onChange={(e) => set('tabela')(apenasDigitos(e.target.value))}
                    placeholder="Vazio: sem desconto"
                    aria-invalid={tabelaSemDesconto || undefined}
                    className={cn(inputCls, tabelaSemDesconto && 'border-dng focus:border-dng')}
                  />
                </Campo>
                {tabelaCents !== null && (
                  <p
                    role={tabelaSemDesconto ? 'alert' : undefined}
                    className={cn(
                      'col-span-2 rounded-xl p-3 text-sm sm:col-span-4',
                      tabelaSemDesconto ? 'bg-dng-soft font-semibold text-dng' : 'bg-card-2 text-tx-2',
                    )}
                  >
                    {deCents !== null && precoCents !== null ? (
                      <>
                        No site: De <s>{brlCents(deCents)}</s> por <b>{brlCents(precoCents)}</b>.
                      </>
                    ) : precoCents === null ? (
                      'Preencha o preço de venda: é o “por” do “de R$ X por R$ Y”.'
                    ) : (
                      'O preço de tabela tem que ser maior que o de venda. Sem desconto, deixe vazio.'
                    )}
                  </p>
                )}
              </>
            )}
            {f.for_rent && (
              <Campo className="col-span-2" rotulo="Aluguel mensal (R$)">
                <input
                  inputMode="numeric"
                  value={mascaraBRL(f.aluguel)}
                  onChange={(e) => set('aluguel')(apenasDigitos(e.target.value))}
                  placeholder="3.500"
                  className={inputCls}
                />
              </Campo>
            )}
            <Campo rotulo="Condomínio (R$/mês)">
              <input
                inputMode="numeric"
                value={mascaraBRL(f.condominio)}
                onChange={(e) => set('condominio')(apenasDigitos(e.target.value))}
                placeholder="650"
                className={inputCls}
              />
            </Campo>
            <Campo rotulo="IPTU (R$/ano)">
              <input
                inputMode="numeric"
                value={mascaraBRL(f.iptu)}
                onChange={(e) => set('iptu')(apenasDigitos(e.target.value))}
                placeholder="1.200"
                className={inputCls}
              />
            </Campo>

            <Campo rotulo="Área privativa (m²)">
              <input inputMode="decimal" value={f.area_built} onChange={(e) => set('area_built')(e.target.value)} className={inputCls} />
            </Campo>
            <Campo rotulo="Área total (m²)">
              <input inputMode="decimal" value={f.area_total} onChange={(e) => set('area_total')(e.target.value)} className={inputCls} />
            </Campo>
            {/* Os quartos que NÃO são suíte: o site soma os dois (2 quartos e
                1 suíte são 3 dormitórios) e mostra os dois lado a lado. */}
            <Campo rotulo="Quartos (sem as suítes)">
              <input inputMode="numeric" value={f.bedrooms} onChange={(e) => set('bedrooms')(apenasDigitos(e.target.value))} className={inputCls} />
            </Campo>
            <Campo rotulo="Suítes">
              <input inputMode="numeric" value={f.suites} onChange={(e) => set('suites')(apenasDigitos(e.target.value))} className={inputCls} />
            </Campo>
            <Campo rotulo="Banheiros">
              <input inputMode="numeric" value={f.bathrooms} onChange={(e) => set('bathrooms')(apenasDigitos(e.target.value))} className={inputCls} />
            </Campo>
            <Campo rotulo="Vagas">
              <input inputMode="numeric" value={f.parking_spots} onChange={(e) => set('parking_spots')(apenasDigitos(e.target.value))} className={inputCls} />
            </Campo>

            <Campo className="col-span-2 sm:col-span-4" rotulo="Descrição">
              <textarea
                rows={3}
                value={f.description}
                onChange={(e) => set('description')(e.target.value)}
                placeholder="O texto que aparece na página do imóvel no site."
                className={cn(inputCls, 'resize-none')}
              />
            </Campo>

            <div className="col-span-2 flex items-center gap-4 sm:col-span-4">
              <Switch marcado={f.is_published} onMudar={(v) => set('is_published')(v)} rotulo="Publicado" />
              <Switch marcado={f.is_featured} onMudar={(v) => set('is_featured')(v)} rotulo="Destaque" />
            </div>
          </div>
        )}

        {aba === 'local' && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Campo className="col-span-2" rotulo="Bairro">
              <input value={f.neighborhood} onChange={(e) => set('neighborhood')(e.target.value)} className={inputCls} />
            </Campo>
            {/* Sugere as cidades atendidas pelo nome exato: é por ele que o site
                monta as páginas de cidade. */}
            <Campo rotulo="Cidade">
              <input list="cidades-atendidas" value={f.city} onChange={(e) => set('city')(e.target.value)} className={inputCls} />
              <datalist id="cidades-atendidas">
                {CIDADES_ATENDIDAS.map((c) => (
                  <option key={c.slug} value={c.nome} />
                ))}
              </datalist>
            </Campo>
            <Campo rotulo="UF">
              <input maxLength={2} value={f.state} onChange={(e) => set('state')(e.target.value.toUpperCase())} className={inputCls} />
            </Campo>
            <p className="col-span-2 text-sm leading-relaxed text-tx-3 sm:col-span-4">
              O site mostra só bairro e cidade. Endereço completo e mapa entram junto com a nova
              página do imóvel.
            </p>
          </div>
        )}

        {aba === 'pagamento' && (
          <div className="flex flex-col gap-4">
            {f.for_rent && (
              <div>
                <p className="text-sm font-semibold text-tx-2">Garantias aceitas na locação</p>
                <p className="mt-0.5 text-sm text-tx-3">
                  Marque todas as que o proprietário aceita. É a primeira pergunta de quem quer alugar.
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {RENTAL_GUARANTEES.map((g) => {
                    const ativa = garantias.includes(g);
                    return (
                      <button
                        key={g}
                        type="button"
                        onClick={() => setGarantias((s) => (ativa ? s.filter((x) => x !== g) : [...s, g]))}
                        className={cn(
                          'rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors',
                          ativa
                            ? 'border-pri bg-pri text-pri-fg'
                            : 'border-line-2 bg-card text-tx-2 hover:border-pri-light hover:text-tx',
                        )}
                      >
                        {RENTAL_GUARANTEE_LABEL[g]}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* O plano de pagamento é de venda: entrada, parcelas e chaves não existem num aluguel. */}
            {f.for_sale && (
              <>
            <div>
              <p className="text-sm font-semibold text-tx-2">Formas aceitas</p>
              <p className="mt-0.5 text-sm text-tx-3">
                Marque todas. O mesmo imóvel costuma aceitar mais de uma, e obrigar a
                escolher uma faria as outras virarem pergunta no WhatsApp.
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {PAYMENT_METHODS.map((m) => {
                  const ativa = formas.includes(m);
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() =>
                        setFormas((s) => (ativa ? s.filter((x) => x !== m) : [...s, m]))
                      }
                      className={cn(
                        'rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors',
                        ativa
                          ? 'border-pri bg-pri text-pri-fg'
                          : 'border-line-2 bg-card text-tx-2 hover:border-pri-light hover:text-tx',
                      )}
                    >
                      {PAYMENT_METHOD_LABEL[m]}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Campo className="col-span-2" rotulo="Entrada (R$)">
                <input
                  inputMode="numeric"
                  value={f.entrada}
                  onChange={(e) => set('entrada')(mascaraBRL(e.target.value))}
                  placeholder="80.000"
                  className={inputCls}
                />
              </Campo>

              <Campo className="col-span-2" rotulo="Nas chaves (R$)">
                <input
                  inputMode="numeric"
                  value={f.chaves}
                  onChange={(e) => set('chaves')(mascaraBRL(e.target.value))}
                  placeholder="120.000"
                  className={inputCls}
                />
              </Campo>

              <Campo rotulo="Parcelas">
                <input
                  inputMode="numeric"
                  value={f.parcelas}
                  onChange={(e) => set('parcelas')(apenasDigitos(e.target.value))}
                  placeholder="60"
                  className={inputCls}
                />
              </Campo>

              <Campo rotulo="Valor da parcela (R$)">
                <input
                  inputMode="numeric"
                  value={f.parcela}
                  onChange={(e) => set('parcela')(mascaraBRL(e.target.value))}
                  placeholder="2.400"
                  className={inputCls}
                />
              </Campo>

              <Campo rotulo="Reforços">
                <input
                  inputMode="numeric"
                  value={f.reforcos}
                  onChange={(e) => set('reforcos')(apenasDigitos(e.target.value))}
                  placeholder="8"
                  className={inputCls}
                />
              </Campo>

              <Campo rotulo="Valor do reforço (R$)">
                <input
                  inputMode="numeric"
                  value={f.reforco}
                  onChange={(e) => set('reforco')(mascaraBRL(e.target.value))}
                  placeholder="15.000"
                  className={inputCls}
                />
              </Campo>

              {/* Só aparece quando há reforço: periodicidade sem reforço é um
                  seletor que não decide nada. */}
              {f.reforcos && f.reforco && (
                <Campo className="col-span-2" rotulo="Periodicidade do reforço">
                  <select
                    value={f.periodo}
                    onChange={(e) => set('periodo')(e.target.value)}
                    className={inputCls}
                  >
                    {REINFORCEMENT_PERIODS.map((r) => (
                      <option key={r} value={r}>
                        {REINFORCEMENT_PERIOD_LABEL[r]}
                      </option>
                    ))}
                  </select>
                </Campo>
              )}

              <Campo className="col-span-2 sm:col-span-4" rotulo="Observações da condição">
                <input
                  value={f.payment_notes}
                  onChange={(e) => set('payment_notes')(e.target.value)}
                  placeholder="Saldo corrigido pelo INCC. Desconto de 5% à vista."
                  className={inputCls}
                />
              </Campo>
            </div>

            <Conferencia
              precoCents={f.preco ? Number(apenasDigitos(f.preco)) * 100 : null}
              entradaCents={campoParaCents(f.entrada)}
              parcelas={campoParaInteiro(f.parcelas)}
              parcelaCents={campoParaCents(f.parcela)}
              reforcos={campoParaInteiro(f.reforcos)}
              reforcoCents={campoParaCents(f.reforco)}
              chavesCents={campoParaCents(f.chaves)}
            />
              </>
            )}
          </div>
        )}

        {aba === 'proprietario' && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <p className="col-span-2 text-sm text-tx-3 sm:col-span-4">
              Quem entregou o imóvel para administrar. Não aparece no site. O telefone identifica o
              proprietário: o mesmo número em outro imóvel é o mesmo cadastro.
            </p>
            <Campo className="col-span-2 sm:col-span-4" rotulo="Nome completo">
              <input value={dono.nome} onChange={(e) => setDonoCampo('nome')(e.target.value)} autoComplete="off" className={inputCls} />
            </Campo>
            <Campo className="col-span-2" rotulo="Cidade onde mora">
              <input value={dono.cidade} onChange={(e) => setDonoCampo('cidade')(e.target.value)} autoComplete="off" className={inputCls} />
            </Campo>
            <Campo className="col-span-2" rotulo="Telefone com DDD">
              <input
                type="tel"
                inputMode="tel"
                value={dono.telefone}
                onChange={(e) => setDonoCampo('telefone')(e.target.value)}
                placeholder="(47) 99999-1234"
                autoComplete="off"
                className={inputCls}
              />
            </Campo>
          </div>
        )}

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

const inputCls =
  'w-full rounded-xl border border-line-2 bg-card px-3 py-2.5 text-md outline-none transition-colors focus:border-pri';

function Campo({ rotulo, children, className }: { rotulo: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn('flex flex-col gap-1.5', className)}>
      <span className="text-sm font-semibold text-tx-2">{rotulo}</span>
      {children}
    </label>
  );
}

/**
 * A conta do plano, conferida na hora do cadastro.
 *
 * Existe para o erro aparecer AQUI, e não na página pública — onde quem faz a
 * soma é o comprador, e a diferença aparece na hora da proposta, que é o pior
 * momento possível.
 *
 * Saldo positivo é normal: é o que o banco financia. Saldo negativo é erro de
 * digitação, e por isso ele grita em vez de informar.
 */
function Conferencia(props: Parameters<typeof resumoDoPlano>[0]) {
  const r = resumoDoPlano(props);
  if (r.vazio) return null;

  const brl = (c: number) =>
    (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  return (
    <div
      className={cn(
        'rounded-xl p-3 text-sm',
        r.excede ? 'bg-dng-soft text-dng' : 'bg-card-2 text-tx-2',
      )}
    >
      <p>
        O plano soma <b>{brl(r.somaCents)}</b>.
      </p>
      {r.saldoCents === null ? (
        // Sem preço não há "quanto falta": devolver o negativo da soma seria
        // inventar uma resposta para uma pergunta que não foi feita.
        <p className="mt-0.5 text-tx-3">Preencha o valor do imóvel para conferir o saldo.</p>
      ) : r.excede ? (
        <p className="mt-0.5 font-semibold">
          Passou {brl(-r.saldoCents)} do valor do imóvel — confira os campos.
        </p>
      ) : r.saldoCents === 0 ? (
        <p className="mt-0.5">Fecha exatamente com o valor do imóvel.</p>
      ) : (
        <p className="mt-0.5">
          Restam <b>{brl(r.saldoCents)}</b> — é o saldo a financiar.
        </p>
      )}
    </div>
  );
}
