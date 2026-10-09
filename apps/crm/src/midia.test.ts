import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  colapsado,
  definicaoDaFuncao,
  semComentarios,
  tarefaAgendada,
} from '../../../supabase/testes/esquema';

/**
 * A foto que o cliente mandou — a migração 125.
 *
 * O defeito custou 40.600 mensagens gravadas como texto puro, e era de uma
 * linha: a 012 comparou `lower('ImageMessage')` com `'image'`. Nenhum ramo
 * casava, tudo virava texto, `media_status` nascia `sem_midia`, e o trabalhador
 * — que procura por `pendente` — nunca teve o que baixar.
 *
 * Estes testes guardam o mapeamento CONTRA OS VALORES REAIS do provedor, lidos
 * do banco em 23/09/2026. Um mapeamento escrito de cabeça erra duas vezes:
 * `ptt` é áudio de voz (3.132 mensagens, o segundo tipo mais comum) e `url` NÃO
 * é mídia (417 mensagens de texto com prévia de link).
 */

/** A última definição de uma função — a que vale na produção —, sem comentário e com os espaços colapsados. */
const definicaoVigente = (nome: string) => colapsado(semComentarios(definicaoDaFuncao(nome).texto));

describe('o mapeamento de tipo, contra o que o provedor manda de verdade', () => {
  const corpo = () => definicaoVigente('tipo_da_mensagem');

  /*
   * Os valores e as contagens saíram do banco em 23/09/2026. Mudar esta tabela
   * exige medir de novo, não lembrar.
   */
  const REAIS: [string, string, number][] = [
    ['image', 'imagem', 5902],
    ['ptt', 'audio', 3132],
    ['video', 'video', 1070],
    ['sticker', 'figurinha', 1044],
    ['document', 'documento', 813],
    ['user_created', 'figurinha', 190],
    ['audio', 'audio', 135],
    ['collection', 'imagem', 106],
    ['vcard', 'contato', 62],
    ['location', 'local', 54],
    ['gif', 'video', 29],
  ];

  it('conhece todos os `mediaType` que existem no banco', () => {
    /*
     * Os dois tipos de figurinha — `sticker` e `user_created_sticker` — são
     * pegos pelo mesmo `like`, e é de propósito: o provedor inventa sufixos, e
     * uma lista fechada de nomes de figurinha envelhece sozinha.
     */
    const sql = corpo();
    for (const [media] of REAIS) {
      const esperado = media.includes('sticker') || media === 'user_created'
        ? "like '%sticker%'"
        : `'${media}'`;
      expect(sql, media).toContain(esperado);
    }
  });

  it('e a tabela de verdade acima é a do banco, não de cabeça', () => {
    // 11 valores medidos, somando 12.537 das 13.069 mensagens de mídia.
    expect(REAIS).toHaveLength(11);
    expect(REAIS.reduce((s, [, , q]) => s + q, 0)).toBeGreaterThan(12_000);
  });

  it('`ptt` é ÁUDIO — é o áudio de voz, e o nome não entrega isso', () => {
    // 3.132 mensagens. Errar aqui esconde o segundo tipo mais comum da casa.
    expect(corpo()).toContain("when m in ('ptt', 'audio') then 'audio'");
  });

  it('`url` NÃO é mídia: é texto com prévia de link', () => {
    /*
     * 417 mensagens. Tratá-las como arquivo poria 417 downloads impossíveis na
     * fila para sempre — e cada um vira uma linha com erro que ninguém entende.
     */
    const sql = corpo();
    expect(sql).not.toContain("'url'");
    expect(sql).toContain("else 'texto'");
  });

  it('trata string VAZIA como ausente', () => {
    /*
     * O provedor manda `mediaType: ""` em vez de omitir o campo. Sem `nullif`,
     * um `coalesce` devolve a string vazia e engole o campo seguinte — e as 55
     * imagens que chegam sem `mediaType` voltariam a ser texto.
     */
    const sql = corpo();
    expect(sql).toContain("nullif(_msg->>'mediaType', '')");
    expect(sql).toContain("nullif(_msg->>'messageType', '')");
  });

  it('lê `mediaType` ANTES de `messageType`', () => {
    const sql = corpo();
    const media = sql.indexOf("_msg->>'mediaType'");
    const classe = sql.indexOf("_msg->>'messageType'");
    expect(media).toBeGreaterThan(0);
    expect(classe).toBeGreaterThan(media);
  });

  it('e ainda entende a classe, para as 38 imagens que chegaram sem `mediaType`', () => {
    const sql = corpo();
    for (const [classe, kind] of [
      ['imagemessage', 'imagem'],
      ['audiomessage', 'audio'],
      ['videomessage', 'video'],
      ['documentmessage', 'documento'],
      ['stickermessage', 'figurinha'],
      ['contactmessage', 'contato'],
      ['locationmessage', 'local'],
    ]) {
      expect(sql, classe).toContain(`when t = '${classe}' then '${kind}'`);
    }
  });

  it('nunca compara a classe crua com o nome curto — foi esse o defeito', () => {
    // `lower('ImageMessage')` = 'imagemessage'. A 012 comparava com 'image'.
    const sql = corpo();
    expect(sql).not.toContain("when t = 'image' then");
    expect(sql).not.toContain("when t = 'audio' then");
  });

  it('só devolve tipos que o CHECK da tabela aceita', () => {
    const aceitos = ['texto', 'imagem', 'audio', 'video', 'documento', 'figurinha', 'local', 'contato', 'sistema'];
    const devolvidos = [...corpo().matchAll(/then '([a-z]+)'/g)].map((m) => m[1]);
    expect(devolvidos.length).toBeGreaterThan(10);
    for (const t of devolvidos) expect(aceitos, t).toContain(t);
  });
});

