import {
  ROTULO_DA_UNIDADE,
  UNIT_STATUSES,
  aPartirDe,
  lerReais,
  resumoDoEmpreendimento,
  type ResumoDoEmpreendimento,
  type UnitStatus,
} from '@contracts';

/**
 * A conta da página "Unidades" (empreendimento com várias unidades, migration
 * 20261009000000), fora da tela para ser testada: ler o que a Juliana digita
 * na grade, montar a grade como a construtora a escreve e conferir a tabela
 * do mês antes de gravar.
 *
 * Quem grava é o banco (`aplicar_tabela_de_unidades`), e quem calcula o "a
 * partir de" também; aqui é a mesma regra (`resumoDoEmpreendimento`), para a
 * conferência mostrar o preço do anúncio ANTES de ele ir para o site.
 */

/** O mínimo de uma unidade que a grade e a conferência leem. */
export interface UnidadeDaTabela {
  id: string;
  label: string;
  floor: number | null;
  price_cents: number | null;
  status: string;
}

/* -------------------------------------------------------------------------- */
/* A célula                                                                   */
/* -------------------------------------------------------------------------- */

/** O preço como a tabela da construtora escreve, sem o "R$": "840.569,40". */
export function formatarPreco(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * O que a célula mostra ao abrir: o estado de hoje. Disponível é o preço,
 * vendida é "v", reservada é "r" (e guarda o preço que já tinha).
 */
export function textoDaCelula(u: Pick<UnidadeDaTabela, 'status' | 'price_cents'>): string {
  if (u.status === 'vendido') return 'v';
  if (u.status === 'reservado') return 'r';
  return u.price_cents != null ? formatarPreco(u.price_cents) : '';
}

export type LeituraDaCelula =
  | { ok: true; status: UnitStatus; price_cents: number | null }
  | { ok: false; erro: string };

const SEM_ACENTO = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * O que a Juliana digitou na célula: o preço ("840.569,40") é disponível, "v"
 * é vendida, "r" é reservada. A reservada mantém o preço que tinha, ou o que
 * vier depois do "r" ("r 850.000,00"); a vendida mantém o dela, porque o site
 * não a mostra e preço trocado à toa conta como mudança.
 *
 * Célula vazia é erro, e não "sem mudança": disponível sem preço o banco
 * recusa, e vazio por engano não pode virar nada em silêncio.
 */
export function lerCelula(texto: string, precoAtual: number | null): LeituraDaCelula {
  // Sem o "R$" antes de tudo: o "R" dele seria lido como "reservada".
  const t = SEM_ACENTO(texto.replace(/r\$/gi, ' ').trim().toLowerCase());
  if (!t) return { ok: false, erro: 'Vazia: digite o preço, v (vendida) ou r (reservada).' };

  if (/^v(endid[ao])?\.?$/.test(t)) return { ok: true, status: 'vendido', price_cents: precoAtual };

  const reservada = /^r(eservad[ao])?\.?\s*(.*)$/.exec(t);
  if (reservada) {
    const resto = reservada[2] ?? '';
    if (!resto) return { ok: true, status: 'reservado', price_cents: precoAtual };
    const preco = lerReais(resto);
    return preco === null
      ? { ok: false, erro: 'Preço da reservada ilegível. Ex.: r 850.000,00' }
      : { ok: true, status: 'reservado', price_cents: preco };
  }

  if (/^d(isponivel)?\.?$/.test(t)) {
    return precoAtual === null
      ? { ok: false, erro: 'Disponível sem preço: digite o preço.' }
      : { ok: true, status: 'disponivel', price_cents: precoAtual };
  }

  const preco = lerReais(t);
  return preco === null
    ? { ok: false, erro: 'Não entendi: digite o preço (840.569,40), v ou r.' }
    : { ok: true, status: 'disponivel', price_cents: preco };
}

/**
 * A mesma célula em duas partes, para a lista do celular (situação num
 * seletor, preço num campo). Os dois jeitos escrevem o mesmo texto, então a
 * grade do computador e a lista nunca discordam.
 */
export function partesDaCelula(texto: string, precoAtual: number | null): { status: UnitStatus; preco: string } {
  const leitura = lerCelula(texto, precoAtual);
  const t = texto.replace(/R\$\s*/gi, '').trim();
  // O texto sem a palavra da situação: o que sobra é o preço digitado.
  const resto = t.replace(/^(reservad[ao]|r|disponível|disponivel|d)\b\.?\s*/i, '');
  const status: UnitStatus = leitura.ok
    ? leitura.status
    : /^r/i.test(t)
      ? 'reservado'
      : /^v/i.test(t)
        ? 'vendido'
        : 'disponivel';
  if (status === 'vendido') return { status, preco: '' };
  if (resto && lerReais(resto) !== null) return { status, preco: resto };
  const preco = leitura.ok ? leitura.price_cents : null;
  return { status, preco: preco != null ? formatarPreco(preco) : resto };
}

export function celulaDasPartes(status: UnitStatus, preco: string): string {
  if (status === 'vendido') return 'v';
  if (status === 'reservado') return preco.trim() ? `r ${preco.trim()}` : 'r';
  return preco.trim();
}

/* -------------------------------------------------------------------------- */
/* A grade                                                                    */
/* -------------------------------------------------------------------------- */

const natural = (a: string, b: string) => a.localeCompare(b, 'pt-BR', { numeric: true });

/** O final da unidade: "804" no andar 8 é o final "04". Sem andar, ou fora do padrão, não tem. */
export function finalDaUnidade(label: string, floor: number | null): string | null {
  if (floor === null) return null;
  const andar = String(floor);
  return label.startsWith(andar) && label.length > andar.length ? label.slice(andar.length) : null;
}

export interface LinhaDaGrade<U> {
  andar: number;
  /** Uma por final, na ordem de `finais`; nula onde o prédio não tem a unidade. */
  celulas: (U | null)[];
}

/**
 * A grade como a tabela da construtora: andares nas linhas, do mais alto para
 * o mais baixo, e finais nas colunas. A unidade sem andar (sala) ou com
 * rótulo fora do padrão andar + final fica fora, numa lista à parte.
 */
export function montarGrade<U extends Pick<UnidadeDaTabela, 'label' | 'floor'>>(
  unidades: readonly U[],
): { finais: string[]; linhas: LinhaDaGrade<U>[]; foraDaGrade: U[] } {
  const naGrade = new Map<string, U>();
  const andares = new Set<number>();
  const finais = new Set<string>();
  const foraDaGrade: U[] = [];

  for (const u of unidades) {
    const final = finalDaUnidade(u.label, u.floor);
    if (u.floor === null || final === null) {
      foraDaGrade.push(u);
      continue;
    }
    andares.add(u.floor);
    finais.add(final);
    naGrade.set(`${u.floor}|${final}`, u);
  }

  const colunas = [...finais].sort(natural);
  return {
    finais: colunas,
    linhas: [...andares]
      .sort((a, b) => b - a)
      .map((andar) => ({ andar, celulas: colunas.map((f) => naGrade.get(`${andar}|${f}`) ?? null) })),
    foraDaGrade: ordenarUnidades(foraDaGrade),
  };
}

/** A ordem das listas: do andar mais alto para o mais baixo, como a grade; sem andar por último, pelo rótulo. */
export function ordenarUnidades<U extends Pick<UnidadeDaTabela, 'label' | 'floor'>>(unidades: readonly U[]): U[] {
  return [...unidades].sort((a, b) => {
    if (a.floor !== b.floor) {
      if (a.floor === null) return 1;
      if (b.floor === null) return -1;
      return b.floor - a.floor;
    }
    return natural(a.label, b.label);
  });
}

/* -------------------------------------------------------------------------- */
/* A troca no meio do mês                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Para onde a unidade pode ir sem a tabela do mês (a venda ou a reserva do
 * meio do mês). Só para a frente: disponível reserva ou vende, reservada
 * vende. Voltar a disponível, da reservada ou da vendida, é só pela tabela do
 * mês: o preço guardado nelas pode ser de uma tabela antiga (a reservada
 * guarda o do dia da reserva), e voltar por aqui o poria no site sem passar
 * pela conferência.
 */
export function situacoesNoMeioDoMes(atual: UnitStatus): readonly UnitStatus[] {
  if (atual === 'disponivel') return UNIT_STATUSES;
  return atual === 'reservado' ? ['reservado', 'vendido'] : ['vendido'];
}

/* -------------------------------------------------------------------------- */
/* A planta de cada unidade                                                   */
/* -------------------------------------------------------------------------- */

/**
 * As unidades que passam a ser desta planta quando ela ganha finais: as dos
 * finais novos que estão gravadas em outra planta. O site agrupa as unidades
 * pela planta gravada nelas (`floorplan_id`), e não pelo final, então mudar
 * os finais sem mover as unidades deixaria o 804 com a planta antiga no site.
 *
 * Só os finais que a planta GANHOU: a unidade de um final que ela já tinha e
 * que está em outra planta foi posta lá de propósito (o garden do 1º andar).
 * O final sai do rótulo pelo andar gravado (804 no andar 8 é final 04), e a
 * unidade sem andar (sala) não tem final: fica fora.
 */
export function unidadesQueSeguemOsFinais<U extends Pick<UnidadeDaTabela, 'label' | 'floor'> & { floorplan_id: string }>(args: {
  unidades: readonly U[];
  /** Nula para a planta que ainda não foi criada. */
  plantaId: string | null;
  finaisAntes: readonly string[];
  finaisDepois: readonly string[];
}): U[] {
  const antes = new Set(args.finaisAntes);
  const ganhou = new Set(args.finaisDepois.filter((f) => !antes.has(f)));
  if (!ganhou.size) return [];
  return ordenarUnidades(
    args.unidades.filter((u) => {
      if (u.floorplan_id === args.plantaId) return false;
      const final = finalDaUnidade(u.label, u.floor);
      return final !== null && ganhou.has(final);
    }),
  );
}

/** "804", "804 e 904", "804, 904 e 1004". */
export function juntarComE(itens: readonly string[]): string {
  if (itens.length <= 1) return itens[0] ?? '';
  return `${itens.slice(0, -1).join(', ')} e ${itens[itens.length - 1]}`;
}

/**
 * Alguns exemplos e a conta do resto, numa linha: "Apto 804, Apto 904, Apto
 * 1004 e mais 12". Cabendo um a mais que o máximo, vão todos: "e mais 1"
 * ocupa o lugar do próprio nome.
 */
export function listaCurta(itens: readonly string[], maximo = 3): string {
  if (itens.length <= maximo + 1) return juntarComE(itens);
  return `${itens.slice(0, maximo).join(', ')} e mais ${itens.length - maximo}`;
}

/* -------------------------------------------------------------------------- */
/* O mês da tabela                                                            */
/* -------------------------------------------------------------------------- */

/** "2026-09-01" → "2026-10-01"; dezembro vira janeiro do ano seguinte. */
export function mesSeguinte(mes: string): string {
  const [ano = 0, numero = 1] = mes.slice(0, 7).split('-').map(Number);
  return numero === 12 ? `${ano + 1}-01-01` : `${ano}-${String(numero + 1).padStart(2, '0')}-01`;
}

/**
 * Desde quando o site mostra "Consulte": o dia 1 do mês seguinte ao da tabela
 * aplicada. Nulo quando a tabela vale (ou quando nunca houve tabela, e aí o
 * "Consulte" é desde sempre).
 */
export function consulteDesde(mesAplicado: string | null | undefined, mesAtual: string): string | null {
  if (!mesAplicado || mesAplicado.slice(0, 10) >= mesAtual) return null;
  return mesSeguinte(mesAplicado);
}

/* -------------------------------------------------------------------------- */
/* Plantas e "Gerar unidades"                                                 */
/* -------------------------------------------------------------------------- */

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/**
 * "2 quartos + 1 suíte · 2 banheiros · 1 vaga · 70 m²". Os quartos são os que
 * NÃO são suíte, como no imóvel: "2 suítes + lavabo" tem 0 quartos e 2 suítes.
 */
export function resumoDaPlanta(p: {
  bedrooms: number | null;
  suites: number | null;
  bathrooms: number | null;
  parking_spots: number | null;
  area_built: number | null;
}): string {
  const dormitorios = [
    p.bedrooms ? plural(p.bedrooms, 'quarto', 'quartos') : null,
    p.suites ? plural(p.suites, 'suíte', 'suítes') : null,
  ].filter(Boolean);
  return [
    dormitorios.join(' + ') || null,
    p.bathrooms ? plural(p.bathrooms, 'banheiro', 'banheiros') : null,
    p.parking_spots ? plural(p.parking_spots, 'vaga', 'vagas') : null,
    p.area_built ? `${p.area_built.toLocaleString('pt-BR')} m²` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** O mesmo padrão do CHECK de `property_floorplans.finals`. */
const FINAL = /^[0-9A-Za-z]{1,4}$/;

/** "01, 02 03;04" → ["01", "02", "03", "04"]; o que não serve de final volta à parte. */
export function lerFinais(texto: string): { finais: string[]; invalidos: string[] } {
  const partes = texto
    .split(/[,;\s]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  const finais: string[] = [];
  const invalidos: string[] = [];
  for (const p of partes) {
    if (!FINAL.test(p)) invalidos.push(p);
    else if (!finais.includes(p)) finais.push(p);
  }
  return { finais, invalidos };
}

export interface PlantaParaGerar {
  id: string;
  name: string;
  finals: string[];
}

export interface Geracao {
  novas: { label: string; floor: number; floorplan_id: string }[];
  /** Rótulos que já existem: ficam como estão. */
  jaExistem: string[];
  /** Finais que nenhuma planta tem: sem planta, a unidade não nasce. */
  semPlanta: string[];
  /** Finais em mais de uma planta: qual delas, ninguém sabe. */
  emDuasPlantas: { final: string; plantas: string[] }[];
  /** Andar fora de -10 a 300, ou rótulo fora do padrão do banco. */
  invalidas: string[];
}

/**
 * As unidades a criar: andar por final (`gerarUnidades` faria o mesmo), com a
 * planta achada pelo final. O que já existe é pulado, e não sobrescrito: gerar
 * de novo, depois de acrescentar um andar, não mexe no preço de ninguém.
 */
export function prepararGeracao(args: {
  primeiroAndar: number;
  ultimoAndar: number;
  finais: readonly string[];
  plantas: readonly PlantaParaGerar[];
  existentes: readonly string[];
}): Geracao {
  const { primeiroAndar, ultimoAndar, finais, plantas, existentes } = args;
  const plantasDoFinal = new Map<string, PlantaParaGerar[]>();
  for (const p of plantas) {
    for (const f of p.finals) plantasDoFinal.set(f, [...(plantasDoFinal.get(f) ?? []), p]);
  }

  const semPlanta = finais.filter((f) => !plantasDoFinal.get(f)?.length);
  const emDuasPlantas = finais
    .filter((f) => (plantasDoFinal.get(f)?.length ?? 0) > 1)
    .map((f) => ({ final: f, plantas: (plantasDoFinal.get(f) ?? []).map((p) => p.name) }));

  const jaHa = new Set(existentes);
  const geracao: Geracao = { novas: [], jaExistem: [], semPlanta, emDuasPlantas, invalidas: [] };
  const [de, ate] = primeiroAndar <= ultimoAndar ? [primeiroAndar, ultimoAndar] : [ultimoAndar, primeiroAndar];

  for (let andar = de; andar <= ate; andar++) {
    for (const final of finais) {
      const label = `${andar}${final}`;
      const doFinal = plantasDoFinal.get(final) ?? [];
      if (andar < -10 || andar > 300 || !ROTULO_DA_UNIDADE.test(label)) geracao.invalidas.push(label);
      else if (jaHa.has(label)) geracao.jaExistem.push(label);
      else if (doFinal.length === 1 && doFinal[0]) geracao.novas.push({ label, floor: andar, floorplan_id: doFinal[0].id });
    }
  }
  return geracao;
}

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
  const erros = new Map<string, string>();
  const novas: { u: U; status: UnitStatus; price_cents: number | null }[] = [];
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

  const antes = resumoDoEmpreendimento(unidades);
  const depois = resumoDoEmpreendimento(tabelaDepois);
  const aPartirDeAntes = aPartirDe(antes);
  const aPartirDeDepois = aPartirDe(depois);
  const aPartirDeCaiu = aPartirDeAntes !== null && aPartirDeDepois !== null && aPartirDeDepois < aPartirDeAntes;

  const candidatas = tabelaDepois.filter((n) =>
    depois.menorCents !== null ? n.status === 'disponivel' : n.status === 'reservado',
  );
  const unidadeDoAPartirDe = candidatas.find((n) => n.price_cents === aPartirDeDepois && aPartirDeDepois !== null)?.u ?? null;

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

function naOrdemDaGrade<T extends { unidade: UnidadeDaTabela }>(lista: readonly T[]): T[] {
  const ordem = new Map(ordenarUnidades(lista.map((m) => m.unidade)).map((u, i) => [u.id, i]));
  return [...lista].sort((a, b) => (ordem.get(a.unidade.id) ?? 0) - (ordem.get(b.unidade.id) ?? 0));
}

/** O destaque primeiro: é o que a Juliana precisa olhar antes de gravar. */
function ordenarPor<U extends UnidadeDaTabela>(lista: MudancaDePreco<U>[]): MudancaDePreco<U>[] {
  // O sort é estável: dentro de cada grupo, fica a ordem da grade.
  return naOrdemDaGrade(lista).sort((a, b) => Number(!!b.destaque) - Number(!!a.destaque));
}
