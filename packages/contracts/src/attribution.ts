/**
 * Chave de atribuição: como imóvel, template, variante e idioma viajam
 * do anúncio até o lead, e como o gasto encontra a venda.
 *
 * Esta é a peça que destrava todas as outras. Se ela mudar depois,
 * cada camada construída em cima nasce com remendo.
 */

/** Variante do teste. Minúscula, sempre. */
export const VARIANTS = ['a', 'b', 'c'] as const;
export type Variant = (typeof VARIANTS)[number];

export function isVariant(value: unknown): value is Variant {
  return typeof value === 'string' && (VARIANTS as readonly string[]).includes(value);
}

/**
 * URL canônica da landing page.
 *
 *   https://{dominio-do-cliente}/{locale?}/imovel/{slug}?v={a|b|c}
 *
 *  - idioma no PATH: é o que o Google indexa e o que casa com hreflang.
 *    Jamais negociado na URL de anúncio — a campanha aponta para o path
 *    do idioma que ela mira.
 *  - variante na QUERY: é dimensão de tráfego pago, descartável. Colapsa
 *    sob canonical e pode ser desligada sem quebrar link compartilhado.
 *
 * A URL nua (sem prefixo de idioma) existe só como x-default: responde
 * negociando o idioma, com `no-store`, e nenhum anúncio aponta para ela.
 */
export function landingPath(slug: string, opts: { locale?: string; variant?: Variant } = {}): string {
  const prefix = opts.locale && opts.locale !== 'pt-BR' ? `/${opts.locale}` : '';
  const query = opts.variant ? `?v=${opts.variant}` : '';
  return `${prefix}/imovel/${slug}${query}`;
}

/**
 * Parâmetros que a URL do anúncio carrega.
 *
 * UTM continua existindo porque é o que humano lê no relatório. Mas a
 * atribuição real NÃO depende deles: nome de campanha muda, ID não.
 * Os macros da Meta entram em parâmetros próprios e são a chave de junção.
 */
export const AD_PARAMS = {
  campaignId: 'sc_cid', // {{campaign.id}}
  adsetId: 'sc_asid', // {{adset.id}}
  adId: 'sc_aid', // {{ad.id}}  ← identidade do teste
  placement: 'sc_plc', // {{placement}}
} as const;

export const UTM_PARAMS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] as const;

export const CLICK_IDS = ['fbclid', 'gclid', 'gbraid', 'wbraid', 'ttclid', 'msclkid'] as const;
export type ClickId = (typeof CLICK_IDS)[number];

/**
 * Como a atribuição de um lead que veio pelo WhatsApp foi resolvida.
 * Gravado junto com o lead para que o painel saiba a própria margem de erro.
 */
export const ATTRIBUTION_METHODS = [
  'form', // veio do formulário da página — confiança total
  /*
   * A Meta dizendo, ela mesma, que esta pessoa clicou neste anúncio.
   *
   * Click To WhatsApp: o anúncio abre a conversa já com a saudação escrita, e o
   * WhatsApp entrega junto o `contextInfo` com `conversionSource: FB_Ads`, o id
   * do anúncio e o `ctwaClid`. É a atribuição mais forte que existe aqui —
   * acima até do `form`, porque não depende de a pessoa manter um texto colado
   * na mensagem.
   *
   * Entrou depois do resto: no primeiro dia com o número no ar, o lead que veio
   * de anúncio foi o único que o CRM NÃO contou como lead, porque a saudação da
   * Meta não carrega o nosso `Ref.` — só a dela.
   */
  'ctwa', // clique em anúncio de Click To WhatsApp, confirmado pela Meta
  'ref_code', // código curto visível na saudação do WhatsApp
  'time_window', // clique único não atribuído nos últimos 30 min
  'none', // não foi possível atribuir
  /*
   * Nós é que dissemos de onde veio, lendo o relatório de entrega da Meta.
   *
   * Nasceu de uma perda: o WhatsApp de uma corretora ficou fora do ar por
   * dezessete horas e três conversas que a Meta cobrou e entregou nunca
   * chegaram ao CRM. Sem telefone, sem nome, sem mensagem — mas com gasto real
   * e anúncio conhecido.
   *
   * NÃO é `ctwa`, e a diferença é o ponto inteiro deste campo. `ctwa` significa
   * que a Meta afirmou, no `contextInfo` da própria mensagem, que aquela pessoa
   * clicou naquele anúncio. Aqui não houve mensagem nenhuma. Reusar `ctwa`
   * tornaria o lançamento contábil indistinguível de prova técnica — no campo
   * criado justamente para guardar a FORÇA da prova.
   *
   * É a atribuição mais fraca da lista, e é assim que deve ser lida.
   */
  'reconciliado', // lançado a partir do relatório da Meta, sem sinal técnico
] as const;
export type AttributionMethod = (typeof ATTRIBUTION_METHODS)[number];

