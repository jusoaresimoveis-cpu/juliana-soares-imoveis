import { servir, admin, json, passouNoLimite, CORS } from '../_shared/wa.ts';
import { enviarLead } from '../_shared/meta-capi.ts';

/**
 * Captura do formulário da landing page.
 *
 * Chamada por quem NÃO tem sessão — um visitante vindo de um anúncio. Por isso
 * ela existe: dar ao `anon` permissão de inserir em `leads` abriria a tabela
 * mais sensível do sistema para a internet inteira, e uma política de linha não
 * protege coluna nenhuma. Aqui o corpo é validado campo a campo e o insert
 * acontece por uma função que já sabe deduplicar por telefone.
 *
 * `verify_jwt = false`: não há sessão para verificar. A defesa é o que está
 * abaixo, não um token.
 */

/** Teto por rodada. Nome, telefone e mensagem não precisam de mais que isso. */
const MAX = { nome: 120, telefone: 30, email: 160, mensagem: 1000 } as const;

/*
 * Cópia de `FINALIDADES`, em `packages/contracts/qualificacao.ts`.
 *
 * A função de borda roda em Deno e não enxerga o pacote de contratos. A cópia
 * é conferida por teste (`packages/contracts/qualificacao.test.ts`), e o banco
 * confere de novo no CHECK — valor fora da lista nunca chega à coluna.
 */
const FINALIDADES = ['morar', 'investir', 'segunda_residencia', 'avaliando'] as const;

/*
 * As outras duas respostas do QUIZ (a 135). Mesma disciplina da lista acima:
 * cópia conferida por teste, e o CHECK do banco confere de novo.
 */
const PRAZOS = [
  'ate_30_dias',
  'de_1_a_3_meses',
  'de_3_a_6_meses',
  'mais_de_6_meses',
  'pesquisando',
] as const;
const ENCAIXES = ['cabe', 'precisa_prazo', 'depende_banco'] as const;

interface Corpo {
  paginaId?: unknown;
  nome?: unknown;
  telefone?: unknown;
  email?: unknown;
  mensagem?: unknown;
  /** O que a pessoa marcou em "O que você procura", como código. */
  finalidade?: unknown;
  /** As duas respostas que só o quiz faz: quando compra e se a entrada cabe. */
  prazo?: unknown;
  encaixe?: unknown;
  /** Campo isca, invisível na tela. Preenchido = robô. */
  site?: unknown;
  /** Milissegundos entre abrir a página e enviar. */
  ms?: unknown;
  /** De onde a pessoa veio: `utm_*`, `ad_id`, `fbclid`. Ver `origem.ts`. */
  origem?: unknown;
  /**
   * O id do evento disparado no navegador.
   *
   * Guardado agora para a API de Conversões usar depois: quando o `Lead` sair
   * também do servidor, os dois vão com o MESMO id e a Meta junta os dois num
   * só. Sem isso o mesmo lead conta duas vezes e o custo por lead aparece pela
   * metade — erro que sempre engana para o lado otimista.
   */
  eventID?: unknown;
}

/*
 * A ORIGEM VEM DO NAVEGADOR, ENTÃO É SUSPEITA POR CONSTRUÇÃO.
 *
 * São rótulos de anúncio: quem envia pode escrever o que quiser neles. Isso é
 * aceitável — rótulo errado suja um relatório, não abre uma porta — mas com
 * duas condições, e as duas estão aqui.
 *
 * A LISTA É FECHADA. Só estas seis chaves passam. Sem isso, um corpo com
 * `{"organization_id": "..."}` dentro de `origem` chegaria inteiro ao
 * `_attribution`, e ali dentro há campos que decidem coisas.
 *
 * O TAMANHO É CORTADO. `fbclid` legítimo tem ~100 caracteres; sem teto, um
 * pedido com 2 MB de texto viraria 2 MB de linha no banco, a cada envio.
 *
 * O que NÃO está aqui e não pode estar: `variant`, `locale`, `landing_page_id`
 * e `method`. Esses quatro a função resolve pela PÁGINA, que é o único dado que
 * o visitante legitimamente conhece — deixá-los vir do corpo seria deixar o
 * cliente escolher em que teste A/B ele foi contado.
 */
const CAMPOS_DE_ORIGEM = {
  meta_ad_id: 80,
  utm_source: 80,
  utm_campaign: 160,
  fbclid: 300,
  gclid: 300,
  landing_page_url: 300,
  referrer: 300,
} as const;

function origemLimpa(bruta: unknown): Record<string, string> {
  if (!bruta || typeof bruta !== 'object' || Array.isArray(bruta)) return {};
  const o = bruta as Record<string, unknown>;
  const saida: Record<string, string> = {};
  for (const [chave, teto] of Object.entries(CAMPOS_DE_ORIGEM)) {
    const v = texto(o[chave], teto);
    if (v) saida[chave] = v;
  }
  return saida;
}

