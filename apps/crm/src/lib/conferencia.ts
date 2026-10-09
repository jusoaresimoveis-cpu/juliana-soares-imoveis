import { aPartirDe, resumoDoEmpreendimento, type ResumoDoEmpreendimento, type UnitStatus } from '@contracts';
import { lerCelula, type UnidadeDaTabela } from './celula';
import { natural, ordenarUnidades } from './grade';

/* -------------------------------------------------------------------------- */
/* A conferência da tabela do mês                                             */
/* -------------------------------------------------------------------------- */

/** Acima disso, a mudança de preço de um mês para o outro pede um segundo olhar (o CUB anda menos de 1%). */
export const VARIACAO_SUSPEITA = 0.1;

export type Destaque = 'caiu' | 'subiu' | 'longe';

export interface MudancaDePreco<U> {
  unidade: U;
  de: number | null;
  para: number | null;
  /** (para − de) / de; nula sem os dois preços. */
  variacao: number | null;
  destaque: Destaque | null;
}

type Estado = Pick<UnidadeDaTabela, 'status' | 'price_cents'>;

const mesmoEstado = (a: Estado, b: Estado) => a.status === b.status && a.price_cents === b.price_cents;

/**
 * Uma célula que a Juliana editou, com a unidade como a grade a mostrava
 * quando ela digitou. É contra esse "antes" que se sabe o que ELA mudou: a
 * célula que ela não tocou não vai para o banco, e a venda feita no celular
 * com o computador aberto não é desfeita por uma grade velha.
 */
export interface CelulaEditada {
  texto: string;
  antes: Pick<UnidadeDaTabela, 'label' | 'status' | 'price_cents'>;
}

/** Célula editada de uma unidade que outro aparelho mudou depois que a grade a mostrou. */
export interface MudouEmOutroAparelho<U> {
  /** Como está no banco agora. */
  unidade: U;
  /** Como a grade mostrava quando a Juliana digitou. */
  visto: Estado;
  /** O que a célula grava por cima. */
  vai: { status: UnitStatus; price_cents: number | null };
}

export interface ConferenciaDaTabela<U> {
  /** Célula que não grava, por id da unidade. */
  erros: Map<string, string>;
  /**
   * O que vai para `aplicar_tabela_de_unidades`: só as unidades que a Juliana
   * mudou e que ainda estão diferentes no banco. Vazia também grava o mês.
   */
  linhas: { label: string; price_cents: number | null; status: UnitStatus }[];
  /** Mesma situação (disponível ou reservada), preço novo. */
  precos: MudancaDePreco<U>[];
  vendidas: U[];
  reservadas: MudancaDePreco<U>[];
  /** Vendida ou reservada que voltou a ficar disponível. */
  voltaram: MudancaDePreco<U>[];
  mudaram: number;
  /** Editadas sobre uma unidade que mudou em outro aparelho: gravar desfaria o que foi feito lá. */
  outroAparelho: MudouEmOutroAparelho<U>[];
  /** Rótulo das editadas cuja unidade foi apagada em outro aparelho: ficam de fora. */
  apagadas: string[];
  antes: ResumoDoEmpreendimento;
  depois: ResumoDoEmpreendimento;
  aPartirDeAntes: number | null;
  aPartirDeDepois: number | null;
  /** A unidade que dá o "a partir de" novo, que é o preço do anúncio. */
  unidadeDoAPartirDe: U | null;
  /** O "a partir de" baixou: um erro de digitação na mais barata vira o preço do anúncio. */
  aPartirDeCaiu: boolean;
  /** Quantos preços em destaque, contando o "a partir de" que caiu. */
  destaques: number;
  /**
   * A tabela do mês ainda não foi aplicada: gravar faz dos preços que a
   * Juliana não mudou os preços do mês, e o site troca o "Consulte" por eles.
   * Quem só queria registrar uma venda publicaria, sem ver, a tabela velha
   * inteira como a do mês.
   */
  tabelaNova: boolean;
  /** Gravar pede o "Conferi": preço em destaque, unidade mexida em outro aparelho ou tabela nova. */
  exigeConferi: boolean;
}

export function variacao(de: number | null, para: number | null): number | null {
  return de && para ? (para - de) / de : null;
}

