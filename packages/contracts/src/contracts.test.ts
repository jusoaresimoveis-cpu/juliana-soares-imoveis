import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_STAGES,
  LOCALES,
  VARIANTS,
  EVENT_TYPES,
  LEAD_SOURCES,
  LOSS_REASONS,
  PROPERTY_TYPES,
  PROPERTY_PURPOSES,
  PROPERTY_STATUSES,
  MEDIA_KINDS,
  ATTRIBUTION_METHODS,
  negotiateLocale,
  parseRefCode,
  buildRefCode,
  VISIT_STATUSES,
  VISIT_BLOCKING_STATUSES,
  VISIT_CLOSED_STATUSES,
  MAX_VISIT_HOURS,
  APP_ROLES, atendeLead, papelPrincipal,
  NOTIFICATION_TYPES, NOTIFICATION_META, NOTIFICATION_SOUNDS, isNotificationType,
  LEAD_SCOPES, podeUsarAlcance, alcancesDisponiveis,
  REMINDER_STATUSES,
  WA_INSTANCE_STATUSES, WA_INSTANCE_META, WA_STATUSES_OPERANTES,
  telefoneDoJid, ehIdentificadorAnonimo, podeEnviar,
  META_HEALTH, META_HEALTH_META, META_INBOX_STATUSES, META_SYNC_KINDS,
  META_SYNC_STATUSES, META_AD_LEVELS, GRAPH_VERSION,
  gastoParaMenor, custoPorLead, telefoneE164, idDaMeta, saudeDoErro,
  mensagemDoErro, META_ERROS_DE_TOKEN, META_ERROS_DE_PERMISSAO, META_ERROS_DE_LIMITE,
  tipoDeResultado, resultadoDaLinha, custoPorResultado,
  MERCADOS, MERCADO_CODES, localeDoMercado, areaNoMercado, caminhoDaPagina,
  PAYMENT_METHODS, resumoDoPlano, precoDeTabela,
  ANGULOS, LAYOUTS, CTA_KINDS, ANGULO_META, LAYOUT_META, CTA_META,
  ANGULOS_DE_CRIATIVO, ANGULO_DE_CRIATIVO_META,
  VARIANTES_GERADAS, MIN_VISITAS_CONFIAVEL, conversaoDaVariante,
  META_ENTREGAS, META_ENTREGA_META, entregaDoStatus, estaEntregando,
} from './index';
import { dimensoesDe, type Linha } from '../../../supabase/functions/meta-insights/dimensoes';
import { resultadosDe } from '../../../supabase/functions/meta-insights/resultados';
import { BORDAS_DE_ENTREGA, entregaDe } from '../../../supabase/functions/meta-insights/entrega';
import {
  colunasDaTabela,
  definicaoDaFuncao,
  definicaoDaRestricao,
  definicaoDoGatilho,
  definicaoDoIndice,
  literais,
  privilegiosNaTabela,
  restricoesDaTabela,
  semComentarios,
  tabelasVigentes,
  todasAsMigracoes,
  valoresDoCheck as valoresDoCheckAtual,
  valoresDoEnum,
} from '../../../supabase/testes/esquema';

/*
 * O CHECK como ele está HOJE, e não como nasceu.
 *
 * Uma versão antiga destes testes lia um arquivo fixo — o que criou a tabela.
 * Funcionou até a primeira constraint ser redefinida numa migração posterior: a
 * de origens do lead ganhou `link_bio`, `facebook` e `placa` na 030, e o teste
 * continuou conferindo o contrato contra a lista de 003. Isso é pior do que
 * falhar: comparando duas listas antigas e idênticas, passaria verde sem
 * verificar nada do que está no banco.
 *
 * `valoresDoCheckAtual` (de `supabase/testes/esquema`) lê a ÚLTIMA definição de
 * cada restrição, na forma escrita à mão (`in (...)`) ou na do pg_dump (`= ANY
 * (ARRAY[...])`), e só o que está dentro da lista.
 */

/** A definição vigente de uma função, sem comentário. */
const funcao = (nome: string) => semComentarios(definicaoDaFuncao(nome).texto);

/**
 * O terceiro argumento de uma chamada, quando ele é literal.
 *
 * Anda caractere a caractere contando parênteses e respeitando aspas, porque
 * regex não separa argumento de chamada aninhada: o terceiro argumento de
 * `create_notification` vem depois de um `array(select ...)` cheio de vírgulas
 * e de parênteses, e qualquer `split(',')` erraria o alvo em silêncio.
 *
 * Devolve `null` quando o argumento não é um literal simples — variável ou
 * expressão não dá para conferir sem executar.
 */
function terceiroArgumento(texto: string, inicio: number): string | null {
  const args: string[] = [];
  let atual = '';
  let profundidade = 0;
  let aspas = false;

  for (let i = inicio; i < texto.length; i++) {
    const c = texto[i]!;
    if (aspas) {
      atual += c;
      if (c === "'") aspas = false;
      continue;
    }
    if (c === "'") { aspas = true; atual += c; continue; }
    if (c === '(' || c === '[') { profundidade++; atual += c; continue; }
    if (c === ')' && profundidade === 0) { args.push(atual); break; }
    if (c === ')' || c === ']') { profundidade--; atual += c; continue; }
    if (c === ',' && profundidade === 0) {
      args.push(atual);
      if (args.length === 3) break;
      atual = '';
      continue;
    }
    atual += c;
  }

  const terceiro = args[2]?.trim() ?? '';
  return /^'([a-z_]+)'$/.test(terceiro) ? terceiro.slice(1, -1) : null;
}

/*
 * O `muted_types` é um CHECK escrito como `<@ array[...]`, e não `in (...)`.
 *
 * O teste dele já leu direto o arquivo da 005 — e por isso NÃO enxergava
 * redefinição posterior. Quando a 074 acrescentou um tipo novo, o CHECK do banco
 * e o dicionário passaram a bater e o teste reprovou mesmo assim, apontando para
 * um arquivo de dois meses atrás. Um teste de contrato que só lê a primeira
 * versão do contrato não testa contrato nenhum: ele testa história.
 * `valoresDoCheckAtual` lê as duas formas, na última definição.
 */

/**
 * Este teste existe para quebrar de propósito.
 *
 * O dicionário canônico só vale se o banco repetir os mesmos valores. Numa
 * revisão do desenho, frentes paralelas produziram `variant`, `variant_key`,
 * `ab_variant` e `variant` maiúsculo para a mesma coisa — a consulta que fecha
 * gasto → template → lead retornaria zero para sempre, em silêncio.
 *
 * Se alguém renomear uma etapa no SQL e esquecer do TypeScript (ou o
 * contrário), o CI para aqui.
 */

describe('dicionário canônico ↔ banco', () => {
  it('as etapas semeadas são exatamente as do contrato, na mesma ordem', () => {
    /*
     * Etapa de funil é dado de cliente, e dado de cliente não entra em
     * migration: a base não semeia organização nem etapa. Elas moram no seed
     * de cada cliente, em `supabase/seeds` — e cada seed tem de repetir o
     * contrato, que é de onde a tela tira o que cada coluna significa.
     */
    const pasta = join(__dirname, '../../../supabase/seeds');
    const seeds = readdirSync(pasta).filter((f) => f.endsWith('.sql'));
    expect(seeds.length, 'nenhum seed de cliente em supabase/seeds').toBeGreaterThan(0);

    for (const arquivo of seeds) {
      const seed = readFileSync(join(pasta, arquivo), 'utf8');
      const noSql = [...seed.matchAll(/^\s*\('([a-z_]+)',\s*'[^']+',\s*(\d+),/gm)].map((m) => ({
        key: m[1],
        position: Number(m[2]),
      }));

      expect(noSql.length, `${arquivo}: nenhuma etapa encontrada — o regex ou o SQL mudou`).toBeGreaterThan(0);
      expect(noSql.map((s) => s.key), arquivo).toEqual(DEFAULT_STAGES.map((s) => s.key));
      expect(noSql.map((s) => s.position), arquivo).toEqual(DEFAULT_STAGES.map((s) => s.position));
    }
  });

  it('a visita vem antes da proposta', () => {
    const pos = (key: string) => DEFAULT_STAGES.find((s) => s.key === key)?.position ?? 0;
    // Os dois CRMs de referência invertem isso, e por causa disso toda
    // conversão etapa-a-etapa mente: quem está em negociação nunca conta
    // como tendo visitado.
    expect(pos('visita_agendada')).toBeLessThan(pos('proposta'));
    expect(pos('visita_realizada')).toBeLessThan(pos('proposta'));
  });

  it('os idiomas do contrato são os aceitos pelo CHECK da organização', () => {
    expect(valoresDoCheckAtual('organizations_default_locale_ck')).toEqual([...LOCALES].sort());
  });

  it('exatamente uma etapa de ganho e uma de perda', () => {
    expect(DEFAULT_STAGES.filter((s) => s.isWon)).toHaveLength(1);
    expect(DEFAULT_STAGES.filter((s) => s.isLost)).toHaveLength(1);
  });
});

