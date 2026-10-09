import { describe, expect, it } from 'vitest';
import { MERCADO_CODES, VARIANTS, buildRefCode, parseRefCode } from './index';
import {
  definicaoDaFuncao,
  semComentarios,
  valoresDoCheck as valoresDoCheckAtual,
} from '../../../supabase/testes/esquema';

/** A definição vigente de uma função, sem comentário. */
const funcao = (nome: string) => semComentarios(definicaoDaFuncao(nome).texto);

describe('variantes', () => {
  it('são minúsculas e são exatamente três', () => {
    expect(VARIANTS).toEqual(['a', 'b', 'c']);
    VARIANTS.forEach((v) => expect(v).toBe(v.toLowerCase()));
  });

  it('o banco aceita exatamente as mesmas, em minúscula', () => {
    expect(valoresDoCheckAtual('leads_ft_variant_ck')).toEqual([...VARIANTS].sort());
    expect(valoresDoCheckAtual('leads_lt_variant_ck')).toEqual([...VARIANTS].sort());
  });
});

describe('código de referência do WhatsApp', () => {
  it('é visível e volta redondo, com mercado', () => {
    const code = buildRefCode('a7k3', 'b', 'ar');
    expect(code).toBe('A7K3-AR-B');
    expect(parseRefCode(`Olá! Tenho interesse. Ref. ${code} — Cobertura Vista Mar`)).toEqual({
      publicCode: 'a7k3',
      market: 'ar',
      variant: 'b',
    });
  });

  it('código ANTIGO, sem mercado, continua sendo lido', () => {
    /*
     * Retrocompatibilidade de verdade, não de fachada: um código sem mercado
     * já está dentro de anúncios publicados. Quebrar a leitura dele
     * significaria perder o lead que respondesse a um anúncio de ontem — e o
     * prejuízo apareceria como "parou de chegar lead", sem erro nenhum.
     */
    expect(parseRefCode('Olá! Tenho interesse. Ref. A7K3-B')).toEqual({
      publicCode: 'a7k3',
      market: null,
      variant: 'b',
    });
    expect(buildRefCode('a7k3', 'b')).toBe('A7K3-B');
  });

  it('as cinco páginas do mesmo imóvel geram códigos DIFERENTES', () => {
    // Era o buraco: os cinco mercados devolviam 'ZZ98-A', e o lead que chegava
    // pelo WhatsApp trazia imóvel e variante mas nunca o país de origem.
    const codigos = MERCADO_CODES.map((m) => buildRefCode('zz98', 'a', m));
    expect(new Set(codigos).size).toBe(MERCADO_CODES.length);
  });

  it('sobrevive ao usuário digitando antes e depois', () => {
    expect(parseRefCode('bom dia, vi o anuncio ref A7K3-US-C obrigado')).toEqual({
      publicCode: 'a7k3',
      market: 'us',
      variant: 'c',
    });
  });

  it('mensagem sem código não inventa atribuição', () => {
    expect(parseRefCode('Olá, tenho interesse no apartamento')).toBeNull();
  });

  it('o SQL do WhatsApp lê o mesmo formato que o contrato escreve', () => {
    /*
     * O `parse_ref_code` do banco é quem lê a primeira mensagem de verdade. Se
     * ele ficar no formato antigo, o botão da página passa a mandar
     * 'A7K3-AR-B' e o banco não casa nada: o lead nasce sem imóvel e sem
     * variante, e o A/B fica eternamente vazio sem erro em lugar nenhum.
     */
    const wa = funcao('parse_ref_code');
    /*
     * A extração atravessa quebra de linha e ignora o que vem depois do padrão.
     *
     * A primeira versão exigia `, '...')` numa linha só — e por isso pegou a
     * definição de 2013, a única formatada assim, ignorando as duas mais novas.
     * O teste falhou apontando para o arquivo errado, que é como um guarda
     * frágil vira ruído e acaba sendo desligado.
     */
    const todos = [...wa.matchAll(/regexp_match\(\s*coalesce\(_texto, ''\)\s*,\s*'([^']+)'([^)]*)\)/g)];
    const ultimo = todos.pop();
    expect(ultimo, 'o regexp_match sumiu de parse_ref_code').toBeDefined();

    const [, padraoSql, resto] = ultimo!;
    // O grupo do meio, opcional, é o mercado.
    expect(padraoSql, 'o padrão do banco não tem o grupo de mercado').toContain('{2}');
    expect(padraoSql).toMatch(/\)\?/);
    /*
     * E o `i`. Sem ele o banco é sensível a maiúscula e não lê o "ref" que a
     * pessoa DIGITA — só o "Ref." que o botão preenche. Quem guardou o anúncio
     * para responder depois, ou encaminhou para o cônjuge, reescreve do zero:
     * o lead chega, o código está lá, e a atribuição some sem erro nenhum.
     */
    expect(resto, "falta a flag 'i' no regexp_match do banco").toContain("'i'");
  });
});
