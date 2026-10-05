import { parseRefCode } from '@juliana/contracts';
import { describe, expect, it } from 'vitest';

import { canalAnotado, canalDaChegada, comCanal, novaAnotacao, VALIDADE_DA_ORIGEM_DIAS } from './origem';

/**
 * De onde o visitante chegou. Erro aqui não quebra nada na tela: só conta o
 * cliente do Google como "Site" no CRM, e o painel de origens passa a mentir.
 */

const site = (busca = '') => new URL(`https://julianasoaresimoveis.com.br/${busca}`);

describe('o canal da chegada', () => {
  it('pela página anterior', () => {
    expect(canalDaChegada(site(), 'https://www.google.com/')).toBe('go');
    expect(canalDaChegada(site(), 'https://www.google.com.br/')).toBe('go');
    expect(canalDaChegada(site(), 'https://l.instagram.com/')).toBe('ig');
    expect(canalDaChegada(site(), 'https://m.facebook.com/')).toBe('fb');
    expect(canalDaChegada(site(), 'android-app://com.google.android.googlequicksearchbox/')).toBe('go');
  });

  it('pelas UTMs dos links da Juliana, que valem mais que a página anterior', () => {
    expect(canalDaChegada(site('?utm_source=google&utm_medium=perfil'), '')).toBe('go');
    expect(canalDaChegada(site('?utm_source=instagram&utm_medium=bio'), 'https://l.instagram.com/')).toBe('bi');
    expect(canalDaChegada(site('?utm_source=facebook&utm_medium=marketplace'), '')).toBe('mk');
  });

  it('anúncio é anúncio, e não orgânico', () => {
    expect(canalDaChegada(site('?gclid=abc'), 'https://www.google.com/')).toBe('ga');
    expect(canalDaChegada(site('?utm_source=google&utm_medium=cpc'), '')).toBe('ga');
    expect(canalDaChegada(site('?utm_source=instagram&utm_medium=paid'), '')).toBe('ma');
  });

  it('chegada direta, ou de dentro do próprio site, não tem canal', () => {
    expect(canalDaChegada(site(), '')).toBeNull();
    expect(canalDaChegada(site(), 'https://julianasoaresimoveis.com.br/aluguel')).toBeNull();
    expect(canalDaChegada(site(), 'https://www.bing.com/')).toBeNull();
    // Um domínio que só termina parecido não é o Google.
    expect(canalDaChegada(site(), 'https://naoegoogle.com/')).toBeNull();
  });
});

describe('a anotação', () => {
  const hoje = new Date('2026-10-05T12:00:00Z');

  it('o primeiro canal fica, e o seguinte não passa por cima', () => {
    const primeira = novaAnotacao(null, 'go', hoje);
    expect(canalAnotado(primeira, hoje)).toBe('go');
    expect(novaAnotacao(primeira, 'ig', hoje)).toBeNull();
  });

  it('chegada sem canal não escreve nada', () => {
    expect(novaAnotacao(null, null, hoje)).toBeNull();
  });

  it(`vence em ${VALIDADE_DA_ORIGEM_DIAS} dias, e aí a chegada nova vale`, () => {
    const antiga = novaAnotacao(null, 'go', new Date('2026-06-01T12:00:00Z'));
    expect(canalAnotado(antiga, hoje)).toBeNull();
    expect(canalAnotado(novaAnotacao(antiga, 'mk', hoje), hoje)).toBe('mk');
  });

  it('anotação estragada é ignorada', () => {
    expect(canalAnotado('{"canal":"xx","em":"2026-10-05"}', hoje)).toBeNull();
    expect(canalAnotado('não é json', hoje)).toBeNull();
  });
});

describe('o canal no link do WhatsApp', () => {
  const link = (texto: string) => `https://wa.me/5547997354111?text=${encodeURIComponent(texto)}`;
  const mensagem = (href: string) => new URL(href).searchParams.get('text') ?? '';

  it('entra no meio do código, e o banco lê de volta', () => {
    const href = comCanal(link('Olá, Juliana! Tenho interesse neste imóvel (Ref. 1004-A)'), 'go');
    expect(mensagem(href)).toBe('Olá, Juliana! Tenho interesse neste imóvel (Ref. 1004-GO-A)');
    expect(parseRefCode(mensagem(href))).toEqual({ publicCode: '1004', market: 'go', variant: 'a' });
  });

  it('o espaço continua espaço, e não vira "+"', () => {
    expect(comCanal(link('Oi (Ref. SITE-A)'), 'bi')).toContain('Oi%20(Ref.%20SITE-BI-A)');
  });

  it('código que já tem canal, ou link sem código, fica como está', () => {
    const comCodigo = link('Oi (Ref. 1004-MK-A)');
    expect(comCanal(comCodigo, 'go')).toBe(comCodigo);
    const semCodigo = link('Oi');
    expect(comCanal(semCodigo, 'go')).toBe(semCodigo);
  });
});
