import { admin } from '../_shared/wa.ts';
import { enviarConversao, type Acao } from '../_shared/meta-capi.ts';

/**
 * Devolve à Meta as conversões que o CRM registrou.
 *
 * O CONTRÁRIO DE TODAS AS OUTRAS FUNÇÕES `meta-*` DESTE REPOSITÓRIO: elas
 * trazem o que a Meta sabe (gasto, formulário, anúncio). Esta leva o que só o
 * CRM sabe — que aquele clique virou ficha, que aquela ficha marcou visita, que
 * aquela visita virou proposta.
 *
 * É o que fecha o ciclo do método: sem isto o algoritmo aprende com quem
 * CLICOU, e clique é de graça. Com isto ele aprende com quem virou cliente.
 *
 * Um evento por chamada, e não o lote inteiro num POST. A Meta aceita mil de
 * uma vez, mas recusa o pacote inteiro quando UM está malformado — e aí não há
 * como saber qual, nem como registrar o motivo na linha certa. O volume aqui é
 * de dezenas por semana; precisão vale mais que economia de chamada.
 *
 * `verify_jwt = false`: quem chama é o cron do Postgres, que não tem sessão.
 * Autentica por X-Cron-Secret.
 */

const responde = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });

/** Quantos por rodada. O cron bate de minuto em minuto: a fila esvazia rápido
    sem precisar de um lote grande, e lote grande é o que estoura o tempo. */
const LOTE = 20;

/** Teto da rodada inteira. A função de borda é derrubada aos 150 s; parar por
    conta própria bem antes disso deixa o que sobrou na fila em vez de perdido. */
const TETO_DE_TEMPO_MS = 40_000;

/**
 * A janela da Meta, conferida AQUI TAMBÉM.
 *
 * O `meta_conversoes_expirar()` já limpa os velhos a cada minuto, mas entre a
 * reivindicação e o envio existe um intervalo, e um evento na beira dos sete
 * dias pode cruzar a linha no meio do caminho. Descobrir isso aqui custa uma
 * comparação; descobrir pela Meta custa uma chamada e um erro no registro.
 */
const JANELA_MS = 7 * 24 * 3_600_000;

/*
 * OS DOIS VOCABULÁRIOS DA META.
 *
 * Cópia de `CONVERSAO_NA_CONVERSA` e `CONVERSAO_NO_SITE`, em
 * `packages/contracts/meta-conversoes.ts` — a função de borda roda em Deno e não enxerga o
 * pacote de contratos. A cópia é conferida por teste (`src/conversoes.test.ts`),
 * a mesma disciplina das listas de qualificação na `landing-lead`.
 *
 * E é por elas existirem que a FILA guarda o fato do CRM em vez do nome da
 * Meta: `Lead` vale no site e é recusado com 400 na conversa. Uma linha só não
 * consegue estar certa para as duas portas.
 */
const NA_CONVERSA: Record<string, string> = {
  lead: 'LeadSubmitted',
  visita_agendada: 'QualifiedLead',
  proposta: 'InitiateCheckout',
  venda: 'Purchase',
  /* `visita_realizada` de propósito ausente: a lista do CTWA não tem nome para
     ela, e o descarte abaixo diz isso em vez de inventar um. */
};

/* Vale para `website` e para `chat`. Aqui a Meta aceita nome PRÓPRIO, e é por
   isso que `VisitaRealizada` cabe nesta e não na de cima. */
const NO_SITE: Record<string, string> = {
  lead: 'Lead',
  visita_agendada: 'Schedule',
  visita_realizada: 'VisitaRealizada',
  proposta: 'InitiateCheckout',
  venda: 'Purchase',
};

interface Linha {
  o_id: string;
  o_evento: string;
  o_ocorrido_em: string;
  o_valor_centavos: number | null;
  o_pixel_id: string | null;
  o_dataset_id: string | null;
  o_waba_id: string | null;
  o_page_id: string | null;
  o_ctwa_clid: string | null;
  o_telefone: string | null;
  o_email: string | null;
  o_acao: string;
}

