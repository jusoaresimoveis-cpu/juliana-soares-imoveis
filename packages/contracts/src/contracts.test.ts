import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ATTRIBUTION_METHODS,
  DEFAULT_STAGES,
  LEAD_SOURCES,
  LOCALES,
  LOSS_REASONS,
} from './index';
import {
  colunasDaTabela,
  definicaoDaFuncao,
  definicaoDoIndice,
  semComentarios,
  valoresDoCheck as valoresDoCheckAtual,
} from '../../../supabase/testes/esquema';

/*
 * O CHECK como ele está HOJE, e não como nasceu.
 *
 * Uma versão antiga destes testes lia um arquivo fixo — o que criou a tabela.
 * Funcionou até a primeira constraint ser redefinida numa migração posterior: a
 * de origens do lead ganhou `link_bio`, `facebook` e `placa` na 030, e o teste
 * continuou conferindo o contrato contra a lista de 003. Isso é pior do que
 * falhar: comparando duas listas antigas e idênticas, passaria verde sem
 * verificar nada do que está no banco.
 *
 * `valoresDoCheckAtual` (de `supabase/testes/esquema`) lê a ÚLTIMA definição de
 * cada restrição, na forma escrita à mão (`in (...)`) ou na do pg_dump (`= ANY
 * (ARRAY[...])`), e só o que está dentro da lista.
 */

/** A definição vigente de uma função, sem comentário. */
const funcao = (nome: string) => semComentarios(definicaoDaFuncao(nome).texto);

/**
 * Este teste existe para quebrar de propósito.
 *
 * O dicionário canônico só vale se o banco repetir os mesmos valores. Numa
 * revisão do desenho, frentes paralelas produziram `variant`, `variant_key`,
 * `ab_variant` e `variant` maiúsculo para a mesma coisa — a consulta que fecha
 * gasto → template → lead retornaria zero para sempre, em silêncio.
 *
 * Se alguém renomear uma etapa no SQL e esquecer do TypeScript (ou o
 * contrário), o CI para aqui.
 */

describe('dicionário canônico ↔ banco', () => {
  it('as etapas semeadas são exatamente as do contrato, na mesma ordem', () => {
    /*
     * Etapa de funil é dado de cliente, e dado de cliente não entra em
     * migration: a base não semeia organização nem etapa. Elas moram no seed
     * de cada cliente, em `supabase/seeds` — e cada seed tem de repetir o
     * contrato, que é de onde a tela tira o que cada coluna significa.
     */
    const pasta = join(__dirname, '../../../supabase/seeds');
    const seeds = readdirSync(pasta).filter((f) => f.endsWith('.sql'));
    expect(seeds.length, 'nenhum seed de cliente em supabase/seeds').toBeGreaterThan(0);

    for (const arquivo of seeds) {
      const seed = readFileSync(join(pasta, arquivo), 'utf8');
      const noSql = [...seed.matchAll(/^\s*\('([a-z_]+)',\s*'[^']+',\s*(\d+),/gm)].map((m) => ({
        key: m[1],
        position: Number(m[2]),
      }));

      expect(noSql.length, `${arquivo}: nenhuma etapa encontrada — o regex ou o SQL mudou`).toBeGreaterThan(0);
      expect(noSql.map((s) => s.key), arquivo).toEqual(DEFAULT_STAGES.map((s) => s.key));
      expect(noSql.map((s) => s.position), arquivo).toEqual(DEFAULT_STAGES.map((s) => s.position));
    }
  });

  it('a visita vem antes da proposta', () => {
    const pos = (key: string) => DEFAULT_STAGES.find((s) => s.key === key)?.position ?? 0;
    // Os dois CRMs de referência invertem isso, e por causa disso toda
    // conversão etapa-a-etapa mente: quem está em negociação nunca conta
    // como tendo visitado.
    expect(pos('visita_agendada')).toBeLessThan(pos('proposta'));
    expect(pos('visita_realizada')).toBeLessThan(pos('proposta'));
  });

  it('os idiomas do contrato são os aceitos pelo CHECK da organização', () => {
    expect(valoresDoCheckAtual('organizations_default_locale_ck')).toEqual([...LOCALES].sort());
  });

  it('exatamente uma etapa de ganho e uma de perda', () => {
    expect(DEFAULT_STAGES.filter((s) => s.isWon)).toHaveLength(1);
    expect(DEFAULT_STAGES.filter((s) => s.isLost)).toHaveLength(1);
  });
});