describe('mercados de anúncio', () => {
  it('a lista do contrato é a que o banco aceita', () => {
    expect(valoresDoCheckAtual('landing_pages_market_ck')).toEqual([...MERCADO_CODES].sort());
  });

  it('todo mercado escreve num idioma que existe', () => {
    // Um mercado apontando para idioma fora de LOCALES faria o `hreflang` sair
    // com uma tag que buscador nenhum reconhece.
    for (const m of MERCADOS) {
      expect(LOCALES as readonly string[], m.code).toContain(m.locale);
    }
  });

  it('a derivação idioma←mercado é a MESMA no banco e no contrato', () => {
    /*
     * Ela existe nos dois lados: aqui, para a tela; e dentro de `landing_gerar`,
     * porque deixar a tela mandar os dois permitiria uma página marcada como
     * "Estados Unidos" escrita em português — e o `hreflang` diria inglês para
     * um texto em português, que é pior do que não ter hreflang nenhum.
     *
     * Divergir seria invisível: a página nasce, abre e mente para o buscador.
     */
    const doSql = [...funcao('landing_gerar').matchAll(/when '([a-z]{2})' then '([\w-]+)'/g)].map((m) => ({
      code: m[1],
      locale: m[2],
    }));
    expect(doSql.length, 'derivação não encontrada em landing_gerar').toBe(MERCADOS.length);
    for (const linha of doSql) {
      expect(localeDoMercado(linha.code!), linha.code).toBe(linha.locale);
    }
  });

  it('mercado é dimensão, não braço do experimento', () => {
    /*
     * O placar precisa filtrar por mercado SEMPRE. Sem isso ele somaria a
     * variante A da Argentina com a A dos Estados Unidos — dois públicos com
     * orçamento, moeda e motivo de compra diferentes — e o vencedor seria o
     * mercado com mais verba, creditado ao desenho da página.
     */
    expect(funcao('landing_placar')).toContain('p.market = _mercado');
    // E a chave única precisa conter o mercado, senão criar a página da
    // Argentina apagaria a do Brasil pelo `on conflict`.
    expect(definicaoDaRestricao('landing_pages_uk').definicao).toBe(
      'unique (organization_id, property_id, market, variant)',
    );
  });

  it('só os Estados Unidos leem em pé quadrado', () => {
    // Mostrar "120 m²" para quem compra em pés quadrados é a diferença entre
    // página traduzida e página feita para aquele leitor.
    expect(areaNoMercado(120, 'us')).toEqual({ valor: 1292, unidade: 'ft²' });
    for (const code of ['br', 'ar', 'cl', 'es']) {
      expect(areaNoMercado(120, code), code).toEqual({ valor: 120, unidade: 'm²' });
    }
  });

  it('área ausente ou absurda não vira zero na tela', () => {
    // Zero metros quadrados é uma afirmação; ausência é ausência.
    expect(areaNoMercado(null, 'br')).toBeNull();
    expect(areaNoMercado(0, 'br')).toBeNull();
    expect(areaNoMercado(-5, 'br')).toBeNull();
  });

  it('o caminho público carrega organização, mercado e variante', () => {
    // O mercado entra sempre, inclusive o Brasil: esta URL é colada dentro de
    // um anúncio, nunca digitada, e rota sem caso especial vale mais que URL
    // curta. O caso especial é onde mora o defeito que só aparece no padrão.
    expect(caminhoDaPagina('imob', 'ar', 'apto-jardim', 'b')).toBe('/imob/ar/imovel/apto-jardim/b');
    expect(caminhoDaPagina('imob', 'br', 'apto-jardim')).toBe('/imob/br/imovel/apto-jardim');
  });

  it('no domínio próprio o segmento da organização SAI', () => {
    /*
     * `imobiliaria.exemplo/imob/br/imovel/...` tem um resto de multi-inquilino no
     * domínio de um inquilino só. Quem desfaz a ambiguidade ali é o hostname.
     */
    expect(caminhoDaPagina(null, 'br', 'apto-jardim', 'b')).toBe('/br/imovel/apto-jardim/b');
    expect(caminhoDaPagina(null, 'us', 'apto-jardim')).toBe('/us/imovel/apto-jardim');
  });

  it('o segmento literal `imovel` é o que separa as duas formas', () => {
    /*
     * As duas rotas convivem, e com quatro segmentos as duas poderiam casar:
     * `/imob/br/imovel/apto` e `/br/imovel/apto/b`. O que decide é a POSIÇÃO do
     * literal — terceira na forma longa, segunda na curta. Sem ele, o
     * roteador escolheria pelo desempate interno e a variante `b` viraria o
     * slug de um imóvel inexistente.
     */
    const longo = caminhoDaPagina('imob', 'br', 'apto', undefined).split('/');
    const curto = caminhoDaPagina(null, 'br', 'apto', 'b').split('/');
    expect(longo).toHaveLength(curto.length);
    expect(longo[3]).toBe('imovel');
    expect(curto[2]).toBe('imovel');
    expect(longo[2]).not.toBe('imovel');
  });
});

describe('o ângulo do criativo — a 134', () => {
  it('os cinco do contrato são os que o banco aceita', () => {
    expect(valoresDoCheckAtual('meta_ad_dimensions_angulo_ck')).toEqual(
      [...ANGULOS_DE_CRIATIVO].sort(),
    );
  });

  it('não se confundem com os ângulos de landing page', () => {
    /*
     * Dois vocabulários, dois eixos. O da landing é sobre a PÁGINA que recebe
     * (experiência, investimento, oportunidade); este é sobre o ARGUMENTO do
     * anúncio que traz. Se um nome aparecesse nos dois, a primeira leitura
     * cruzada juntaria coisas que não têm relação nenhuma.
     */
    const juntos = new Set<string>([...ANGULOS, ...ANGULOS_DE_CRIATIVO]);
    expect(juntos.size).toBe(ANGULOS.length + ANGULOS_DE_CRIATIVO.length);
  });

  it('cada um explica o que é e dá um exemplo', () => {
    // Quem está escolhendo o ângulo está criando o anúncio: "objeção" sozinho
    // não ajuda ninguém a escrever a primeira linha do criativo.
    ANGULOS_DE_CRIATIVO.forEach((a) => {
      expect(ANGULO_DE_CRIATIVO_META[a]?.nota.length, a).toBeGreaterThan(30);
      expect(ANGULO_DE_CRIATIVO_META[a]?.exemplo.length, a).toBeGreaterThan(20);
    });
  });
});

describe('landing pages — os três eixos', () => {
  it('os ângulos do contrato são os que o banco aceita', () => {
    expect(valoresDoCheckAtual('landing_pages_angulo_ck')).toEqual([...ANGULOS].sort());
  });

  it('os layouts batem', () => {
    expect(valoresDoCheckAtual('landing_pages_layout_ck')).toEqual([...LAYOUTS].sort());
  });

  it('os mecanismos de conversão batem', () => {
    expect(valoresDoCheckAtual('landing_pages_cta_ck')).toEqual([...CTA_KINDS].sort());
  });

  it('todo valor tem rótulo e explicação para quem escolhe', () => {
    /*
     * A tela do CRM é onde se decide qual variante recebe verba. "Ângulo:
     * oportunidade" não informa nada a quem está decidindo — a nota é o que
     * transforma o rótulo em escolha consciente, e por isso ela é obrigatória.
     */
    ANGULOS.forEach((a) => expect(ANGULO_META[a]?.nota.length, a).toBeGreaterThan(30));
    LAYOUTS.forEach((l) => expect(LAYOUT_META[l]?.nota.length, l).toBeGreaterThan(30));
    CTA_KINDS.forEach((c) => expect(CTA_META[c]?.nota.length, c).toBeGreaterThan(30));
  });

  it('o pareamento que a tela promete é o que `landing_gerar` cria', () => {
    /*
     * A tela explica o que o botão vai fazer ANTES de alguém clicar. Se a
     * função no banco trocar o par de uma variante e o contrato não, a tela
     * passa a descrever uma página que não existe — e a leitura do placar sai
     * invertida, creditando ao WhatsApp o resultado do formulário.
     *
     * Lê a definição VIGENTE porque `landing_gerar` já foi redefinida três
     * vezes: ler um arquivo fixo é como o teste de origens do lead passou meses
     * conferindo a lista da 003.
     */
    const pares = [...funcao('landing_gerar').matchAll(/'([abc])',\s*'(\w+)',\s*_layout,\s*'(\w+)'/g)].map(
      (m) => ({ variant: m[1], angulo: m[2], cta: m[3] }),
    );
    expect(pares).toEqual(VARIANTES_GERADAS.map((v) => ({ ...v })));
  });

  it('cada variante gerada usa um ângulo e um mecanismo diferentes', () => {
    // Três variantes com o mesmo par seriam três cópias da mesma página — e o
    // placar mediria só o ruído da divisão do tráfego.
    expect(new Set(VARIANTES_GERADAS.map((v) => v.angulo)).size).toBe(VARIANTES_GERADAS.length);
    expect(new Set(VARIANTES_GERADAS.map((v) => v.cta)).size).toBe(VARIANTES_GERADAS.length);
  });
});

