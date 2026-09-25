import { describe, expect, it } from 'vitest';
import { definicaoDaFuncao, semComentarios } from '../../../supabase/testes/esquema';
import {
  PERIODOS,
  PERIODOS_DE_JANELA,
  janelaDe,
  janelaDeDias,
  janelaDoPeriodo,
  janelaPersonalizada,
} from '@/hooks/usePainel';

/** Data local em YYYY-MM-DD — a mesma conta que `janelaDe` usa por dentro. */
function hoje(): string {
  const d = new Date();
  const z = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}

describe('filtro de período do painel', () => {
  it('"Hoje" devolve uma janela de um dia só', () => {
    /*
     * `dias: 1` cai na mesma conta dos outros porque `janelaDe` subtrai
     * `dias - 1`: o período INCLUI o dia corrente. Um caso especial para "hoje"
     * era o caminho fácil e seria o começo de um `if` por atalho novo.
     */
    const j = janelaDe('hoje');
    expect(j.de).toBe(hoje());
    expect(j.ate).toBe(hoje());
  });

  it('nenhum período começa depois de terminar', () => {
    // Guarda contra o erro de sinal em `dias - 1`: com `dias: 0` num atalho de
    // dias fixos, a janela nasceria invertida e o painel devolveria zero em
    // tudo — plausível, e errado.
    for (const p of PERIODOS) {
      const j = janelaDe(p.key);
      expect(j.de <= j.ate, `${p.rotulo}: ${j.de} .. ${j.ate}`).toBe(true);
    }
  });

  it('as chaves são únicas', () => {
    const chaves = PERIODOS.map((p) => p.key);
    expect(new Set(chaves).size).toBe(chaves.length);
  });

  it('"7 dias" é hoje e os seis anteriores, não os sete', () => {
    const j = janelaDe('7');
    const de = new Date(`${j.de}T12:00:00`);
    const ate = new Date(`${j.ate}T12:00:00`);
    const dias = Math.round((ate.getTime() - de.getTime()) / 86_400_000) + 1;
    expect(dias).toBe(7);
  });
});

describe('o período personalizado', () => {
  const ontem = () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const z = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
  };

  it('devolve o que foi escolhido, na ordem escolhida', () => {
    // A positiva primeiro: uma função que normalizasse tudo para hoje passaria
    // nos testes de baixo sem servir para nada.
    const j = janelaPersonalizada('2026-07-01', '2026-07-31');
    expect(j).toEqual({ de: '2026-07-01', ate: '2026-07-31' });
  });

  it('endireita a janela invertida em vez de recusá-la', () => {
    /*
     * Recusar exigiria uma mensagem de erro para um engano que os próprios
     * campos tornam óbvio — e um painel que fica vazio enquanto a pessoa
     * termina de escolher parece quebrado.
     */
    expect(janelaPersonalizada('2026-07-31', '2026-07-01')).toEqual({
      de: '2026-07-01',
      ate: '2026-07-31',
    });
  });

  it('apara a data no futuro em hoje', () => {
    // Janela no futuro devolveria zero em tudo, e zero por período impossível é
    // indistinguível de zero por não ter acontecido nada.
    const j = janelaPersonalizada(ontem(), '2099-12-31');
    expect(j.de).toBe(ontem());
    expect(j.ate).toBe(hoje());
  });

  it('campo vazio vale como hoje, e a janela continua válida', () => {
    const j = janelaPersonalizada('', '');
    expect(j).toEqual({ de: hoje(), ate: hoje() });
  });

  it('e o atalho "Personalizado" tem janela válida antes de alguém escolher', () => {
    /*
     * `janelaDe('personalizado')` existe para o instante entre clicar na
     * pastilha e escolher as datas. Sem ela, `dias` seria `undefined` e a
     * consulta sairia com um período inválido.
     */
    const j = janelaDe('personalizado');
    expect(j.de <= j.ate).toBe(true);
  });
});

/** Quantos dias uma janela cobre, contando as duas pontas. */
function diasEntre(j: { de: string; ate: string }): number {
  const de = new Date(`${j.de}T12:00:00`);
  const ate = new Date(`${j.ate}T12:00:00`);
  return Math.round((ate.getTime() - de.getTime()) / 86_400_000) + 1;
}

