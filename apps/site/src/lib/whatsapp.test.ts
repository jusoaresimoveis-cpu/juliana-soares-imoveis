import { parseRefCode } from '@juliana/contracts';
import { describe, expect, it } from 'vitest';

import { linkDoWhatsApp, mensagemDoImovel } from './whatsapp';

/**
 * Todo link de WhatsApp do site leva um código que o CRM lê.
 *
 * Sem o código, o contato de quem veio do site cai como conversa pessoal (o
 * número da Juliana também é pessoal) e some do CRM sem erro nenhum.
 */

const textoDoLink = (link: string) => new URL(link).searchParams.get('text') ?? '';

describe('o link do WhatsApp', () => {
  it('no botão de um imóvel, leva o código dele e o link da página', () => {
    const texto = textoDoLink(linkDoWhatsApp(mensagemDoImovel({ codigo: '1000', slug: 'apartamento-meia-praia-1000' })));
    expect(parseRefCode(texto)?.publicCode).toBe('1000');
    expect(texto).toContain('https://julianasoaresimoveis.com.br/imovel/apartamento-meia-praia-1000');
    // O código do site não entra por cima do código do imóvel.
    expect(texto.match(/Ref\./g)).toHaveLength(1);
  });

  it('sem mensagem, leva o código do site', () => {
    expect(parseRefCode(textoDoLink(linkDoWhatsApp()))?.publicCode).toBe('site');
  });

  it('com a mensagem de uma página, ganha o código do site no fim', () => {
    const texto = textoDoLink(linkDoWhatsApp('Olá, Juliana! Quero cadastrar meu imóvel.'));
    expect(texto.startsWith('Olá, Juliana! Quero cadastrar meu imóvel.')).toBe(true);
    expect(parseRefCode(texto)?.publicCode).toBe('site');
  });
});