/** "+0,5%", "−12,3%". */
export function formatarVariacao(v: number): string {
  const pct = (Math.abs(v) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}${pct}%`;
}

function mediana(valores: number[]): number | null {
  if (!valores.length) return null;
  const v = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(v.length / 2);
  return v.length % 2 ? (v[meio] ?? null) : ((v[meio - 1] ?? 0) + (v[meio] ?? 0)) / 2;
}

/**
 * Compara as células editadas com o banco de AGORA (`unidades` é a releitura
 * feita no clique em "Conferir"): o que mudou, o "a partir de" novo ao lado do
 * anterior e os preços que merecem um segundo olhar.
 *
 * Só a célula editada entra, e só se a Juliana mudou alguma coisa em relação
 * ao que via; o resto da grade é o que estava na tela, e mandar de volta
 * desfaria o que outro aparelho gravou nesse meio-tempo (vendeu o 1604 pelo
 * celular, e o computador o devolveria à venda). Se a unidade da célula
 * editada mudou no banco depois que a grade a mostrou, a conferência diz, e
 * gravar exige o "Conferi".
 *
 * Destaque: preço que caiu (a tabela da construtora só sobe com o CUB),
 * variação acima de 10%, e preço longe dos outros (metade ou o dobro da
 * mediana da tabela, que é o que uma vírgula no lugar errado produz quando a
 * unidade não tinha preço para comparar).
 *
 * `tabela` é o mês gravado no imóvel (relido junto com as unidades) e o mês
 * que se vai gravar: diferentes, a tabela é nova e gravar exige o "Conferi",
 * mesmo sem mudança nenhuma. Sem ele, a conferência não olha o mês.
 */
export function conferirTabela<U extends UnidadeDaTabela>(
  unidades: readonly U[],
  editadas: Readonly<Record<string, CelulaEditada>>,
  tabela?: { aplicada: string | null | undefined; mes: string },
): ConferenciaDaTabela<U> {
  const { erros, novas, outroAparelho } = lerEdicoes(unidades, editadas);

  const noBanco = new Set(unidades.map((u) => u.id));
  const apagadas = Object.entries(editadas)
    .filter(([id]) => !noBanco.has(id))
    .map(([, e]) => e.antes.label)
    .sort(natural);

  // A tabela inteira depois de gravar: a mediana e o "a partir de" são dela, e não só das mudanças.
  const novaDe = new Map(novas.map((n) => [n.u.id, n]));
  const tabelaDepois = unidades.map((u) => novaDe.get(u.id) ?? { u, status: u.status, price_cents: u.price_cents });

  const aVenda = tabelaDepois
    .filter((n) => n.status !== 'vendido' && n.price_cents != null)
    .map((n) => n.price_cents as number);
  const meio = aVenda.length >= 3 ? mediana(aVenda) : null;

  const mudanca = (n: (typeof novas)[number]): MudancaDePreco<U> => {
    const v = variacao(n.u.price_cents, n.price_cents);
    const longe = meio !== null && n.price_cents != null && (n.price_cents < meio / 2 || n.price_cents > meio * 2);
    const destaque: Destaque | null =
      v !== null && v < 0 ? 'caiu' : v !== null && v > VARIACAO_SUSPEITA ? 'subiu' : longe ? 'longe' : null;
    return { unidade: n.u, de: n.u.price_cents, para: n.price_cents, variacao: v, destaque };
  };

  const { precos, vendidas, reservadas, voltaram } = classificarMudancas(novas, mudanca);

  const { antes, depois, aPartirDeAntes, aPartirDeDepois, unidadeDoAPartirDe, aPartirDeCaiu } =
    aPartirDaConferencia(unidades, tabelaDepois);

  const comDestaque = [...precos, ...reservadas, ...voltaram].filter((m) => m.destaque).length;
  const destaques = comDestaque + (aPartirDeCaiu ? 1 : 0);
  const tabelaNova = !!tabela && (tabela.aplicada?.slice(0, 10) ?? null) !== tabela.mes;

  return {
    erros,
    linhas: novas.map((n) => ({ label: n.u.label, price_cents: n.price_cents, status: n.status })),
    precos: ordenarPor(precos),
    vendidas: ordenarUnidades(vendidas),
    reservadas: ordenarPor(reservadas),
    voltaram: ordenarPor(voltaram),
    mudaram: novas.length,
    outroAparelho: naOrdemDaGrade(outroAparelho),
    apagadas,
    antes,
    depois,
    aPartirDeAntes,
    aPartirDeDepois,
    unidadeDoAPartirDe,
    aPartirDeCaiu,
    destaques,
    tabelaNova,
    exigeConferi: destaques > 0 || outroAparelho.length > 0 || tabelaNova,
  };
}

interface Nova<U> {
  u: U;
  status: UnitStatus;
  price_cents: number | null;
}

function lerEdicoes<U extends UnidadeDaTabela>(
  unidades: readonly U[],
  editadas: Readonly<Record<string, CelulaEditada>>,
): { erros: Map<string, string>; novas: Nova<U>[]; outroAparelho: MudouEmOutroAparelho<U>[] } {
  const erros = new Map<string, string>();
  const novas: Nova<U>[] = [];
  const outroAparelho: MudouEmOutroAparelho<U>[] = [];

  for (const u of unidades) {
    const e = editadas[u.id];
    if (!e) continue;
    // O que ELA mudou se mede contra o que via: "v" e "r" sem preço mantêm o da tela.
    const vista = lerCelula(e.texto, e.antes.price_cents);
    if (!vista.ok) {
      erros.set(u.id, vista.erro);
      continue;
    }
    if (mesmoEstado(vista, e.antes)) continue;
    // O que grava se mede contra o banco: o "mantém o preço" é o de agora.
    const leitura = lerCelula(e.texto, u.price_cents);
    if (!leitura.ok) {
      erros.set(u.id, leitura.erro);
      continue;
    }
    // O outro aparelho já fez o mesmo: nada a gravar, nada a conferir.
    if (mesmoEstado(leitura, u)) continue;
    const nova = { status: leitura.status, price_cents: leitura.price_cents };
    if (!mesmoEstado(u, e.antes)) outroAparelho.push({ unidade: u, visto: e.antes, vai: nova });
    novas.push({ u, ...nova });
  }
  return { erros, novas, outroAparelho };
}

function classificarMudancas<U extends UnidadeDaTabela>(
  novas: readonly Nova<U>[],
  mudanca: (n: Nova<U>) => MudancaDePreco<U>,
): { precos: MudancaDePreco<U>[]; vendidas: U[]; reservadas: MudancaDePreco<U>[]; voltaram: MudancaDePreco<U>[] } {
  const precos: MudancaDePreco<U>[] = [];
  const vendidas: U[] = [];
  const reservadas: MudancaDePreco<U>[] = [];
  const voltaram: MudancaDePreco<U>[] = [];

  // Toda linha aqui muda alguma coisa no banco; o que não mudou nem entrou.
  for (const n of novas) {
    const antes = n.u.status;
    if (n.status === 'vendido') {
      if (antes !== 'vendido') vendidas.push(n.u);
    } else if (n.status === 'reservado' && antes !== 'reservado') {
      reservadas.push(mudanca(n));
    } else if (n.status === 'disponivel' && antes !== 'disponivel') {
      voltaram.push(mudanca(n));
    } else if (n.u.price_cents !== n.price_cents) {
      precos.push(mudanca(n));
    }
  }
  return { precos, vendidas, reservadas, voltaram };
}

function aPartirDaConferencia<U extends UnidadeDaTabela>(
  unidades: readonly U[],
  tabelaDepois: readonly { u: U; status: string; price_cents: number | null }[],
) {
  const antes = resumoDoEmpreendimento(unidades);
  const depois = resumoDoEmpreendimento(tabelaDepois);
  const aPartirDeAntes = aPartirDe(antes);
  const aPartirDeDepois = aPartirDe(depois);
  const aPartirDeCaiu = aPartirDeAntes !== null && aPartirDeDepois !== null && aPartirDeDepois < aPartirDeAntes;

  const candidatas = tabelaDepois.filter((n) =>
    depois.menorCents !== null ? n.status === 'disponivel' : n.status === 'reservado',
  );
  const unidadeDoAPartirDe = candidatas.find((n) => n.price_cents === aPartirDeDepois && aPartirDeDepois !== null)?.u ?? null;
  return { antes, depois, aPartirDeAntes, aPartirDeDepois, unidadeDoAPartirDe, aPartirDeCaiu };
}

function naOrdemDaGrade<T extends { unidade: UnidadeDaTabela }>(lista: readonly T[]): T[] {
  const ordem = new Map(ordenarUnidades(lista.map((m) => m.unidade)).map((u, i) => [u.id, i]));
  return [...lista].sort((a, b) => (ordem.get(a.unidade.id) ?? 0) - (ordem.get(b.unidade.id) ?? 0));
}

/** O destaque primeiro: é o que a Juliana precisa olhar antes de gravar. */
function ordenarPor<U extends UnidadeDaTabela>(lista: MudancaDePreco<U>[]): MudancaDePreco<U>[] {
  // O sort é estável: dentro de cada grupo, fica a ordem da grade.
  return naOrdemDaGrade(lista).sort((a, b) => Number(!!b.destaque) - Number(!!a.destaque));
}
