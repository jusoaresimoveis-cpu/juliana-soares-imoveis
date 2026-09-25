import {
  admin,
  graph,
  idDaMeta,
  lerSegredo,
  mensagemDoErro,
  saudeDoErro,
  tokenDaPagina,
  type CacheDePagina,
  type RespostaGraph,
} from '../_shared/meta.ts';

/**
 * Processa os leads de formulário que o webhook enfileirou.
 *
 * Um evento por vez, reivindicado com `for update skip locked`. Falha da Graph
 * NÃO cria lead degradado: volta para a fila com espera crescente.
 *
 * O sistema auditado, quando a chamada à Graph falhava, criava o lead assim
 * mesmo com o nome "Lead Meta 483920" e telefone vazio. O corretor recebia a
 * notificação, abria e não tinha como ligar para ninguém — e o lead de verdade,
 * que chegaria na retentativa, era barrado como duplicata desse fantasma.
 *
 * `verify_jwt = false`: quem chama é o cron do Postgres, que não tem sessão.
 * Autentica por X-Cron-Secret.
 */

const responde = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });

/** Quantos eventos por rodada. Baixo de propósito: cada um é uma ida à Graph. */
const LOTE = 10;

/**
 * Os nomes que o mesmo campo recebe em formulário de verdade.
 *
 * Lista herdada do sistema de referência — é conhecimento acumulado sobre
 * formulário brasileiro, e vale portar. O que não vale é a extração dele, que
 * pegava o PRIMEIRO campo que casasse com qualquer coisa.
 */
const APELIDOS = {
  nome: ['full_name', 'name', 'nome', 'nome_completo', 'first_name'],
  telefone: ['phone_number', 'phone', 'telefone', 'celular', 'whatsapp'],
  email: ['email', 'e-mail', 'e_mail', 'correio'],
};

type Campo = { name?: unknown; values?: unknown };

function extrair(campos: Campo[], quais: string[]): string | null {
  for (const alvo of quais) {
    const achado = campos.find((c) => String(c.name ?? '').toLowerCase() === alvo);
    const valor = Array.isArray(achado?.values) ? achado.values[0] : null;
    if (typeof valor === 'string' && valor.trim()) return valor.trim();
  }
  return null;
}

/**
 * A cidade, quando o formulário perguntou.
 *
 * Não cabe em `APELIDOS`: o campo padrão da Meta chama `city`, mas pergunta
 * personalizada ganha o PRÓPRIO TEXTO como nome — "em_qual_cidade_voce_mora?" —,
 * e nenhuma lista fixa alcança isso. Daí o "contém cidade".
 */
function extrairCidade(campos: Campo[]): string | null {
  const achado = campos.find((c) => {
    const nome = String(c.name ?? '').toLowerCase();
    return nome === 'city' || nome.includes('cidade');
  });
  const valor = Array.isArray(achado?.values) ? achado.values[0] : null;
  if (typeof valor !== 'string') return null;
  // O banco aceita até 80 caracteres (`leads_city_ck`).
  const limpo = valor.trim().slice(0, 80).trim();
  return limpo || null;
}

