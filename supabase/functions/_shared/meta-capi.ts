/**
 * A API DE CONVERSÕES DA META, do lado do servidor.
 *
 * POR QUE ELA EXISTE, SE O PIXEL JÁ DISPARA
 *
 * O pixel roda no navegador, e o navegador é território hostil: iOS corta,
 * bloqueador de anúncio corta, extensão de privacidade corta. Some de 20% a 40%
 * das conversões — sempre as mesmas, sempre para o mesmo lado. O algoritmo passa
 * a achar que a campanha converte menos do que converte e reduz a entrega.
 *
 * Aqui o evento sai do SERVIDOR, onde nada disso alcança. E sai com dado que o
 * navegador não tem: o telefone e o e-mail que a pessoa acabou de digitar, em
 * hash — o que a Meta chama de correspondência avançada e é o que decide se ela
 * consegue ligar a conversão ao clique.
 *
 * E EXISTE UM SEGUNDO MOTIVO, QUE É O MAIOR DESTE PROJETO
 *
 * Nenhum navegador participa do caminho que a imobiliária de origem realmente usa. Os 187 leads
 * medidos em 24/09 vieram TODOS do anúncio que abre o WhatsApp: a pessoa clica
 * no Instagram e cai numa conversa. Não há página, não há pixel, não há nada
 * para disparar. A única forma de a Meta saber que aquele clique virou ficha —
 * e depois visita, e depois proposta — é o servidor contar.
 *
 * A DEDUPLICAÇÃO É O CORAÇÃO DISTO
 *
 * Quando o mesmo fato dispara nos dois lugares (é o caso do formulário da
 * landing page), sem `event_id` igual dos dois lados a Meta conta duas vezes e
 * o custo por lead aparece pela METADE — e um número errado para o lado
 * otimista é o pior tipo de número errado, porque ninguém desconfia dele.
 *
 * No formulário o `event_id` nasce no navegador (`novoEventID`), vai no evento
 * do pixel e vem no corpo do POST para cá. Na fila de conversões ele é o `id`
 * da linha, que não muda entre uma tentativa e outra.
 *
 * O QUE NUNCA SAI DAQUI
 *
 * Nome, mensagem, endereço, código de referência, nome de construtora, nome de
 * empreendimento. Só o que a Meta usa para casar pessoa: telefone e e-mail,
 * sempre em SHA-256, nunca em claro — mais o identificador do clique, que é
 * dela mesma. O resto do lead é assunto da imobiliária.
 */

const VERSAO = 'v21.0';

