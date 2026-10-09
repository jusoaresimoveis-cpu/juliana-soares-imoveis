import { describe, expect, it } from 'vitest';
import {
  LEAD_SCOPES,
  NOTIFICATION_META,
  NOTIFICATION_SOUNDS,
  NOTIFICATION_TYPES,
  alcancesDisponiveis,
  isNotificationType,
  podeUsarAlcance,
} from './index';
import {
  definicaoDaFuncao,
  definicaoDoGatilho,
  privilegiosNaTabela,
  semComentarios,
  todasAsMigracoes,
  valoresDoCheck as valoresDoCheckAtual,
} from '../../../supabase/testes/esquema';

/** A definição vigente de uma função, sem comentário. */
const funcao = (nome: string) => semComentarios(definicaoDaFuncao(nome).texto);

function abre(c: string | undefined): boolean {
  return c === '(' || c === '[';
}

function fecha(c: string | undefined): boolean {
  return c === ')' || c === ']';
}

function literalSimples(argumento: string | undefined): string | null {
  const valor = argumento?.trim() ?? '';
  return /^'([a-z_]+)'$/.test(valor) ? valor.slice(1, -1) : null;
}

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
    const c = texto[i];
    if (aspas) {
      atual += c;
      if (c === "'") aspas = false;
      continue;
    }
    if (c === "'") { aspas = true; atual += c; continue; }
    if (abre(c)) { profundidade++; atual += c; continue; }
    if (c === ')' && profundidade === 0) { args.push(atual); break; }
    if (fecha(c)) { profundidade--; atual += c; continue; }
    if (c === ',' && profundidade === 0) {
      args.push(atual);
      if (args.length === 3) break;
      atual = '';
      continue;
    }
    atual += c;
  }

  return literalSimples(args[2]);
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