describe('domínio de lead ↔ banco', () => {
  it('origens batem', () => {
    expect(valoresDoCheckAtual('leads_source_ck')).toEqual([...LEAD_SOURCES].sort());
  });
  it('motivos de perda batem', () => {
    expect(valoresDoCheckAtual('leads_loss_ck')).toEqual([...LOSS_REASONS].sort());
  });
  it('métodos de atribuição batem', () => {
    expect(valoresDoCheckAtual('leads_method_ck')).toEqual([...ATTRIBUTION_METHODS].sort());
  });
  it('idiomas batem', () => {
    expect(valoresDoCheckAtual('leads_locale_ck')).toEqual([...LOCALES].sort());
  });
});

describe('garantias estruturais do banco', () => {
  it('telefone é coluna gerada em E.164, com índice único por organização', () => {
    // Sem isso a deduplicação volta a ser varredura no aplicativo, que é
    // exatamente o que quebra com lead argentino ou americano.
    expect(colunasDaTabela('leads').get('phone_e164')).toMatch(
      /^text generated always as \(public\.to_e164\(/,
    );
    expect(definicaoDoIndice('leads_phone_uk').normal).toMatch(
      /^create unique index leads_phone_uk on public\.leads .*\(organization_id, phone_e164\)/,
    );
  });

  it('dinheiro é inteiro em centavos, nunca ponto flutuante', () => {
    expect(colunasDaTabela('properties').get('price_cents')).toMatch(/^bigint\b/);
    expect(colunasDaTabela('leads').get('deal_value_cents')).toMatch(/^bigint\b/);
    for (const [coluna, tipo] of colunasDaTabela('properties')) {
      if (coluna.includes('price')) expect(tipo, coluna).not.toMatch(/^(real|double precision|float)/);
    }
  });

  it('mídia tem no máximo uma capa por imóvel, garantido pelo banco', () => {
    // O pg_dump escreve o `where` do índice parcial com ou sem parênteses.
    expect(definicaoDoIndice('property_media_one_cover_uk').normal).toMatch(
      /^create unique index property_media_one_cover_uk on public\.property_media .* where \(?is_cover\)?;$/,
    );
  });

  it('renomear imóvel preserva a URL antiga', () => {
    expect(colunasDaTabela('property_slug_history').has('old_slug')).toBe(true);
    expect(funcao('tg_property_slug')).toContain('insert into public.property_slug_history');
  });

  it('a criação de lead usa trava para não duplicar em corrida de webhook', () => {
    expect(funcao('find_or_create_lead')).toMatch(/pg_advisory_xact_lock/);
  });

  it('as saídas de find_or_create_lead não colidem com nome de coluna', () => {
    // No PL/pgSQL as colunas de `returns table` viram variáveis dentro do
    // corpo. Chamar uma saída de `lead_id` torna ambíguo qualquer uso da
    // coluna homônima e a função aborta com 42702 em tempo de execução —
    // ou seja, só aparece quando alguém cadastra um lead com imóvel.
    const assinatura =
      /find_or_create_lead[\s\S]*?returns table \(([^)]+)\)/.exec(funcao('find_or_create_lead'))?.[1] ?? '';
    expect(assinatura).not.toBe('');
    const nomes = assinatura.split(',').map((p) => p.trim().split(/\s+/)[0] ?? '');
    nomes.forEach((n) => expect(n.startsWith('o_'), `saída "${n}" precisa do prefixo o_`).toBe(true));
  });
});
