import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import { DDDS_DO_BRASIL, UFS_DOS_DDDS, regiaoDoTelefone } from '@contracts';
import { letraDaColuna, serialExcel, textoXml } from '@/xlsx';
import {
  COLUNAS_DA_EXPORTACAO,
  linhasDaPlanilha,
  motivoLegivel,
  nomeDoArquivo,
  origemLegivel,
  planilhaDeLeads,
  rotuloDe,
  telefoneLegivel,
  type LinhaExportada,
} from '@/exportacao';
import {
  definicaoDaFuncao,
  executoresDaFuncao,
  privilegiosNaTabela,
  semComentarios,
} from '../../../supabase/testes/esquema';

function lead(p: Partial<LinhaExportada> = {}): LinhaExportada {
  return {
    nome: 'Maria Souza',
    telefone_e164: '+5549991545454',
    telefone_bruto: '49991545454',
    pais: 'BR',
    cidade: null,
    corretor: 'Maria Exemplo',
    entrada: '2026-09-10T21:52:00',
    etapa: 'Novo',
    origem: 'meta_ads',
    entrada_por: 'whatsapp_inbound',
    campanha: 'Campanha X | Whatsapp',
    email: null,
    ultimo_contato: null,
    motivo_perda: null,
    motivo_perda_texto: null,
    temperatura: null,
    finalidade: null,
    prazo_compra: null,
    encaixe_financeiro: null,
    ...p,
  };
}

/** As partes do .xlsx, já como texto. */
function partes(bytes: Uint8Array): Record<string, string> {
  return Object.fromEntries(Object.entries(unzipSync(bytes)).map(([k, v]) => [k, strFromU8(v)]));
}

describe('a região pelo telefone', () => {
  it('a tabela tem os 67 DDDs e cobre as 27 unidades da federação', () => {
    expect(DDDS_DO_BRASIL).toHaveLength(67);
    expect(new Set(UFS_DOS_DDDS).size).toBe(27);
  });

  it('diz estado e região — e nunca afirma a cidade', () => {
    // O 49 cobre de Chapecó a Lages. A frase localiza sem inventar onde a
    // pessoa mora.
    expect(regiaoDoTelefone('+5549991545454', 'BR')).toBe('SC · região de Chapecó e Lages');
  });

  it('número de fora diz o país, que é certeza', () => {
    expect(regiaoDoTelefone('+56912345678', 'CL')).toBe('Chile');
    expect(regiaoDoTelefone('+595981000000', 'PY')).toBe('Paraguai');
  });

  it('sem telefone não inventa, e DDD desconhecido diz só o país', () => {
    expect(regiaoDoTelefone(null, 'BR')).toBeNull();
    expect(regiaoDoTelefone('+5520991545454', 'BR')).toBe('Brasil');
  });

  it('o número manda quando o cadastro diz outro país', () => {
    // Caso real da primeira exportação: nove leads da campanha da Bolívia com
    // +591 e país gravado como BR ficavam com a coluna em branco.
    expect(regiaoDoTelefone('+59171234567', 'BR')).toBe('Bolívia');
    expect(regiaoDoTelefone('+59899123456', 'BR')).toBe('Uruguai');
  });

  it('+1 não escolhe um país que o número não diz', () => {
    expect(regiaoDoTelefone('+15551234567', 'BR')).toBe('EUA ou Canadá');
  });

  it('número estrangeiro sem código conhecido não fica em branco', () => {
    expect(regiaoDoTelefone('+99912345678', 'BR')).toBe('Fora do Brasil');
    expect(regiaoDoTelefone('+99912345678', 'AR')).toBe('Argentina');
  });
});