describe('uma regra, dois usos', () => {
  it('o processamento chama a função em vez de repetir o `case`', () => {
    /*
     * Duas cópias da mesma regra é como uma delas fica para trás. A releitura
     * das quarenta mil e a mensagem que chega agora têm de concordar para
     * sempre.
     */
    const sql = definicaoVigente('processar_inbox');
    expect(sql).toContain('v_kind := public.tipo_da_mensagem(v_msg);');
    expect(sql).not.toContain("when 'image' then 'imagem'");
  });

  it('a figurinha passa a ser baixada junto com o resto', () => {
    /*
     * Conversa em que as figurinhas são bolhas vazias não se lê.
     *
     * A afirmação é sobre a LISTA de tipos, e não sobre a linha inteira: a 131
     * pôs uma condição a mais ali (só conversa de lead entra na fila), e o teste
     * que exigia a linha exata reprovava uma mudança que não tem nada a ver com
     * figurinha.
     */
    const corpo = definicaoVigente('processar_inbox');
    expect(corpo).toContain("case when v_kind in ('imagem','audio','video','documento','figurinha')");
    const fila = corpo.slice(corpo.indexOf("case when v_kind in ('imagem'"));
    expect(fila.slice(0, 300)).toContain("then 'pendente' else 'sem_midia' end");
  });
});

describe('a fila de download não estoura', () => {
  /*
   * A releitura da 125 foi de uma vez só, sobre as mensagens que já existiam.
   * O caminho que devolve mídia antiga à fila HOJE é o da 131: a conversa que
   * vira lead recupera o que ainda dá tempo. As três travas são as mesmas.
   */
  const sql = () => definicaoVigente('tg_conversa_virou_lead_pega_midia');

  it('a releitura põe na fila só os últimos três dias', () => {
    /*
     * O trabalhador baixa dez por minuto NO MESMO processo que envia as
     * mensagens da casa. Treze mil de uma vez seriam 22 horas de fila, e
     * ninguém sabe se o provedor ainda serve mídia de agosto.
     */
    const t = sql();
    expect(t).toMatch(/and m\.occurred_at >=? now\(\) - interval '3 days'/);
  });

  it('e nunca repõe o que já foi baixado', () => {
    // Sem esta condição, rodar a migração de novo mandaria baixar tudo outra vez.
    expect(sql()).toContain("and m.media_status = 'sem_midia'");
  });

  it('nem enfileira mensagem que o trabalhador não consegue pedir', () => {
    // Sem `provider_message_id` não há o que baixar: a linha ficaria presa.
    expect(sql()).toContain('and m.provider_message_id is not null');
  });
});

