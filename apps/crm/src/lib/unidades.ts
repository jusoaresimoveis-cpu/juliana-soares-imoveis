import { ROTULO_DA_UNIDADE, UNIT_STATUSES, type UnitStatus } from '@contracts';
import type { UnidadeDaTabela } from './celula';
import { finalDaUnidade, ordenarUnidades } from './grade';

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

// A célula, a grade e a conferência moram em arquivos próprios; daqui seguem
// com o mesmo nome, para quem importa de '@/lib/unidades'.
export {
  celulaDasPartes,
  formatarPreco,
  lerCelula,
  partesDaCelula,
  textoDaCelula,
  type LeituraDaCelula,
  type UnidadeDaTabela,
} from './celula';
export { finalDaUnidade, montarGrade, natural, ordenarUnidades, type LinhaDaGrade } from './grade';
export {
  VARIACAO_SUSPEITA,
  conferirTabela,
  formatarVariacao,
  variacao,
  type CelulaEditada,
  type ConferenciaDaTabela,
  type Destaque,
  type MudancaDePreco,
  type MudouEmOutroAparelho,
} from './conferencia';

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

function plantasPorFinal(plantas: readonly PlantaParaGerar[]): Map<string, PlantaParaGerar[]> {
  const plantasDoFinal = new Map<string, PlantaParaGerar[]>();
  for (const p of plantas) {
    for (const f of p.finals) plantasDoFinal.set(f, [...(plantasDoFinal.get(f) ?? []), p]);
  }
  return plantasDoFinal;
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
  const plantasDoFinal = plantasPorFinal(plantas);

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