Deno.serve(async (req) => {
  if (req.headers.get('X-Cron-Secret') !== Deno.env.get('META_CRON_SECRET')) {
    return responde({ erro: 'não autorizado' }, 401);
  }

  const sb = admin();
  const conta = { processados: 0, erros: 0, descartados: 0 };

  /*
   * Um token de Página por rodada, e ele morre com a resposta.
   *
   * O lote inteiro costuma vir da mesma Página, então é uma chamada extra à
   * Graph por rodada — não uma por lead. Fora do handler, a credencial
   * atravessaria requisições no mesmo isolate e envelheceria em silêncio.
   */
  const cacheDePagina: CacheDePagina = new Map();

  try {
    const { data: eventos, error } = await sb.rpc('meta_reivindicar_eventos', { _limit: LOTE });
    if (error) {
      console.error('reivindicar:', error.message);
      return responde({ erro: 'falha ao ler a fila' }, 500);
    }

    for (const evento of (eventos ?? []) as Array<Record<string, unknown>>) {
      const id = evento.id as string;
      const org = evento.organization_id as string;
      const leadgenId = evento.leadgen_id as string;

      /*
       * O token vem da CONEXÃO por onde o evento entrou, não da organização.
       *
       * A URL do webhook sempre carregou o id da conexão — `/meta-webhook/{id}/
       * {segredo}` — e o inbox jogava fora. Sem ele, com duas BMs na mesma casa
       * este `.eq('organization_id', org).single()` passa a ERRAR (duas linhas),
       * e o erro era descartado: o resultado seria "sem token" para TODO evento,
       * seis tentativas cada, e o lead pago virando 'erro' na fila.
       *
       * Errar para o outro lado seria pior: ler o lead da Página de uma BM com
       * a credencial da outra.
       */
      const conexao = evento.integration_id as string | null;

      const { data: integracao } = conexao
        ? await sb
            .from('meta_integrations')
            .select('id, access_token_id')
            .eq('id', conexao)
            .maybeSingle()
        : { data: null };

      const token = integracao?.access_token_id
        ? await lerSegredo(sb, integracao.access_token_id)
        : null;

      if (!token) {
        if (conexao) {
          await sb.rpc('meta_saude', {
            _integracao: conexao,
            _saude: 'precisa_reconectar',
            _msg: 'sem token guardado',
          });
        }
        await sb.rpc('meta_evento_falhou', {
          _id: id,
          _motivo: conexao ? 'sem token' : 'evento sem conexão de origem',
        });
        conta.erros++;
        continue;
      }

      /*
       * O id passa pelo validador ANTES de virar caminho de URL.
       *
       * Era o único que o sistema auditado esquecia, e ele ia cru para a Graph
       * junto com o token da organização — um valor como
       * `me/accounts?fields=access_token&x=` fazia o servidor consultar outra
       * coisa inteiramente e despejar a resposta no log.
       */
      const seguro = idDaMeta(leadgenId);
      if (!seguro) {
        await sb
          .from('meta_webhook_inbox')
          .update({ status: 'descartado', motivo: 'leadgen_id inválido', processed_at: new Date().toISOString() })
          .eq('id', id);
        conta.descartados++;
        continue;
      }

      /*
       * A leitura do lead vai com o token DA PÁGINA.
       *
       * Com o do usuário do sistema a Graph devolve erro 200 — e como isso
       * aconteceria em TODO evento, a fila inteira entraria em espera crescente
       * e o cliente veria "nenhum lead chegou" sem nada quebrado à vista. Foi o
       * mesmo engano que fez a busca de leads antigos voltar vazia.
       */
      const pageId = evento.page_id as string | null;
      const daPagina = pageId
        ? await tokenDaPagina(pageId, token, cacheDePagina)
        : { token: null, codigo: null, status: 0 };

      if (!daPagina.token) {
        const motivo = pageId
          ? mensagemDoErro(daPagina.codigo, daPagina.status)
          : 'evento sem página de origem';
        // `sem_permissao`, não `precisa_reconectar`: o token está vivo, o que
        // falta é cargo na Página. Mandar reconectar levaria a pessoa a repetir
        // o passo que já está certo.
        await sb.rpc('meta_saude', {
          _integracao: conexao,
          _saude: daPagina.codigo ? saudeDoErro(daPagina.codigo) : 'erro',
          _codigo: daPagina.codigo,
          _msg: `sem token da Página: ${motivo}`,
        });
        await sb.rpc('meta_evento_falhou', { _id: id, _motivo: motivo.slice(0, 200) });
        conta.erros++;
        continue;
      }

      let r: RespostaGraph;
      try {
        r = await graph(
          `/${seguro}?fields=id,created_time,field_data,ad_id,adset_id,campaign_id,form_id,is_organic,platform`,
          daPagina.token,
        );
      } catch (e) {
        console.error('graph:', e);
        await sb.rpc('meta_evento_falhou', { _id: id, _motivo: 'rede' });
        conta.erros++;
        continue;
      }

      if (!r.ok) {
        /*
         * O erro da Graph vem no CORPO, com 200 no HTTP em vários casos. Quem
         * olha só o status conclui que deu certo — e o sistema auditado gravava
         * `success` no histórico mesmo quando todas as chamadas falharam.
         */
        const saude = saudeDoErro(r.codigo);
        if (saude !== 'erro') {
          await sb.rpc('meta_saude', {
            _integracao: conexao,
            _saude: saude,
            _codigo: r.codigo,
            _msg: `Graph respondeu ${r.codigo}`,
          });
        }
        await sb.rpc('meta_evento_falhou', {
          _id: id,
          _codigo: r.codigo,
          _motivo: `Graph ${r.codigo ?? r.status}`,
        });
        conta.erros++;
        continue;
      }

      // Chegou aqui: o acesso está vivo.
      await sb.rpc('meta_saude', { _integracao: conexao, _saude: 'ok' });

      const d = r.dados as {
        created_time?: string;
        field_data?: Campo[];
        ad_id?: unknown;
        form_id?: unknown;
        is_organic?: boolean;
      };
      const campos = Array.isArray(d.field_data) ? d.field_data : [];
      const captadoEm = d.created_time ?? new Date().toISOString();

      /*
       * O cru é gravado ANTES da extração, e é isso que dá segunda chance.
       *
       * Dentro do `field_data` está o consentimento que a pessoa marcou — e a
       * Meta apaga o dado dela em 90 dias. O sistema auditado extraía nome e
       * telefone e descartava o resto: a prova de consentimento deixava de
       * existir, e as respostas de qualificação junto.
       */
      const ehTeste = d.is_organic === true;

      await sb.from('meta_lead_submissions').upsert(
        {
          organization_id: org,
          leadgen_id: seguro,
          form_id: String(idDaMeta(d.form_id) ?? evento.form_id ?? ''),
          field_data: { campos, bruto: d },
          is_organic: d.is_organic === true,
          is_test: ehTeste,
          captado_em: captadoEm,
        },
        { onConflict: 'organization_id,leadgen_id' },
      );

      /*
       * Lead de teste da Meta não entra na operação.
       *
       * Ele chega pela MESMA porta que os reais. Sem esta separação, ele toma
       * uma posição da fila de corretores, dispara notificação e barateia o
       * custo por lead com um lead que não existe.
       */
      if (ehTeste) {
        await sb
          .from('meta_webhook_inbox')
          .update({ status: 'descartado', motivo: 'lead orgânico/teste', processed_at: new Date().toISOString() })
          .eq('id', id);
        conta.descartados++;
        continue;
      }

      const nome = extrair(campos, APELIDOS.nome);
      const telefone = extrair(campos, APELIDOS.telefone);
      const email = extrair(campos, APELIDOS.email);

      // Sem nenhuma forma de contato não existe lead — existe um registro que
      // faz o corretor perder tempo. Fica como erro, visível, com o cru salvo.
      if (!telefone && !email) {
        await sb.rpc('meta_evento_falhou', {
          _id: id,
          _motivo: 'formulário sem telefone nem e-mail',
        });
        conta.erros++;
        continue;
      }

      const { data: criado, error: erroLead } = await sb.rpc('find_or_create_lead', {
        _org: org,
        _full_name: nome ?? 'Sem nome',
        _phone: telefone,
        _email: email,
        _source: 'meta_ads',
        _entry_point: 'formulario_meta',
        _attribution: {
          // As chaves são as que `find_or_create_lead` LÊ. Passar `ft_meta_ad_id`
          // aqui — que é o nome da COLUNA — faz o valor cair no vazio: o lead
          // nasce sem atribuição e com método 'none'. Já aconteceu neste projeto.
          meta_ad_id: idDaMeta(d.ad_id),
          method: 'form',
          occurred_at: captadoEm,
        },
      });

      if (erroLead) {
        console.error('find_or_create_lead:', erroLead.message);
        await sb.rpc('meta_evento_falhou', { _id: id, _motivo: erroLead.message.slice(0, 200) });
        conta.erros++;
        continue;
      }

      const leadId = (criado as Array<{ o_lead_id: string }> | null)?.[0]?.o_lead_id ?? null;

      /*
       * Só preenche o VAZIO. O lead pode já existir — a pessoa escreveu antes
       * pelo WhatsApp e o corretor anotou a cidade na conversa —, e a resposta
       * de um formulário não passa por cima do que alguém confirmou falando com
       * ela.
       */
      const cidade = extrairCidade(campos);
      if (leadId && cidade) {
        await sb.from('leads').update({ city: cidade }).eq('id', leadId).is('city', null);
      }

      await sb.from('meta_lead_submissions').update({ lead_id: leadId })
        .eq('organization_id', org).eq('leadgen_id', seguro);

      await sb
        .from('meta_webhook_inbox')
        .update({ status: 'processado', lead_id: leadId, processed_at: new Date().toISOString() })
        .eq('id', id);

      conta.processados++;
    }

    return responde(conta);
  } catch (e) {
    console.error('meta-trabalhador:', e);
    return responde({ erro: 'interno' }, 500);
  }
});
