import { describe, expect, it } from 'vitest';

import { colunasDaTabela, definicaoDaFuncao, definicaoDaRestricao } from '../../../supabase/testes/esquema';
import { exigir } from '../../../supabase/testes/exigir';

import {
  CATEGORIAS_COM_LISTA,
  CATEGORIAS_DO_IMOVEL,
  ITENS_DO_IMOVEL,
  LIMITE_DE_ITENS,
  LIMITE_DO_TEXTO_LIVRE,
  caracteristicasParaMostrar,
  chaveDeBusca,
  itemCombinaComBusca,
  itemPeloTexto,
  nomesDoItem,
  normalizarCaracteristicas,
  tituloDaCategoria,
  totalDeCaracteristicas,
} from './index';

const itensDa = (categoria: (typeof CATEGORIAS_COM_LISTA)[number]) => ITENS_DO_IMOVEL[categoria].flatMap((g) => g.itens);

describe('a lista de itens', () => {
  it.each(CATEGORIAS_COM_LISTA)('%s: tem itens, e os ids são snake_case e únicos', (categoria) => {
    const ids = itensDa(categoria).map((i) => i.id);
    expect(ids.length).toBeGreaterThan(20);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(_[a-z0-9]+)*$/);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(CATEGORIAS_COM_LISTA)('%s: nenhum rótulo repetido, nem com outro acento ou caixa', (categoria) => {
    const chaves = itensDa(categoria).map((i) => chaveDeBusca(i.rotulo));
    const repetidos = chaves.filter((c, i) => chaves.indexOf(c) !== i);
    expect(repetidos).toEqual([]);
  });

  it.each(CATEGORIAS_COM_LISTA)('%s: rótulo com maiúscula, sem ponto e dentro do limite do texto livre', (categoria) => {
    for (const { rotulo } of itensDa(categoria)) {
      expect(rotulo, rotulo).toMatch(/^\p{Lu}/u);
      expect(rotulo, rotulo).not.toMatch(/[.\s]$/);
      expect(rotulo.length, rotulo).toBeLessThanOrEqual(LIMITE_DO_TEXTO_LIVRE);
    }
  });

  it.each(CATEGORIAS_COM_LISTA)('%s: um nome (rótulo ou sinônimo) leva a um item só', (categoria) => {
    const nomes = itensDa(categoria).flatMap(nomesDoItem);
    const repetidos = nomes.filter((n, i) => nomes.indexOf(n) !== i);
    expect(repetidos).toEqual([]);
  });

  it('os exemplos que o usuário deu estão na lista, na categoria que ele disse', () => {
    const rotulos = (categoria: (typeof CATEGORIAS_COM_LISTA)[number]) => itensDa(categoria).map((i) => i.rotulo);
    expect(rotulos('unidade')).toEqual(expect.arrayContaining(['Acabamento em gesso', 'Churrasqueira a carvão', 'Lavabo', 'Piso porcelanato']));
    expect(rotulos('empreendimento')).toEqual(
      expect.arrayContaining(['Box de praia', 'Hall decorado', 'Interfone', 'Portão eletrônico', 'Monitoramento 24 horas', 'Wi-Fi nas áreas comuns']),
    );
    expect(rotulos('lazer')).toEqual(expect.arrayContaining(['Piscina', 'Salão de festas', 'Brinquedoteca', 'Espaço gourmet']));
  });

  it.each(CATEGORIAS_COM_LISTA)('%s: grupos com nome único e pelo menos 3 itens', (categoria) => {
    const grupos = ITENS_DO_IMOVEL[categoria];
    expect(new Set(grupos.map((g) => g.grupo)).size).toBe(grupos.length);
    for (const g of grupos) expect(g.itens.length, g.grupo).toBeGreaterThanOrEqual(3);
  });
});

describe('os títulos', () => {
  it('a unidade leva o nome do tipo', () => {
    expect(tituloDaCategoria('unidade', 'apartamento')).toBe('Apartamento');
    expect(tituloDaCategoria('unidade', 'casa_condominio')).toBe('Casa em condomínio');
    expect(tituloDaCategoria('unidade', 'outro')).toBe('Imóvel');
    expect(tituloDaCategoria('unidade')).toBe('Imóvel');
    expect(tituloDaCategoria('lazer')).toBe('Área de lazer');
    expect(tituloDaCategoria('adicionais')).toBe('Informações adicionais');
  });
});

describe('normalizarCaracteristicas', () => {
  const [a, b] = itensDa('unidade');
  const [piscinaOuOutro] = itensDa('lazer');

  it('deixa só o que a página sabe mostrar', () => {
    expect(normalizarCaracteristicas(null)).toEqual({});
    expect(normalizarCaracteristicas(['x'])).toEqual({});
    expect(
      normalizarCaracteristicas({
        cozinha: { itens: [a.id] },
        unidade: { itens: ['nao_existe', b.id, a.id, b.id, 7], outros: ['  Ilha   em quartzo ', '', 3] },
        lazer: 'piscina',
        adicionais: { itens: [a.id], outros: ['Escriturado'] },
      }),
    ).toEqual({
      // Na ordem da lista, sem repetir e sem id desconhecido.
      unidade: { itens: [a.id, b.id], outros: ['Ilha em quartzo'] },
      // "Informações adicionais" não tem lista.
      adicionais: { outros: ['Escriturado'] },
    });
  });

  it('texto livre que é sinônimo de um item marcado não repete o item', () => {
    const salao = exigir(itemPeloTexto('lazer', 'Salão de jogos'));
    expect(normalizarCaracteristicas({ lazer: { itens: [salao.id], outros: ['Game room'] } }).lazer).toEqual({ itens: [salao.id] });
  });

  it('texto livre igual a um item marcado, ou repetido, aparece uma vez só', () => {
    const r = normalizarCaracteristicas({
      lazer: { itens: [piscinaOuOutro.id], outros: [piscinaOuOutro.rotulo.toUpperCase(), 'Deck', 'deck '] },
    });
    expect(r.lazer).toEqual({ itens: [piscinaOuOutro.id], outros: ['Deck'] });
  });

  it('categoria vazia some, e o texto longo é cortado no limite do banco', () => {
    expect(normalizarCaracteristicas({ unidade: { itens: [], outros: [] } })).toEqual({});
    const longo = normalizarCaracteristicas({ adicionais: { outros: ['x'.repeat(500)] } });
    expect(longo.adicionais?.outros?.[0]).toHaveLength(LIMITE_DO_TEXTO_LIVRE);
  });

  it('o corte no limite não parte um emoji ao meio (o banco recusaria o imóvel inteiro)', () => {
    const texto = `${'a'.repeat(LIMITE_DO_TEXTO_LIVRE - 1)}🏊 piscina`;
    const [cortado] = exigir(normalizarCaracteristicas({ adicionais: { outros: [texto] } }).adicionais?.outros);
    expect(Array.from(cortado)).toHaveLength(LIMITE_DO_TEXTO_LIVRE);
    expect(cortado.endsWith('🏊')).toBe(true);
    // Sem metade de par substituto solta.
    expect(cortado).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
  });

  it('não passa do limite de itens por lista', () => {
    const muitos = Array.from({ length: LIMITE_DE_ITENS + 50 }, (_, i) => `Item ${i}`);
    expect(normalizarCaracteristicas({ adicionais: { outros: muitos } }).adicionais?.outros).toHaveLength(LIMITE_DE_ITENS);
  });
});

describe('itemPeloTexto', () => {
  it('acha o item digitado sem olhar acento nem caixa', () => {
    const [item] = itensDa('empreendimento');
    const digitado = item.rotulo.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    expect(itemPeloTexto('empreendimento', `  ${digitado} `)?.id).toBe(item.id);
    expect(itemPeloTexto('empreendimento', 'coisa que não existe')).toBeUndefined();
    expect(itemPeloTexto('empreendimento', '   ')).toBeUndefined();
  });

  it('hífen, pontuação e espaço não contam: "Ar condicionado" é o "Ar-condicionado"', () => {
    expect(itemPeloTexto('unidade', 'Ar condicionado')?.id).toBe('ar_condicionado');
    expect(itemPeloTexto('empreendimento', 'wifi nas areas comuns')?.id).toBe('wifi_areas_comuns');
    expect(itemPeloTexto('empreendimento', 'Lava car')?.id).toBe('lava_car');
  });

  it('sinônimo só o que é o mesmo item: o texto que diz outra coisa fica como foi escrito', () => {
    // "Água quente" pode ser de aquecedor elétrico; "Hall de entrada" não diz que é decorado.
    expect(itemPeloTexto('unidade', 'Água quente')).toBeUndefined();
    expect(itemPeloTexto('empreendimento', 'Hall de entrada')).toBeUndefined();
    expect(itemPeloTexto('lazer', 'Quadra de vôlei')).toBeUndefined();
    expect(itemPeloTexto('lazer', 'Sky pool')).toBeUndefined();
  });

  it('acha pelo sinônimo: quem digita "Game room" marca o salão de jogos', () => {
    expect(itemPeloTexto('lazer', 'game room')?.rotulo).toBe('Salão de jogos');
    expect(itemPeloTexto('unidade', 'Varanda gourmet')?.rotulo).toBe('Sacada gourmet');
  });
});

describe('itemCombinaComBusca', () => {
  it('olha o começo das palavras do rótulo e dos sinônimos', () => {
    const salao = exigir(itemPeloTexto('lazer', 'Salão de jogos'));
    const yoga = exigir(itemPeloTexto('lazer', 'Sala de yoga'));
    expect(itemCombinaComBusca(salao, 'game')).toBe(true);
    expect(itemCombinaComBusca(salao, 'JOG')).toBe(true);
    expect(itemCombinaComBusca(salao, 'salao de')).toBe(true);
    // "alongamento" é sinônimo da sala de yoga, mas "game" está no meio da palavra.
    expect(itemCombinaComBusca(yoga, 'game')).toBe(false);
    expect(itemCombinaComBusca(yoga, '  ')).toBe(true);
  });

  it('acha com ou sem hífen', () => {
    const wifi = exigir(itemPeloTexto('empreendimento', 'Wi-Fi nas áreas comuns'));
    expect(itemCombinaComBusca(wifi, 'wifi')).toBe(true);
    expect(itemCombinaComBusca(wifi, 'wi fi')).toBe(true);
    expect(itemCombinaComBusca(exigir(itemPeloTexto('unidade', 'Ar-condicionado')), 'condicionado')).toBe(true);
  });
});

describe('caracteristicasParaMostrar', () => {
  it('categorias na ordem fixa, rótulos da lista e depois o texto livre', () => {
    const [a, b] = itensDa('unidade');
    const [l] = itensDa('lazer');
    const r = caracteristicasParaMostrar(
      { lazer: { itens: [l.id] }, adicionais: { outros: ['Escriturado'] }, unidade: { itens: [b.id, a.id], outros: ['Ilha'] } },
      'casa',
    );
    expect(r).toEqual([
      { categoria: 'unidade', titulo: 'Casa', itens: [a.rotulo, b.rotulo, 'Ilha'] },
      { categoria: 'lazer', titulo: 'Área de lazer', itens: [l.rotulo] },
      { categoria: 'adicionais', titulo: 'Informações adicionais', itens: ['Escriturado'] },
    ]);
    expect(totalDeCaracteristicas({ unidade: { itens: [a.id], outros: ['Ilha'] }, lazer: { itens: [l.id] } })).toBe(3);
  });
});

describe('o banco', () => {
  it('guarda em jsonb, com o formato conferido', () => {
    expect(colunasDaTabela('properties').get('features')).toMatch(/^jsonb\b/);
    expect(definicaoDaRestricao('properties_features_ck').definicao).toContain('caracteristicas_validas(features)');
  });

  it('confere as mesmas categorias e os mesmos limites que este arquivo', () => {
    const sql = definicaoDaFuncao('caracteristicas_validas').normal;
    const categorias = /categoria\.key not in \(([^)]*)\)/.exec(sql)?.[1];
    expect(categorias?.match(/'([a-z_]+)'/g)?.map((c) => c.slice(1, -1))).toEqual([...CATEGORIAS_DO_IMOVEL]);
    expect(sql).toContain(`jsonb_array_length(lista.value) > ${LIMITE_DE_ITENS}`);
    expect(sql).toContain(`not between 1 and ${LIMITE_DO_TEXTO_LIVRE}`);
  });
});
