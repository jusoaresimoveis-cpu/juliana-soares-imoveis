/**
 * Onde a pessoa está, pelo que o telefone permite AFIRMAR.
 *
 * O CRM não sabe a cidade da maior parte dos leads: o WhatsApp não informa, a
 * landing não pergunta — de propósito, cada campo derruba conversão — e o
 * formulário da Meta só pergunta quando a campanha quis. O telefone, porém,
 * sempre diz alguma coisa, e diz com certeza:
 *
 *   - de fora do Brasil, o PAÍS;
 *   - do Brasil, o ESTADO e a região do DDD.
 *
 * E nunca a cidade. O 49 cobre de Chapecó a Lages; escrever "Chapecó" para
 * alguém de Lages seria dado inventado com cara de dado verdadeiro. Por isso
 * isto preenche uma coluna própria, "Região (pelo DDD) / País", e jamais a
 * coluna Cidade — que só recebe o que alguém informou.
 */

/**
 * Os 67 DDDs do Brasil: estado e a região que o código cobre.
 *
 * Estado com um DDD só diz "todo o estado", que é a afirmação exata. Nos
 * outros, "região de" seguido das cidades-polo: é como se localiza um DDD em
 * voz alta, e não promete que a pessoa mora no polo.
 */
const DDD: Record<string, readonly [uf: string, regiao: string]> = {
  '11': ['SP', 'região de São Paulo'],
  '12': ['SP', 'região de São José dos Campos'],
  '13': ['SP', 'região de Santos'],
  '14': ['SP', 'região de Bauru e Marília'],
  '15': ['SP', 'região de Sorocaba'],
  '16': ['SP', 'região de Ribeirão Preto'],
  '17': ['SP', 'região de São José do Rio Preto'],
  '18': ['SP', 'região de Presidente Prudente'],
  '19': ['SP', 'região de Campinas'],
  '21': ['RJ', 'região do Rio de Janeiro'],
  '22': ['RJ', 'região de Campos e Macaé'],
  '24': ['RJ', 'região de Petrópolis e Volta Redonda'],
  '27': ['ES', 'região de Vitória'],
  '28': ['ES', 'região de Cachoeiro de Itapemirim'],
  '31': ['MG', 'região de Belo Horizonte'],
  '32': ['MG', 'região de Juiz de Fora'],
  '33': ['MG', 'região de Governador Valadares'],
  '34': ['MG', 'região de Uberlândia e Uberaba'],
  '35': ['MG', 'região de Poços de Caldas e Varginha'],
  '37': ['MG', 'região de Divinópolis'],
  '38': ['MG', 'região de Montes Claros'],
  '41': ['PR', 'região de Curitiba'],
  '42': ['PR', 'região de Ponta Grossa e Guarapuava'],
  '43': ['PR', 'região de Londrina'],
  '44': ['PR', 'região de Maringá'],
  '45': ['PR', 'região de Cascavel e Foz do Iguaçu'],
  '46': ['PR', 'região de Francisco Beltrão e Pato Branco'],
  '47': ['SC', 'região de Joinville, Blumenau e Itajaí'],
  '48': ['SC', 'região de Florianópolis e Criciúma'],
  '49': ['SC', 'região de Chapecó e Lages'],
  '51': ['RS', 'região de Porto Alegre'],
  '53': ['RS', 'região de Pelotas'],
  '54': ['RS', 'região de Caxias do Sul e Passo Fundo'],
  '55': ['RS', 'região de Santa Maria e Uruguaiana'],
  '61': ['DF', 'região de Brasília'],
  '62': ['GO', 'região de Goiânia'],
  '63': ['TO', 'todo o estado'],
  '64': ['GO', 'região de Rio Verde e Itumbiara'],
  '65': ['MT', 'região de Cuiabá'],
  '66': ['MT', 'região de Rondonópolis e Sinop'],
  '67': ['MS', 'todo o estado'],
  '68': ['AC', 'todo o estado'],
  '69': ['RO', 'todo o estado'],
  '71': ['BA', 'região de Salvador'],
  '73': ['BA', 'região de Ilhéus e Porto Seguro'],
  '74': ['BA', 'região de Juazeiro'],
  '75': ['BA', 'região de Feira de Santana'],
  '77': ['BA', 'região de Vitória da Conquista e Barreiras'],
  '79': ['SE', 'todo o estado'],
  '81': ['PE', 'região de Recife'],
  '82': ['AL', 'todo o estado'],
  '83': ['PB', 'todo o estado'],
  '84': ['RN', 'todo o estado'],
  '85': ['CE', 'região de Fortaleza'],
  '86': ['PI', 'região de Teresina'],
  '87': ['PE', 'região de Petrolina e Garanhuns'],
  '88': ['CE', 'região de Juazeiro do Norte e Sobral'],
  '89': ['PI', 'região de Picos e Floriano'],
  '91': ['PA', 'região de Belém'],
  '92': ['AM', 'região de Manaus'],
  '93': ['PA', 'região de Santarém'],
  '94': ['PA', 'região de Marabá'],
  '95': ['RR', 'todo o estado'],
  '96': ['AP', 'todo o estado'],
  '97': ['AM', 'interior do estado'],
  '98': ['MA', 'região de São Luís'],
  '99': ['MA', 'região de Imperatriz'],
};

/** Só para o teste conferir que a tabela está inteira. */
export const DDDS_DO_BRASIL = Object.keys(DDD);
export const UFS_DOS_DDDS = [...new Set(Object.values(DDD).map(([uf]) => uf))];