describe('a fila anda mesmo com arquivo grande — o conserto de 23/09 à tarde', () => {
  const worker = () =>
    readFileSync(
      join(__dirname, '..', '..', '..', 'supabase', 'functions', 'whatsapp-trabalhador', 'index.ts'),
      'utf8',
    );

  /*
   * A 127 consertou o RELÓGIO e deixou passar a MEMÓRIA e o arquivo lento. Duas
   * horas de fila parada no mesmo dia provaram o resto:
   *
   *   WORKER_RESOURCE_LIMIT  quatro vídeos em base64 não cabem nos 150 MB da
   *                          Edge Function;
   *   TIMEOUT de 25 s        um arquivo lento sozinho gasta a execução inteira.
   *
   * Nos dois casos NADA é marcado, a consulta devolve os mesmos arquivos no
   * minuto seguinte, e a fila fica refém deles para sempre. Por isso são três
   * tetos, e não um: bytes, tempo do laço e tempo de cada arquivo.
   */

  it('tem teto de BYTES por execução', () => {
    const t = worker();
    expect(t).toContain('TETO_POR_EXECUCAO');
    expect(t).toMatch(/if \(bytesNoRun > TETO_POR_EXECUCAO\) break;/);
    expect(t).toContain('bytesNoRun += bytes.length;');
  });

  it('tem teto de TEMPO para o laço', () => {
    const t = worker();
    expect(t).toContain('TETO_DE_TEMPO_MS');
    expect(t).toMatch(/if \(Date\.now\(\) - comecou > TETO_DE_TEMPO_MS\) break;/);
  });

  it('e teto por ARQUIVO, que vira falha em vez de derrubar a execução', () => {
    const t = worker();
    expect(t).toContain('tetoMs: 8_000');
    const i = t.indexOf('tetoMs: 8_000');
    expect(t.slice(i, i + 400)).toContain("media_status: 'falhou'");
  });

  it('arquivo grande demais é marcado, e não decodificado', () => {
    // Sem isto, um arquivo só trava a fila inteira: ele nunca termina, nunca é
    // marcado, e volta a ser o primeiro da lista no minuto seguinte.
    const t = worker();
    const i = t.indexOf('base64.length >');
    expect(i).toBeGreaterThan(0);
    expect(t.slice(i, i + 300)).toContain("media_status: 'falhou'");
    expect(t.indexOf('atob(puro)')).toBeGreaterThan(i);
  });

  it('os três tetos cabem dentro dos 25 s do pg_net', () => {
    const t = worker();
    const laco = Number(/const TETO_DE_TEMPO_MS = ([\d_]+);/.exec(t)?.[1]?.replace(/_/g, ''));
    const arquivo = Number(/tetoMs: ([\d_]+),/.exec(t)?.[1]?.replace(/_/g, ''));
    const pgNet = 25_000;
    expect(laco + arquivo).toBeLessThan(pgNet);
  });
});

describe('a fila anda — a 127', () => {
  const worker = () =>
    readFileSync(
      join(__dirname, '..', '..', '..', 'supabase', 'functions', 'whatsapp-trabalhador', 'index.ts'),
      'utf8',
    );

  it('a consulta de pendentes tem ORDEM', () => {
    /*
     * Sem ordem, cada execução reencontra as mesmas linhas. Se as primeiras
     * forem vídeos grandes que não terminam a tempo, a fila para para todo o
     * resto — aconteceu: nove baixaram e depois zero por meia hora.
     */
    const i = worker().indexOf("eq('media_status', 'pendente')");
    expect(i).toBeGreaterThan(0);
    expect(worker().slice(i, i + 700)).toContain("order('occurred_at'");
  });

  it('e o lote cabe no tempo de espera', () => {
    const i = worker().indexOf("eq('media_status', 'pendente')");
    expect(worker().slice(i, i + 700)).toContain('limit(4)');
  });

  // A 127 mexeu numa função só: a que o cron chama para acordar o trabalhador.
  const agendador = () => definicaoVigente('whatsapp_drenar_saida');

  it('o agendador espera 25 segundos, e não os 5 de fábrica', () => {
    /*
     * O padrão do `pg_net` bastava enquanto o trabalhador só enviava mensagem.
     * Um vídeo de 9 MB não cabe em cinco segundos, e a chamada morria no meio.
     * Medido: 120 respostas 200 por hora viraram 30 timeouts em meia hora.
     */
    expect(agendador()).toContain('timeout_milliseconds := 25000');
  });

  it('e espera MENOS que o intervalo do cron, para não empilhar execução', () => {
    // O cron chama de minuto em minuto. Um limite maior que o intervalo põe
    // duas execuções disputando as mesmas linhas.
    expect(tarefaAgendada('whatsapp-saida')?.agenda).toBe('* * * * *');
    expect(tarefaAgendada('whatsapp-saida')?.comando).toContain('public.whatsapp_drenar_saida()');
    const ms = Number(/timeout_milliseconds := (\d+)/.exec(agendador())?.[1]);
    expect(ms).toBeGreaterThan(5000);
    expect(ms).toBeLessThan(60_000);
  });
});

describe('o trabalhador não cai por causa de uma mídia', () => {
  it('`baixarMidias` roda dentro de um `try`, como `baixarFotos`', () => {
    /*
     * Ela estava desprotegida e só não tinha derrubado nada porque nunca rodou:
     * `media_status` nascia sempre `sem_midia`. Com a 125 ela passa a fazer
     * trabalho de verdade — e um 500 aqui leva junto o ENVIO de mensagem, que é
     * a razão de o arquivo existir.
     */
    const fonte = readFileSync(
      join(__dirname, '..', '..', '..', 'supabase', 'functions', 'whatsapp-trabalhador', 'index.ts'),
      'utf8',
    );
    const i = fonte.indexOf('midias = await baixarMidias(sb)');
    expect(i).toBeGreaterThan(0);
    const antes = fonte.slice(Math.max(0, i - 200), i);
    expect(antes).toContain('try {');
    expect(fonte.slice(i, i + 200)).toContain('catch');
  });
});
