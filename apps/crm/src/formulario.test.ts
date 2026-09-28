import { describe, expect, it } from 'vitest';
import { ehLeadDeTeste, origemDoFormulario } from '../../../supabase/functions/_shared/lead-de-teste';

/**
 * Lead de formulário da Meta: só o de TESTE fica de fora (decisão de 28/09).
 *
 * Orgânico, que é quem preencheu fora de um anúncio (link da bio, Marketplace,
 * Google), é cliente e entra. Antes o `is_organic` descartava os dois juntos, e
 * um contato de verdade sumia sem ninguém ver.
 */

/** Os campos do lead que a ferramenta de testes criou em 28/09, como chegaram. */
const DO_TESTE = [
  { name: 'já_conhece_a_nossa_região?', values: ['<test lead: dummy data for já_conhece_a_nossa_região?>'] },
  { name: 'full_name', values: ['<test lead: dummy data for full_name>'] },
  { name: 'phone_number', values: ['<test lead: dummy data for phone_number>'] },
  { name: 'email', values: ['test@meta.com'] },
];

const DE_VERDADE = [
  { name: 'já_conhece_a_nossa_região?', values: ['sim'] },
  { name: 'full_name', values: ['Maria Souza'] },
  { name: 'phone_number', values: ['+5547999990000'] },
  { name: 'email', values: ['maria@exemplo.com'] },
];

describe('lead de teste da Meta', () => {
  it('é reconhecido pela marca que a ferramenta põe nos campos', () => {
    expect(ehLeadDeTeste(DO_TESTE)).toBe(true);
  });

  it('lead de verdade não é teste, mesmo orgânico', () => {
    expect(ehLeadDeTeste(DE_VERDADE)).toBe(false);
  });

  it('formulário vazio ou malformado não vira teste por engano', () => {
    expect(ehLeadDeTeste([])).toBe(false);
    expect(ehLeadDeTeste([{ name: 'full_name' }, { name: 'email', values: 'x' }])).toBe(false);
  });
});

describe('origem do lead de formulário', () => {
  it('com anúncio é mídia paga, que é o que o custo por lead divide', () => {
    expect(origemDoFormulario({ is_organic: false, platform: 'ig' })).toBe('meta_ads');
  });

  it('sem anúncio é o perfil orgânico onde a pessoa preencheu', () => {
    expect(origemDoFormulario({ is_organic: true, platform: 'ig' })).toBe('instagram');
    expect(origemDoFormulario({ is_organic: true, platform: 'fb' })).toBe('facebook');
  });

  it('sem a plataforma, fica o Facebook, dono do formulário', () => {
    expect(origemDoFormulario({ is_organic: true })).toBe('facebook');
  });

  it('sem a informação de orgânico, vale o de antes: anúncio', () => {
    expect(origemDoFormulario({})).toBe('meta_ads');
  });
});
