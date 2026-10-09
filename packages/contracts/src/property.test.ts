import { describe, expect, it } from 'vitest';
import {
  MEDIA_KINDS,
  PAYMENT_METHODS,
  PROPERTY_PURPOSES,
  PROPERTY_STATUSES,
  PROPERTY_TYPES,
  precoDeTabela,
  resumoDoPlano,
} from './index';
import {
  colunasDaTabela,
  definicaoDaRestricao,
  restricoesDaTabela,
  valoresDoCheck as valoresDoCheckAtual,
} from '../../../supabase/testes/esquema';
import { exigir } from '../../../supabase/testes/exigir';

describe('domínio de imóvel ↔ banco', () => {
  it('tipos batem', () => {
    expect(valoresDoCheckAtual('properties_type_ck')).toEqual([...PROPERTY_TYPES].sort());
  });
  it('finalidades batem', () => {
    expect(valoresDoCheckAtual('properties_purpose_ck')).toEqual([...PROPERTY_PURPOSES].sort());
  });
  it('situações batem', () => {
    expect(valoresDoCheckAtual('properties_status_ck')).toEqual([...PROPERTY_STATUSES].sort());
  });
  it('tipos de mídia batem', () => {
    expect(valoresDoCheckAtual('property_media_kind_ck')).toEqual([...MEDIA_KINDS].sort());
  });
});

describe('plano de pagamento', () => {
  /*
   * As regras do plano procuradas pelo que DIZEM, entre as restrições que a
   * tabela tem hoje — e não pelo nome que cada uma recebeu.
   */
  const regras = () => restricoesDaTabela('properties');

  it('as formas do contrato são as que o banco aceita', () => {
    const formas = regras().find((r) => r.definicao.includes('payment_methods <@'));
    expect(formas, 'CHECK de payment_methods não encontrado').toBeDefined();
    expect(valoresDoCheckAtual(exigir(formas, 'o CHECK de payment_methods').nome)).toEqual([...PAYMENT_METHODS].sort());
  });

  it('quantidade e valor andam juntos, no banco', () => {
    /*
     * "60 parcelas" sem valor é meia informação, e meia informação numa página
     * pública vira a pergunta que estes campos existem para evitar.
     */
    const texto = regras().map((r) => r.definicao).join('\n');
    expect(texto).toContain('(installments_count is null) = (installment_cents is null)');
    expect(texto).toContain('(reinforcement_count is null) = (reinforcement_cents is null)');
    // E reforço sem periodicidade não dá para escrever: de quanto em quanto tempo?
    // (O pg_dump põe cada termo do `or` entre parênteses.)
    expect(texto).toMatch(/\(?reinforcement_count is null\)? or \(?reinforcement_period is not null\)?/);
  });

  it('a soma do plano é a soma das partes', () => {
    const r = resumoDoPlano({
      precoCents: 39_900_000,
      entradaCents: 8_000_000,
      parcelas: 60,
      parcelaCents: 240_000,
      reforcos: 4,
      reforcoCents: 1_500_000,
      chavesCents: 5_000_000,
    });
    // 80.000 + 60×2.400 + 4×15.000 + 50.000 = 334.000
    expect(r.somaCents).toBe(33_400_000);
    expect(r.saldoCents).toBe(6_500_000);
    expect(r.excede).toBe(false);
  });

  it('plano maior que o imóvel é ERRO, e aparece como erro', () => {
    // Sinal ou dígito trocado vira um plano que cobra mais do que o imóvel
    // custa. Se isso passar batido, quem soma é o comprador — e descobre na
    // proposta, que é o pior momento possível.
    const r = resumoDoPlano({ precoCents: 10_000_000, entradaCents: 12_000_000 });
    expect(r.excede).toBe(true);
    expect(r.saldoCents).toBe(-2_000_000);
  });

  it('sem preço, o saldo é NULO — não o negativo da soma', () => {
    // "Quanto falta" não é pergunta com resposta sem o total. Devolver
    // -334.000 seria inventar uma.
    const r = resumoDoPlano({ entradaCents: 8_000_000 });
    expect(r.saldoCents).toBeNull();
    expect(r.excede).toBe(false);
  });

  it('nada preenchido é plano VAZIO, e não um plano de zero', () => {
    // Plano vazio não aparece na tela. Um plano "de R$ 0" apareceria, e diria
    // ao comprador que o imóvel é de graça.
    expect(resumoDoPlano({ precoCents: 39_900_000 }).vazio).toBe(true);
    expect(resumoDoPlano({}).somaCents).toBe(0);
  });

  it('parcela sem quantidade não vira soma', () => {
    // O par incompleto é zerado no envio; aqui a conta também não pode
    // inventar "1 parcela" a partir de um valor solto.
    expect(resumoDoPlano({ parcelaCents: 240_000 }).somaCents).toBe(0);
    expect(resumoDoPlano({ parcelas: 60 }).somaCents).toBe(0);
  });
});

describe('preço de tabela', () => {
  it('só existe acima do preço de venda', () => {
    expect(precoDeTabela(185_000_000, 195_000_000)).toBe(195_000_000);
    // Igual ou abaixo não é desconto: na vitrine, pareceria erro.
    expect(precoDeTabela(185_000_000, 185_000_000)).toBeNull();
    expect(precoDeTabela(185_000_000, 180_000_000)).toBeNull();
  });

  it('sem preço de venda não há o "por", e então não há o "de"', () => {
    expect(precoDeTabela(null, 195_000_000)).toBeNull();
    expect(precoDeTabela(0, 195_000_000)).toBeNull();
    expect(precoDeTabela(185_000_000, null)).toBeNull();
    expect(precoDeTabela(185_000_000, undefined)).toBeNull();
  });

  it('o banco recusa o mesmo caso, em centavos inteiros', () => {
    expect(colunasDaTabela('properties').get('original_price_cents')).toMatch(/^bigint\b/);
    const regra = definicaoDaRestricao('properties_original_price_ck').definicao;
    expect(regra).toContain('price_cents is not null');
    expect(regra).toContain('price_cents > 0');
    expect(regra).toContain('original_price_cents > price_cents');
  });
});
