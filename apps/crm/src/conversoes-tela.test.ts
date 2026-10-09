import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CONVERSAO_NA_CONVERSA,
  CONVERSAO_MINIMO_SEMANAL,
} from '@contracts';
import {
  colunasDaTabela,
  definicaoDaFuncao,
  privilegiosNaTabela,
  rlsLigada,
  semComentarios,
} from '../../../supabase/testes/esquema';

/**
 * A VOLTA PARA A META, segunda parte: o fim de `conversoes.test.ts`. Ficaram
 * aqui os dois blocos que leem a tela (`AVolta.tsx`) e a memória das cinco
 * recusas, que é o "último bloco" de que fala o cabeçalho de lá.
 */

/** A definição vigente de uma função, sem comentário — só ela, e não o arquivo. */
const corpo = (nome: string) => semComentarios(definicaoDaFuncao(nome).texto);

const trabalhador = () =>
  readFileSync(join(__dirname, '..', '..', '..', 'supabase', 'functions', 'meta-conversoes', 'index.ts'), 'utf8');

const capi = () =>
  readFileSync(join(__dirname, '..', '..', '..', 'supabase', 'functions', '_shared', 'meta-capi.ts'), 'utf8');

describe('a tela diz a verdade sobre o que isto serve', () => {
  it('a fila é do servidor: a tela lê contagem, não lista', () => {
    // `meta_conversoes` tem `revoke` para anon e authenticated. A gestão precisa
    // saber se o cano entupiu; não precisa da lista de quem foi devolvido.
    for (const papel of ['anon', 'authenticated', 'PUBLIC']) {
      const concedido = privilegiosNaTabela('meta_conversoes', papel);
      expect(concedido.tabela, papel).toEqual([]);
      expect(concedido.colunas, papel).toEqual({});
    }
    expect(rlsLigada('meta_conversoes')).toBe(true);
  });

  it('e avisa que isto não é objetivo de campanha', () => {
    /*
     * A tentação natural de quem vê "Visita agendada" no Gerenciador de Eventos
     * é trocar o objetivo da campanha para ela — e a campanha entraria em
     * aprendizado e ficaria lá, porque visita acontece uma ou duas vezes por
     * mês. O número da Meta é 50 por semana; a HVA faz ~26 leads.
     */
    expect(CONVERSAO_MINIMO_SEMANAL).toBe(50);
    const tela = readFileSync(
      join(__dirname, 'components', 'inteligencia', 'AVolta.tsx'),
      'utf8',
    );
    expect(tela).toContain('CONVERSAO_MINIMO_SEMANAL');
    expect(tela.toLowerCase()).toContain('aprendizado');
  });

  it('e não chama de lead perdido o que foi só relatório', () => {
    // Uma conversão que não voltou não é um lead perdido: o lead está no CRM,
    // com o corretor. Dizer o contrário criaria pânico pelo motivo errado.
    const tela = readFileSync(
      join(__dirname, 'components', 'inteligencia', 'AVolta.tsx'),
      'utf8',
    );
    expect(tela).toContain('Os leads continuam no CRM');
  });
});

describe('as cinco recusas da Meta, uma a uma', () => {
  /*
   * Este bloco é memória. Devolver uma conversão de CTWA exigiu descobrir cinco
   * campos, um por vez, cada um só revelado pelo 400 anterior — e nenhum deles
   * aparece junto na documentação. Sem isto escrito, a primeira "limpeza" deste
   * código volta a errar na mesma ordem.
   */

  it('1 · o vocabulário da conversa não é o do site', () => {
    expect(CONVERSAO_NA_CONVERSA.lead).toBe('LeadSubmitted');
  });

  it('2 · o evento de conversa exige page_id', () => {
    expect(capi()).toContain('user_data.page_id = c.pageId');
  });

  it('3 · e exige ctwa_clid — telefone não substitui', () => {
    const t = trabalhador();
    expect(t).toContain('if (naConversa && !linha.o_ctwa_clid)');
  });

  it('4 · e a página tem de ser a DO ANÚNCIO, não a da casa', () => {
    /*
     * "O ctwa_clid deve ser gerado usando o mesmo ID que o page_id." A HVA
     * anuncia por três páginas; uma fixa acertaria no máximo uma delas. Por
     * isso a página sai de `meta_ad_dimensions` pelo anúncio do lead, e SEM
     * recuo para a página conectada ao CRM — recuo aqui é um evento recusado
     * depois de contado como enviado.
     */
    const reivindicar = corpo('meta_conversoes_reivindicar');
    expect(reivindicar).toContain('d.object_id = l.ft_meta_ad_id');
    expect(reivindicar).not.toContain('meta_pages');
  });

  it('5 · e o conjunto de dados precisa vir da conta oficial do WhatsApp', () => {
    /*
     * A única das cinco que não se resolve em código — e a que fecha o caminho
     * por enquanto.
     *
     * A recusa foi "o conjunto de dados deve ter uma Página associada", o que
     * parece uma ligação a fazer no Gerenciador de Eventos. NÃO É. A
     * documentação da API de Conversões para mensagens é explícita: o conjunto
     * de dados de CTWA nasce da CONTA DO WHATSAPP na Meta (o WABA), por uma
     * chamada `POST /{WABA_ID}/dataset`, com permissões
     * `whatsapp_business_management` e `whatsapp_business_manage_events` em
     * acesso avançado — e anúncio que aponta para número fora da API oficial
     * não é suportado.
     *
     * O WhatsApp da HVA está na UAZAPI, uma ponte por fora da oficial. Não há
     * WABA, então não há conjunto de dados, e nenhuma associação de Página
     * resolve isso. O que resolveria é o número passar para a API oficial
     * (Cloud API) — decisão de outra ordem, que mexe com toda a integração de
     * WhatsApp deste CRM.
     *
     * O caminho do SITE continua aberto e não depende de nada disso: `Lead`
     * com `action_source: website` vai para o pixel comum, e esse código está
     * no ar desde agosto esperando a landing receber tráfego.
     *
     * O teste guarda o caminho: o dia em que o id existir, o trabalhador tem
     * de MANDAR para ele, e não para o pixel do site.
     */
    const t = trabalhador();
    expect(t).toContain('linha.o_dataset_id ?? linha.o_pixel_id');
    expect(colunasDaTabela('organizations').has('meta_whatsapp_dataset_id')).toBe(true);
  });

  it('e a tela mostra o motivo com as palavras da própria Meta', () => {
    // Fila parada sem explicação é indistinguível de fila funcionando mal, e as
    // duas somem da cabeça de quem olha a tela em uma semana.
    const t = corpo('meta_conversoes_pendencia');
    expect(t).toContain("error_user_title");
    const tela = readFileSync(join(__dirname, 'components', 'inteligencia', 'AVolta.tsx'), 'utf8');
    expect(tela).toContain('pendencia.data.titulo');
  });
});
