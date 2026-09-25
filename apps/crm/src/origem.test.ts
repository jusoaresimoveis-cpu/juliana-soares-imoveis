import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A origem do visitante vem do NAVEGADOR — e por isso é a entrada mais
 * suspeita que a landing page tem.
 *
 * Ela existe para o dinheiro do anúncio ter dono: sem `ad_id` no lead, o custo
 * por campanha não fecha e a regra da 095 (o lead vai para quem paga aquela
 * conta) nunca dispara. Mas ela chega pelo corpo de um POST público, escrita
 * por quem quiser.
 *
 * O que estes testes guardam não é a captura — é a TRAVA, na função de borda
 * que recebe o formulário. Todas as três já existiram quebradas em algum CRM:
 * lista aberta, sem teto de tamanho, e campo de decisão aceito do cliente.
 *
 * A captura no navegador (`src/publico/*`) não veio para este CRM: o site
 * público é outro app. A porta do servidor veio, e é ela que decide o que entra.
 */

const RAIZ = join(__dirname, '..');
const FUNCAO = readFileSync(join(RAIZ, '..', '..', 'supabase', 'functions', 'landing-lead', 'index.ts'), 'utf8');

describe('a origem chega até o lead', () => {
  it('a função de borda repassa para a atribuição', () => {
    expect(FUNCAO).toContain('origemLimpa');
    expect(FUNCAO).toMatch(/_attribution:\s*\{[\s\S]{0,220}\.\.\.origem/);
  });
});

describe('a trava da origem', () => {
  it('a lista de campos é FECHADA', () => {
    /*
     * Um `...c.origem` direto no `_attribution` aceitaria qualquer chave que o
     * corpo trouxesse — e ali dentro existem campos que decidem coisa, não só
     * rótulos.
     */
    const bloco = FUNCAO.match(/const CAMPOS_DE_ORIGEM = \{([\s\S]*?)\} as const;/);
    expect(bloco, 'CAMPOS_DE_ORIGEM sumiu').toBeTruthy();

    const chaves = [...bloco![1]!.matchAll(/^\s*(\w+):/gm)].map((m) => m[1]);
    expect(chaves.sort()).toEqual(
      [
        'fbclid',
        'gclid',
        'landing_page_url',
        'meta_ad_id',
        'referrer',
        'utm_campaign',
        'utm_source',
      ].sort(),
    );
  });

  it('e NUNCA aceita do cliente o que decide alguma coisa', () => {
    /*
     * `variant` é o braço do teste A/B; `landing_page_id` diz de qual página o
     * lead veio; `method` é o grau de confiança da atribuição; `locale` escolhe
     * o idioma. Os quatro a função resolve pela PÁGINA, que é o único dado que
     * o visitante legitimamente conhece.
     *
     * Aceitar `variant` do corpo deixaria qualquer um escolher em que perna do
     * teste ele é contado — e o placar que decide onde a verba vai passaria a
     * ser editável por quem visita.
     */
    const bloco = FUNCAO.match(/const CAMPOS_DE_ORIGEM = \{([\s\S]*?)\} as const;/)![1]!;
    for (const proibida of ['variant', 'locale', 'landing_page_id', 'method', 'organization_id']) {
      expect(bloco, `origem aceita '${proibida}' do cliente`).not.toMatch(
        new RegExp(`\\b${proibida}\\s*:`),
      );
    }
  });

  it('e todo campo tem teto de tamanho', () => {
    // Sem teto, um POST com 2 MB de texto vira 2 MB de linha no banco, a cada
    // envio. O `fbclid` legítimo tem cerca de cem caracteres.
    const bloco = FUNCAO.match(/const CAMPOS_DE_ORIGEM = \{([\s\S]*?)\} as const;/)![1]!;
    const pares = [...bloco.matchAll(/^\s*\w+:\s*(\d+)/gm)].map((m) => Number(m[1]));
    expect(pares.length, 'nenhum campo com teto declarado').toBeGreaterThan(0);
    for (const teto of pares) expect(teto).toBeLessThanOrEqual(300);
  });

  it('e a página não pode ser sobrescrita pela origem', () => {
    /*
     * A ordem do espalhamento É a defesa. Com `...origem` DEPOIS dos campos da
     * página, um corpo com `landing_page_id` dentro de `origem` passaria por
     * cima do id verdadeiro — e o lead seria contado noutra página.
     *
     * O teste acima já barra a chave na lista; este barra a ordem. As duas
     * precisam cair para o defeito voltar.
     */
    const attr = FUNCAO.match(/_attribution:\s*\{([\s\S]*?)\n    \},/)![1]!;
    expect(attr.indexOf('...origem')).toBeLessThan(attr.indexOf('landing_page_id'));
  });
});
