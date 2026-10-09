/**
 * "Sobre o imóvel": o que a unidade, o empreendimento e a área de lazer têm.
 *
 * O cadastro marca itens prontos (os quadradinhos do CRM) e, em cada categoria,
 * digita o que não estiver na lista. O banco guarda em `properties.features`
 * (jsonb, migration 20261008000000):
 *
 *   { "unidade": { "itens": ["lavabo"], "outros": ["Cozinha com ilha em quartzo"] },
 *     "empreendimento": {...}, "lazer": {...}, "adicionais": { "outros": [...] } }
 *
 * `itens` são ids desta lista; `outros` é texto livre. "Informações adicionais"
 * não tem lista: é só texto livre. O banco confere o formato
 * (`caracteristicas_validas`), mas não os ids: tirar um id daqui exige uma
 * migration que troque o id antigo nos imóveis, senão ele some da página.
 *
 * Substitui a coluna antiga `amenities` (comodidades sem categoria), que o CRM
 * nunca deixou editar e que o site não lê mais.
 */

import { ITENS_DO_IMOVEL } from './caracteristicas-itens';
import { PROPERTY_TYPE_LABEL, type PropertyType } from './property';

export const CATEGORIAS_DO_IMOVEL = ['unidade', 'empreendimento', 'lazer', 'adicionais'] as const;
export type CategoriaDoImovel = (typeof CATEGORIAS_DO_IMOVEL)[number];
/** As categorias com lista pronta; "adicionais" é só texto livre. */
export type CategoriaComLista = Exclude<CategoriaDoImovel, 'adicionais'>;
export const CATEGORIAS_COM_LISTA = ['unidade', 'empreendimento', 'lazer'] as const satisfies readonly CategoriaComLista[];

export interface ItemDoImovel {
  /** Vai para o banco. Estável: trocar um id exige migration (ver o cabeçalho). */
  id: string;
  rotulo: string;
  /**
   * Outros nomes do mesmo item ("Game room" para "Salão de jogos"). A busca do
   * CRM acha o item por eles, e quem digita um deles marca o quadradinho em vez
   * de criar texto livre repetido. Nunca aparecem no site.
   */
  sinonimos?: readonly string[];
}

/** Os subgrupos só organizam os quadradinhos do CRM; o site mostra a categoria como uma lista só. */
export interface GrupoDeItens {
  grupo: string;
  itens: readonly ItemDoImovel[];
}

// A lista em si mora em `caracteristicas-itens.ts`: é dado, e as regras abaixo
// só a leem. Fica reexportada daqui para `index.ts` continuar vendo o nome.
export { ITENS_DO_IMOVEL };

export interface MarcadosNaCategoria {
  itens?: string[];
  outros?: string[];
}
export type CaracteristicasDoImovel = Partial<Record<CategoriaDoImovel, MarcadosNaCategoria>>;

/** Tamanho máximo de um texto livre. O banco confere o mesmo (`caracteristicas_validas`). */
export const LIMITE_DO_TEXTO_LIVRE = 120;
/** Itens por lista, marcados ou digitados. O banco confere o mesmo. */
export const LIMITE_DE_ITENS = 300;

/**
 * O título da categoria. A da unidade é o tipo do imóvel ("Apartamento",
 * "Casa"): o que está dentro de uma casa não se chama "apartamento".
 */
export function tituloDaCategoria(categoria: CategoriaDoImovel, tipo?: PropertyType | null): string {
  switch (categoria) {
    case 'unidade':
      return tipo && tipo !== 'outro' ? PROPERTY_TYPE_LABEL[tipo] : 'Imóvel';
    case 'empreendimento':
      return 'Empreendimento';
    case 'lazer':
      return 'Área de lazer';
    case 'adicionais':
      return 'Informações adicionais';
  }
}

/**
 * Para comparar o que a pessoa digita com a lista: sem acento, sem caixa, e
 * hífen e pontuação viram espaço ("Ar condicionado" acha "Ar-condicionado").
 */
