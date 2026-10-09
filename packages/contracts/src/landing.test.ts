import { describe, expect, it } from 'vitest';
import {
  ANGULOS,
  ANGULO_META,
  CTA_KINDS,
  CTA_META,
  LAYOUTS,
  LAYOUT_META,
  MIN_VISITAS_CONFIAVEL,
  VARIANTES_GERADAS,
  conversaoDaVariante,
} from './index';
import {
  definicaoDaFuncao,
  semComentarios,
  valoresDoCheck as valoresDoCheckAtual,
} from '../../../supabase/testes/esquema';

/** A definição vigente de uma função, sem comentário. */
const funcao = (nome: string) => semComentarios(definicaoDaFuncao(nome).texto);

describe('landing pages — os três eixos', () => {
  it('os ângulos do contrato são os que o banco aceita', () => {
    expect(valoresDoCheckAtual('landing_pages_angulo_ck')).toEqual([...ANGULOS].sort());
  });

  it('os layouts batem', () => {
    expect(valoresDoCheckAtual('landing_pages_layout_ck')).toEqual([...LAYOUTS].sort());
  });

  it('os mecanismos de conversão batem', () => {
    expect(valoresDoCheckAtual('landing_pages_cta_ck')).toEqual([...CTA_KINDS].sort());
  });

  it('todo valor tem rótulo e explicação para quem escolhe', () => {
    /*
     * A tela do CRM é onde se decide qual variante recebe verba. "Ângulo:
     * oportunidade" não informa nada a quem está decidindo — a nota é o que
     * transforma o rótulo em escolha consciente, e por isso ela é obrigatória.
     */
    ANGULOS.forEach((a) => expect(ANGULO_META[a]?.nota.length, a).toBeGreaterThan(30));
    LAYOUTS.forEach((l) => expect(LAYOUT_META[l]?.nota.length, l).toBeGreaterThan(30));
    CTA_KINDS.forEach((c) => expect(CTA_META[c]?.nota.length, c).toBeGreaterThan(30));
  });

  it('o pareamento que a tela promete é o que `landing_gerar` cria', () => {
    /*
     * A tela explica o que o botão vai fazer ANTES de alguém clicar. Se a
     * função no banco trocar o par de uma variante e o contrato não, a tela
     * passa a descrever uma página que não existe — e a leitura do placar sai
     * invertida, creditando ao WhatsApp o resultado do formulário.
     *
     * Lê a definição VIGENTE porque `landing_gerar` já foi redefinida três
     * vezes: ler um arquivo fixo é como o teste de origens do lead passou meses
     * conferindo a lista da 003.
     */
    const pares = [...funcao('landing_gerar').matchAll(/'([abc])',\s*'(\w+)',\s*_layout,\s*'(\w+)'/g)].map(
      (m) => ({ variant: m[1], angulo: m[2], cta: m[3] }),
    );
    expect(pares).toEqual(VARIANTES_GERADAS.map((v) => ({ ...v })));
  });

  it('cada variante gerada usa um ângulo e um mecanismo diferentes', () => {
    // Três variantes com o mesmo par seriam três cópias da mesma página — e o
    // placar mediria só o ruído da divisão do tráfego.
    expect(new Set(VARIANTES_GERADAS.map((v) => v.angulo)).size).toBe(VARIANTES_GERADAS.length);
    expect(new Set(VARIANTES_GERADAS.map((v) => v.cta)).size).toBe(VARIANTES_GERADAS.length);
  });
});

describe('placar da landing page', () => {
  it('sem visita, a taxa é NULA — não zero', () => {
    // Zero afirma "ninguém converteu"; nulo diz "ninguém entrou ainda". A
    // diferença decide se o corretor desliga a página ou espera mais um dia.
    expect(conversaoDaVariante(0, 0).taxa).toBeNull();
    expect(conversaoDaVariante(null, 3).taxa).toBeNull();
  });

  it('pouca visita conta, mas não vale decisão', () => {
    /*
     * O caso que motiva o campo: a variante que fez 1 lead em 2 visitas mostra
     * 50% e a que fez 0 em 3 mostra 0%. Desligar a segunda por causa disso é
     * decidir verba com ruído — e é o erro mais caro que esta tela pode induzir.
     */
    expect(conversaoDaVariante(2, 1)).toEqual({ taxa: 0.5, confiavel: false });
    expect(conversaoDaVariante(MIN_VISITAS_CONFIAVEL, 3).confiavel).toBe(true);
    expect(conversaoDaVariante(MIN_VISITAS_CONFIAVEL - 1, 3).confiavel).toBe(false);
  });
});