/** SHA-256 em minúsculas hexadecimais, que é o formato que a Meta exige. */
async function hash(v: string): Promise<string> {
  const bytes = new TextEncoder().encode(v);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * O telefone como a Meta espera: só dígitos, com código do país, sem `+`.
 *
 * Normalizar importa mais do que parece — `(47) 99999-9999` e `5547999999999`
 * geram hashes diferentes, e hash diferente é pessoa diferente para ela. Sem
 * isto a correspondência simplesmente não acontece, em silêncio.
 */
export function telefoneNormalizado(bruto: string): string | null {
  const d = bruto.replace(/\D/g, '');
  if (d.length < 10) return null;
  // Brasileiro digitado sem o país: 10 ou 11 dígitos. Acima disso já veio com.
  return d.length <= 11 ? `55${d}` : d;
}

/**
 * De onde o fato veio, no vocabulário da Meta.
 *
 * `website` é o formulário da landing page. `business_messaging` é o
 * anúncio-que-abre-o-WhatsApp, e ele NÃO é um detalhe de rótulo: mandar um
 * evento de conversa como se fosse de site faz a Meta ignorar o `ctwa_clid`,
 * que é o único fio que liga aquela conversa ao clique que a imobiliária pagou.
 *
 * `chat` é a mesma conversa SEM conta oficial do WhatsApp atrás — "conversão
 * feita por aplicativo de mensagens", no vocabulário da Meta. Ela não aceita
 * `ctwa_clid` nem exige Página: casa a pessoa pelo telefone em hash, que é uma
 * amarra mais fraca e a única disponível quando o número roda por uma ponte
 * não oficial. Era a rota da imobiliária de origem.
 */
export type Acao = 'website' | 'business_messaging' | 'chat';

export interface Conversao {
  /**
   * Para onde o evento vai.
   *
   * No site é o pixel da imobiliária. Na CONVERSA a Meta exige um conjunto de
   * dados criado a partir da conta do WhatsApp dela (o WABA) — outro número,
   * outro lugar. Quem chama resolve isso; aqui é só o destino.
   */
  pixelId: string;
  /**
   * O nome JÁ TRADUZIDO para o vocabulário desta `acao`.
   *
   * Existem dois, e `Lead` só vale no do site. O da conversa recusa com 400 —
   * foi assim que os 42 primeiros eventos da 141 voltaram.
   */
  evento: string;
  acao: Acao;
  /**
   * A HORA DO FATO, em segundos. Nunca a hora do envio.
   *
   * A Meta recusa acima de 7 dias, e quem chama precisa ter conferido isso
   * antes — daqui o que sai é só um 400 com o texto dela.
   */
  quando: number;
  /** O mesmo id entre tentativas, e o mesmo do pixel quando há pixel. */
  eventID?: string;
  telefone?: string | null;
  email?: string | null;
  /** O clique do anúncio-que-abre-o-WhatsApp. Só em `business_messaging`. */
  ctwaClid?: string | null;
  /**
   * A conta do WhatsApp na Meta, exigida dentro do evento de conversa.
   *
   * Nula enquanto o número da casa estiver numa ponte por fora da API oficial —
   * é o caso de quem usa a UAZAPI, como este CRM. Vai assim mesmo, e a Meta diz o que
   * falta: melhor a recusa dela registrada na fila do que uma suposição nossa.
   */
  wabaId?: string | null;
  /**
   * A PÁGINA de onde o anúncio fala.
   *
   * A documentação de conversa não a lista como obrigatória — quem disse que
   * era foi a Meta, recusando o evento com "não tem um parâmetro page_id".
   * Faz sentido: o anúncio de clique-para-WhatsApp é publicado por uma Página,
   * e é por ela que a conversa se liga ao anunciante.
   */
  pageId?: string | null;
  /** `fbclid` da URL da landing page: vira `fbc`. Só em `website`. */
  fbclid?: string | null;
  origemUrl?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  valor?: number | null;
  moeda?: string | null;
  /** Código público do imóvel. Nunca o nome dele, nunca o da construtora. */
  conteudoId?: string | null;
}

export type Resultado =
  | { ok: true }
  | { ok: false; permanente: boolean; status: number | null; motivo: string };

/**
 * Manda uma conversão. Nunca lança.
 *
 * O `permanente` do retorno é o que a fila usa para decidir entre reenviar e
 * desistir: 400 da Meta quer dizer "este evento está errado e continuará
 * errado" — insistir nele é queimar limite de chamada sem nunca acertar.
 * Timeout e 500 são o contrário, e voltam para a fila.
 */
export async function enviarConversao(c: Conversao, tetoMs = 8000): Promise<Resultado> {
  const token = Deno.env.get('META_CAPI_TOKEN');
  if (!token) return { ok: false, permanente: true, status: null, motivo: 'META_CAPI_TOKEN ausente' };
  if (!c.pixelId) return { ok: false, permanente: true, status: null, motivo: 'organização sem pixel' };

  const user_data: Record<string, unknown> = {};

  const tel = c.telefone ? telefoneNormalizado(c.telefone) : null;
  if (tel) user_data.ph = [await hash(tel)];

  const mail = c.email?.trim().toLowerCase();
  if (mail) user_data.em = [await hash(mail)];

  /*
   * `fbc` no formato que a Meta define: `fb.1.<milissegundos>.<fbclid>`.
   *
   * O navegador guarda isso num cookie que a gente não lê aqui — mas o `fbclid`
   * cru veio na URL e foi capturado na chegada, então dá para montar. É o sinal
   * de correspondência mais forte que existe num evento de site: liga a
   * conversão ao CLIQUE, não à pessoa.
   */
  if (c.acao === 'website' && c.fbclid) user_data.fbc = `fb.1.${Date.now()}.${c.fbclid}`;

  /*
   * E o equivalente disso do lado da conversa.
   *
   * Vai cru, e tem de ir: é um identificador que a própria Meta emitiu no
   * clique e devolveu no `contextInfo` da primeira mensagem (a 062). Passá-lo
   * por hash o tornaria irreconhecível para ela, que é justamente quem precisa
   * reconhecê-lo.
   */
  if (c.acao === 'business_messaging') {
    if (c.ctwaClid) user_data.ctwa_clid = c.ctwaClid;
    if (c.wabaId) user_data.whatsapp_business_account_id = c.wabaId;
    if (c.pageId) user_data.page_id = c.pageId;
  }

  /*
   * Os dois de rede só valem quando são de quem converteu.
   *
   * No formulário eles vêm do pedido da pessoa e sobem a correspondência. Na
   * conversa não existe pedido nenhum — mandar o IP do servidor do Supabase
   * seria dizer à Meta que 187 pessoas diferentes moram no mesmo endereço, o
   * que piora a correspondência em vez de melhorar.
   */
  if (c.acao === 'website') {
    if (c.ip) user_data.client_ip_address = c.ip;
    if (c.userAgent) user_data.client_user_agent = c.userAgent;
  }

  const evento: Record<string, unknown> = {
    event_name: c.evento,
    event_time: c.quando,
    action_source: c.acao,
    user_data,
    ...(c.acao === 'business_messaging' ? { messaging_channel: 'whatsapp' } : {}),
    ...(c.eventID ? { event_id: c.eventID } : {}),
    ...(c.origemUrl ? { event_source_url: c.origemUrl } : {}),
    ...(c.conteudoId || c.valor
      ? {
          custom_data: {
            ...(c.conteudoId ? { content_ids: [c.conteudoId], content_type: 'product' } : {}),
            ...(c.valor ? { value: c.valor } : {}),
            currency: c.moeda || 'BRL',
          },
        }
      : {}),
  };

  const corpo: Record<string, unknown> = { data: [evento] };
  /* Só em teste. Com este código o evento aparece na aba "Eventos de teste" e
     NÃO entra nos relatórios — é o jeito de conferir sem sujar o número. */
  const teste = Deno.env.get('META_CAPI_TEST_CODE');
  if (teste) corpo.test_event_code = teste;

  try {
    const r = await fetch(
      `https://graph.facebook.com/${VERSAO}/${c.pixelId}/events?access_token=${encodeURIComponent(token)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corpo),
        signal: AbortSignal.timeout(tetoMs),
      },
    );
    if (!r.ok) {
      /* O corpo do erro da Meta diz exatamente o que está errado — campo com
         formato inválido, token sem permissão — e some se ninguém registrar. */
      /*
       * Mil e duzentos, e não quatrocentos.
       *
       * A recusa da 141 chegou cortada em "Forneça um valor v…" — justamente
       * onde a Meta ia listar os valores aceitos. Descobrir isso custou uma
       * migração; o texto inteiro é o que transforma um 400 em conserto.
       */
      const texto = (await r.text()).slice(0, 1200);
      console.error('meta-capi:', r.status, texto);
      /*
       * 401 e 403 são permanentes de outro jeito: o token caiu. Reenviar não
       * resolve, mas o evento não está errado — quem resolve é gente. Entram
       * como temporários de propósito, para que a fila os segure em vez de
       * marcá-los como perdidos: depois de o token ser trocado, eles saem.
       */
      return { ok: false, permanente: r.status === 400, status: r.status, motivo: texto };
    }
    return { ok: true };
  } catch (err) {
    const motivo = err instanceof Error ? err.message : String(err);
    console.error('meta-capi:', motivo);
    return { ok: false, permanente: false, status: null, motivo };
  }
}

export interface EventoDeLead {
  pixelId: string;
  /** O MESMO id que o navegador usou. Sem ele, contagem dobrada. */
  eventID?: string;
  telefone?: string | null;
  email?: string | null;
  /** URL da landing page, como a pessoa a viu. */
  origemUrl?: string | null;
  /** `fbclid` da URL do anúncio: vira `fbc`, que é o melhor sinal de todos. */
  fbclid?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  /** Código público do imóvel e valor, para a Meta comparar campanha por valor. */
  conteudo?: { id?: string | null; valor?: number | null; moeda?: string | null };
}

/**
 * O `Lead` do formulário da landing page, mandado NA HORA.
 *
 * Vive à parte da fila de propósito: aqui existe um navegador esperando, e o
 * `event_id` que deduplica os dois lados só existe neste instante. Teto de 2,5
 * segundos — se a Meta estiver lenta, o evento se perde e o do navegador cobre.
 * Perder um evento é ruim; segurar a tela de quem está com o dedo no formulário
 * é pior.
 */
export async function enviarLead(e: EventoDeLead): Promise<'ok' | 'sem-token' | 'falhou'> {
  if (!Deno.env.get('META_CAPI_TOKEN') || !e.pixelId) return 'sem-token';

  const r = await enviarConversao(
    {
      pixelId: e.pixelId,
      evento: 'Lead',
      acao: 'website',
      quando: Math.floor(Date.now() / 1000),
      eventID: e.eventID,
      telefone: e.telefone,
      email: e.email,
      fbclid: e.fbclid,
      origemUrl: e.origemUrl,
      ip: e.ip,
      userAgent: e.userAgent,
      valor: e.conteudo?.valor ?? null,
      moeda: e.conteudo?.moeda ?? null,
      conteudoId: e.conteudo?.id ?? null,
    },
    2500,
  );
  return r.ok ? 'ok' : 'falhou';
}