describe('placar da landing page', () => {
  it('sem visita, a taxa é NULA — não zero', () => {
    // Zero afirma "ninguém converteu"; nulo diz "ninguém entrou ainda". A
    // diferença decide se o corretor desliga a página ou espera mais um dia.
    expect(conversaoDaVariante(0, 0).taxa).toBeNull();
    expect(conversaoDaVariante(null, 3).taxa).toBeNull();
  });

  it('pouca visita conta, mas não vale decisão', () => {
    /*
     * O caso que motiva o campo: a variante que fez 1 lead em 2 visitas mostra
     * 50% e a que fez 0 em 3 mostra 0%. Desligar a segunda por causa disso é
     * decidir verba com ruído — e é o erro mais caro que esta tela pode induzir.
     */
    expect(conversaoDaVariante(2, 1)).toEqual({ taxa: 0.5, confiavel: false });
    expect(conversaoDaVariante(MIN_VISITAS_CONFIAVEL, 3).confiavel).toBe(true);
    expect(conversaoDaVariante(MIN_VISITAS_CONFIAVEL - 1, 3).confiavel).toBe(false);
  });
});

describe('variantes', () => {
  it('são minúsculas e são exatamente três', () => {
    expect(VARIANTS).toEqual(['a', 'b', 'c']);
    VARIANTS.forEach((v) => expect(v).toBe(v.toLowerCase()));
  });

  it('o banco aceita exatamente as mesmas, em minúscula', () => {
    expect(valoresDoCheckAtual('leads_ft_variant_ck')).toEqual([...VARIANTS].sort());
    expect(valoresDoCheckAtual('leads_lt_variant_ck')).toEqual([...VARIANTS].sort());
  });
});

describe('domínio de imóvel ↔ banco', () => {
  it('tipos batem', () => {
    expect(valoresDoCheckAtual('properties_type_ck')).toEqual([...PROPERTY_TYPES].sort());
  });
  it('finalidades batem', () => {
    expect(valoresDoCheckAtual('properties_purpose_ck')).toEqual([...PROPERTY_PURPOSES].sort());
  });
  it('situações batem', () => {
    expect(valoresDoCheckAtual('properties_status_ck')).toEqual([...PROPERTY_STATUSES].sort());
  });
  it('tipos de mídia batem', () => {
    expect(valoresDoCheckAtual('property_media_kind_ck')).toEqual([...MEDIA_KINDS].sort());
  });
});

describe('domínio de lead ↔ banco', () => {
  it('origens batem', () => {
    expect(valoresDoCheckAtual('leads_source_ck')).toEqual([...LEAD_SOURCES].sort());
  });
  it('motivos de perda batem', () => {
    expect(valoresDoCheckAtual('leads_loss_ck')).toEqual([...LOSS_REASONS].sort());
  });
  it('métodos de atribuição batem', () => {
    expect(valoresDoCheckAtual('leads_method_ck')).toEqual([...ATTRIBUTION_METHODS].sort());
  });
  it('idiomas batem', () => {
    expect(valoresDoCheckAtual('leads_locale_ck')).toEqual([...LOCALES].sort());
  });
});

