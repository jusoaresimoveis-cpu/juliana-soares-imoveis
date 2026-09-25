import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DISCAGEM_DO_PAIS,
  PAISES_DO_TELEFONE,
  PAIS_DESCONHECIDO,
  paisDoTelefone,
} from '@contracts';
import { definicaoDaFuncao, semComentarios } from '../../../supabase/testes/esquema';

/**
 * O país do lead sai do NÚMERO — a migração 126.
 *
 * `cc_from_e164`, escrita na 013, conhecia sete países e terminava em
 * `else 'BR'`. Todo número que ela não reconhecia virava brasileiro, e foi
 * assim que nove leads com +591 entraram no CRM como do Brasil.
 *
 * A regra agora é a mesma nas duas camadas: a tabela de discagem do dicionário
 * e a do banco. Estes testes existem para elas não se separarem — é o defeito
 * que a 030 produziu com as origens do lead, e que só apareceu meses depois.
 */

/**
 * A definição vigente de `pais_da_discagem`, SEM COMENTÁRIO — e isso importa
 * aqui mais do que de costume.
 *
 * A 126 cita o código velho — `else 'BR'` — para explicar o que ela conserta.
 * Sem tirar a prosa, o teste que proíbe esse trecho reprova a função por causa
 * da própria explicação dela.
 */
const discagem = () => semComentarios(definicaoDaFuncao('pais_da_discagem').texto);

/** A tabela `(codigo, iso)` como está no SQL vigente. */
function discagemDoBanco(): Record<string, string> {
  const sql = discagem();
  const bloco = sql.slice(sql.indexOf('from (values'), sql.indexOf(') as p(codigo, iso)'));
  const mapa: Record<string, string> = {};
  for (const m of bloco.matchAll(/\('(\d+)',\s*'([A-Z]{2})'\)/g)) mapa[m[1]!] = m[2]!;
  return mapa;
}

describe('a tabela de discagem é a mesma nas duas camadas', () => {
  it('o banco conhece exatamente os códigos do dicionário', () => {
    expect(discagemDoBanco()).toEqual(DISCAGEM_DO_PAIS);
  });

  it('e são mais que os sete de antes', () => {
    // Os sete da 013: BR, AR, CL, UY, PY, PT e US. Faltavam Bolívia, Peru,
    // Colômbia, Equador e mais duas dúzias.
    expect(Object.keys(DISCAGEM_DO_PAIS).length).toBeGreaterThan(25);
    expect(DISCAGEM_DO_PAIS['591']).toBe('BO');
  });

  it('o mais longo ganha: +591 é Bolívia, não "59"', () => {
    expect(discagem()).toContain('order by length(p.codigo) desc');
  });
});

describe('o que o número diz', () => {
  it('acerta os países que aparecem na carteira', () => {
    expect(paisDoTelefone('+5547999990001')).toBe('BR');
    expect(paisDoTelefone('+59179796364')).toBe('BO');
    expect(paisDoTelefone('+59891234567')).toBe('UY');
    expect(paisDoTelefone('+56912345678')).toBe('CL');
    expect(paisDoTelefone('+595981234567')).toBe('PY');
    expect(paisDoTelefone('+12125551234')).toBe('US');
  });

  it('diz que NÃO SABE em vez de dizer Brasil', () => {
    /*
     * O defeito inteiro cabe nesta linha. Um `else 'BR'` transforma cada país
     * desconhecido num brasileiro, e ninguém percebe porque o CRM é brasileiro.
     */
    expect(paisDoTelefone('+67012345678')).toBe(PAIS_DESCONHECIDO);
    expect(paisDoTelefone(null)).toBe(PAIS_DESCONHECIDO);
    expect(paisDoTelefone('47999990001')).toBe(PAIS_DESCONHECIDO);

    const sql = discagem();
    expect(sql).toContain("'ZZ')::char(2)");
    expect(sql).not.toMatch(/else\s+'BR'/);
  });
});

describe('a ficha oferece todo país que o banco pode gravar', () => {
  it('nenhum valor possível fica de fora do seletor', () => {
    /*
     * Com a lista de sete siglas escrita na tela, um lead boliviano abria a
     * ficha com o seletor VAZIO — o valor do banco não estava entre as opções.
     * Salvar qualquer outro campo levava o país junto, de volta para o errado.
     */
    const oferecidos = new Set(PAISES_DO_TELEFONE.map((p) => p.codigo));
    for (const iso of Object.values(DISCAGEM_DO_PAIS)) expect(oferecidos, iso).toContain(iso);
    expect(oferecidos).toContain(PAIS_DESCONHECIDO);
  });

  it('e a tela usa a lista do dicionário, não uma cópia', () => {
    const tela = readFileSync(join(__dirname, 'pages', 'LeadDetail.tsx'), 'utf8');
    expect(tela).toContain('PAISES_DO_TELEFONE.map(');
    expect(tela).not.toContain("['BR', 'AR', 'CL', 'UY', 'PY', 'US', 'PT']");
  });

  it('cada país tem nome legível, e não só a sigla', () => {
    for (const p of PAISES_DO_TELEFONE) {
      expect(p.nome.length, p.codigo).toBeGreaterThan(2);
      expect(p.nome, p.codigo).not.toBe(p.codigo);
    }
  });
});
