import { admin, graph, lerSegredo, mensagemDoErro, saudeDoErro, LIMITE_PRUDENTE } from '../_shared/meta.ts';
import { CAMPOS_DE_NOME, dimensoesDe, type Linha } from './dimensoes.ts';
import {
  BORDAS_DE_ENTREGA,
  BORDA_DA_PAGINA,
  entregaDe,
  paginasDeAnuncio,
  type ObjetoDaMeta,
} from './entrega.ts';
import { resultadosDe } from './resultados.ts';

/**
 * Importa o gasto por anúncio por dia.
 *
 * É o número que decide verba, então nenhuma etapa aqui pode errar em silêncio.
 * Cada decisão abaixo fecha um defeito confirmado na auditoria do sistema de
 * referência.
 *
 * `verify_jwt = false`: chamado pelo cron e pelo botão da tela (que passa pelo
 * meta-conectar). Autentica por X-Cron-Secret.
 */

const responde = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });

/** Teto de páginas por conta. Existe para a função não rodar para sempre. */
const MAX_PAGINAS = 40;

/*
 * Teto do estado, POR NÍVEL e bem mais baixo.
 *
 * São objetos, não dias: com 500 por página, dez páginas cobrem cinco mil
 * anúncios numa conta. Quem passar disso tem um problema de organização que
 * este cron não resolve — e o custo de tentar é atrasar a importação do gasto,
 * que é o número que decide verba.
 */
const MAX_PAGINAS_DE_ESTADO = 10;

/**
 * String da Meta para inteiro na unidade mínima.
 *
 * `parseFloat(x) || 0` — o que a referência fazia — transforma campo ausente e
 * NaN em ZERO, e esse zero é gravado por cima do gasto correto do dia. Aqui,
 * valor que não converte devolve null e ABORTA a linha.
 */
function paraMenor(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) && v >= 0 ? Math.round(v * 100) : null;
  if (typeof v !== 'string') return null;
  const t = v.trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}

function paraInteiro(v: unknown): number | null {
  if (typeof v !== 'string' && typeof v !== 'number') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : null;
}

/** Data no fuso da CONTA de anúncios, não no do servidor nem no do navegador. */
function diaNoFuso(quandoMs: number, fuso: string): string {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: fuso,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return f.format(new Date(quandoMs));
}