describe('garantias estruturais do banco', () => {
  it('telefone é coluna gerada em E.164, com índice único por organização', () => {
    // Sem isso a deduplicação volta a ser varredura no aplicativo, que é
    // exatamente o que quebra com lead argentino ou americano.
    expect(colunasDaTabela('leads').get('phone_e164')).toMatch(
      /^text generated always as \(public\.to_e164\(/,
    );
    expect(definicaoDoIndice('leads_phone_uk').normal).toMatch(
      /^create unique index leads_phone_uk on public\.leads .*\(organization_id, phone_e164\)/,
    );
  });

  it('dinheiro é inteiro em centavos, nunca ponto flutuante', () => {
    expect(colunasDaTabela('properties').get('price_cents')).toMatch(/^bigint\b/);
    expect(colunasDaTabela('leads').get('deal_value_cents')).toMatch(/^bigint\b/);
    for (const [coluna, tipo] of colunasDaTabela('properties')) {
      if (coluna.includes('price')) expect(tipo, coluna).not.toMatch(/^(real|double precision|float)/);
    }
  });

  it('mídia tem no máximo uma capa por imóvel, garantido pelo banco', () => {
    // O pg_dump escreve o `where` do índice parcial com ou sem parênteses.
    expect(definicaoDoIndice('property_media_one_cover_uk').normal).toMatch(
      /^create unique index property_media_one_cover_uk on public\.property_media .* where \(?is_cover\)?;$/,
    );
  });

  it('renomear imóvel preserva a URL antiga', () => {
    expect(colunasDaTabela('property_slug_history').has('old_slug')).toBe(true);
    expect(funcao('tg_property_slug')).toContain('insert into public.property_slug_history');
  });

  it('a criação de lead usa trava para não duplicar em corrida de webhook', () => {
    expect(funcao('find_or_create_lead')).toMatch(/pg_advisory_xact_lock/);
  });

  it('as saídas de find_or_create_lead não colidem com nome de coluna', () => {
    // No PL/pgSQL as colunas de `returns table` viram variáveis dentro do
    // corpo. Chamar uma saída de `lead_id` torna ambíguo qualquer uso da
    // coluna homônima e a função aborta com 42702 em tempo de execução —
    // ou seja, só aparece quando alguém cadastra um lead com imóvel.
    const assinatura =
      /find_or_create_lead[\s\S]*?returns table \(([^)]+)\)/.exec(funcao('find_or_create_lead'))?.[1] ?? '';
    expect(assinatura).not.toBe('');
    const nomes = assinatura.split(',').map((p) => p.trim().split(/\s+/)[0] ?? '');
    nomes.forEach((n) => expect(n.startsWith('o_'), `saída "${n}" precisa do prefixo o_`).toBe(true));
  });
});

describe('eventos', () => {
  it('sem prefixo e sem duplicata', () => {
    expect(new Set(EVENT_TYPES).size).toBe(EVENT_TYPES.length);
    EVENT_TYPES.forEach((e) => expect(e.startsWith('lp_')).toBe(false));
  });

  it('a profundidade de rolagem é um evento só, com o marco nas propriedades', () => {
    // E não scroll_25 / scroll_50 / scroll_75 como tipos separados — foi
    // exatamente essa divergência que quebrou o desenho anterior.
    expect(EVENT_TYPES).toContain('scroll_depth');
    expect(EVENT_TYPES.filter((e) => /^scroll_\d+$/.test(e))).toHaveLength(0);
  });
});

describe('negociação de idioma', () => {
  it('brasileiro morando no exterior recebe português', () => {
    // O caso que motivou a decisão: IP nos Estados Unidos, aparelho em
    // português. Decidir por geolocalização entregaria inglês justamente
    // para o público que a campanha mais quer.
    expect(negotiateLocale('pt-BR,pt;q=0.9,en-US;q=0.8', LOCALES)).toBe('pt-BR');
  });

  it('argentino recebe espanhol pela raiz do idioma', () => {
    expect(negotiateLocale('es-AR,es;q=0.9', LOCALES)).toBe('es');
  });

  it('respeita a ordem de qualidade, não a ordem de escrita', () => {
    expect(negotiateLocale('en;q=0.4,es;q=0.9', LOCALES)).toBe('es');
  });

  it('curinga e cabeçalho ausente caem no padrão', () => {
    expect(negotiateLocale('*', LOCALES)).toBe('pt-BR');
    expect(negotiateLocale(null, LOCALES)).toBe('pt-BR');
  });

  it('idioma não publicado cai no padrão', () => {
    expect(negotiateLocale('de-DE,de;q=0.9', ['pt-BR', 'es'])).toBe('pt-BR');
  });
});

describe('código de referência do WhatsApp', () => {
  it('é visível e volta redondo, com mercado', () => {
    const code = buildRefCode('a7k3', 'b', 'ar');
    expect(code).toBe('A7K3-AR-B');
    expect(parseRefCode(`Olá! Tenho interesse. Ref. ${code} — Cobertura Vista Mar`)).toEqual({
      publicCode: 'a7k3',
      market: 'ar',
      variant: 'b',
    });
  });

  it('código ANTIGO, sem mercado, continua sendo lido', () => {
    /*
     * Retrocompatibilidade de verdade, não de fachada: um código sem mercado
     * já está dentro de anúncios publicados. Quebrar a leitura dele
     * significaria perder o lead que respondesse a um anúncio de ontem — e o
     * prejuízo apareceria como "parou de chegar lead", sem erro nenhum.
     */
    expect(parseRefCode('Olá! Tenho interesse. Ref. A7K3-B')).toEqual({
      publicCode: 'a7k3',
      market: null,
      variant: 'b',
    });
    expect(buildRefCode('a7k3', 'b')).toBe('A7K3-B');
  });

  it('as cinco páginas do mesmo imóvel geram códigos DIFERENTES', () => {
    // Era o buraco: os cinco mercados devolviam 'ZZ98-A', e o lead que chegava
    // pelo WhatsApp trazia imóvel e variante mas nunca o país de origem.
    const codigos = MERCADO_CODES.map((m) => buildRefCode('zz98', 'a', m));
    expect(new Set(codigos).size).toBe(MERCADO_CODES.length);
  });

  it('sobrevive ao usuário digitando antes e depois', () => {
    expect(parseRefCode('bom dia, vi o anuncio ref A7K3-US-C obrigado')).toEqual({
      publicCode: 'a7k3',
      market: 'us',
      variant: 'c',
    });
  });

  it('mensagem sem código não inventa atribuição', () => {
    expect(parseRefCode('Olá, tenho interesse no apartamento')).toBeNull();
  });

  it('o SQL do WhatsApp lê o mesmo formato que o contrato escreve', () => {
    /*
     * O `parse_ref_code` do banco é quem lê a primeira mensagem de verdade. Se
     * ele ficar no formato antigo, o botão da página passa a mandar
     * 'A7K3-AR-B' e o banco não casa nada: o lead nasce sem imóvel e sem
     * variante, e o A/B fica eternamente vazio sem erro em lugar nenhum.
     */
    const wa = funcao('parse_ref_code');
    /*
     * A extração atravessa quebra de linha e ignora o que vem depois do padrão.
     *
     * A primeira versão exigia `, '...')` numa linha só — e por isso pegou a
     * definição de 2013, a única formatada assim, ignorando as duas mais novas.
     * O teste falhou apontando para o arquivo errado, que é como um guarda
     * frágil vira ruído e acaba sendo desligado.
     */
    const todos = [...wa.matchAll(/regexp_match\(\s*coalesce\(_texto, ''\)\s*,\s*'([^']+)'([^)]*)\)/g)];
    const ultimo = todos.pop();
    expect(ultimo, 'o regexp_match sumiu de parse_ref_code').toBeDefined();

    const [, padraoSql, resto] = ultimo!;
    // O grupo do meio, opcional, é o mercado.
    expect(padraoSql, 'o padrão do banco não tem o grupo de mercado').toContain('{2}');
    expect(padraoSql).toMatch(/\)\?/);
    /*
     * E o `i`. Sem ele o banco é sensível a maiúscula e não lê o "ref" que a
     * pessoa DIGITA — só o "Ref." que o botão preenche. Quem guardou o anúncio
     * para responder depois, ou encaminhou para o cônjuge, reescreve do zero:
     * o lead chega, o código está lá, e a atribuição some sem erro nenhum.
     */
    expect(resto, "falta a flag 'i' no regexp_match do banco").toContain("'i'");
  });
});

/**
 * A lista de status da visita aparece em QUATRO lugares: o dicionário aqui, o
 * CHECK da tabela, o `where` da restrição de exclusão e o `where` da função de
 * conflito. Os dois últimos são os perigosos — se alguém acrescentar um status
 * "remarcada" e esquecer deles, a agenda passa a aceitar dois corretores no
 * mesmo horário sem nenhum erro aparecer.
 */
describe('visitas', () => {
  it('os status batem com o CHECK da tabela', () => {
    expect(valoresDoCheckAtual('visits_status_ck')).toEqual([...VISIT_STATUSES].sort());
  });

  it('a restrição de exclusão bloqueia exatamente os status que ocupam a agenda', () => {
    // `where (status in (...) ...)` à mão; `where (((status = any (array[...]))
    // ...)` no pg_dump. Os status são os literais do `where`, nas duas formas.
    const exclusao = definicaoDaRestricao('visits_sem_sobreposicao').definicao;
    expect(exclusao).toMatch(/^exclude using gist /);
    const onde = exclusao.slice(exclusao.indexOf(' where '));
    expect(onde, 'a restrição de exclusão perdeu o where').toMatch(/^ where /);
    expect(literais(onde).sort()).toEqual([...VISIT_BLOCKING_STATUSES].sort());
  });

  it('a função de conflito usa a mesma lista da restrição', () => {
    const bloco = /status in \(([^)]+)\)/i.exec(funcao('visit_conflicts'))?.[1] ?? '';
    const noSql = [...bloco.matchAll(/'([^']+)'/g)].map((m) => m[1] ?? '').sort();
    expect(noSql).toEqual([...VISIT_BLOCKING_STATUSES].sort());
  });

  it('todo status ou ocupa a agenda ou encerra a visita', () => {
    const cobertos = [...VISIT_BLOCKING_STATUSES, ...VISIT_CLOSED_STATUSES].sort();
    expect(cobertos).toEqual([...VISIT_STATUSES].sort());
  });

  it('o teto de duração bate com o do banco', () => {
    // `interval '12 hours'` à mão; o pg_dump normaliza para `'12:00:00'::interval`.
    const check = definicaoDaRestricao('visits_duration_ck').definicao;
    const horas = /interval '(\d+) hours?'/.exec(check)?.[1] ?? /'(\d+):00:00'::interval/.exec(check)?.[1];
    expect(Number(horas), check).toBe(MAX_VISIT_HOURS);
  });

  it('o gatilho da linha do tempo trata cada status de encerramento', () => {
    const corpo = funcao('tg_visit_timeline');
    VISIT_CLOSED_STATUSES.forEach((s) =>
      expect(corpo, `status "${s}" sem texto próprio na linha do tempo`).toContain(`when '${s}'`),
    );
  });

  it('as saídas de visit_conflicts não colidem com nome de coluna', () => {
    const assinatura = /visit_conflicts[\s\S]*?returns table \(([^)]+)\)/i.exec(funcao('visit_conflicts'))?.[1] ?? '';
    expect(assinatura).not.toBe('');
    const nomes = assinatura.split(',').map((p) => p.trim().split(/\s+/)[0] ?? '');
    nomes.forEach((n) => expect(n.startsWith('o_'), `saída "${n}" precisa do prefixo o_`).toBe(true));
  });
});

describe('papéis', () => {
  it('APP_ROLES bate com o enum do banco', () => {
    expect([...valoresDoEnum('app_role')].sort()).toEqual([...APP_ROLES].sort());
  });

  it('o admin não atende lead', () => {
    // Sem isto ele aparece no seletor de corretor da agenda, e dá para marcar
    // visita no nome de quem cuida de anúncio e de código.
    expect(atendeLead('admin')).toBe(false);
    expect(atendeLead('gerente')).toBe(true);
    expect(atendeLead('corretor')).toBe(true);
  });

  it('o papel principal é o mais alto da lista', () => {
    expect(papelPrincipal(['corretor', 'admin'])).toBe('admin');
    expect(papelPrincipal(['corretor', 'gerente'])).toBe('gerente');
    expect(papelPrincipal(['xpto'])).toBeNull();
  });
});