function nomeDoPais(codigo: string): string {
  try {
    return new Intl.DisplayNames(['pt-BR'], { type: 'region' }).of(codigo) ?? codigo;
  } catch {
    return codigo;
  }
}

/**
 * Código de discagem → país.
 *
 * Existe por causa da primeira exportação real: nove leads da campanha da
 * Bolívia chegaram com número +591 e o país gravado como BR. O cadastro errava;
 * o número, não. A coluna se chama "pelo telefone", então quem manda é o
 * número — o país gravado só entra quando o código não está aqui.
 *
 * Não é a tabela do mundo: são as Américas, onde a imobiliária anuncia, e os
 * países de onde costuma vir comprador de litoral. Código fora da lista cai no
 * país gravado e, sem ele, em "Fora do Brasil".
 */
export const DISCAGEM: Record<string, string> = {
  '7': 'RU',
  '27': 'ZA',
  '31': 'NL',
  '32': 'BE',
  '33': 'FR',
  '34': 'ES',
  '39': 'IT',
  '41': 'CH',
  '44': 'GB',
  '49': 'DE',
  '51': 'PE',
  '52': 'MX',
  '53': 'CU',
  '54': 'AR',
  '56': 'CL',
  '57': 'CO',
  '58': 'VE',
  '61': 'AU',
  '81': 'JP',
  '86': 'CN',
  '351': 'PT',
  '353': 'IE',
  '591': 'BO',
  '592': 'GY',
  '593': 'EC',
  '594': 'GF',
  '595': 'PY',
  '597': 'SR',
  '598': 'UY',
  '971': 'AE',
  '972': 'IL',
};

/**
 * A tabela acima mais os dois códigos que faltam nela: o +55 e o +1.
 *
 * `DISCAGEM` existe para NOMEAR a origem de quem vem de FORA — o Brasil não
 * está lá porque `regiaoDoTelefone` resolve o +55 antes, pelo DDD, e diz o
 * estado. E o +1 é "EUA ou Canadá": o código não separa os dois, e afirmar um
 * seria inventar.
 *
 * `phone_country` precisa de uma sigla para cada um. Brasil é BR; para o +1 a
 * escolha é os Estados Unidos, de onde vem quem compra imóvel de litoral.
 */
export const DISCAGEM_DO_PAIS: Record<string, string> = { ...DISCAGEM, '1': 'US', '55': 'BR' };

/**
 * A sigla de quem o código de discagem não nomeia.
 *
 * É a sigla que a ISO reserva para "desconhecido", e ela existe aqui porque a
 * alternativa era pior: `cc_from_e164` devolvia **'BR' para todo número que não
 * reconhecia**, e foi assim que nove bolivianos entraram no CRM como
 * brasileiros. Mentir sobre o país é pior do que dizer que não se sabe.
 */
export const PAIS_DESCONHECIDO = 'ZZ';

/** As siglas que `phone_country` pode ter, com o nome que a tela mostra. */
export const PAISES_DO_TELEFONE: readonly { codigo: string; nome: string }[] = [
  ...[...new Set(Object.values(DISCAGEM_DO_PAIS))]
    .map((codigo) => ({ codigo, nome: nomeDoPais(codigo) }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
  { codigo: PAIS_DESCONHECIDO, nome: 'Não identificado' },
];

/**
 * A sigla do país pelo código de discagem — a mesma regra que `cc_from_e164`
 * aplica no banco, e o teste compara as duas.
 *
 * Do mais longo para o mais curto, porque +591 é Bolívia e "59" não é nada.
 */
export function paisDoTelefone(e164: string | null | undefined): string {
  const telefone = (e164 ?? '').replace(/\s/g, '');
  if (!telefone.startsWith('+')) return PAIS_DESCONHECIDO;
  const digitos = telefone.slice(1);
  for (const tamanho of [3, 2, 1]) {
    const iso = DISCAGEM_DO_PAIS[digitos.slice(0, tamanho)];
    if (iso) return iso;
  }
  return PAIS_DESCONHECIDO;
}

function paisPelaDiscagem(telefone: string): string | null {
  if (!telefone.startsWith('+')) return null;
  const digitos = telefone.slice(1);
  // +1 é EUA, Canadá e boa parte do Caribe no mesmo código. Escolher um
  // seria afirmar o que o número não diz.
  if (digitos.startsWith('1')) return 'EUA ou Canadá';
  // Do mais longo para o mais curto: +591 é Bolívia, e "59" sozinho não é nada.
  for (const tamanho of [3, 2, 1]) {
    const iso = DISCAGEM[digitos.slice(0, tamanho)];
    if (iso) return nomeDoPais(iso);
  }
  return null;
}

/**
 * "SC · região de Chapecó e Lages", "Bolívia" — ou nulo quando não há telefone.
 *
 * O número decide. `pais` (o `phone_country` do lead) só serve quando o código
 * de discagem não é reconhecido — e sozinho, sem número, não afirma nada.
 */
export function regiaoDoTelefone(e164: string | null | undefined, pais?: string | null): string | null {
  const telefone = (e164 ?? '').replace(/\s/g, '');

  if (telefone.startsWith('+55')) {
    const achado = DDD[telefone.slice(3, 5)];
    return achado ? `${achado[0]} · ${achado[1]}` : 'Brasil';
  }

  const pelaDiscagem = paisPelaDiscagem(telefone);
  if (pelaDiscagem) return pelaDiscagem;

  const codigo = (pais ?? '').trim().toUpperCase();
  if (codigo && codigo !== 'BR') return nomeDoPais(codigo);
  if (telefone.startsWith('+')) return 'Fora do Brasil';
  return null;
}