Deno.serve(async (req) => {
  if (req.headers.get('X-Cron-Secret') !== Deno.env.get('META_CRON_SECRET')) {
    return responde({ erro: 'não autorizado' }, 401);
  }

  const sb = admin();
  const conta = { enviados: 0, refeitos: 0, descartados: 0 };
  const comecou = Date.now();

  const { data, error } = await sb.rpc('meta_conversoes_reivindicar', { _limite: LOTE });
  if (error) {
    console.error('meta-conversoes: não deu para reivindicar:', error.message);
    return responde({ erro: 'fila' }, 500);
  }

  for (const linha of (data ?? []) as Linha[]) {
    if (Date.now() - comecou > TETO_DE_TEMPO_MS) {
      /* O que sobrou volta para a fila em vez de ficar preso em `processando`
         até alguém reparar. O cron da próxima volta pega. */
      await sb.rpc('meta_conversao_falhou', {
        _id: linha.o_id,
        _codigo: null,
        _motivo: 'rodada cheia — devolvido para a próxima',
      });
      conta.refeitos++;
      continue;
    }

    /*
     * `business_messaging` é a rota do CTWA, e só ela carrega as exigências de
     * clique e Página. `chat` é a conversão que aconteceu num aplicativo de
     * mensagens sem conta oficial atrás — mesmo pixel, mesmo vocabulário do
     * site, casada pelo telefone em hash.
     */
    const naConversa = linha.o_acao === 'business_messaging';
    const quandoMs = new Date(linha.o_ocorrido_em).getTime();

    /*
     * O DESTINO, e ele muda com a porta.
     *
     * Site vai para o pixel da imobiliária. Conversa tem de ir para o conjunto
     * de dados criado a partir da conta do WhatsApp na Meta — é outro lugar, e
     * mandar para o pixel do site não é "quase certo", é errado.
     *
     * Quando o conjunto não existe ainda, o evento sai para o pixel assim
     * mesmo. Não é teimosia: é para a recusa da META ficar registrada na fila,
     * com o texto dela, em vez de a gente decidir por conta própria que não dá.
     */
    const destino = naConversa ? (linha.o_dataset_id ?? linha.o_pixel_id) : linha.o_pixel_id;
    const nome = (naConversa ? NA_CONVERSA : NO_SITE)[linha.o_evento];

    if (!destino) {
      await sb.rpc('meta_conversao_descartar', {
        _id: linha.o_id,
        _motivo: 'a imobiliária não tem pixel nem conjunto de dados configurado',
      });
      conta.descartados++;
      continue;
    }

    if (!nome) {
      /* Fato novo na fila sem tradução nas duas tabelas acima. Não pode
         acontecer — o CHECK do banco e o teste seguram —, e se acontecer é
         melhor dizer o nome do fato do que mandar `undefined` para a Meta. */
      await sb.rpc('meta_conversao_descartar', {
        _id: linha.o_id,
        _motivo: `sem tradução para "${linha.o_evento}" em ${linha.o_acao}`,
      });
      conta.descartados++;
      continue;
    }

    if (Date.now() - quandoMs > JANELA_MS) {
      await sb.rpc('meta_conversao_descartar', {
        _id: linha.o_id,
        _motivo: 'passou de 7 dias — a Meta não aceita mais',
      });
      conta.descartados++;
      continue;
    }

    /*
     * NA CONVERSA, O CLIQUE É OBRIGATÓRIO. Telefone não substitui.
     *
     * A Meta foi explícita: "Seu evento LeadSubmitted com a fonte da ação
     * business_messaging do canal whatsapp não tem um parâmetro ctwa_clid".
     * Faz sentido — num evento de site ela casa a pessoa pelo hash do contato,
     * mas numa conversa o que ela precisa ligar é o CLIQUE que foi pago, e só
     * o `ctwa_clid` diz qual foi.
     *
     * Existem uns poucos leads assim: vieram de anúncio (o `sourceID` chegou no
     * `contextInfo`) mas sem o clique junto. Eles não têm conserto — insistir
     * gastaria as seis tentativas para ouvir a mesma frase seis vezes.
     */
    /*
     * E A PÁGINA TEM DE SER A DO ANÚNCIO.
     *
     * "Para eventos de CTWA, o parâmetro 'ctwa_clid' deve ser gerado usando o
     * mesmo ID que o parâmetro 'page_id'." A Página conectada ao CRM não serve:
     * a casa anuncia por quatro contas, e mandar uma página fixa acerta no
     * máximo uma delas.
     *
     * Falta quer dizer que a importação de gasto ainda não passou por este
     * anúncio. Volta para a fila (não é descarte) — é uma espera de até uma
     * hora, e o evento continua dentro dos sete dias.
     */
    if (naConversa && !linha.o_page_id) {
      await sb.rpc('meta_conversao_falhou', {
        _id: linha.o_id,
        _codigo: null,
        _motivo: 'ainda sem a página do anúncio — esperando a importação de gasto passar por ele',
      });
      conta.refeitos++;
      continue;
    }

    if (naConversa && !linha.o_ctwa_clid) {
      await sb.rpc('meta_conversao_descartar', {
        _id: linha.o_id,
        _motivo: 'veio de anúncio mas sem o ctwa_clid do clique — a Meta exige ele na conversa',
      });
      conta.descartados++;
      continue;
    }

    /*
     * Fora do CTWA, pelo menos um identificador de PESSOA.
     *
     * É o que a rota `chat` usa para casar, e é tudo que ela tem: sem clique,
     * o telefone em hash é a única ponte até alguém que viu o anúncio. Um
     * evento sem nada disso é recusado com 400, e gastaria as seis tentativas
     * da fila para descobrir o que dá para saber aqui.
     */
    if (!naConversa && !linha.o_telefone && !linha.o_email) {
      await sb.rpc('meta_conversao_descartar', {
        _id: linha.o_id,
        _motivo: 'sem telefone, e-mail ou clique — a Meta não teria como casar',
      });
      conta.descartados++;
      continue;
    }

    const r = await enviarConversao({
      pixelId: destino,
      evento: nome,
      acao: linha.o_acao as Acao,
      quando: Math.floor(quandoMs / 1000),
      /*
       * O `event_id` é o id da LINHA, e é por isso que a tabela tem um único
       * registro por (lead, evento): duas tentativas do mesmo evento chegam à
       * Meta com o mesmo id e ela junta as duas numa só. Sem isso, uma falha de
       * rede que na verdade deu certo contaria a conversão duas vezes.
       */
      eventID: linha.o_id,
      telefone: linha.o_telefone,
      email: linha.o_email,
      ctwaClid: linha.o_ctwa_clid,
      wabaId: linha.o_waba_id,
      pageId: linha.o_page_id,
      valor: linha.o_valor_centavos ? linha.o_valor_centavos / 100 : null,
      /* Fixo em BRL, como a `landing_publica` e a `landing-lead` já fazem: não
         existe coluna de moeda no negócio, e o preço é sempre em real. */
      moeda: 'BRL',
    });

    if (r.ok) {
      await sb.rpc('meta_conversao_enviada', { _id: linha.o_id });
      conta.enviados++;
    } else if (r.permanente) {
      /* 400 da Meta: este evento está errado e vai continuar errado. Insistir
         seria queimar limite de chamada para sempre pelo mesmo motivo. O texto
         dela fica na linha — foi ele que ensinou, na 141, que a conversa tem
         vocabulário próprio. */
      await sb.rpc('meta_conversao_descartar', {
        _id: linha.o_id,
        _motivo: `a Meta recusou: ${r.motivo}`,
      });
      conta.descartados++;
    } else {
      await sb.rpc('meta_conversao_falhou', {
        _id: linha.o_id,
        _codigo: r.status,
        _motivo: r.motivo,
      });
      conta.refeitos++;
    }
  }

  return responde(conta);
});