const texto = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null;
  const t = v.trim().slice(0, max);
  return t === '' ? null : t;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/*
 * A origem certa é carimbada na saída, uma vez só.
 *
 * Faltava aqui, e não era detalhe: `CORS` traz `PERMITIDAS[0]` fixo, que é o
 * endereço do CRM. A landing page é servida pelo domínio da imobiliária — outra
 * origem — então o navegador comparava o cabeçalho com o lugar de onde a página
 * realmente estava, não batia, e descartava a resposta antes do código ver. As
 * outras funções já passavam por `comOrigem`; esta não passava.
 */
servir(responder);

async function responder(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ erro: 'método' }, 405);

  const c = (await req.json().catch(() => ({}))) as Corpo;

  /*
   * Duas peneiras antes de qualquer consulta ao banco.
   *
   * A isca é um campo de texto escondido no formulário: pessoa nenhuma o vê,
   * robô que preenche tudo o preenche. E o tempo mínimo pega o robô que envia
   * em 200 ms — ninguém lê um anúncio, decide e digita o telefone em menos de
   * três segundos.
   *
   * As duas respondem `ok` em vez de erro, de propósito: dizer "recusado"
   * ensina o robô a ajustar. Silêncio com cara de sucesso, não.
   */
  if (texto(c.site, 200) !== null) return json({ ok: true });
  if (typeof c.ms === 'number' && c.ms < 3000) return json({ ok: true });

  const sb = admin();

  /*
   * A terceira peneira: quantas vezes esta origem já passou aqui.
   *
   * As duas de cima pegam robô burro — o que preenche campo escondido e o que
   * envia em 200 ms. Nenhuma delas pega um laço que espera três segundos e
   * envia mil vezes, e é esse que custa caro: cada linha vira notificação,
   * entra na fila do WhatsApp e desloca o custo por lead que decide verba.
   *
   * Vem DEPOIS das duas de graça e ANTES de qualquer validação, de propósito:
   * as de cima não tocam o banco, e enxurrada de corpo malformado precisa
   * contar tanto quanto enxurrada de corpo válido.
   */
  if (!(await passouNoLimite(req, sb, 'landing-lead'))) {
    /*
     * Aqui a resposta é um erro de verdade, diferente das duas peneiras acima.
     *
     * Elas devolvem `ok` para não ensinar o robô. Esta não pode: se o contador
     * estiver somando gente demais numa chave só, quem apanha é uma pessoa real
     * com o dedo no formulário — e responder "enviado" faria ela ir embora
     * achando que o corretor foi avisado. Melhor dizer que não deu e mostrar a
     * outra porta.
     */
    return json({ erro: 'limite' }, 429);
  }

  const paginaId = typeof c.paginaId === 'string' && UUID.test(c.paginaId) ? c.paginaId : null;
  const nome = texto(c.nome, MAX.nome);
  const telefone = texto(c.telefone, MAX.telefone);
  const email = texto(c.email, MAX.email);
  const mensagem = texto(c.mensagem, MAX.mensagem);
  const origem = origemLimpa(c.origem);

  if (!paginaId) return json({ erro: 'pagina' }, 400);
  // Telefone OU e-mail: o `find_or_create_lead` recusa os dois vazios, e a
  // mensagem de exceção dele não é coisa que se mostre a um visitante.
  if (!nome || (!telefone && !email)) return json({ erro: 'campos' }, 400);

  /*
   * A página é a fonte da organização, do imóvel e da variante.
   *
   * NADA disso vem do corpo do pedido. Aceitar `organization_id` de quem
   * envia deixaria qualquer um criar lead dentro de qualquer imobiliária — e a
   * página, por ser publicada, é o único dado que o visitante legitimamente
   * conhece.
   */
  const { data: pagina } = await sb
    .from('landing_pages')
    .select(
      /* `organizations` e `properties` vêm embutidos porque a API de Conversões
         precisa do pixel DA IMOBILIÁRIA e do valor do imóvel — e uma ida a mais
         ao banco, aqui, é meio segundo na cara de quem está enviando. */
      'id, organization_id, property_id, variant, locale, is_published,' +
        ' organizations(meta_pixel_id), properties(public_code, price_cents)',
    )
    .eq('id', paginaId)
    .maybeSingle();

  if (!pagina || !pagina.is_published) return json({ erro: 'pagina' }, 404);

  const { data, error } = await sb.rpc('find_or_create_lead', {
    _org: pagina.organization_id,
    _full_name: nome,
    _phone: telefone,
    // Sem país declarado o `to_e164` assume Brasil. O formulário do exterior
    // pede o telefone COM código de país, e aí o '+' manda.
    _phone_cc: 'BR',
    _email: email,
    _source: 'landing_page',
    _entry_point: 'landing_form',
    _property_id: pagina.property_id,
    _attribution: {
      /* A origem entra PRIMEIRO para que os campos de baixo, que vêm da página,
         não possam ser sobrescritos por ela. Ordem é a defesa. */
      ...origem,
      landing_page_id: pagina.id,
      variant: pagina.variant,
      locale: pagina.locale,
      // 'form' é a atribuição de confiança total: a pessoa digitou os dados
      // DENTRO da página. Não há janela de tempo nem código para interpretar.
      method: 'form',
    },
  });

  if (error) {
    // O detalhe fica no log do servidor. Para quem enviou, a única informação
    // útil é que não deu — e que existe outro caminho.
    console.error('landing-lead:', error.message);
    return json({ erro: 'falha' }, 500);
  }

  const leadId = (data as { o_lead_id: string }[] | null)?.[0]?.o_lead_id ?? null;

  /*
   * O `Lead` também pelo SERVIDOR.
   *
   * Depois de o lead existir, nunca antes: evento de conversão para um cadastro
   * que falhou ensina o algoritmo a comprar mais gente que não converte.
   *
   * Sem `await` que possa derrubar a resposta — `enviarLead` não lança e tem
   * teto de 2,5s. Quem está esperando é alguém com o dedo no formulário; se a
   * Meta estiver lenta, o evento do navegador cobre.
   */
  const org = (pagina as unknown as { organizations?: { meta_pixel_id?: string | null } })
    .organizations;
  const imovel = (pagina as unknown as {
    properties?: { public_code?: string | null; price_cents?: number | null };
  }).properties;

  if (org?.meta_pixel_id) {
    await enviarLead({
      pixelId: org.meta_pixel_id,
      eventID: typeof c.eventID === 'string' ? c.eventID.slice(0, 80) : undefined,
      telefone,
      email,
      origemUrl: origem.landing_page_url ?? null,
      fbclid: origem.fbclid ?? null,
      /*
       * O IP de quem enviou, e não o do servidor. `x-forwarded-for` traz a
       * cadeia inteira quando há mais de um intermediário; o primeiro é o
       * cliente.
       */
      ip: (req.headers.get('x-forwarded-for') ?? '').split(',')[0]?.trim() || null,
      userAgent: req.headers.get('user-agent'),
      conteudo: {
        id: imovel?.public_code ?? null,
        valor: imovel?.price_cents ? imovel.price_cents / 100 : null,
        /* Fixo em BRL, como a própria `landing_publica` faz: não existe coluna
           de moeda em `properties`, e o preço é sempre em real. */
        moeda: 'BRL',
      },
    });
  }

  /*
   * A mensagem vira evento na linha do tempo do lead.
   *
   * Não existe tabela de notas neste sistema — o histórico do lead é
   * `lead_timeline_events`, e é lá que o corretor lê. Perder a mensagem seria
   * descartar a única frase que a pessoa escreveu por vontade própria, que
   * costuma ser a mais útil do atendimento inteiro ("procuro para alugar",
   * "só posso visitar no sábado").
   *
   * A falha é registrada e ENGOLIDA: o lead já existe, e devolver erro faria a
   * pessoa enviar de novo achando que nada chegou.
   */
  /*
   * A finalidade marcada no formulário vai para a ficha do lead.
   *
   * Pela porta única de quem grava sem ser o corretor (a 121): ela só preenche
   * o que está vazio — um lead que já existia e já foi qualificado não é
   * sobrescrito por um segundo envio — e carimba "respondido na landing page"
   * no histórico.
   *
   * Engolida como a mensagem abaixo, e pelo mesmo motivo: o lead já existe.
   */
  const finalidade = FINALIDADES.find((f) => f === c.finalidade) ?? null;
  const prazo = PRAZOS.find((p) => p === c.prazo) ?? null;
  const encaixe = ENCAIXES.find((e) => e === c.encaixe) ?? null;

  /*
   * UMA chamada com as três, e não três chamadas.
   *
   * A porta única escreve o histórico uma vez por preenchimento: três chamadas
   * virariam três linhas na ficha do mesmo lead, dizendo a mesma coisa em
   * pedaços. E ela já sabe ignorar o que vier nulo.
   */
  if (leadId && (finalidade || prazo || encaixe)) {
    const { error: e } = await sb.rpc('lead_preencher_qualificacao', {
      _lead: leadId,
      _origem: 'landing',
      _finalidade: finalidade,
      _prazo: prazo,
      _encaixe: encaixe,
    });
    if (e) console.warn('qualificação não registrada:', e.message);
  }

  if (leadId && mensagem) {
    const { error: e } = await sb.from('lead_timeline_events').insert({
      organization_id: pagina.organization_id,
      lead_id: leadId,
      category: 'mensagem',
      event_type: 'form_submit',
      title: 'Mensagem no formulário da landing page',
      description: mensagem,
      actor_label: nome,
    });
    if (e) console.warn('mensagem não registrada:', e.message);
  }

  return json({ ok: true });
}
