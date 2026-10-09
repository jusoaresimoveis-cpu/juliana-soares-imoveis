import { describe, expect, it } from 'vitest';
import {
  LOCALES,
  MERCADOS,
  MERCADO_CODES,
  areaNoMercado,
  caminhoDaPagina,
  localeDoMercado,
} from './index';
import {
  definicaoDaFuncao,
  definicaoDaRestricao,
  semComentarios,
  valoresDoCheck as valoresDoCheckAtual,
} from '../../../supabase/testes/esquema';

/** A definição vigente de uma função, sem comentário. */
const funcao = (nome: string) => semComentarios(definicaoDaFuncao(nome).texto);

describe('mercados de anúncio', () => {
  it('a lista do contrato é a que o banco aceita', () => {
    expect(valoresDoCheckAtual('landing_pages_market_ck')).toEqual([...MERCADO_CODES].sort());
  });

  it('todo mercado escreve num idioma que existe', () => {
    // Um mercado apontando para idioma fora de LOCALES faria o `hreflang` sair
    // com uma tag que buscador nenhum reconhece.
    for (const m of MERCADOS) {
      expect(LOCALES as readonly string[], m.code).toContain(m.locale);
    }
  });

  it('a derivação idioma←mercado é a MESMA no banco e no contrato', () => {
    /*
     * Ela existe nos dois lados: aqui, para a tela; e dentro de `landing_gerar`,
     * porque deixar a tela mandar os dois permitiria uma página marcada como
     * "Estados Unidos" escrita em português — e o `hreflang` diria inglês para
     * um texto em português, que é pior do que não ter hreflang nenhum.
     *
     * Divergir seria invisível: a página nasce, abre e mente para o buscador.
     */
    const doSql = [...funcao('landing_gerar').matchAll(/when '([a-z]{2})' then '([\w-]+)'/g)].map((m) => ({
      code: m[1],
      locale: m[2],
    }));
    expect(doSql.length, 'derivação não encontrada em landing_gerar').toBe(MERCADOS.length);
    for (const linha of doSql) {
      expect(localeDoMercado(linha.code!), linha.code).toBe(linha.locale);
    }
  });

  it('mercado é dimensão, não braço do experimento', () => {
    /*
     * O placar precisa filtrar por mercado SEMPRE. Sem isso ele somaria a
     * variante A da Argentina com a A dos Estados Unidos — dois públicos com
     * orçamento, moeda e motivo de compra diferentes — e o vencedor seria o
     * mercado com mais verba, creditado ao desenho da página.
     */
    expect(funcao('landing_placar')).toContain('p.market = _mercado');
    // E a chave única precisa conter o mercado, senão criar a página da
    // Argentina apagaria a do Brasil pelo `on conflict`.
    expect(definicaoDaRestricao('landing_pages_uk').definicao).toBe(
      'unique (organization_id, property_id, market, variant)',
    );
  });

  it('só os Estados Unidos leem em pé quadrado', () => {
    // Mostrar "120 m²" para quem compra em pés quadrados é a diferença entre
    // página traduzida e página feita para aquele leitor.
    expect(areaNoMercado(120, 'us')).toEqual({ valor: 1292, unidade: 'ft²' });
    for (const code of ['br', 'ar', 'cl', 'es']) {
      expect(areaNoMercado(120, code), code).toEqual({ valor: 120, unidade: 'm²' });
    }
  });

  it('área ausente ou absurda não vira zero na tela', () => {
    // Zero metros quadrados é uma afirmação; ausência é ausência.
    expect(areaNoMercado(null, 'br')).toBeNull();
    expect(areaNoMercado(0, 'br')).toBeNull();
    expect(areaNoMercado(-5, 'br')).toBeNull();
  });

  it('o caminho público carrega organização, mercado e variante', () => {
    // O mercado entra sempre, inclusive o Brasil: esta URL é colada dentro de
    // um anúncio, nunca digitada, e rota sem caso especial vale mais que URL
    // curta. O caso especial é onde mora o defeito que só aparece no padrão.
    expect(caminhoDaPagina('imob', 'ar', 'apto-jardim', 'b')).toBe('/imob/ar/imovel/apto-jardim/b');
    expect(caminhoDaPagina('imob', 'br', 'apto-jardim')).toBe('/imob/br/imovel/apto-jardim');
  });

  it('no domínio próprio o segmento da organização SAI', () => {
    /*
     * `imobiliaria.exemplo/imob/br/imovel/...` tem um resto de multi-inquilino no
     * domínio de um inquilino só. Quem desfaz a ambiguidade ali é o hostname.
     */
    expect(caminhoDaPagina(null, 'br', 'apto-jardim', 'b')).toBe('/br/imovel/apto-jardim/b');
    expect(caminhoDaPagina(null, 'us', 'apto-jardim')).toBe('/us/imovel/apto-jardim');
  });

  it('o segmento literal `imovel` é o que separa as duas formas', () => {
    /*
     * As duas rotas convivem, e com quatro segmentos as duas poderiam casar:
     * `/imob/br/imovel/apto` e `/br/imovel/apto/b`. O que decide é a POSIÇÃO do
     * literal — terceira na forma longa, segunda na curta. Sem ele, o
     * roteador escolheria pelo desempate interno e a variante `b` viraria o
     * slug de um imóvel inexistente.
     */
    const longo = caminhoDaPagina('imob', 'br', 'apto', undefined).split('/');
    const curto = caminhoDaPagina(null, 'br', 'apto', 'b').split('/');
    expect(longo).toHaveLength(curto.length);
    expect(longo[3]).toBe('imovel');
    expect(curto[2]).toBe('imovel');
    expect(longo[2]).not.toBe('imovel');
  });
});