describe('notificações', () => {
  it('os tipos batem com o CHECK da tabela', () => {
    expect(valoresDoCheckAtual('notifications_type_ck')).toEqual([...NOTIFICATION_TYPES].sort());
  });

  it('o CHECK de muted_types aceita exatamente os mesmos tipos', () => {
    // No sistema auditado o filtro por tipo era uma cadeia de `if` dentro da
    // função de envio, e 6 de ~13 tipos não respeitavam preferência nenhuma.
    expect(valoresDoCheckAtual('notification_preferences_muted_ck')).toEqual(
      [...NOTIFICATION_TYPES].sort(),
    );
  });

  it('os alcances batem com o CHECK', () => {
    expect(valoresDoCheckAtual('notification_preferences_scope_ck')).toEqual([...LEAD_SCOPES].sort());
  });

  it('todo tipo tem rótulo, ícone e som conhecido', () => {
    // Sem isto repetimos o defeito do `clipboard-check`: o produtor grava um
    // nome que a tela não conhece e o aviso cai no genérico, em silêncio.
    NOTIFICATION_TYPES.forEach((t) => {
      const meta = NOTIFICATION_META[t];
      expect(meta, `tipo "${t}" sem meta`).toBeDefined();
      expect(NOTIFICATION_SOUNDS).toContain(meta.som);
    });
  });

  it('o corretor não pode receber todos os leads', () => {
    expect(podeUsarAlcance('corretor', 'todos')).toBe(false);
    expect(podeUsarAlcance('gerente', 'todos')).toBe(true);
    expect(alcancesDisponiveis('corretor')).toEqual(['nenhum', 'meus']);
  });

  it('o banco também barra o corretor subindo para todos', () => {
    // A tela esconde a opção; o banco recusa. Permissão decidida só na tela é
    // permissão que a API não tem.
    const gatilho = definicaoDoGatilho('prefs_limita_alcance');
    expect(gatilho.funcao).toBe('tg_prefs_limita_alcance');
    expect(gatilho.normal).toContain('before insert or update of lead_scope on public.notification_preferences');
    expect(funcao('tg_prefs_limita_alcance')).toMatch(/raise exception[\s\S]{0,120}todos os leads/i);
  });

  it('o público tem rede de segurança para lead que não avisaria ninguém', () => {
    // Encontrado testando: sem gerente cadastrado, admin em 'nenhum' e corretor
    // em 'meus' fazem um lead sem dono entrar e sumir, sem erro nenhum.
    expect(funcao('notification_audience')).toMatch(/not exists \(select 1 from escolhidos\)/);
  });

  it('ninguém é notificado do que fez', () => {
    expect(funcao('create_notification')).toMatch(/continue when v_actor is not null and v_id = v_actor/);
  });

  it('a notificação colapsa por group_key em vez de empilhar', () => {
    expect(funcao('create_notification')).toMatch(/on conflict \(recipient_id, group_key\) where not is_read/);
  });

  it('marcar como lida é a única escrita permitida pela API', () => {
    // No sistema auditado a policy de UPDATE era irrestrita: qualquer
    // autenticado reescrevia título, corpo e destino de notificação alheia.
    // O `revoke update` seguido do `grant update (is_read, read_at)`, lido
    // como ficou: nada de escrita na linha inteira, e só as duas colunas.
    const concedido = privilegiosNaTabela('notifications', 'authenticated');
    for (const escrita of ['insert', 'update', 'delete']) {
      expect(concedido.tabela, escrita).not.toContain(escrita);
    }
    expect(concedido.colunas.update).toEqual(['is_read', 'read_at']);
    expect(concedido.colunas.insert).toBeUndefined();
  });

  it('nenhuma migração grava um tipo que a trava recusa', () => {
    /*
     * Escrito depois de subir um alarme que nunca alarmou.
     *
     * A 112 chamava `create_notification` com `'whatsapp_fora'`, tipo que a
     * trava de `notifications` não conhecia. Aplicar a migração não acusa nada
     * — função criada não executa —, e o cron rodou 576 vezes em verde porque
     * em nenhuma delas havia número caído para avisar. O erro esperava a
     * primeira queda de verdade, que é a única hora em que ele importa.
     *
     * Um tipo inventado no SQL e ausente do contrato é sempre isto: um aviso
     * que só falha no dia em que precisa sair.
     */
    const invalidos: string[] = [];

    todasAsMigracoes().forEach(({ arquivo, texto: bruto }) => {
      const texto = semComentarios(bruto);
      let i = texto.indexOf('create_notification(');
      while (i !== -1) {
        const tipo = terceiroArgumento(texto, i + 'create_notification('.length);
        // Só dá para conferir literal. Argumento montado em variável não é
        // verificável aqui — e nenhum produtor faz isso hoje.
        if (tipo && !isNotificationType(tipo)) invalidos.push(`${arquivo}: '${tipo}'`);
        i = texto.indexOf('create_notification(', i + 1);
      }
    });

    expect(invalidos, 'tipo fora de NOTIFICATION_TYPES').toEqual([]);
  });
});

describe('lembretes', () => {
  it('os status batem com o CHECK', () => {
    expect(valoresDoCheckAtual('lead_reminders_status_ck')).toEqual([...REMINDER_STATUSES].sort());
  });

  it('a varredura olha para trás, nunca para uma janela futura', () => {
    // A origem usava `between now+5min and now+15min`: três horas fora do ar e
    // o lembrete não casava mais com filtro nenhum, ficando pendente para
    // sempre, sem erro em lugar algum.
    const varredura = funcao('run_due_reminders');
    expect(varredura).toMatch(/remind_at <= now\(\)/);
    expect(varredura).not.toMatch(/remind_at\s+between/i);
  });

  it('o lembrete é reservado antes de ser notificado', () => {
    expect(funcao('run_due_reminders')).toMatch(/for update skip locked/);
  });

  it('o lembrete é de uma pessoa, não do plantão', () => {
    // À mão, `assigned_to uuid not null references public.profiles`; o pg_dump
    // separa a referência numa restrição da tabela.
    const coluna = colunasDaTabela('lead_reminders').get('assigned_to') ?? '';
    expect(coluna).toMatch(/^uuid not null\b/);
    const referencia =
      /references public\.profiles\b/.test(coluna) ||
      restricoesDaTabela('lead_reminders').some((r) =>
        /^foreign key \(assigned_to\) references public\.profiles\b/.test(r.definicao),
      );
    expect(referencia, 'assigned_to deixou de apontar para profiles').toBe(true);
  });
});

describe('whatsapp — conexão', () => {
  it('os estados batem com o CHECK da tabela', () => {
    expect(valoresDoCheckAtual('whatsapp_instances_status_ck')).toEqual([...WA_INSTANCE_STATUSES].sort());
  });

  it('todo estado tem rótulo e instrução para o corretor', () => {
    // O estado só existe porque muda a FRASE na tela: "celular sem internet"
    // (não faça nada) é instrução oposta a "escaneie o QR" (aja agora).
    WA_INSTANCE_STATUSES.forEach((s) => {
      expect(WA_INSTANCE_META[s], `estado "${s}" sem meta`).toBeDefined();
      expect(WA_INSTANCE_META[s].instrucao.length).toBeGreaterThan(10);
    });
  });

  it('só a instância conectada envia', () => {
    expect(WA_STATUSES_OPERANTES).toEqual(['conectada']);
    expect(podeEnviar('credenciada_offline')).toBe(false);
  });

  it('o segredo do webhook é guardado como digest, nunca em claro', () => {
    const colunas = colunasDaTabela('whatsapp_instances');
    expect(colunas.has('webhook_secret_hash')).toBe(true);
    expect(colunas.has('webhook_secret')).toBe(false);
  });

  it('o token não tem coluna própria — só a referência para o Vault', () => {
    const colunas = colunasDaTabela('whatsapp_instances');
    expect(colunas.get('token_secret_id')).toMatch(/^uuid\b/);
    expect(colunas.has('token')).toBe(false);
  });

  it('segredo e referência do Vault ficam fora do GRANT de leitura', () => {
    // RLS decide linha; coluna se decide por GRANT. Se estes nomes entrarem na
    // lista, o token passa a trafegar até o navegador — e SELECT na tabela
    // inteira seria o mesmo que pô-los na lista.
    const concedido = privilegiosNaTabela('whatsapp_instances', 'authenticated');
    expect(concedido.tabela).not.toContain('select');
    const legiveis = concedido.colunas.select ?? [];
    expect(legiveis).not.toContain('token_secret_id');
    expect(legiveis).not.toContain('webhook_secret_hash');
    expect(legiveis).toContain('status');
  });

  it('o teto de instâncias é checado sob trava, não em leitura solta', () => {
    // Sem o advisory lock, dois cliques simultâneos criam duas instâncias pagas.
    const teto = definicaoDoGatilho('whatsapp_instances_teto');
    expect(teto.normal).toContain('before insert on public.whatsapp_instances');
    expect(funcao(teto.funcao)).toMatch(/pg_advisory_xact_lock/);
  });
});

describe('whatsapp — identificadores do provedor', () => {
  it('o telefone sai do JID cortando o aparelho ANTES de limpar dígitos', () => {
    // Na ordem inversa o sufixo gruda e vira número com um dígito a mais, que
    // nunca abre conversa. Foi bug de produção na referência.
    expect(telefoneDoJid('554788886666:3')).toBe('+554788886666');
    expect(telefoneDoJid('5511987654321@s.whatsapp.net')).toBe('+5511987654321');
    expect(telefoneDoJid(null)).toBeNull();
    expect(telefoneDoJid('123')).toBeNull();
  });

  it('identificador anônimo é reconhecido em vez de adivinhado', () => {
    expect(ehIdentificadorAnonimo('102938475610293@lid')).toBe(true);
    expect(ehIdentificadorAnonimo('5511987654321')).toBe(false);
  });
});