describe('a janela de N dias', () => {
  it('cobre exatamente N dias, contando hoje', () => {
    for (const n of [1, 7, 30, 90]) expect(diasEntre(janelaDeDias(n)), `${n} dias`).toBe(n);
  });

  it('termina hoje, no fuso local', () => {
    expect(janelaDeDias(30).ate).toBe(hoje());
  });

  it('menos de um dia vira um dia, e não uma janela invertida', () => {
    expect(janelaDeDias(0)).toEqual({ de: hoje(), ate: hoje() });
  });
});

describe('o período de Anúncios e da exportação', () => {
  const qualquer = { de: '2026-07-01', ate: '2026-07-31' };

  it('"7 dias" são sete, não oito', () => {
    // A versão anterior subtraía `dias` de hoje: "7 dias" cobria oito, e todo
    // número da tabela vinha com um dia a mais do que o rótulo prometia.
    expect(diasEntre(janelaDoPeriodo('7', qualquer))).toBe(7);
    expect(diasEntre(janelaDoPeriodo('30', qualquer))).toBe(30);
    expect(diasEntre(janelaDoPeriodo('90', qualquer))).toBe(90);
  });

  it('"Hoje" é hoje e só hoje', () => {
    expect(janelaDoPeriodo('hoje', qualquer)).toEqual({ de: hoje(), ate: hoje() });
  });

  it('"Personalizado" usa as datas escolhidas, e os atalhos as ignoram', () => {
    expect(janelaDoPeriodo('personalizado', qualquer)).toEqual(qualquer);
    // Sem isto, mexer nos campos e voltar para "30 dias" mostraria outra coisa
    // que não os últimos 30 dias.
    expect(janelaDoPeriodo('30', qualquer).ate).toBe(hoje());
  });

  it('nenhum atalho nasce invertido, e as chaves são únicas', () => {
    for (const p of PERIODOS_DE_JANELA) {
      const j = janelaDoPeriodo(p.key, qualquer);
      expect(j.de <= j.ate, `${p.rotulo}: ${j.de} .. ${j.ate}`).toBe(true);
    }
    const chaves = PERIODOS_DE_JANELA.map((p) => p.key);
    expect(new Set(chaves).size).toBe(chaves.length);
  });
});

describe('o dia do banco é o dia do Brasil', () => {
  /*
   * As duas funções que alimentam a tela de Anúncios cortavam o lead por
   * `created_at::date`, que converte pelo fuso da SESSÃO do banco — UTC. Um
   * lead das 21h30 em São Paulo caía no dia seguinte, e o filtro "Hoje" nascia
   * errado justamente no fim do dia. O painel e a Inteligência já cortavam
   * pelo fuso da organização; estas duas tinham ficado para trás.
   *
   * A definição VIGENTE é a última, na ordem em que as migrations se aplicam:
   * um arquivo fixo passaria verde sobre código morto no dia em que alguém
   * redefinisse a função numa migração nova.
   *
   * Sem comentários: a migração explica por escrito o `created_at::date` que
   * ela removeu, e o teste não pode tropeçar na prosa.
   */
  const corpoVigente = (nome: string) => semComentarios(definicaoDaFuncao(nome).texto);

  for (const nome of ['meta_gasto_agregado', 'meta_cobertura_atribuicao']) {
    it(`${nome} corta o lead pelo fuso da organização`, () => {
      const corpo = corpoVigente(nome);
      expect(corpo).not.toContain('created_at::date');
      expect(corpo).toContain('inicio_do_dia(_since');
      expect(corpo).toContain('inicio_do_dia(_until + 1');
    });

    it(`${nome} não conta o que foi marcado como "não é lead"`, () => {
      // A faixa de cobertura e a coluna "No CRM" moram no mesmo cartão: se só
      // uma delas tirar os excluídos, a soma da coluna deixa de bater com a
      // frase logo acima dela.
      expect(corpoVigente(nome)).toContain('excluded_at is null');
    });
  }
});
