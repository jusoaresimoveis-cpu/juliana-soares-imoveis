import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ANGULOS_DE_CRIATIVO,
  ANGULO_DE_CRIATIVO_META,
  anguloSugeridoPeloNome,
} from '@contracts';
import {
  colapsado,
  definicaoDaFuncao,
  definicaoDaRestricao,
  privilegiosNaTabela,
  semComentarios,
} from '../../../supabase/testes/esquema';

/**
 * A leitura por ângulo de criativo — a migração 134.
 *
 * Três coisas aqui, e as três nasceram de defeito conhecido:
 *
 *   1. a FAIXA de custo é a mesma da 108. Duas fórmulas parecidas na mesma tela
 *      dariam dois vereditos para a mesma conta, e ninguém saberia qual seguir;
 *   2. o ângulo é DIGITADO. O projeto já fechou a porta do "deduzir do nome"
 *      duas vezes — no tipo de campanha (017) e no empreendimento (105);
 *   3. o piso de dez leads existe nos dois lugares, porque ele é da fórmula e
 *      não do produto.
 */

/**
 * O corpo VIGENTE de uma função, sem comentário.
 *
 * A função, e não o arquivo: com o esquema consolidado num arquivo só, "o
 * arquivo que tem a marca" é o banco inteiro — e as duas leituras abaixo
 * seriam o mesmo texto, iguais por construção.
 */
const corpo = (nome: string) => semComentarios(definicaoDaFuncao(nome).texto);

describe('a faixa de custo é uma só', () => {
  const porAngulo = () => colapsado(corpo('mkt_por_angulo'));
  const porCampanha = () => colapsado(corpo('mkt_inteligencia'));

  it('as três expressões são idênticas nas duas leituras', () => {
    /*
     * `1.96 · √n` é a aproximação normal da Poisson. Se uma das duas telas
     * mudasse de fórmula, a mesma campanha apareceria "rende" num lugar e
     * "revisar" no outro — e a tela perderia a autoridade inteira, não só
     * aquela linha.
     */
    const a = porAngulo();
    const c = porCampanha();

    expect(a).toContain('1.96 * sqrt(');
    expect(c).toContain('1.96 * sqrt(');
    // A mesma forma dos dois lados: piso divide pelo limite de CIMA da contagem.
    expect(a).toMatch(/nullif\(p\.leads \+ 1\.96 \* sqrt\(p\.leads::numeric\), 0\)/);
    expect(c).toMatch(/nullif\(b\.leads \+ 1\.96 \* sqrt\(b\.leads::numeric\), 0\)/);
    expect(a).toMatch(/when p\.leads - 1\.96 \* sqrt\(p\.leads::numeric\) > 0/);
    expect(c).toMatch(/when b\.leads - 1\.96 \* sqrt\(b\.leads::numeric\) > 0/);
  });

  it('e o piso de dez leads também', () => {
    expect(porAngulo()).toContain('leads < 10');
    expect(porCampanha()).toContain('leads < 10');
  });

  it('sem teto declarado não há semáforo em nenhuma das duas', () => {
    expect(porAngulo()).toContain("when v_teto is null then 'sem_meta'");
    expect(colapsado(porCampanha())).toContain("when v_teto is null then 'sem_meta'");
  });
});

describe('o ângulo é digitado, nunca deduzido', () => {
  it('a função de leitura não lê o NOME do anúncio para classificar', () => {
    /*
     * O defeito que o projeto já viu duas vezes: classificar por substring do
     * nome. Nome de anúncio é texto que o gestor reescreve no meio do mês, e
     * uma chave que muda sozinha parte o histórico em dois.
     */
    const f = corpo('mkt_por_angulo');
    const bloco = f.slice(f.indexOf('porangulo as ('), f.indexOf('calc as ('));
    expect(bloco).toContain('an.angulo');
    expect(bloco).not.toContain('name like');
    expect(bloco).not.toContain('d.name');
  });

  it('a tela escreve a coluna do ângulo, e só ela', () => {
    // O que a 134 concedeu (`grant update (angulo)`), lido do estado final dos
    // privilégios: a coluna, e não a linha inteira do anúncio.
    const concedido = privilegiosNaTabela('meta_ad_dimensions', 'authenticated');
    expect(concedido.colunas.update ?? []).toContain('angulo');
    expect(concedido.tabela).not.toContain('update');

    const hook = readFileSync(join(__dirname, 'hooks', 'useInteligencia.ts'), 'utf8');
    const i = hook.indexOf('useMarcarAngulo');
    expect(i).toBeGreaterThan(0);
    const trecho = hook.slice(i, i + 800);
    expect(trecho).toContain(".update({ angulo })");
    expect(trecho).toContain(".eq('level', 'ad')");
  });

  it('o ângulo só existe no nível do anúncio', () => {
    // Campanha e conjunto misturam criativos; o rótulo viraria mentira na
    // primeira vez que alguém subisse dois argumentos no mesmo conjunto.
    // À mão, `angulo is null or (level = 'ad' and ...)`; o pg_dump devolve a
    // mesma regra com um parêntese por termo e `'ad'::text`.
    const check = definicaoDaRestricao('meta_ad_dimensions_angulo_ck').definicao;
    expect(check).toMatch(/angulo is null\)? or \(+level = 'ad'(?:::text)?\)? and /);
  });
});