describe('meta — o dicionário e o banco dizem a mesma coisa', () => {
  it('saúde da integração', () => {
    expect(valoresDoCheckAtual('meta_integrations_health_ck')).toEqual([...META_HEALTH].sort());
  });

  it('estado do evento recebido', () => {
    expect(valoresDoCheckAtual('meta_webhook_inbox_st_ck')).toEqual(
      [...META_INBOX_STATUSES].sort(),
    );
  });

  it('tipo e resultado da sincronização', () => {
    expect(valoresDoCheckAtual('meta_sync_runs_kind_ck')).toEqual([...META_SYNC_KINDS].sort());
    expect(valoresDoCheckAtual('meta_sync_runs_status_ck')).toEqual(
      [...META_SYNC_STATUSES].sort(),
    );
  });

  it('nível da hierarquia de anúncios', () => {
    expect(valoresDoCheckAtual('meta_ad_dimensions_lv_ck')).toEqual([...META_AD_LEVELS].sort());
  });

  it('todo estado de saúde tem instrução para quem está olhando', () => {
    // "Com erro" sem dizer o que fazer é o mesmo que não avisar.
    for (const h of META_HEALTH) {
      expect(META_HEALTH_META[h]?.instrucao.length, h).toBeGreaterThan(20);
    }
  });
});

describe('meta — segredo nunca vira coluna', () => {
  it('nenhuma tabela tem coluna de token nem de app secret', () => {
    /*
     * O sistema auditado guardava `meta_app_secret` e `meta_access_token` em
     * colunas TEXT que o navegador de qualquer gerente alcançava. Este teste
     * quebra se alguém repetir o padrão aqui.
     */
    for (const tabela of tabelasVigentes()) {
      for (const [coluna, tipo] of colunasDaTabela(tabela)) {
        expect(`${tabela}.${coluna} ${tipo}`).not.toMatch(
          /\.(app_secret|access_token|page_token|verify_token) text\b/,
        );
      }
    }
    // Só ponteiro para o Vault.
    const conexao = colunasDaTabela('meta_integrations');
    expect(conexao.get('app_secret_id')).toMatch(/^uuid\b/);
    expect(conexao.get('access_token_id')).toMatch(/^uuid\b/);
  });

  it('a chave do gasto não admite nulo em nenhuma coluna da constraint', () => {
    // `null` nunca é igual a `null` numa unique: coluna anulável na chave é o
    // mesmo que não ter chave, e cada importação duplica a linha.
    // (`text not null default ''` à mão; `text default ''::text not null` no pg_dump.)
    const gasto = colunasDaTabela('meta_ads_spend');
    for (const coluna of ['adset_id', 'ad_id']) {
      const tipo = gasto.get(coluna) ?? '';
      expect(tipo, coluna).toMatch(/^text\b/);
      expect(tipo, coluna).toMatch(/\bnot null\b/);
      expect(tipo, coluna).toMatch(/\bdefault ''(::text)?/);
    }
  });

  it('a fila e o dado cru do formulário não são legíveis pelo cliente', () => {
    for (const tabela of ['meta_webhook_inbox', 'meta_lead_submissions']) {
      for (const papel of ['anon', 'authenticated']) {
        expect(privilegiosNaTabela(tabela, papel), `${tabela} / ${papel}`).toEqual({ tabela: [], colunas: {} });
      }
    }
  });
});

describe('meta — dinheiro e telefone', () => {
  it('gasto que não converte vira nulo, nunca zero', () => {
    // `parseFloat(x) || 0` do sistema auditado gravava ZERO por cima do gasto
    // correto do dia quando a Meta omitia o campo.
    expect(gastoParaMenor('12.34')).toBe(1234);
    expect(gastoParaMenor(0)).toBe(0);
    expect(gastoParaMenor(undefined)).toBeNull();
    expect(gastoParaMenor('')).toBeNull();
    expect(gastoParaMenor('abc')).toBeNull();
    expect(gastoParaMenor('-1')).toBeNull();
  });

  it('custo por lead sem lead atribuído é nulo, não zero', () => {
    expect(custoPorLead(10000, 0).valor).toBeNull();
    expect(custoPorLead(10000, 4)).toEqual({ valor: 2500, confiavel: false });
    expect(custoPorLead(10000, 5).confiavel).toBe(true);
  });

  it('a regra do nono dígito só vale para número brasileiro', () => {
    // Celular antigo, de 8 dígitos: ganha o nono na frente.
    expect(telefoneE164('(47) 8888-6666')).toBe('+5547988886666');
    // Já com o nono: fica como está, não ganha outro.
    expect(telefoneE164('5547988886666')).toBe('+5547988886666');
    // Fixo não ganha o 9.
    expect(telefoneE164('4733334444')).toBe('+554733334444');
    // Português: passa inteiro, sem apanhar a regra brasileira.
    expect(telefoneE164('+351912345678')).toBe('+351912345678');
    expect(telefoneE164(null)).toBeNull();
  });

  it('id da Meta que vira URL é validado — inclusive o leadgen_id', () => {
    // O sistema auditado validava quatro ids e esquecia justamente deste, que
    // ia cru para o caminho da Graph API junto com o token da organização.
    expect(idDaMeta('120209876543210')).toBe('120209876543210');
    expect(idDaMeta('me/accounts?fields=access_token&x=')).toBeNull();
    expect(idDaMeta('../../etc')).toBeNull();
    expect(idDaMeta(123)).toBeNull();
  });

  it('o código de erro da Graph decide se vale insistir', () => {
    expect(saudeDoErro(190)).toBe('precisa_reconectar');
    expect(saudeDoErro(17)).toBe('throttled');
    expect(saudeDoErro(999)).toBe('erro');
    expect(saudeDoErro(null)).toBe('erro');
  });

  it('falta de permissão NÃO manda reconectar', () => {
    /*
     * Os códigos 200 e 10 moravam na lista de "token morreu" e não deviam.
     *
     * Foi o que aconteceu na primeira busca de leads desta instalação: token
     * válido, escopos todos concedidos, e a Graph respondendo 200 porque a
     * chamada ia com o token do usuário do sistema em vez do token da Página.
     * A tela mandava reconectar — e reconectar não mudava nada, porque não era
     * o token que estava errado.
     */
    expect(saudeDoErro(200)).toBe('sem_permissao');
    expect(saudeDoErro(10)).toBe('sem_permissao');
    expect(META_HEALTH_META.sem_permissao.grave).toBe(true);
  });

  it('o erro da Graph vira frase, não número solto', () => {
    // "Graph 200" é o que a tela mostrava: nem diz o que houve, nem o que
    // fazer, e ainda se parece com o status HTTP de sucesso.
    expect(mensagemDoErro(200)).toMatch(/controle total/);
    expect(mensagemDoErro(190)).toMatch(/reconecte/);
    expect(mensagemDoErro(17)).toMatch(/limite/i);
    // Código desconhecido não vira frase inventada.
    expect(mensagemDoErro(4242)).toBe('erro 4242 da Meta');
    expect(mensagemDoErro(null, 503)).toBe('a Meta respondeu 503');
  });

  it('as listas de erro do pacote e das funções não divergem', () => {
    /*
     * O Deno não alcança este pacote, então `_shared/meta.ts` carrega uma
     * cópia dos códigos. Duas cópias sem guarda é como o que a tela diz deixa
     * de descrever o que o servidor decidiu — e a divergência só aparece no dia
     * do incidente, que é o pior dia para descobrir.
     */
    const compartilhado = readFileSync(
      join(__dirname, '../../../supabase/functions/_shared/meta.ts'),
      'utf8',
    );
    const numerosDe = (nome: string): number[] => {
      const m = compartilhado.match(new RegExp(`const ${nome} = \\[([^\\]]*)\\]`));
      if (!m?.[1]) throw new Error(`${nome} não encontrado em _shared/meta.ts`);
      return m[1]
        .split(',')
        .map((t) => Number(t.trim()))
        .filter((n) => Number.isFinite(n))
        .sort((a, b) => a - b);
    };
    const ordenado = (v: readonly number[]) => [...v].sort((a, b) => a - b);

    expect(numerosDe('ERROS_DE_TOKEN')).toEqual(ordenado(META_ERROS_DE_TOKEN));
    expect(numerosDe('ERROS_DE_PERMISSAO')).toEqual(ordenado(META_ERROS_DE_PERMISSAO));
    expect(numerosDe('ERROS_DE_LIMITE')).toEqual(ordenado(META_ERROS_DE_LIMITE));
  });

  it('a versão da Graph mora num lugar só', () => {
    // Espalhada por arquivo, uma delas envelhece e a chamada falha em silêncio.
    expect(GRAPH_VERSION).toMatch(/^v\d+\.0$/);
  });
});

