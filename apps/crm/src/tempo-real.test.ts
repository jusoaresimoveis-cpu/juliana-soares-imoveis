import { describe, expect, it } from 'vitest';

import { CHAVES_DE_COR } from '@/lib/cores';

import { privilegiosNaTabela, tabelasPublicadas, valoresDoCheck } from '../../../supabase/testes/esquema';

/**
 * O que sai do banco para o navegador sem ninguém pedir.
 *
 * O Realtime manda a linha que passou na replicação para toda aba que assina a
 * tabela. Publicada inteira, `notifications` levaria o título e o corpo do aviso
 * (nome de cliente) junto com o evento; a tela só precisa do tipo, para o som,
 * e de saber se virou lida.
 */
describe('o sino em tempo real', () => {
  const colunas = () => tabelasPublicadas('supabase_realtime').get('notifications');

  it('está publicado, com lista de colunas', () => {
    expect(colunas(), 'sem publicação o sino só muda ao recarregar').toBeTruthy();
  });

  it('leva o que a tela e a policy usam', () => {
    // `recipient_id`: o filtro da assinatura e a policy de leitura.
    for (const c of ['id', 'recipient_id', 'type', 'is_read']) expect(colunas()).toContain(c);
  });

  it('e não leva o texto do aviso', () => {
    for (const c of ['title', 'body', 'link_path']) expect(colunas()).not.toContain(c);
  });
});

describe('o número de WhatsApp', () => {
  it('o visitante não tem privilégio nenhum na tabela das instâncias', () => {
    // Ela guarda a referência do token e o hash do segredo do webhook.
    expect(privilegiosNaTabela('whatsapp_instances', 'anon')).toEqual({ tabela: [], colunas: {} });
  });
});

describe('a cor do sistema', () => {
  it('o seletor oferece exatamente as cores que o banco aceita', () => {
    // Uma cor que o banco recusa salva com erro; uma que ele aceita e a tela
    // não conhece volta para o padrão sem aviso.
    expect(valoresDoCheck('profiles_theme_color_ck')).toEqual([...CHAVES_DE_COR].sort());
  });
});