describe('a sugestão pelo nome', () => {
  it('reconhece a convenção que o Guto adotou', () => {
    expect(anguloSugeridoPeloNome('DOR 1 - Aurora')).toBe('dor');
    expect(anguloSugeridoPeloNome('dor 2 — aurora')).toBe('dor');
    expect(anguloSugeridoPeloNome('OBJEÇÃO 1 | Aurora')).toBe('objecao');
    expect(anguloSugeridoPeloNome('Comparacao — aluguel x parcela')).toBe('comparacao');
    expect(anguloSugeridoPeloNome('  Curiosidade 3')).toBe('curiosidade');
  });

  it('cala a boca quando o nome não segue convenção nenhuma', () => {
    /*
     * Os nomes reais da conta em 23/09. Uma heurística que procurasse a palavra
     * em qualquer posição sugeriria com confiança em cima de nome de arte — e
     * sugestão errada que parece certa é pior que nenhuma.
     */
    for (const nome of [
      'Aurora BRANCO',
      'Aurora (Sem branco e amarelo)',
      'CHILE',
      'Novo anúncio de Engajamento',
      'BBalas (Antg Aurora)',
      'Aurora Azul Pier',
      'Parcela 1700 | Imagem | v1',
    ]) {
      expect(anguloSugeridoPeloNome(nome), nome).toBeNull();
    }
    expect(anguloSugeridoPeloNome(null)).toBeNull();
    expect(anguloSugeridoPeloNome('')).toBeNull();
  });

  it('não casa a palavra no meio do nome', () => {
    // "Aurora DOR" provavelmente é outra coisa; no começo é convenção, no meio
    // é coincidência.
    expect(anguloSugeridoPeloNome('Aurora DOR 1')).toBeNull();
  });
});

describe('a tela por ângulo', () => {
  const tela = () =>
    readFileSync(join(__dirname, 'components', 'inteligencia', 'PorAngulo.tsx'), 'utf8');

  it('oferece a lista do contrato, e não uma cópia', () => {
    const t = tela();
    expect(t).toContain('ANGULOS_DE_CRIATIVO.map(');
    expect(t).toContain('ANGULO_DE_CRIATIVO_META[');
  });

  it('a sugestão é um BOTÃO, e nunca se grava sozinha', () => {
    /*
     * A diferença entre sugerir e decidir. Um `useEffect` que gravasse o
     * sugerido ao abrir a tela encheria o banco de classificações que ninguém
     * fez — e elas passariam a parecer decisão humana daí em diante.
     */
    const t = tela();
    expect(t).toContain('anguloSugeridoPeloNome(');
    expect(t).not.toContain('useEffect');
    const i = t.indexOf('sugerido ? (');
    expect(i).toBeGreaterThan(0);
    expect(t.slice(i, i + 600)).toContain('<button');
  });

  it('mostra a faixa, e não só o número', () => {
    // A peça de desenho que carrega a tela inteira: número sozinho convida à
    // decisão; com a faixa em volta, desconvida na mesma olhada.
    expect(tela()).toContain('<Faixa');
  });

  it('e diz quantos leads faltam quando a faixa ainda não vale', () => {
    expect(tela()).toContain('linha.faltam');
  });
});

describe('o vocabulário chega inteiro à tela', () => {
  it('todo ângulo tem rótulo curto o bastante para caber no seletor', () => {
    for (const a of ANGULOS_DE_CRIATIVO) {
      expect(ANGULO_DE_CRIATIVO_META[a].label.length, a).toBeLessThan(14);
    }
  });
});
