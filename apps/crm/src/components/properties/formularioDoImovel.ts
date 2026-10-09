import {
  normalizarCaracteristicas,
  type CaracteristicasDoImovel,
  type PaymentMethod,
  type RentalGuarantee,
} from '@contracts';
import type { PropertyUpdate } from '@/hooks/useProperties';
import type { Json } from '@/lib/database.types';
import type { EstadoDoImovel } from './PropertyFormDialog';

// O formulário do imóvel guarda tudo como texto e só converte no envio. As
// conversões e a montagem do que vai ao banco moram aqui, fora da tela: é a
// conta de dinheiro (em centavos), e num .ts ela tem orçamento de complexidade.

export function apenasDigitos(v: string) {
  return v.replace(/\D/g, '');
}

export function mascaraBRL(v: string) {
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
export function centsParaCampo(cents: number | null | undefined): string {
  if (typeof cents !== 'number' || cents <= 0) return '';
  return Math.round(cents / 100).toLocaleString('pt-BR');
}

/** Campo em reais para centavos. Vazio é nulo, não zero. */
export function campoParaCents(v: string): number | null {
  const d = apenasDigitos(v);
  return d ? Number(d) * 100 : null;
}

/**
 * O ano de entrega, guardado como 1º de janeiro: só o ano sai no site. Vazio é
 * nulo; um ano fora de 2000 a 2100 é `undefined`, para o formulário avisar.
 */
export function campoParaEntrega(v: string): string | null | undefined {
  if (!v) return null;
  const ano = Number(v);
  return /^\d{4}$/.test(v) && ano >= 2000 && ano <= 2100 ? `${v}-01-01` : undefined;
}

/** Campo de contagem. Vazio e zero são nulo: "0 parcelas" não é um plano. */
export function campoParaInteiro(v: string): number | null {
  const n = Number(apenasDigitos(v));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** O que o envio junta ao estado `f`: as contas que a tela já fez e os outros estados do formulário. */
interface Envio {
  f: EstadoDoImovel;
  precoCents: number | null;
  tabelaCents: number | null;
  entrega: string | null | undefined;
  garantias: RentalGuarantee[];
  sobre: CaracteristicasDoImovel;
  formas: PaymentMethod[];
}

/*
 * Com unidades, preço, "de/por" e situação NÃO vão: o banco calcula das
 * unidades. A situação vai só como "suspenso" ou não, que é a única
 * decisão de quem cadastra; com tabela aplicada o gatilho a recalcula, e
 * antes da primeira ele guarda a que vier. "disponivel" é a que o
 * empreendimento já tinha (sem tabela, só este formulário grava a situação
 * dele) e o deixa no ar com "Consulte". Quartos, suítes, banheiros, vagas e
 * área ficam como estão: vêm das plantas.
 */
function camposDoImovelUnico(f: EstadoDoImovel, precoCents: number | null, tabelaCents: number | null): PropertyUpdate {
  return f.has_units
    ? { status: f.status === 'suspenso' ? 'suspenso' : 'disponivel' }
    : {
        status: f.status,
        // Centavos, sempre inteiro. O valor de um regime desligado vai nulo: o
        // campo some da tela, e um preço que ninguém vê não pode ficar gravado.
        price_cents: f.for_sale ? precoCents : null,
        original_price_cents: tabelaCents,
        bedrooms: f.bedrooms ? Number(f.bedrooms) : null,
        suites: f.suites ? Number(f.suites) : null,
        bathrooms: f.bathrooms ? Number(f.bathrooms) : null,
        parking_spots: f.parking_spots ? Number(f.parking_spots) : null,
        area_built: f.area_built ? Number(f.area_built.replace(',', '.')) : null,
        area_total: f.area_total ? Number(f.area_total.replace(',', '.')) : null,
      };
}

// Os campos do empreendimento só vão com ele ligado: desligado, a tela não
// os mostra, e o que ninguém vê não se apaga.
function camposDoEmpreendimento(f: EstadoDoImovel, entrega: string | null | undefined): PropertyUpdate {
  return f.has_units
    ? {
        construction_status: f.construction_status || null,
        delivery_at: entrega ?? null,
        developer: f.developer.trim() || null,
        incorporation_registry: f.incorporation_registry.trim() || null,
        incorporation_registry_office: f.incorporation_registry_office.trim() || null,
      }
    : {};
}

/*
 * Quantidade e valor vão JUNTOS, ou nenhum dos dois vai.
 *
 * O banco recusa metade do par — "60 parcelas" sem valor é meia informação,
 * e meia informação numa página pública vira uma pergunta que o corretor
 * responde de novo por WhatsApp. Zerar os dois aqui evita que a pessoa
 * receba um erro do Postgres por ter apagado só um campo.
 */
function aplicarParcelasEReforcos(dados: PropertyUpdate, f: EstadoDoImovel) {
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
}

/** O que o formulário grava no imóvel, na ordem de campos de sempre. */
export function montarDados({ f, precoCents, tabelaCents, entrega, garantias, sobre, formas }: Envio): PropertyUpdate {
  const doImovelUnico = camposDoImovelUnico(f, precoCents, tabelaCents);
  const doEmpreendimentoNovo = camposDoEmpreendimento(f, entrega);

  const dados: PropertyUpdate = {
    title: f.title.trim(),
    public_title: f.public_title.trim() || null,
    property_type: f.property_type,
    has_units: f.has_units,
    for_sale: f.for_sale,
    for_rent: f.for_rent,
    ...doImovelUnico,
    ...doEmpreendimentoNovo,
    rent_cents: f.for_rent ? campoParaCents(f.aluguel) : null,
    rental_guarantees: f.for_rent ? garantias : [],
    condo_fee_cents: campoParaCents(f.condominio),
    iptu_year_cents: campoParaCents(f.iptu),
    neighborhood: f.neighborhood.trim() || null,
    city: f.city.trim() || null,
    state: f.state.trim().toUpperCase() || null,
    features: normalizarCaracteristicas(sobre) as Json,
    is_published: f.is_published,
    is_featured: f.is_featured,

    payment_methods: formas,
    down_payment_cents: campoParaCents(f.entrada),
    keys_cents: campoParaCents(f.chaves),
    payment_notes: f.payment_notes.trim() || null,
  };

  aplicarParcelasEReforcos(dados, f);
  // Enviado sempre, inclusive vazio: agora o formulário conhece o valor atual,
  // então limpar a descrição de propósito passou a ser possível.
  dados.description = f.description.trim() || null;
  return dados;
}
