import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AVISO_ESPERA_JANELA,
  AVISO_ESPERA_OPCOES,
  AVISO_ESPERA_PADRAO,
  NOTIFICATION_META,
  NOTIFICATION_TYPES,
  rotuloDoAvisoDeEspera,
} from '@contracts';
import {
  colunasDaTabela,
  definicaoDaFuncao,
  definicaoDaRestricao,
  executoresDaFuncao,
  semComentarios,
  tarefaAgendada,
  valoresDoCheck,
} from '../../../supabase/testes/esquema';

/**
 * O alarme da fila — a migração 128.
 *
 * A 124 deixou a fila pronta e disse que o alarme só viria depois de alguém
 * olhar o movimento por uns dias. Veio. Estes testes seguram as quatro decisões
 * que a medição pagou e que um "ajuste rápido" desfaz sem perceber:
 *
 *   1. a janela é conferida na hora da IMOBILIÁRIA, dentro da função — o `cron`
 *      do Supabase roda em UTC, e escrever '8-20' no agendamento avisaria de 5h
 *      às 17h em Porto Belo, em silêncio;
 *   2. o aviso sai UMA vez por espera;
 *   3. lead ganho ou perdido não é cobrado;
 *   4. o tipo novo está nas DUAS listas — a da tabela e a da preferência.
 */

/**
 * Só a definição vigente da função do alarme, sem comentário.
 *
 * Sem tirar a prosa, quase toda proibição daqui reprovaria a função por causa
 * da própria explicação dela — o cabeçalho da 128 conta a medição inteira, com
 * horas, limites e o erro que ela evita.
 */
const corpoDoAlarme = () => semComentarios(definicaoDaFuncao('avisar_espera_longa').texto);

describe('o alarme não toca de madrugada', () => {
  it('a janela é conferida na hora da imobiliária, e não no relógio do banco', () => {
    const corpo = corpoDoAlarme();
    expect(corpo).toContain('now() at time zone o.timezone');
    expect(corpo).toContain(
      `between ${AVISO_ESPERA_JANELA.inicio} and ${AVISO_ESPERA_JANELA.fim}`,
    );
  });

  it('e o agendamento NÃO tem hora fixa — seria UTC', () => {
    /*
     * `cron.schedule` do Supabase roda em UTC. '2 8-20 * * *' pareceria certo e
     * avisaria das 5h às 17h no horário de Porto Belo, sem erro em lugar nenhum
     * — o cron marcaria "succeeded" em todas as execuções.
     */
    const agendamento = tarefaAgendada('fila-sem-resposta')?.agenda;
    expect(agendamento, 'o cron do alarme sumiu').toBeTruthy();
    expect(tarefaAgendada('fila-sem-resposta')?.comando).toContain('public.avisar_espera_longa()');
    const campos = agendamento!.trim().split(/\s+/);
    expect(campos).toHaveLength(5);
    expect(campos.slice(1), 'hora, dia, mês e semana têm de ser "*"').toEqual(['*', '*', '*', '*']);
  });
});

describe('uma vez por espera', () => {
  it('a marca guarda QUAL espera foi avisada, e não um sim/não', () => {
    // `timestamptz` à mão; `timestamp with time zone` no pg_dump.
    expect(colunasDaTabela('leads').get('espera_avisada')).toMatch(
      /^(timestamptz|timestamp with time zone)\b/,
    );

    const corpo = corpoDoAlarme();
    expect(corpo).toContain('l.espera_avisada is distinct from l.esperando_desde');
    expect(corpo).toContain('set espera_avisada = r.esperando_desde');
  });

  it('marca depois de avisar, para o aviso perdido ser tentado de novo', () => {
    const corpo = corpoDoAlarme();
    const avisa = corpo.indexOf('create_notification');
    const marca = corpo.indexOf('set espera_avisada = r.esperando_desde');
    expect(avisa).toBeGreaterThan(0);
    expect(marca).toBeGreaterThan(avisa);
  });
});

describe('quem não é cobrado', () => {
  it('lead ganho, perdido ou excluído fica de fora', () => {
    const corpo = corpoDoAlarme();
    expect(corpo).toContain('not s.is_won');
    expect(corpo).toContain('not s.is_lost');
    expect(corpo).toContain('l.excluded_at is null');
  });

  it('e a casa que desligou o alarme não recebe nada', () => {
    const corpo = corpoDoAlarme();
    expect(corpo).toContain('o.aviso_espera_horas is not null');
    expect(corpo).toContain('o.is_active');
  });
});

describe('o que o aviso diz', () => {
  it('conta o TEMPO, nunca o que o cliente escreveu', () => {
    /*
     * A notificação vira push e acende na tela de bloqueio do celular. O texto
     * da conversa já está no cartão do painel e na conversa, para quem tem
     * acesso a ela — repeti-lo aqui é exposição que o aviso não precisa.
     */
    const corpo = corpoDoAlarme();
    expect(corpo).toContain("'Sem resposta ' || v_texto");
    expect(corpo).not.toContain('last_message_body');
    expect(corpo).not.toContain('body');
  });

  it('a função é do cron, e não da tela', () => {
    // A regra da 011: `revoke ... from public` sozinho não fecha nada no
    // Supabase — anon e authenticated têm concessão nominal e precisam ser
    // nomeados. Aqui se confere o resultado, e não a frase do revoke.
    const quem = executoresDaFuncao('avisar_espera_longa');
    for (const papel of ['PUBLIC', 'anon', 'authenticated']) expect(quem, papel).not.toContain(papel);
  });
});

