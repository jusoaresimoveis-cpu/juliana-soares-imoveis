import { describe, expect, it } from 'vitest';
import { anotar, deveRelatar, montarRelato, rastro } from '@/lib/rastro';

/*
 * O estado do rastro é do MÓDULO, e o vitest carrega o módulo uma vez por
 * arquivo. Os testes abaixo somam no mesmo rastro de propósito — é assim que ele
 * se comporta numa aba aberta o dia inteiro, que é o caso real.
 */

describe('rastro', () => {
  it('guarda os passos na ordem em que aconteceram', () => {
    anotar('rota', '/leads');
    anotar('rota', '/leads/abc');
    const p = rastro();
    expect(p.at(-2)?.texto).toBe('/leads');
    expect(p.at(-1)?.texto).toBe('/leads/abc');
  });

  it('descarta o mais antigo em vez de crescer sem fim', () => {
    // Sem teto, uma aba aberta desde as oito da manhã manda um rastro de dez mil
    // passos junto do relato — e o que interessa são sempre os últimos.
    for (let i = 0; i < 50; i += 1) anotar('rota', `/p/${i}`);
    const p = rastro();
    expect(p.length).toBeLessThanOrEqual(20);
    expect(p.at(-1)?.texto).toBe('/p/49');
  });

  it('corta o texto de um passo antes de ele sair da máquina', () => {
    anotar('console', 'x'.repeat(500));
    const ultimo = rastro().at(-1);
    expect(ultimo!.texto.length).toBeLessThanOrEqual(201); // 200 + reticência
  });

  it('devolve uma cópia — quem lê não mexe no rastro', () => {
    const antes = rastro().length;
    rastro().push({ ms: 0, tipo: 'rota', texto: 'intruso' });
    expect(rastro().length).toBe(antes);
  });
});

describe('montarRelato', () => {
  it('sempre tem mensagem, mesmo quando o erro não trouxe nenhuma', () => {
    // `throw null` e `Promise.reject()` chegam aqui com string vazia. Uma linha
    // com mensagem em branco na tabela é indistinguível de um erro de gravação.
    const r = montarRelato('janela', '');
    expect(r.mensagem).toBe('erro sem mensagem');
  });

  it('corta a pilha e a mensagem', () => {
    const r = montarRelato('tela', 'm'.repeat(900), 'p'.repeat(9000));
    expect(r.mensagem.length).toBeLessThanOrEqual(501);
    expect(r.pilha!.length).toBeLessThanOrEqual(4001);
  });

  it('leva o rastro junto', () => {
    anotar('rota', '/agenda');
    expect(montarRelato('tela', 'x').rastro.at(-1)?.texto).toBe('/agenda');
  });
});

describe('deveRelatar', () => {
  it('manda o primeiro e cala nos repetidos', () => {
    /*
     * Um erro dentro do `render` volta a cada tentativa do React, e um dentro de
     * `setInterval` volta para sempre. Sem esta trava, a primeira queda de um
     * laço vira um pedido por segundo saindo do navegador de quem já está com o
     * sistema quebrado.
     */
    const pilha = 'Error: x\n    at Componente (arquivo.js:1:1)';
    expect(deveRelatar('mesmo erro', pilha)).toBe(true);
    expect(deveRelatar('mesmo erro', pilha)).toBe(false);
    expect(deveRelatar('mesmo erro', pilha)).toBe(false);
  });

  it('para no teto de automáticos por aba', () => {
    // O teto é 3 e um já foi gasto acima. Erros DIFERENTES, para provar que o
    // que trava aqui é a quantidade e não a repetição.
    expect(deveRelatar('erro 2', 'a\n b')).toBe(true);
    expect(deveRelatar('erro 3', 'a\n c')).toBe(true);
    expect(deveRelatar('erro 4', 'a\n d')).toBe(false);
  });
});