/* -------------------------------------------------------------------------- */

describe('nomes de campanha, conjunto e anúncio', () => {
  const linha = (extra: Partial<Linha>): Linha => ({
    campaign_id: '111',
    adset_id: '222',
    ad_id: '333',
    ...extra,
  });

  it('o mesmo anúncio em trinta dias vira UMA dimensão', () => {
    /*
     * Sem deduplicar, o upsert recebe o mesmo (level, object_id) várias vezes
     * no mesmo lote e o Postgres recusa o comando INTEIRO: "ON CONFLICT DO
     * UPDATE command cannot affect row a second time". Não falha uma linha,
     * falha a gravação toda.
     */
    const dias = ['2026-08-01', '2026-08-02', '2026-08-03'].map((d) =>
      linha({ date_start: d, ad_name: 'Vídeo 15s' }),
    );
    const dims = dimensoesDe(dias, 'org', 'act_1', '2026-08-10T00:00:00Z');

    expect(dims).toHaveLength(3); // campanha, conjunto, anúncio — um de cada
    const chaves = dims.map((d) => `${d.level}:${d.object_id}`);
    expect(new Set(chaves).size).toBe(3);
  });

  it('nome vazio não apaga o nome que já veio', () => {
    // Basta uma linha vir sem nome para o anúncio voltar a ser um número na
    // tela, que é justamente o sintoma que estamos corrigindo.
    const dims = dimensoesDe(
      [linha({ ad_name: 'Vídeo 15s' }), linha({ ad_name: '' }), linha({})],
      'org',
      'act_1',
      'agora',
    );
    expect(dims.find((d) => d.level === 'ad')?.name).toBe('Vídeo 15s');
  });

  it('a sentinela de id ausente não vira uma dimensão chamada ""', () => {
    // O gasto usa '' como sentinela para conjunto/anúncio ausentes — é o que
    // faz a chave única funcionar. Dimensão com object_id vazio seria uma
    // linha fantasma casando com todo gasto sem conjunto.
    const dims = dimensoesDe([linha({ adset_id: '', ad_id: '' })], 'org', 'act_1', 'agora');
    expect(dims.map((d) => d.level)).toEqual(['campaign']);
  });

  it('cadastro e conversa saem de `actions`, cada um no seu campo', () => {
    const r = resultadosDe([
      { action_type: 'link_click', value: '120' },
      { action_type: 'lead', value: '7' },
      { action_type: 'onsite_conversion.messaging_conversation_started_7d', value: '13' },
    ]);
    expect(r).toEqual({ cadastros: 7, conversas: 13 });
  });

  it('anúncio sem ação nenhuma é zero, não desconhecido', () => {
    // A Meta omite o tipo de ação que ficou em zero. Ausência aqui é zero.
    expect(resultadosDe(undefined)).toEqual({ cadastros: 0, conversas: 0 });
    expect(resultadosDe([{ action_type: 'link_click', value: '4' }])).toEqual({
      cadastros: 0,
      conversas: 0,
    });
  });

  it('a métrica precisa zerada não esconde a agrupada preenchida', () => {
    /*
     * Algumas contas devolvem `lead: 0` junto de `lead_grouped: 5`. Parando no
     * primeiro tipo presente, o anúncio que converteu apareceria com zero — e
     * marcado em vermelho como desperdício, que é o pior jeito de errar numa
     * tela de decisão de verba.
     */
    const r = resultadosDe([
      { action_type: 'lead', value: '0' },
      { action_type: 'onsite_conversion.lead_grouped', value: '5' },
    ]);
    expect(r.cadastros).toBe(5);
  });

  it('as duas contagens do mesmo cadastro nunca são somadas', () => {
    // Somar `lead` com `lead_grouped` dobraria o número — e o dobro continua
    // parecendo plausível na tela, que é o que o torna perigoso.
    const r = resultadosDe([
      { action_type: 'lead', value: '6' },
      { action_type: 'onsite_conversion.lead_grouped', value: '6' },
    ]);
    expect(r.cadastros).toBe(6);
  });

  it('valor ilegível vira nulo, nunca zero', () => {
    // Zero afirma "não converteu"; nulo diz "não sabemos" e vira '—' na tela.
    expect(resultadosDe([{ action_type: 'lead', value: '' }]).cadastros).toBeNull();
    expect(resultadosDe([{ action_type: 'lead', value: 'muitos' }]).cadastros).toBeNull();
    expect(resultadosDe([{ action_type: 'lead', value: -3 }]).cadastros).toBeNull();
  });

  it('campanha de leads que gera conversa é rotulada por CONVERSA', () => {
    /*
     * É a conta do a conta de origem: 9 campanhas `OUTCOME_LEADS`, R$ 470 gastos, zero
     * cadastro de formulário e 37 conversas. `OUTCOME_LEADS` cobre quatro
     * destinos, e o dela é mensagem. Uma regra só de objetivo marcaria os nove
     * como "sem cadastro" em vermelho — errando justamente sobre os anúncios
     * que estavam funcionando.
     */
    expect(tipoDeResultado('OUTCOME_LEADS', 0, 37)).toBe('conversa');
    // Mas quando ela produz o cadastro que prometia, é cadastro.
    expect(tipoDeResultado('OUTCOME_LEADS', 12, 3)).toBe('cadastro');
  });

  it('sem resultado nenhum, o objetivo dá o rótulo da linha vazia', () => {
    // Para a linha dizer "sem cadastro" em vez de "sem clique".
    expect(tipoDeResultado('OUTCOME_LEADS', 0, 0)).toBe('cadastro');
    expect(tipoDeResultado('MESSAGES', 0, 0)).toBe('conversa');
    expect(tipoDeResultado(null, 0, 0)).toBe('clique');
  });

  it('objetivo ambíguo é decidido pelo que foi medido', () => {
    // OUTCOME_ENGAGEMENT cobre tanto conversa no WhatsApp quanto post
    // impulsionado, e a Meta não separa os dois.
    expect(tipoDeResultado('OUTCOME_ENGAGEMENT', 0, 62)).toBe('conversa');
    expect(tipoDeResultado('OUTCOME_ENGAGEMENT', 0, 0)).toBe('clique');
  });

  it('resultado não importado é nulo na tela, não zero', () => {
    expect(resultadoDaLinha('cadastro', { cadastros: null, conversas: 5 })).toBeNull();
    expect(resultadoDaLinha('conversa', { conversas: 5 })).toBe(5);
    expect(custoPorResultado(10000, null).valor).toBeNull();
    // Dividir por nulo daria Infinity, que sai formatado como "R$ ∞".
    expect(custoPorResultado(10000, 0).valor).toBeNull();
    expect(custoPorResultado(10000, 4)).toEqual({ valor: 2500, confiavel: false });
    expect(custoPorResultado(10000, 5).confiavel).toBe(true);
  });

  it('o objetivo desce da campanha para os três níveis', () => {
    // Para não classificar campanha por SUBSTRING do nome, que quebra no dia
    // em que alguém escreve "Whats" em vez de "wpp".
    const dims = dimensoesDe([linha({ objective: 'OUTCOME_LEADS' })], 'org', 'act_1', 'agora');
    expect(dims.every((d) => d.objective === 'OUTCOME_LEADS')).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */

describe('está no ar agora?', () => {
  it('o estado EFETIVO manda, não o botão do objeto', () => {
    /*
     * O caso que dá sentido a esta coluna: um anúncio ligado dentro de uma
     * campanha pausada. O `status` dele é ACTIVE e o `effective_status` é
     * CAMPAIGN_PAUSED — ele não gasta um centavo desde que alguém pausou
     * acima. Filtrar pelo `status` diria que está rodando.
     */
    expect(entregaDoStatus('CAMPAIGN_PAUSED')).toBe('pausado');
    expect(entregaDoStatus('ADSET_PAUSED')).toBe('pausado');
    expect(estaEntregando('CAMPAIGN_PAUSED')).toBe(false);
    expect(estaEntregando('ACTIVE')).toBe(true);
  });

  it('só ACTIVE conta como no ar', () => {
    // "Em análise" ainda não entrega e "com problema" parou de entregar.
    // Chamar qualquer um dos dois de ativo faria a tela afirmar que a verba
    // está rodando quando não está.
    expect(estaEntregando('PENDING_REVIEW')).toBe(false);
    expect(estaEntregando('DISAPPROVED')).toBe(false);
    expect(estaEntregando('ARCHIVED')).toBe(false);
  });

  it('quem quebrou não se confunde com quem foi pausado', () => {
    // Ninguém escolheu parar um DISAPPROVED. Somá-lo aos pausados esconderia
    // justamente a linha que precisa de alguém hoje.
    expect(entregaDoStatus('DISAPPROVED')).toBe('com_problema');
    expect(entregaDoStatus('WITH_ISSUES')).toBe('com_problema');
    expect(META_ENTREGA_META.com_problema.atencao).toBe(true);
    expect(META_ENTREGA_META.pausado.atencao).toBe(false);
  });

  it('ausência de estado é ausência, não pausa', () => {
    /*
     * Antes da primeira importação de estado, TODO objeto cai aqui. Tratar
     * ausência como "pausado" esvaziaria a tela no primeiro clique do filtro e
     * o corretor concluiria que não há nada rodando.
     */
    expect(entregaDoStatus(null)).toBe('desconhecido');
    expect(entregaDoStatus('')).toBe('desconhecido');
    expect(entregaDoStatus('SEI_LA_O_QUE')).toBe('desconhecido');
    expect(estaEntregando(null)).toBe(false);
  });

  it('todo estado tem rótulo para quem está olhando', () => {
    for (const e of META_ENTREGAS) {
      expect(META_ENTREGA_META[e]?.rotulo.length, e).toBeGreaterThan(2);
    }
  });

  it('maiúscula e espaço do provedor não mudam a leitura', () => {
    expect(entregaDoStatus(' active ')).toBe('ativo');
  });
});

describe('importação do estado', () => {
  const agora = '2026-08-12T00:00:00Z';

  it('objeto sem estado fica de FORA, em vez de gravar nulo', () => {
    /*
     * Gravar nulo apagaria o último estado conhecido. A tela passaria a mostrar
     * "sem estado" para algo que ela sabia estar no ar, e o filtro esconderia
     * uma campanha ativa sem ninguém entender por quê.
     */
    const linhas = entregaDe(
      [{ id: '1', effective_status: 'ACTIVE' }, { id: '2' }, { id: '3', effective_status: '  ' }],
      'campaign',
      'org',
      'act_1',
      agora,
    );
    expect(linhas.map((l) => l.object_id)).toEqual(['1']);
  });

  it('o lote NÃO carrega nome', () => {
    /*
     * O nome vem do insights. Um lote com `name: null` o apagaria de todas as
     * linhas de uma vez — e o PostgREST exige as mesmas chaves em todas as
     * linhas do lote, então não daria para omitir caso a caso.
     */
    const [linha] = entregaDe([{ id: '1', effective_status: 'ACTIVE' }], 'ad', 'org', 'act_1', agora);
    expect(linha).toBeDefined();
    expect(Object.keys(linha!)).not.toContain('name');
    expect(Object.keys(linha!)).not.toContain('objective');
  });

  it('id repetido vira uma linha só', () => {
    // Sem deduplicar, o upsert recebe a mesma chave duas vezes no mesmo comando
    // e o Postgres recusa o lote INTEIRO — "ON CONFLICT DO UPDATE command
    // cannot affect row a second time".
    const linhas = entregaDe(
      [
        { id: '7', effective_status: 'PAUSED' },
        { id: '7', effective_status: 'ACTIVE' },
      ],
      'campaign',
      'org',
      'act_1',
      agora,
    );
    expect(linhas).toHaveLength(1);
    // A última leitura ganha: é a mais recente da paginação.
    expect(linhas[0]?.effective_status).toBe('ACTIVE');
  });

  it('objeto sem id não vira linha fantasma', () => {
    expect(entregaDe([{ effective_status: 'ACTIVE' }], 'ad', 'org', 'act_1', agora)).toEqual([]);
  });

  it('as bordas da Graph cobrem os três níveis do dicionário', () => {
    // Uma borda a menos deixaria um nível inteiro da tela sem estado — e o
    // filtro, naquele nível, esconderia tudo.
    expect(BORDAS_DE_ENTREGA.map((b) => b.nivel).sort()).toEqual([...META_AD_LEVELS].sort());
  });
});

describe('plano de pagamento', () => {
  /*
   * As regras do plano procuradas pelo que DIZEM, entre as restrições que a
   * tabela tem hoje — e não pelo nome que cada uma recebeu.
   */
  const regras = () => restricoesDaTabela('properties');

  it('as formas do contrato são as que o banco aceita', () => {
    const formas = regras().find((r) => r.definicao.includes('payment_methods <@'));
    expect(formas, 'CHECK de payment_methods não encontrado').toBeDefined();
    expect(valoresDoCheckAtual(formas!.nome)).toEqual([...PAYMENT_METHODS].sort());
  });

  it('quantidade e valor andam juntos, no banco', () => {
    /*
     * "60 parcelas" sem valor é meia informação, e meia informação numa página
     * pública vira a pergunta que estes campos existem para evitar.
     */
    const texto = regras().map((r) => r.definicao).join('\n');
    expect(texto).toContain('(installments_count is null) = (installment_cents is null)');
    expect(texto).toContain('(reinforcement_count is null) = (reinforcement_cents is null)');
    // E reforço sem periodicidade não dá para escrever: de quanto em quanto tempo?
    // (O pg_dump põe cada termo do `or` entre parênteses.)
    expect(texto).toMatch(/\(?reinforcement_count is null\)? or \(?reinforcement_period is not null\)?/);
  });

  it('a soma do plano é a soma das partes', () => {
    const r = resumoDoPlano({
      precoCents: 39_900_000,
      entradaCents: 8_000_000,
      parcelas: 60,
      parcelaCents: 240_000,
      reforcos: 4,
      reforcoCents: 1_500_000,
      chavesCents: 5_000_000,
    });
    // 80.000 + 60×2.400 + 4×15.000 + 50.000 = 334.000
    expect(r.somaCents).toBe(33_400_000);
    expect(r.saldoCents).toBe(6_500_000);
    expect(r.excede).toBe(false);
  });

  it('plano maior que o imóvel é ERRO, e aparece como erro', () => {
    // Sinal ou dígito trocado vira um plano que cobra mais do que o imóvel
    // custa. Se isso passar batido, quem soma é o comprador — e descobre na
    // proposta, que é o pior momento possível.
    const r = resumoDoPlano({ precoCents: 10_000_000, entradaCents: 12_000_000 });
    expect(r.excede).toBe(true);
    expect(r.saldoCents).toBe(-2_000_000);
  });

  it('sem preço, o saldo é NULO — não o negativo da soma', () => {
    // "Quanto falta" não é pergunta com resposta sem o total. Devolver
    // -334.000 seria inventar uma.
    const r = resumoDoPlano({ entradaCents: 8_000_000 });
    expect(r.saldoCents).toBeNull();
    expect(r.excede).toBe(false);
  });

  it('nada preenchido é plano VAZIO, e não um plano de zero', () => {
    // Plano vazio não aparece na tela. Um plano "de R$ 0" apareceria, e diria
    // ao comprador que o imóvel é de graça.
    expect(resumoDoPlano({ precoCents: 39_900_000 }).vazio).toBe(true);
    expect(resumoDoPlano({}).somaCents).toBe(0);
  });

  it('parcela sem quantidade não vira soma', () => {
    // O par incompleto é zerado no envio; aqui a conta também não pode
    // inventar "1 parcela" a partir de um valor solto.
    expect(resumoDoPlano({ parcelaCents: 240_000 }).somaCents).toBe(0);
    expect(resumoDoPlano({ parcelas: 60 }).somaCents).toBe(0);
  });
});

describe('preço de tabela', () => {
  it('só existe acima do preço de venda', () => {
    expect(precoDeTabela(185_000_000, 195_000_000)).toBe(195_000_000);
    // Igual ou abaixo não é desconto: na vitrine, pareceria erro.
    expect(precoDeTabela(185_000_000, 185_000_000)).toBeNull();
    expect(precoDeTabela(185_000_000, 180_000_000)).toBeNull();
  });

  it('sem preço de venda não há o "por", e então não há o "de"', () => {
    expect(precoDeTabela(null, 195_000_000)).toBeNull();
    expect(precoDeTabela(0, 195_000_000)).toBeNull();
    expect(precoDeTabela(185_000_000, null)).toBeNull();
    expect(precoDeTabela(185_000_000, undefined)).toBeNull();
  });

  it('o banco recusa o mesmo caso, em centavos inteiros', () => {
    expect(colunasDaTabela('properties').get('original_price_cents')).toMatch(/^bigint\b/);
    const regra = definicaoDaRestricao('properties_original_price_ck').definicao;
    expect(regra).toContain('price_cents is not null');
    expect(regra).toContain('price_cents > 0');
    expect(regra).toContain('original_price_cents > price_cents');
  });
});