export function chaveDeBusca(texto: string): string {
  return texto
    .normalize('NFD')
    // As marcas que o NFD separa da letra (o site compila para ES2017, sem `\p{}`).
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** A chave sem espaço nenhum: "wifi" e "Wi-Fi", "ar condicionado" e "ar-condicionado" são o mesmo nome. */
function chaveCompacta(texto: string): string {
  return chaveDeBusca(texto).replace(/ /g, '');
}

const indice = new Map<CategoriaComLista, Map<string, ItemDoImovel>>();
function itensDa(categoria: CategoriaComLista): Map<string, ItemDoImovel> {
  let mapa = indice.get(categoria);
  if (!mapa) {
    mapa = new Map(ITENS_DO_IMOVEL[categoria].flatMap((g) => g.itens.map((item) => [item.id, item] as const)));
    indice.set(categoria, mapa);
  }
  return mapa;
}

/** Os nomes pelos quais o item é achado: o rótulo e os sinônimos, já como `chaveDeBusca`. */
export function nomesDoItem(item: ItemDoImovel): string[] {
  return [item.rotulo, ...(item.sinonimos ?? [])].map(chaveDeBusca);
}

/**
 * A busca do CRM: o item cujo rótulo ou sinônimo tem uma palavra que COMEÇA
 * com o que foi digitado. Pelo meio da palavra, "game" acharia "alongamento".
 * Sem espaço também vale: "wifi" acha "Wi-Fi nas áreas comuns".
 */
export function itemCombinaComBusca(item: ItemDoImovel, busca: string): boolean {
  const chave = chaveDeBusca(busca);
  if (!chave) return true;
  const compacta = chaveCompacta(busca);
  return nomesDoItem(item).some(
    (nome) => ` ${nome}`.includes(` ${chave}`) || nome.replace(/ /g, '').startsWith(compacta),
  );
}

/**
 * O item da lista com este nome, pelo rótulo ou por um sinônimo (sem olhar
 * acento nem caixa), para o texto digitado marcar o quadradinho.
 */
export function itemPeloTexto(categoria: CategoriaComLista, texto: string): ItemDoImovel | undefined {
  const chave = chaveCompacta(texto);
  if (!chave) return undefined;
  for (const item of itensDa(categoria).values()) {
    if (nomesDoItem(item).some((nome) => nome.replace(/ /g, '') === chave)) return item;
  }
  return undefined;
}

function ehCategoriaComLista(categoria: CategoriaDoImovel): categoria is CategoriaComLista {
  return categoria !== 'adicionais';
}

/**
 * Texto livre arrumado: espaços colapsados, sem vazio, sem repetido (sem olhar
 * acento, caixa, hífen nem pontuação). O corte no limite é por caractere, como
 * o `char_length` do banco: por unidade UTF-16 partiria um emoji ao meio, e o
 * banco recusaria o imóvel inteiro.
 */
function textosLivres(valor: unknown, ja: Set<string>): string[] {
  if (!Array.isArray(valor)) return [];
  const saida: string[] = [];
  for (const bruto of valor) {
    if (typeof bruto !== 'string') continue;
    const texto = Array.from(bruto.replace(/\s+/g, ' ').trim()).slice(0, LIMITE_DO_TEXTO_LIVRE).join('').trim();
    const chave = chaveCompacta(texto);
    if (!chave || ja.has(chave)) continue;
    ja.add(chave);
    saida.push(texto);
    if (saida.length >= LIMITE_DE_ITENS) break;
  }
  return saida;
}

function idsEscolhidos(categoria: CategoriaDoImovel, itens: unknown, ja: Set<string>): string[] {
  const ids: string[] = [];
  if (ehCategoriaComLista(categoria) && Array.isArray(itens)) {
    const escolhidos = new Set(itens.filter((id): id is string => typeof id === 'string'));
    for (const [id, item] of itensDa(categoria)) {
      if (!escolhidos.has(id)) continue;
      ids.push(id);
      for (const nome of nomesDoItem(item)) ja.add(nome.replace(/ /g, ''));
    }
  }
  return ids;
}

/**
 * O que veio do banco (ou do formulário) do jeito que o resto do código espera:
 * só categorias conhecidas, ids que existem na lista e na ordem dela, texto
 * livre limpo e sem repetir item da lista. Categoria vazia some.
 */
export function normalizarCaracteristicas(valor: unknown): CaracteristicasDoImovel {
  const saida: CaracteristicasDoImovel = {};
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return saida;
  const bruto = valor as Record<string, unknown>;

  for (const categoria of CATEGORIAS_DO_IMOVEL) {
    const marcados = bruto[categoria];
    if (!marcados || typeof marcados !== 'object' || Array.isArray(marcados)) continue;
    const { itens, outros } = marcados as Record<string, unknown>;

    // O texto livre que repete um item marcado (ou um sinônimo dele) não aparece duas vezes.
    const ja = new Set<string>();
    const ids = idsEscolhidos(categoria, itens, ja);
    const textos = textosLivres(outros, ja);

    const resultado: MarcadosNaCategoria = {};
    if (ids.length) resultado.itens = ids;
    if (textos.length) resultado.outros = textos;
    if (ids.length || textos.length) saida[categoria] = resultado;
  }
  return saida;
}

export interface CategoriaParaMostrar {
  categoria: CategoriaDoImovel;
  titulo: string;
  /** Os rótulos, na ordem da lista, e depois o texto livre. */
  itens: string[];
}

/** O que a página do imóvel (e a ficha do CRM) mostra: só as categorias com algo marcado. */
export function caracteristicasParaMostrar(
  caracteristicas: CaracteristicasDoImovel,
  tipo?: PropertyType | null,
): CategoriaParaMostrar[] {
  const limpas = normalizarCaracteristicas(caracteristicas);
  return CATEGORIAS_DO_IMOVEL.flatMap((categoria) => {
    const marcados = limpas[categoria];
    if (!marcados) return [];
    const rotulos = ehCategoriaComLista(categoria)
      ? (marcados.itens ?? []).map((id) => itensDa(categoria).get(id)?.rotulo ?? id)
      : [];
    return [{ categoria, titulo: tituloDaCategoria(categoria, tipo), itens: [...rotulos, ...(marcados.outros ?? [])] }];
  });
}

/** Quantos itens estão marcados ou digitados, somando as categorias. */
export function totalDeCaracteristicas(caracteristicas: CaracteristicasDoImovel): number {
  return Object.values(normalizarCaracteristicas(caracteristicas)).reduce(
    (soma, marcados) => soma + (marcados.itens?.length ?? 0) + (marcados.outros?.length ?? 0),
    0,
  );
}
