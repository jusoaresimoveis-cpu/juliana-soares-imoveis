import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { indicadoresDoEscopo } from '@/components/dashboard/Indicadores';
import { frescorDoConjunto } from '@/pages/Anuncios';
import type { Sincronizacao } from '@/hooks/useMeta';

/**
 * O painel do corretor mostra a carteira dele — e diz que é a dele.
 *
 * A trava de verdade é a policy da migration 079, e quem a interroga é
 * `supabase/testes/carteira.test.ts`, contra um Postgres. O que sobra para o
 * front é não MENTIR sobre o recorte, e é isso que este arquivo guarda.
 */

describe('quais cartões cada pessoa vê', () => {
  it('quem enxerga conta de anúncio vê os oito', () => {
    // Positiva primeiro: sem ela, uma lista que voltasse vazia para todo mundo
    // deixaria o teste de baixo verde.
    const chaves = indicadoresDoEscopo(true).map((i) => i.key);
    expect(chaves).toContain('investido');
    expect(chaves).toContain('cpl');
    expect(chaves.length).toBe(8);
  });

  it('quem não enxerga conta de anúncio não vê investimento nem custo por lead', () => {
    /*
     * Não é pudor com o número: as funções do painel são `security invoker`, e
     * para quem não enxerga conta de anúncio nenhuma a soma volta ZERO. O
     * cartão exibiria "R$ 0,00" em Investimento Meta, que não é discrição, é a
     * tela afirmando que ninguém investiu nada no período.
     *
     * Desde a 087 quem responde não é o PAPEL: a corretora tem a BM dela e vê
     * o dinheiro dela. Quem decide é o campo `ve_verba`, que o banco calcula
     * pela policy.
     */
    const chaves = indicadoresDoEscopo(false).map((i) => i.key);
    expect(chaves).not.toContain('investido');
    expect(chaves).not.toContain('cpl');
  });

  it('mas continua vendo os que são sobre o trabalho dele', () => {
    const chaves = indicadoresDoEscopo(false).map((i) => i.key);
    for (const k of ['leads', 'vendas', 'vgv', 'visitas', 'propostas', 'tempo']) {
      expect(chaves, `faltou ${k}`).toContain(k);
    }
    // Seis cartões cabem em 3 colunas; oito, em 4. O número aqui é o que a
    // grade do componente consulta para escolher.
    expect(chaves.length).toBe(6);
  });
});

describe('a tela avisa de quem é o número', () => {
  const DASHBOARD = readFileSync(join(__dirname, 'pages', 'Dashboard.tsx'), 'utf8');

  it('quem manda no recorte é a resposta do banco, não o papel na sessão', () => {
    /*
     * `isAdminOrAbove()` entra só como palpite ENQUANTO a resposta não chega —
     * sem ele o painel abriria com oito cartões e encolheria para seis meio
     * segundo depois. Se um dia alguém inverter a ordem e deixar o papel local
     * decidir, o front passa a discordar do banco em silêncio: mostraria os
     * cartões de mídia zerados para quem não pode lê-los.
     */
    expect(DASHBOARD).toContain("painel.data?.escopo ?? (isAdminOrAbove() ? 'todos' : 'meus')");
  });

  it('e escreve "Sua carteira" quando os números são de uma pessoa só', () => {
    // Sem a etiqueta, o corretor lê "Total de leads: 3" e conclui que a
    // imobiliária teve três leads no mês. O número está certo; falta dizer de
    // quem ele é.
    expect(DASHBOARD).toContain("escopo === 'meus'");
    expect(DASHBOARD).toContain('Sua carteira');
  });
});

describe('o frescor da importação da Meta', () => {
  const linha = (p: Partial<Sincronizacao>): Sincronizacao => ({
    kind: 'insights',
    ad_account_id: 'act_1',
    status: 'ok',
    finished_at: '2026-08-20T14:00:00Z',
    truncated: false,
    rows_written: 10,
    error_message: null,
    ...p,
  });

  it('reporta a conta MAIS ATRASADA, não a mais recente', () => {
    /*
     * A regra inteira em uma asserção. Antes, a função do banco fazia
     * `distinct on (kind)` e devolvia uma linha só — a que terminou por último.
     * Com duas contas ligadas (o caso da HVA hoje), a conta parada há três dias
     * ficava escondida atrás da que acabou de importar, e o cartão continuava
     * verde. É o mesmo defeito do selo fixo de "Tempo real" que este cartão foi
     * escrito para eliminar.
     */
    const f = frescorDoConjunto([
      linha({ ad_account_id: 'act_a', finished_at: '2026-08-17T09:00:00Z' }),
      linha({ ad_account_id: 'act_b', finished_at: '2026-08-20T14:00:00Z' }),
    ]);
    expect(f.maisAtrasada).toBe('2026-08-17T09:00:00Z');
    expect(f.total).toBe(2);
    expect(f.problemas).toBe(0);
  });

  it('uma conta com erro no meio de contas boas é um problema', () => {
    const f = frescorDoConjunto([
      linha({ ad_account_id: 'act_a' }),
      linha({ ad_account_id: 'act_b', status: 'erro' }),
      linha({ ad_account_id: 'act_c' }),
    ]);
    expect(f.problemas).toBe(1);
    expect(f.falhou).toBe(true);
    expect(f.total).toBe(3);
  });

  it('truncado conta como problema mesmo com status ok', () => {
    // Veio incompleto e a tela dizia "ok": o total simplesmente parava de
    // crescer, e continuava plausível.
    const f = frescorDoConjunto([linha({ truncated: true })]);
    expect(f.problemas).toBe(1);
    expect(f.truncado).toBe(true);
  });

  it('sem nenhuma execução terminada, não inventa uma data', () => {
    const f = frescorDoConjunto([linha({ finished_at: null, status: 'running' })]);
    expect(f.maisAtrasada).toBeNull();
    expect(f.emAndamento).toBe(1);
    expect(f.vazio).toBe(false);
  });

  it('lista vazia é vazio, não zero-de-tudo disfarçado', () => {
    expect(frescorDoConjunto([]).vazio).toBe(true);
  });

  it('ignora execuções de outro tipo', () => {
    // O check da 017 admite 'leads', 'forms' e 'account_info'. Nenhum é escrito
    // hoje, mas se passarem a ser, não podem entrar na conta do frescor de gasto.
    const f = frescorDoConjunto([linha({}), linha({ kind: 'forms', status: 'erro' })]);
    expect(f.total).toBe(1);
    expect(f.problemas).toBe(0);
  });
});