/**
 * O método escrito para GENTE.
 *
 * A ficha do lead mostrava `ref_code` cru no campo "Método". É o nome interno da
 * coluna, não uma explicação — quem abre a ficha quer saber COMO se soube de
 * onde a pessoa veio, e "ref_code" não responde isso para ninguém fora do
 * código.
 */
export const ATTRIBUTION_METHOD_LABEL: Record<AttributionMethod, string> = {
  form: 'Preencheu o formulário da página',
  ctwa: 'Clicou no anúncio e abriu o WhatsApp',
  ref_code: 'Veio pelo botão de WhatsApp da página',
  time_window: 'Deduzido pelo horário do clique',
  none: 'Sem origem identificada',
  reconciliado: 'Registrado a partir do relatório da Meta',
};

/**
 * Código de referência VISÍVEL, embutido na saudação pré-preenchida:
 *   "Olá! Tenho interesse. Ref. A7K3-B — Cobertura Vista Mar"
 *
 * A versão anterior deste desenho usava caracteres invisíveis para
 * esconder o identificador dentro da mensagem que a pessoa envia.
 * Foi descartada: é tratamento de dado por meio que o titular não
 * consegue perceber nem inspecionar, indefensável perante a LGPD e
 * impossível de declarar num aviso de privacidade honesto.
 * O código visível sobrevive a copiar e colar e é declarável.
 */
/**
 * O MERCADO entra no meio: `A7K3-AR-B`.
 *
 * Sem ele, as páginas dos cinco países do mesmo imóvel geravam o MESMO código,
 * e o lead que chega pelo WhatsApp trazia imóvel e variante mas nunca o país
 * de origem. Anunciando em cinco mercados, é justamente o número que se quer
 * saber — e a falta dele não apareceria hoje: apareceria daqui a dois meses,
 * na primeira vez que alguém perguntasse qual país está rendendo.
 *
 * O segmento é OPCIONAL na leitura, e isso é retrocompatibilidade de verdade:
 * um código antigo, já dentro de um anúncio rodando, continua sendo lido —
 * apenas sem mercado. Quebrar a leitura antiga significaria perder o lead que
 * respondesse a um anúncio publicado ontem.
 */
export function buildRefCode(publicCode: string, variant: Variant, market?: string): string {
  const meio = market ? `-${market.toUpperCase()}` : '';
  return `${publicCode.toUpperCase()}${meio}-${variant.toUpperCase()}`;
}

export const REF_CODE_RE = /\bRef\.?\s*([A-Z0-9]{4})(?:-([A-Z]{2}))?-([ABC])\b/i;

export function parseRefCode(
  text: string,
): { publicCode: string; market: string | null; variant: Variant } | null {
  const m = REF_CODE_RE.exec(text);
  const code = m?.[1];
  const v = m?.[3]?.toLowerCase();
  if (!code || !isVariant(v)) return null;
  return {
    publicCode: code.toLowerCase(),
    // O mercado não é validado aqui contra a lista: quem consulta o banco é
    // que sabe se aquela página existe. Devolver 'zz' e não achar página é
    // melhor do que devolver nulo e perder também o imóvel e a variante.
    market: m?.[2]?.toLowerCase() ?? null,
    variant: v,
  };
}

/**
 * Primeiro toque é CRONOLÓGICO, não ordem de chegada.
 *
 * O caso mais comum do imobiliário quebrava a versão anterior: pessoa vê
 * o anúncio da variante A no celular, clica, some. Volta três dias depois
 * por um anúncio da variante C e converte. Creditar C é medir recência e
 * chamar de originação — e o painel decidiria o vencedor com base nisso.
 *
 * ft_* só é sobrescrito quando o toque novo é MAIS ANTIGO que o gravado.
 * lt_* é sempre sobrescrito. Se o lead viu mais de uma variante,
 * `ab_contaminated` marca e ele sai da leitura do experimento.
 */
export interface LeadAttribution {
  ft_landing_page_id: string | null;
  ft_variant: Variant | null;
  ft_locale: string | null;
  ft_meta_ad_id: string | null;
  ft_occurred_at: string | null;
  lt_landing_page_id: string | null;
  lt_variant: Variant | null;
  lt_meta_ad_id: string | null;
  lt_occurred_at: string | null;
  attribution_method: AttributionMethod;
  ab_contaminated: boolean;
  variants_seen: Variant[];
}