describe('as colunas da exportação', () => {
  it('as quatro que não podem faltar vêm primeiro, nesta ordem', () => {
    expect(COLUNAS_DA_EXPORTACAO.slice(0, 4).map((c) => c.titulo)).toEqual([
      'Nome',
      'Telefone',
      'Cidade',
      'Corretor responsável',
    ]);
  });

  it('cada linha tem exatamente uma célula por coluna', () => {
    // Uma célula a menos não quebra nada: desloca tudo uma coluna para a
    // esquerda, e o e-mail aparece embaixo de "Campanha" sem ninguém notar.
    expect(linhasDaPlanilha([lead()])[0]).toHaveLength(COLUNAS_DA_EXPORTACAO.length);
  });

  it('a cidade só vem do que foi informado; a região mora na coluna dela', () => {
    const [linha] = linhasDaPlanilha([lead({ cidade: null })]);
    expect(linha?.[2]).toBeNull();
    expect(linha?.[4]).toBe('SC · região de Chapecó e Lages');

    const [informada] = linhasDaPlanilha([lead({ cidade: '  Lages ' })]);
    expect(informada?.[2]).toBe('Lages');
  });

  it('lead sem corretor diz isso, em vez de ficar em branco', () => {
    const [linha] = linhasDaPlanilha([lead({ corretor: null })]);
    expect(linha?.[3]).toBe('Sem responsável');
  });

  it('telefone brasileiro sai legível; o de fora sai como chegou', () => {
    expect(telefoneLegivel('+5549991545454', null)).toBe('+55 49 99154-5454');
    expect(telefoneLegivel('+554933221100', null)).toBe('+55 49 3322-1100');
    expect(telefoneLegivel('+56912345678', null)).toBe('+56912345678');
    expect(telefoneLegivel(null, ' 4999 ')).toBe('4999');
  });

  it('origem e motivo saem com os rótulos da tela, não com o código', () => {
    expect(origemLegivel('meta_ads', 'whatsapp_inbound')).toBe('Meta Ads · WhatsApp');
    // `landing_page` é o site da Juliana (o rótulo mudou em 05/10).
    expect(origemLegivel('landing_page', 'landing_form')).toBe('Site · formulário da página');
    expect(origemLegivel('google', 'whatsapp_inbound')).toBe('Google orgânico · WhatsApp');
    expect(origemLegivel('indicacao', null)).toBe('Indicação');
    expect(motivoLegivel('sem_resposta', ' sumiu depois da visita ')).toBe(
      'Parou de responder — sumiu depois da visita',
    );
    expect(motivoLegivel(null, 'qualquer')).toBeNull();
  });

  it('a qualificação entra no fim, com os rótulos da ficha', () => {
    expect(COLUNAS_DA_EXPORTACAO.slice(-4).map((c) => c.titulo)).toEqual([
      'Temperatura',
      'O que procura',
      'Quando pretende comprar',
      'Entrada e parcelas',
    ]);

    const [linha] = linhasDaPlanilha([
      lead({
        temperatura: 'quente',
        finalidade: 'investir',
        prazo_compra: 'de_1_a_3_meses',
        encaixe_financeiro: 'cabe',
      }),
    ]);
    expect(linha?.slice(-4)).toEqual(['Quente', 'Investir', 'De 1 a 3 meses', 'Entrada e parcelas cabem']);
  });

  it('lead sem qualificação deixa as quatro em branco, e código novo não some', () => {
    const [vazio] = linhasDaPlanilha([lead()]);
    expect(vazio?.slice(-4)).toEqual([null, null, null, null]);

    // Um valor que o banco aceite antes de o dicionário conhecer aparece cru.
    // Feio, mas visível: célula vazia onde havia resposta ninguém nota.
    expect(rotuloDe({ a: 'A' }, 'b')).toBe('b');
    expect(rotuloDe({ a: 'A' }, null)).toBeNull();
  });

  it('o arquivo diz o período no nome', () => {
    expect(nomeDoArquivo('2026-09-16', '2026-09-16')).toBe('leads-2026-09-16.xlsx');
    expect(nomeDoArquivo('2026-08-18', '2026-09-16')).toBe('leads-2026-08-18-a-2026-09-16.xlsx');
  });
});

describe('a planilha .xlsx', () => {
  it('tem as partes que o Excel exige para abrir', () => {
    const p = partes(planilhaDeLeads([lead()]));
    for (const parte of [
      '[Content_Types].xml',
      '_rels/.rels',
      'xl/workbook.xml',
      'xl/_rels/workbook.xml.rels',
      'xl/styles.xml',
      'xl/worksheets/sheet1.xml',
    ]) {
      expect(p[parte], parte).toBeTruthy();
    }
  });

  it('nome com cara de fórmula entra como TEXTO, nunca como fórmula', () => {
    /*
     * O motivo de ser .xlsx e não CSV. No CSV, "=HIPERLINK(...)" num nome vira
     * link clicável para onde quem cadastrou quis, e "+56 9…" vira erro de
     * fórmula. Aqui toda célula de texto é `inlineStr`, que o Excel não avalia.
     */
    const folha = partes(
      planilhaDeLeads([lead({ nome: '=HYPERLINK("http://x","clique")', telefone_e164: '+56912345678', pais: 'CL' })]),
    )['xl/worksheets/sheet1.xml'];
    expect(folha).not.toContain('<f>');
    expect(folha).toContain('=HYPERLINK(&quot;http://x&quot;,&quot;clique&quot;)');
    expect(folha).toContain('<t xml:space="preserve">+56912345678</t>');
  });

  it('a data vira data de verdade, com o formato de data', () => {
    const folha = partes(planilhaDeLeads([lead()]))['xl/worksheets/sheet1.xml'];
    expect(folha).toContain(`<c r="F2" s="2"><v>${serialExcel('2026-09-10T21:52:00')}</v></c>`);
  });

  it('o filtro cobre o cabeçalho e todas as linhas', () => {
    const p = partes(planilhaDeLeads([lead(), lead(), lead()]));
    // A última letra sai da lista de colunas: escrita à mão, ela quebrou no dia
    // em que a qualificação levou a planilha de 12 para 16 colunas.
    const ultima = letraDaColuna(COLUNAS_DA_EXPORTACAO.length - 1);
    expect(ultima).toBe('P');
    expect(p['xl/worksheets/sheet1.xml']).toContain(`<autoFilter ref="A1:${ultima}4"/>`);
    expect(p['xl/workbook.xml']).toContain(`'Leads'!$A$1:$${ultima}$4`);
  });

  it('célula vazia não é escrita', () => {
    const folha = partes(planilhaDeLeads([lead({ cidade: null, email: null })]))['xl/worksheets/sheet1.xml'];
    expect(folha).not.toContain('r="C2"');
    expect(folha).not.toContain('r="J2"');
  });

  it('caractere proibido em XML some, em vez de corromper o arquivo inteiro', () => {
    // Um só destes faz o Excel recusar a planilha toda.
    expect(textoXml('ab\uD800c<&>"')).toBe('abc&lt;&amp;&gt;&quot;');
    expect(textoXml('Ana 🇧🇷')).toBe('Ana 🇧🇷');
  });

  it('número de série do Excel bate com as âncoras conhecidas', () => {
    expect(serialExcel('1970-01-01T00:00:00')).toBe(25569);
    expect(serialExcel('2000-01-01T12:00:00')).toBe(36526.5);
    expect(serialExcel('bobagem')).toBeNull();
  });

  it('as letras das colunas', () => {
    expect([0, 11, 25, 26, 27].map(letraDaColuna)).toEqual(['A', 'L', 'Z', 'AA', 'AB']);
  });
});