describe('o tipo novo entra nas duas listas', () => {
  /*
   * PROCURA A REGRA, NÃO O ARQUIVO.
   *
   * Isto aqui dizia `sqlVigente("'lead_esperando'")` — "a migração mais recente
   * que cita o tipo". Funcionou até a 151 passar a citá-lo também, na lista do
   * que toca no celular: a busca passou a achar a migração errada e dois testes
   * verdes viraram vermelhos sem nada ter quebrado de verdade.
   *
   * Procurar pela própria restrição é estável: quem a mover, move o teste
   * junto, e quem só mencionar o tipo não desloca nada.
   */
  it('na da tabela, senão o alarme nunca toca', () => {
    expect(valoresDoCheck('notifications_type_ck')).toContain('lead_esperando');
  });

  it('e na da preferência, senão ninguém consegue desligar', () => {
    expect(valoresDoCheck('notification_preferences_muted_ck')).toContain('lead_esperando');
  });

  it('e o contrato sabe rotulá-lo', () => {
    expect(NOTIFICATION_TYPES).toContain('lead_esperando');
    expect(NOTIFICATION_META.lead_esperando.label).toBe('Sem resposta');
    expect(NOTIFICATION_META.lead_esperando.som).toBe('lembrete');
  });
});

describe('o limite é o mesmo nas duas camadas', () => {
  it('o padrão do banco é o padrão do contrato', () => {
    const coluna = colunasDaTabela('organizations').get('aviso_espera_horas') ?? '';
    const padrao = coluna.match(/^integer\b.* default (\d+)/)?.[1];
    expect(padrao, `aviso_espera_horas: ${coluna}`).toBeTruthy();
    expect(Number(padrao)).toBe(AVISO_ESPERA_PADRAO);
  });

  it('e toda opção da tela cabe no que o banco aceita', () => {
    /*
     * `between 1 and 72` à mão; o pg_dump desmonta o `between` em
     * `(x >= 1) and (x <= 72)`. A faixa é a mesma nas duas formas.
     */
    const check = definicaoDaRestricao('organizations_aviso_espera_ck').definicao;
    const entre = check.match(/aviso_espera_horas between (\d+) and (\d+)/);
    const minimo = Number(entre?.[1] ?? check.match(/aviso_espera_horas >= (\d+)/)?.[1]);
    const maximo = Number(entre?.[2] ?? check.match(/aviso_espera_horas <= (\d+)/)?.[1]);
    expect(Number.isFinite(minimo) && Number.isFinite(maximo), `a faixa aceita sumiu do CHECK: ${check}`).toBe(true);

    for (const h of AVISO_ESPERA_OPCOES) {
      if (h === null) continue;
      expect(h, `${h}h não cabe no CHECK`).toBeGreaterThanOrEqual(minimo);
      expect(h).toBeLessThanOrEqual(maximo);
    }
    // Nulo é "não cobrar", e o CHECK precisa deixá-lo passar.
    expect(check).toMatch(/aviso_espera_horas is null\)? or /);
  });

  it('o padrão está entre as opções, e desligar é uma delas', () => {
    expect(AVISO_ESPERA_OPCOES).toContain(AVISO_ESPERA_PADRAO);
    expect(AVISO_ESPERA_OPCOES).toContain(null);
  });

  it('cada opção tem um rótulo que se lê', () => {
    expect(rotuloDoAvisoDeEspera(null)).toBe('Não cobrar');
    expect(rotuloDoAvisoDeEspera(1)).toBe('Depois de 1 hora');
    expect(rotuloDoAvisoDeEspera(2)).toBe('Depois de 2 horas');
    expect(rotuloDoAvisoDeEspera(24)).toBe('Depois de um dia');
    for (const h of AVISO_ESPERA_OPCOES) {
      expect(rotuloDoAvisoDeEspera(h).length, String(h)).toBeGreaterThan(5);
    }
  });
});

describe('a tela da configuração', () => {
  const tela = () => readFileSync(join(__dirname, 'pages', 'Settings.tsx'), 'utf8');

  it('oferece a lista do contrato, e não uma cópia', () => {
    expect(tela()).toContain('AVISO_ESPERA_OPCOES.map(');
    expect(tela()).toContain('rotuloDoAvisoDeEspera(');
  });

  it('e o cartão é de quem manda na casa', () => {
    /*
     * A RLS de `organizations` já só deixa gerente e admin gravarem. A tela
     * esconde pelo mesmo motivo — mas quem segura é o banco, e é por isso que o
     * teste do papel mora aqui e a prova de verdade mora na suíte de RLS.
     */
    expect(tela()).toMatch(/papel === 'gerente' \|\| papel === 'admin'[\s\S]{0,120}CobrancaDeResposta/);
  });
});
