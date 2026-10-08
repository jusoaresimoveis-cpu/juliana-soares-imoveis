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

/*
 * A lista saiu da pesquisa do usuário em portais (08/10/2026), curada: sem
 * sinônimo lado a lado (eles viram `sinonimos`), sem o que todo imóvel tem e
 * sem repetir o que o cadastro já tem em campo próprio (quartos, suítes,
 * banheiros, vagas, área). O que faltar, a corretora digita no campo livre.
 * Itens próprios da região: Frente mar, Quadra mar, Box de praia.
 */
export const ITENS_DO_IMOVEL: Record<CategoriaComLista, readonly GrupoDeItens[]> = {
  unidade: [
    {
      grupo: 'Posição e vista',
      itens: [
        { id: 'frente_mar', rotulo: 'Frente mar' },
        { id: 'quadra_mar', rotulo: 'Quadra mar' },
        { id: 'vista_mar', rotulo: 'Vista para o mar' },
        { id: 'vista_mar_parcial', rotulo: 'Vista parcial para o mar' },
        { id: 'vista_panoramica', rotulo: 'Vista panorâmica' },
        { id: 'face_norte', rotulo: 'Face norte' },
        { id: 'sol_manha', rotulo: 'Sol da manhã', sinonimos: ['Face leste'] },
      ],
    },
    {
      grupo: 'Planta e acesso',
      itens: [
        { id: 'duplex', rotulo: 'Duplex' },
        { id: 'pe_direito_duplo', rotulo: 'Pé-direito duplo' },
        { id: 'hall_privativo', rotulo: 'Hall privativo' },
        { id: 'elevador_privativo', rotulo: 'Elevador privativo' },
      ],
    },
    {
      grupo: 'Ambientes',
      itens: [
        { id: 'sala_tv', rotulo: 'Sala de TV', sinonimos: ['Sala íntima'] },
        { id: 'escritorio', rotulo: 'Escritório', sinonimos: ['Home office'] },
        { id: 'cozinha_americana', rotulo: 'Cozinha americana', sinonimos: ['Cozinha integrada'] },
        { id: 'cozinha_ilha', rotulo: 'Cozinha com ilha', sinonimos: ['Ilha'] },
        { id: 'adega', rotulo: 'Adega' },
        { id: 'dependencia_servico', rotulo: 'Dependência de serviço', sinonimos: ['Dependência de empregada', 'Quarto de serviço'] },
      ],
    },
    {
      grupo: 'Quartos e banheiros',
      itens: [
        { id: 'suite_master', rotulo: 'Suíte master' },
        { id: 'demi_suite', rotulo: 'Demi-suíte' },
        { id: 'closet', rotulo: 'Closet' },
        { id: 'lavabo', rotulo: 'Lavabo' },
        { id: 'banheira', rotulo: 'Banheira', sinonimos: ['Banheira na suíte'] },
        { id: 'hidromassagem', rotulo: 'Hidromassagem' },
      ],
    },
    {
      grupo: 'Sacada e churrasqueira',
      itens: [
        { id: 'sacada', rotulo: 'Sacada', sinonimos: ['Varanda'] },
        { id: 'varanda_gourmet', rotulo: 'Sacada gourmet', sinonimos: ['Varanda gourmet'] },
        { id: 'sacada_integrada', rotulo: 'Sacada integrada à sala', sinonimos: ['Varanda integrada', 'Varanda integrada à sala'] },
        { id: 'sacada_envidracada', rotulo: 'Sacada com fechamento em vidro', sinonimos: ['Fechamento de varanda', 'Fechamento em vidro', 'Cortina de vidro'] },
        { id: 'churrasqueira_carvao', rotulo: 'Churrasqueira a carvão' },
        { id: 'churrasqueira_gas', rotulo: 'Churrasqueira a gás' },
        { id: 'churrasqueira_eletrica', rotulo: 'Churrasqueira elétrica' },
      ],
    },
    {
      grupo: 'Área externa privativa',
      itens: [
        { id: 'terraco', rotulo: 'Terraço', sinonimos: ['Terraço privativo'] },
        { id: 'jardim_privativo', rotulo: 'Jardim privativo', sinonimos: ['Garden'] },
        { id: 'quintal', rotulo: 'Quintal' },
        { id: 'espaco_gourmet', rotulo: 'Espaço gourmet' },
        { id: 'edicula', rotulo: 'Edícula' },
        { id: 'piscina_privativa', rotulo: 'Piscina privativa' },
      ],
    },
    {
      grupo: 'Acabamentos',
      itens: [
        { id: 'piso_porcelanato', rotulo: 'Piso porcelanato' },
        { id: 'piso_laminado', rotulo: 'Piso laminado' },
        { id: 'piso_vinilico', rotulo: 'Piso vinílico' },
        { id: 'piso_madeira', rotulo: 'Piso de madeira' },
        { id: 'acabamento_gesso', rotulo: 'Acabamento em gesso', sinonimos: ['Rebaixamento em gesso', 'Teto em gesso'] },
        { id: 'isolamento_acustico', rotulo: 'Isolamento acústico' },
      ],
    },
    {
      grupo: 'Conforto e tecnologia',
      itens: [
        { id: 'ar_condicionado', rotulo: 'Ar-condicionado' },
        { id: 'infra_ar_condicionado', rotulo: 'Infraestrutura para ar-condicionado' },
        { id: 'aquecimento_gas', rotulo: 'Aquecimento a gás', sinonimos: ['Aquecedor a gás'] },
        { id: 'aquecimento_solar', rotulo: 'Aquecimento solar' },
        { id: 'energia_solar', rotulo: 'Energia solar' },
        { id: 'automacao', rotulo: 'Automação residencial', sinonimos: ['Casa inteligente'] },
        { id: 'fechadura_eletronica', rotulo: 'Fechadura eletrônica' },
      ],
    },
    {
      grupo: 'Segurança da casa',
      itens: [
        { id: 'portao_eletronico', rotulo: 'Portão eletrônico', sinonimos: ['Portão automático'] },
        { id: 'alarme', rotulo: 'Alarme' },
        { id: 'cerca_eletrica', rotulo: 'Cerca elétrica' },
        { id: 'cameras_seguranca', rotulo: 'Câmeras de segurança' },
      ],
    },
    {
      grupo: 'Vaga e depósito',
      itens: [
        { id: 'vaga_coberta', rotulo: 'Vaga coberta' },
        { id: 'vaga_privativa', rotulo: 'Vaga privativa' },
        { id: 'vaga_independente', rotulo: 'Vaga independente', sinonimos: ['Vaga livre'] },
        { id: 'vaga_carro_eletrico', rotulo: 'Vaga preparada para carro elétrico', sinonimos: ['Vaga para carro elétrico', 'Vaga com carregador elétrico', 'Infraestrutura para carro elétrico'] },
        { id: 'deposito_privativo', rotulo: 'Depósito privativo', sinonimos: ['Box privativo', 'Hobby box'] },
      ],
    },
    {
      grupo: 'Mobília e condições',
      itens: [
        { id: 'mobiliado', rotulo: 'Mobiliado' },
        { id: 'semimobiliado', rotulo: 'Semimobiliado' },
        { id: 'decorado', rotulo: 'Decorado' },
        { id: 'reformado', rotulo: 'Reformado', sinonimos: ['Recém-reformado'] },
        { id: 'nunca_habitado', rotulo: 'Nunca habitado' },
        { id: 'aceita_pet', rotulo: 'Aceita pet' },
      ],
    },
  ],
  empreendimento: [
    {
      grupo: 'Portaria e segurança',
      itens: [
        { id: 'portaria_24h', rotulo: 'Portaria 24 horas' },
        { id: 'portaria_remota', rotulo: 'Portaria remota', sinonimos: ['Portaria eletrônica'] },
        { id: 'interfone', rotulo: 'Interfone', sinonimos: ['Porteiro eletrônico', 'Videoporteiro'] },
        { id: 'portao_eletronico', rotulo: 'Portão eletrônico', sinonimos: ['Portão automático'] },
        { id: 'clausura', rotulo: 'Clausura na entrada', sinonimos: ['Clausura de veículos', 'Clausura de pedestres', 'Portão duplo'] },
        { id: 'acesso_biometrico', rotulo: 'Controle de acesso por biometria', sinonimos: ['Controle de acesso por reconhecimento facial'] },
        { id: 'cameras_seguranca', rotulo: 'Câmeras de segurança', sinonimos: ['Circuito interno de TV'] },
        { id: 'monitoramento_24h', rotulo: 'Monitoramento 24 horas' },
        { id: 'seguranca_24h', rotulo: 'Segurança 24 horas', sinonimos: ['Vigilância 24 horas'] },
        { id: 'cerca_eletrica', rotulo: 'Cerca elétrica' },
      ],
    },
    {
      grupo: 'Estrutura do prédio',
      itens: [
        { id: 'elevador', rotulo: 'Elevador', sinonimos: ['Elevador social'] },
        { id: 'elevador_servico', rotulo: 'Elevador de serviço' },
        { id: 'hall_decorado', rotulo: 'Hall decorado' },
        { id: 'gerador', rotulo: 'Gerador', sinonimos: ['Gerador de emergência'] },
        { id: 'acessibilidade', rotulo: 'Acessibilidade para PCD', sinonimos: ['Condomínio acessível', 'Acesso PCD'] },
      ],
    },
    {
      grupo: 'Água, energia e gás',
      itens: [
        { id: 'energia_solar', rotulo: 'Energia solar', sinonimos: ['Painéis solares'] },
        { id: 'gas_central', rotulo: 'Gás central', sinonimos: ['Central de gás', 'Gás encanado', 'Rede de gás'] },
        { id: 'gas_individual', rotulo: 'Gás individualizado', sinonimos: ['Medição individual de gás', 'Medidor individual de gás'] },
        { id: 'hidrometro_individual', rotulo: 'Hidrômetro individual', sinonimos: ['Medição individual de água'] },
        { id: 'reuso_agua', rotulo: 'Reuso de água', sinonimos: ['Captação de água da chuva', 'Sistema de reaproveitamento de água'] },
      ],
    },
    {
      grupo: 'Garagem e mobilidade',
      itens: [
        { id: 'box_praia', rotulo: 'Box de praia' },
        { id: 'estacionamento_visitantes', rotulo: 'Estacionamento para visitantes', sinonimos: ['Vagas para visitantes'] },
        { id: 'bicicletario', rotulo: 'Bicicletário', sinonimos: ['Bicicletário coberto'] },
        { id: 'carregador_carro_eletrico', rotulo: 'Carregador para carro elétrico', sinonimos: ['Carregador para veículos elétricos', 'Carregador de carro elétrico'] },
        { id: 'lava_car', rotulo: 'Lava-car', sinonimos: ['Lavagem de carros', 'Car Wash'] },
      ],
    },
    {
      grupo: 'Serviços',
      itens: [
        { id: 'coworking', rotulo: 'Coworking' },
        { id: 'minimercado', rotulo: 'Minimercado', sinonimos: ['Mercado autônomo', 'Loja de conveniência'] },
        { id: 'espaco_delivery', rotulo: 'Espaço delivery', sinonimos: ['Delivery room', 'Guarda-entregas', 'Armários inteligentes', 'Lockers', 'Espaço para encomendas'] },
        { id: 'lavanderia_compartilhada', rotulo: 'Lavanderia compartilhada' },
        { id: 'pet_care', rotulo: 'Pet care' },
        { id: 'wifi_areas_comuns', rotulo: 'Wi-Fi nas áreas comuns', sinonimos: ['Internet nas áreas comuns'] },
      ],
    },
  ],
  lazer: [
    {
      grupo: 'Piscinas',
      itens: [
        { id: 'piscina', rotulo: 'Piscina', sinonimos: ['Piscina adulto'] },
        { id: 'piscina_infantil', rotulo: 'Piscina infantil' },
        { id: 'piscina_aquecida', rotulo: 'Piscina aquecida', sinonimos: ['Piscina climatizada'] },
        { id: 'piscina_coberta', rotulo: 'Piscina coberta' },
        { id: 'piscina_borda_infinita', rotulo: 'Piscina com borda infinita' },
        { id: 'piscina_raia', rotulo: 'Piscina com raia', sinonimos: ['Piscina semiolímpica'] },
        { id: 'solarium', rotulo: 'Solarium' },
      ],
    },
    {
      grupo: 'Festas e gastronomia',
      itens: [
        { id: 'salao_festas', rotulo: 'Salão de festas', sinonimos: ['Salão de festas adulto', 'Salão de festas infantil', 'Salão de festas temático', 'Espaço para eventos'] },
        { id: 'espaco_gourmet', rotulo: 'Espaço gourmet', sinonimos: ['Espaço gourmet externo', 'Espaço gourmet interno'] },
        { id: 'churrasqueira', rotulo: 'Churrasqueira', sinonimos: ['Churrasqueira a carvão', 'Churrasqueira a gás', 'Churrasqueira elétrica'] },
        { id: 'quiosque', rotulo: 'Quiosque', sinonimos: ['Quiosque com churrasqueira'] },
        { id: 'forno_pizza', rotulo: 'Forno de pizza', sinonimos: ['Pizzaria'] },
        { id: 'pub', rotulo: 'Pub', sinonimos: ['Bar'] },
        { id: 'adega', rotulo: 'Adega' },
      ],
    },
    {
      grupo: 'Crianças e entretenimento',
      itens: [
        { id: 'playground', rotulo: 'Playground', sinonimos: ['Playground externo', 'Playground coberto', 'Parquinho', 'Jogos infantis'] },
        { id: 'brinquedoteca', rotulo: 'Brinquedoteca', sinonimos: ['Espaço kids', 'Espaço infantil', 'Espaço baby'] },
        { id: 'salao_jogos', rotulo: 'Salão de jogos', sinonimos: ['Sala de jogos', 'Game room', 'Sala de sinuca'] },
        { id: 'cinema', rotulo: 'Sala de cinema', sinonimos: ['Cinema'] },
      ],
    },
    {
      grupo: 'Esportes',
      itens: [
        { id: 'academia', rotulo: 'Academia', sinonimos: ['Academia equipada', 'Fitness', 'Espaço fitness', 'Sala de ginástica', 'Studio fitness'] },
        { id: 'quadra', rotulo: 'Quadra poliesportiva' },
        { id: 'quadra_areia', rotulo: 'Quadra de areia', sinonimos: ['Beach tennis', 'Quadra de beach tennis', 'Quadra de vôlei de praia'] },
        { id: 'quadra_tenis', rotulo: 'Quadra de tênis' },
        { id: 'campo_futebol', rotulo: 'Campo de futebol', sinonimos: ['Futebol society'] },
        { id: 'pista_caminhada', rotulo: 'Pista de caminhada', sinonimos: ['Pista de cooper', 'Pista de corrida'] },
      ],
    },
    {
      grupo: 'Bem-estar',
      itens: [
        { id: 'sauna', rotulo: 'Sauna', sinonimos: ['Sauna seca', 'Sauna úmida', 'Sauna a vapor'] },
        { id: 'hidromassagem', rotulo: 'Hidromassagem', sinonimos: ['Piscina de hidromassagem', 'Jacuzzi', 'Ofurô'] },
        { id: 'sala_massagem', rotulo: 'Sala de massagem' },
        { id: 'sala_pilates', rotulo: 'Sala de pilates', sinonimos: ['Studio de pilates', 'Pilates'] },
        { id: 'sala_yoga', rotulo: 'Sala de yoga', sinonimos: ['Studio de yoga', 'Yoga'] },
      ],
    },
    {
      grupo: 'Ar livre e pet',
      itens: [
        { id: 'rooftop', rotulo: 'Rooftop', sinonimos: ['Sky lounge'] },
        { id: 'area_verde', rotulo: 'Área verde', sinonimos: ['Jardim', 'Parque', 'Bosque'] },
        { id: 'pet_place', rotulo: 'Pet place', sinonimos: ['Espaço pet', 'Playground pet', 'Área para cães', 'Área de recreação pet'] },
        { id: 'beach_club', rotulo: 'Beach club' },
      ],
    },
  ],
};

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

    const ids: string[] = [];
    // O texto livre que repete um item marcado (ou um sinônimo dele) não aparece duas vezes.
    const ja = new Set<string>();
    if (ehCategoriaComLista(categoria) && Array.isArray(itens)) {
      const escolhidos = new Set(itens.filter((id): id is string => typeof id === 'string'));
      for (const [id, item] of itensDa(categoria)) {
        if (!escolhidos.has(id)) continue;
        ids.push(id);
        for (const nome of nomesDoItem(item)) ja.add(nome.replace(/ /g, ''));
      }
    }
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