describe('a função do banco que monta a lista', () => {
  /*
   * A definição VIGENTE de cada função — um arquivo fixo passaria verde sobre
   * código morto no dia em que alguém a redefinisse —, sem os comentários, que
   * citam por escrito o que o código deixou de fazer. E os privilégios como
   * ficaram depois de todo GRANT e REVOKE, e não o texto de um deles.
   */
  const sqlDa = (nome: string) => semComentarios(definicaoDaFuncao(nome).texto);

  it('só gerente e admin passam pela porta', () => {
    const sql = sqlDa('leads_exportar');
    expect(sql).toContain('not public.is_admin_or_above(v_org)');
    expect(sql).toMatch(/raise exception[^;]*gerente e admin/);
    // O `revoke ... from public, anon, authenticated` da origem, seguido do
    // `grant execute` a quem tem sessão: a porta é a função, e anon não a vê.
    const quem = executoresDaFuncao('leads_exportar');
    expect(quem).toContain('authenticated');
    expect(quem).not.toContain('anon');
    expect(quem).not.toContain('PUBLIC');
  });

  it('o recorte tira excluídos e reconciliados, e corta pelo dia da organização', () => {
    const recorte = sqlDa('leads_da_exportacao');
    expect(recorte).toContain('l.excluded_at is null');
    expect(recorte).toContain("l.attribution_method <> 'reconciliado'");
    // O dia da organização vira instante na porta (`leads_exportar`), e o
    // recorte só compara instantes: data crua não aparece em nenhuma das duas.
    const porta = sqlDa('leads_exportar');
    for (const sql of [recorte, porta]) expect(sql).not.toContain('created_at::date');
    expect(porta).toContain('public.inicio_do_dia(v_ate + 1, v_tz)');
  });

  it('o recorte não é chamável pela API — senão pularia a porta', () => {
    const quem = executoresDaFuncao('leads_da_exportacao');
    for (const papel of ['PUBLIC', 'anon', 'authenticated']) expect(quem, papel).not.toContain(papel);
  });

  it('toda exportação vira registro, e o registro não aceita escrita pela API', () => {
    expect(sqlDa('leads_exportar')).toContain('insert into public.lead_exportacoes');
    // Quem tem sessão lê o registro; ninguém do lado de fora escreve nele.
    expect(privilegiosNaTabela('lead_exportacoes', 'authenticated')).toEqual({ tabela: ['select'], colunas: {} });
    for (const papel of ['PUBLIC', 'anon']) {
      expect(privilegiosNaTabela('lead_exportacoes', papel), papel).toEqual({ tabela: [], colunas: {} });
    }
  });

  it('a função vigente entrega as quatro respostas, cruas', () => {
    // Espaços colapsados e busca LITERAL: regex montada em template literal já
    // perdeu o escape uma vez nesta suíte, e o teste passou a acusar o banco.
    const sql = sqlDa('leads_exportar').split(/\s+/).join(' ');
    for (const campo of ['temperatura', 'finalidade', 'prazo_compra', 'encaixe_financeiro']) {
      expect(sql, campo).toContain(`l.${campo} as ${campo}`);
    }
  });

  it('contar não registra: só a exportação de verdade vira linha', () => {
    const sql = sqlDa('leads_exportar');
    const contar = sql.indexOf('if _so_contar then');
    const registro = sql.indexOf('insert into public.lead_exportacoes');
    const retornoDaContagem = sql.indexOf("return jsonb_build_object('total', v_n);", contar);
    expect(contar).toBeGreaterThan(0);
    expect(retornoDaContagem).toBeGreaterThan(contar);
    expect(registro).toBeGreaterThan(retornoDaContagem);
  });
});