Deno.serve(async (req) => {
  if (req.headers.get('X-Cron-Secret') !== Deno.env.get('META_CRON_SECRET')) {
    return responde({ erro: 'não autorizado' }, 401);
  }

  const sb = admin();
  const corpo = (await req.json().catch(() => ({}))) as { modo?: string; org?: string };
  /*
   * Duas janelas, e a segunda não é luxo: a Meta REVISA o gasto retroativamente
   * por até 28 dias. Importar uma vez e nunca mais voltar deixa o número da
   * tela divergindo do painel da Meta, e a divergência só aumenta.
   */
  const modo = corpo.modo === 'reconciliar' ? 'reconciliar' : 'quente';

  const { data: contas } = await sb
    .from('meta_ad_accounts')
    // `integration_id` é o que passou a decidir COM QUAL TOKEN buscar o gasto
    // desta conta. Antes o token vinha da organização, e com duas BMs na mesma
    // casa a consulta por organização devolve duas linhas.
    .select('organization_id, integration_id, ad_account_id, currency, timezone_name')
    .eq('enabled', true); // a allowlist: só o que alguém ligou de propósito

  const resumo: Record<string, unknown>[] = [];

  /*
   * Um token por CONEXÃO, resolvido uma vez.
   *
   * O laço passa por todas as contas ligadas do produto, e várias contas
   * pertencem à mesma conexão — ler o cofre a cada volta seria uma chamada por
   * conta. O cache morre com a requisição: credencial em escopo de módulo
   * atravessaria requisições de outros clientes no mesmo isolate.
   */
  const tokens = new Map<string, string | null>();

  for (const conta of (contas ?? []) as Array<Record<string, string>>) {
    const org = conta.organization_id;
    if (corpo.org && corpo.org !== org) continue;

    const fuso = conta.timezone_name || 'America/Sao_Paulo';
    const hoje = diaNoFuso(Date.now(), fuso);
    const dia = (n: number) => diaNoFuso(Date.now() - n * 86400000, fuso);

    const since = modo === 'quente' ? dia(3) : dia(28);
    const until = modo === 'quente' ? hoje : dia(4);

    const conexao = conta.integration_id;
    if (!conexao) {
      // Conta sem conexão não tem token possível. Acontece com linha antiga que
      // o backfill não alcançou — e é melhor pular dizendo o motivo do que
      // buscar com a credencial de outra pessoa.
      resumo.push({ conta: conta.ad_account_id, pulado: 'sem conexão' });
      continue;
    }

    if (!tokens.has(conexao)) {
      const { data: integracao } = await sb
        .from('meta_integrations')
        .select('access_token_id')
        .eq('id', conexao)
        .maybeSingle();
      tokens.set(
        conexao,
        integracao?.access_token_id ? await lerSegredo(sb, integracao.access_token_id) : null,
      );
    }

    const token = tokens.get(conexao) ?? null;
    if (!token) {
      resumo.push({ conta: conta.ad_account_id, pulado: 'sem token' });
      continue;
    }

    /*
     * A linha 'running' É a trava.
     *
     * O índice único parcial da 017 recusa uma segunda execução do mesmo tipo
     * para a mesma conta. Sem isso, clicar "importar" enquanto o cron roda
     * dispara duas importações da mesma janela escrevendo nas mesmas linhas.
     */
    const { data: run, error: erroRun } = await sb
      .from('meta_sync_runs')
      .insert({
        organization_id: org,
        integration_id: conexao,
        kind: 'insights',
        ad_account_id: conta.ad_account_id,
        window_since: since,
        window_until: until,
        status: 'running',
      })
      .select('id')
      .single();

    if (erroRun || !run) {
      resumo.push({ conta: conta.ad_account_id, pulado: 'já em execução' });
      continue;
    }

    let paginas = 0;
    let lidas = 0;
    let escritas = 0;
    let semNome = 0;
    /*
     * Contadas à parte das do gasto DE PROPÓSITO.
     *
     * `paginas` alimenta a regra de truncamento — passar do teto significa que
     * o gasto veio cortado. Somar as páginas de estado ali marcaria a rodada
     * como incompleta por causa de uma consulta que nem gasto traz.
     */
    let paginasDeEstado = 0;
    let niveisSemEstado = 0;
    let anunciosComPagina = 0;
    let truncado = false;
    let erroCodigo: number | null = null;
    let erroMsg: string | null = null;

    try {
      /*
       * `inline_link_clicks` ao lado de `clicks`, e nunca no lugar dele.
       *
       * `clicks` é clique em qualquer lugar do anúncio — curtir, comentar,
       * expandir foto, arrastar carrossel. `inline_link_clicks` é clique no
       * link, que é o único que vira visita. Em criativo de imóvel a diferença
       * entre os dois passa da metade, e chamar o primeiro de "CTR" é o tipo de
       * métrica com nome conhecido e definição trocada que ninguém desconfia.
       *
       * Os dois ficam guardados: o total continua sendo o número certo para
       * medir INTERAÇÃO, que também é sinal — só não é sinal de intenção.
       */
      const campos =
        `campaign_id,adset_id,ad_id,${CAMPOS_DE_NOME},spend,impressions,clicks,` +
        `inline_link_clicks,actions,account_currency`;
      let caminho =
        `/${conta.ad_account_id}/insights?level=ad&fields=${campos}` +
        `&time_increment=1&limit=200` +
        `&time_range=${encodeURIComponent(JSON.stringify({ since, until }))}`;

      while (caminho && paginas < MAX_PAGINAS) {
        const r = await graph(caminho, token);
        paginas++;

        if (!r.ok) {
          erroCodigo = r.codigo;
          erroMsg = mensagemDoErro(r.codigo, r.status);
          const saude = saudeDoErro(r.codigo);
          if (saude !== 'erro') {
            // A saúde é da CONEXÃO. Por organização, o token vencido de uma BM
            // marcaria as duas como quebradas e a outra apareceria morta sem
            // ninguém saber qual reconectar.
            await sb.rpc('meta_saude', {
              _integracao: conexao,
              _saude: saude,
              _codigo: r.codigo,
              _msg: erroMsg,
            });
          }
          break;
        }

        const linhas = (r.dados.data ?? []) as Linha[];
        lidas += linhas.length;

        const paraGravar = [];
        for (const l of linhas) {
          const menor = paraMenor(l.spend);
          // Linha que não converte NÃO vira zero: fica de fora e a execução
          // termina como 'parcial', que é a verdade.
          if (menor === null || !l.date_start || !l.campaign_id) continue;

          /*
           * Os resultados vêm de `actions`, que é uma lista de uns quinze tipos
           * diferentes. Cadastro e conversa saem separados e assim ficam: uma
           * coluna só, cujo sentido dependesse do objetivo da campanha, faria
           * qualquer total entre campanhas de tipos diferentes virar um número
           * que não responde a pergunta nenhuma.
           */
          const res = resultadosDe(l.actions);

          paraGravar.push({
            organization_id: org,
            ad_account_id: conta.ad_account_id,
            campaign_id: l.campaign_id,
            // Sentinela '' e não null: é o que faz a chave única funcionar.
            adset_id: l.adset_id ?? '',
            ad_id: l.ad_id ?? '',
            date: l.date_start,
            currency: (l.account_currency ?? conta.currency ?? 'BRL').slice(0, 3),
            report_timezone: fuso,
            spend_minor: menor,
            impressions: paraInteiro(l.impressions),
            clicks: paraInteiro(l.clicks),
            // Nulo quando a Meta não mandou — e toda linha anterior à 105
            // continua nula, que é o que impede o gráfico de CTR de desenhar
            // uma queda a pique no dia em que a coleta começou.
            link_clicks: paraInteiro(l.inline_link_clicks),
            // `null` quando a Meta mandou algo que não é número — que é
            // diferente de zero, e precisa continuar diferente: zero afirma
            // "não converteu", nulo diz "não sabemos".
            lead_count: res.cadastros,
            messaging_count: res.conversas,
            import_run_id: run.id,
            synced_at: new Date().toISOString(),
          });
        }

        if (paraGravar.length > 0) {
          // A gravação é POR PÁGINA. Guardar tudo para o fim significa perder o
          // lote inteiro quando a página 12 falha.
          const { error } = await sb.from('meta_ads_spend').upsert(paraGravar, {
            onConflict: 'organization_id,ad_account_id,campaign_id,adset_id,ad_id,date',
          });
          // O erro é CONFERIDO. A referência ignorava o retorno do upsert e
          // gravava 'success' no histórico de qualquer jeito.
          if (error) {
            erroMsg = error.message.slice(0, 300);
            break;
          }
          escritas += paraGravar.length;
        }

        /*
         * Os nomes vão DEPOIS do gasto, e a falha deles não derruba a rodada.
         *
         * Gasto é o número que decide verba; nome é como ele se chama na tela.
         * Perder a importação inteira porque a tabela de nomes recusou uma
         * linha seria trocar o essencial pelo cosmético.
         *
         * E não é silêncio: quando o nome falta, a própria tela escreve "nome
         * ainda não sincronizado" ao lado do id. O sintoma aparece onde a
         * pessoa está olhando, que é o que separa "degradar" de "esconder".
         */
        const dims = dimensoesDe(linhas, org, conta.ad_account_id, new Date().toISOString());
        if (dims.length > 0) {
          const { error: erroDim } = await sb
            .from('meta_ad_dimensions')
            .upsert(dims, { onConflict: 'organization_id,level,object_id' });
          if (erroDim) {
            semNome += dims.length;
            console.error('dimensões:', erroDim.message);
          }
        }

        // Para ANTES de estourar o limite. Em aplicativo novo o teto é baixo, e
        // insistir prolonga o bloqueio em vez de resolver.
        if (r.uso >= LIMITE_PRUDENTE) {
          truncado = true;
          break;
        }

        const proxima = (r.dados.paging as { next?: string } | undefined)?.next;
        // A referência parava na primeira página e nunca dizia: o gasto vinha
        // cortado em 500 linhas e o total simplesmente parava de crescer.
        caminho = proxima ? proxima.replace(/^https:\/\/graph\.facebook\.com\/v\d+\.\d+/, '') : '';
        if (!caminho) break;
      }

      if (paginas >= MAX_PAGINAS) truncado = true;

      /*
       * O ESTADO de cada objeto — a pergunta "isto ainda está no ar?".
       *
       * O insights não responde. Ele diz quanto se gastou de tal a tal dia, e
       * um anúncio que gastou R$ 500 na semana passada e foi pausado ontem
       * volta com os mesmos R$ 500, indistinguível do que está rodando agora.
       * A tela listava os dois juntos, e não havia como separar.
       *
       * Vem DEPOIS do gasto e num bloco próprio, pela mesma razão que os nomes:
       * gasto é o número que decide verba, estado é o filtro que ajuda a
       * lê-lo. Falha aqui não derruba a rodada — e não é silêncio, porque a
       * tela escreve "sem estado" ao lado de quem ficou sem, e o resumo da
       * execução conta quantos níveis falharam.
       */
      if (!erroMsg) {
        for (const b of BORDAS_DE_ENTREGA) {
          // Os campos vêm do PRÓPRIO nível: anúncio não tem orçamento, e pedir
          // um campo que não existe naquela borda derruba a página inteira.
          let rota = `/${conta.ad_account_id}/${b.borda}?fields=${b.campos}&limit=500`;
          let folhas = 0;

          while (rota && folhas < MAX_PAGINAS_DE_ESTADO) {
            const r = await graph(rota, token);
            folhas++;
            paginasDeEstado++;

            if (!r.ok) {
              niveisSemEstado++;
              console.error(`entrega ${b.nivel}:`, mensagemDoErro(r.codigo, r.status));
              break;
            }

            const estados = entregaDe(
              (r.dados.data ?? []) as ObjetoDaMeta[],
              b.nivel,
              org,
              conta.ad_account_id,
              new Date().toISOString(),
            );

            if (estados.length > 0) {
              /*
               * O lote leva SÓ o estado. O `on conflict` do PostgREST atualiza
               * apenas as colunas presentes, então esta gravação convive com a
               * dos nomes na mesma linha sem uma apagar a outra.
               */
              const { error } = await sb
                .from('meta_ad_dimensions')
                .upsert(estados, { onConflict: 'organization_id,level,object_id' });
              if (error) {
                niveisSemEstado++;
                console.error(`entrega ${b.nivel}:`, error.message);
                break;
              }
            }

            if (r.uso >= LIMITE_PRUDENTE) break;
            const prox = (r.dados.paging as { next?: string } | undefined)?.next;
            rota = prox ? prox.replace(/^https:\/\/graph\.facebook\.com\/v\d+\.\d+/, '') : '';
          }
        }
      }

      /*
       * A PÁGINA DE CADA ANÚNCIO — para a conversão conseguir voltar.
       *
       * Bloco PRÓPRIO, depois do estado e com falha contida, e a separação é a
       * decisão: esta consulta pede um campo ANINHADO (`creative{...}`), e
       * campo aninhado que a Graph não entende derruba a página inteira da
       * resposta. Se isso acontecesse dentro do bloco de cima, levaria junto o
       * `effective_status` — que é o que separa anúncio no ar de anúncio
       * pausado na tela que decide verba.
       *
       * Aqui, se falhar, o gasto e o estado já estão gravados e o único efeito
       * é a conversão continuar sem conseguir voltar, dizendo por quê na fila.
       */
      if (!erroMsg) {
        let rota = `/${conta.ad_account_id}/${BORDA_DA_PAGINA.borda}` +
          `?fields=${BORDA_DA_PAGINA.campos}&limit=500`;
        let folhas = 0;

        while (rota && folhas < MAX_PAGINAS_DE_ESTADO) {
          const r = await graph(rota, token);
          folhas++;
          paginasDeEstado++;

          if (!r.ok) {
            console.error('pagina do anuncio:', mensagemDoErro(r.codigo, r.status));
            break;
          }

          const paginas = paginasDeAnuncio(
            (r.dados.data ?? []) as { id?: string; creative?: { effective_object_story_id?: unknown } }[],
            org,
            conta.ad_account_id,
          );

          if (paginas.length > 0) {
            /* O lote leva SÓ a página, como o de estado leva só o estado: o
               `on conflict` do PostgREST toca apenas as colunas presentes. */
            const { error } = await sb
              .from('meta_ad_dimensions')
              .upsert(paginas, { onConflict: 'organization_id,level,object_id' });
            if (error) {
              console.error('pagina do anuncio:', error.message);
              break;
            }
            anunciosComPagina += paginas.length;
          }

          if (r.uso >= LIMITE_PRUDENTE) break;
          const prox = (r.dados.paging as { next?: string } | undefined)?.next;
          rota = prox ? prox.replace(/^https:\/\/graph\.facebook\.com\/v\d+\.\d+/, '') : '';
        }
      }

      /*
       * Reconciliação: o que sumiu do relatório vira zero.
       *
       * A Meta só devolve linha com atividade. Um anúncio que teve gasto no dia
       * 5 e depois foi revisado para zero simplesmente não volta — e sem isto o
       * valor antigo fica na tela para sempre, um gasto fantasma que ninguém
       * consegue explicar.
       */
      if (!erroMsg && !truncado) {
        await sb.rpc('meta_zerar_ausentes', {
          _org: org,
          _conta: conta.ad_account_id,
          _since: since,
          _until: until,
          _run: run.id,
        });
      }
    } catch (e) {
      erroMsg = String(e).slice(0, 300);
    } finally {
      /*
       * O status é escrito no `finally`, sempre.
       *
       * A referência escrevia 'success' depois do processamento, no caminho
       * feliz — então uma exceção no meio deixava a execução eternamente
       * 'running', e o painel dizia que estava sincronizando.
       *
       * E 'parcial' existe: escrito ≠ lido não é sucesso.
       */
      const status = erroMsg ? 'erro' : truncado || escritas < lidas ? 'parcial' : 'ok';
      await sb
        .from('meta_sync_runs')
        .update({
          status,
          pages_fetched: paginas,
          rows_fetched: lidas,
          rows_written: escritas,
          truncated: truncado,
          error_code: erroCodigo,
          error_message: erroMsg,
          finished_at: new Date().toISOString(),
        })
        .eq('id', run.id);

      resumo.push({
        conta: conta.ad_account_id,
        status,
        paginas,
        lidas,
        escritas,
        // Só aparece quando houve falha ao gravar nome. Zero omitido para o
        // resumo não sugerir problema onde não há.
        ...(semNome > 0 ? { sem_nome: semNome } : {}),
        ...(paginasDeEstado > 0 ? { paginas_estado: paginasDeEstado } : {}),
        ...(niveisSemEstado > 0 ? { niveis_sem_estado: niveisSemEstado } : {}),
        ...(anunciosComPagina > 0 ? { anuncios_com_pagina: anunciosComPagina } : {}),
        janela: `${since}..${until}`,
      });
    }
  }

  return responde({ modo, contas: resumo });
});
