import { parseRefCode } from '@juliana/contracts';
import { describe, expect, it } from 'vitest';

import { GET } from '../app/w/[...rota]/route';
import { linkDoCanal, linkDoWhatsApp, mensagemDoImovel } from './whatsapp';

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

/**
 * O link com canal, que vai fora do site (bio, Perfil da Empresa, Marketplace).
 * É o mesmo código do site, com o canal no meio, e o CRM grava a origem por ele.
 */
describe('o link /w/<canal>', () => {
  it('leva o canal no código e escreve de onde veio', () => {
    const texto = textoDoLink(linkDoCanal(['bio']));
    expect(parseRefCode(texto)).toEqual({ publicCode: 'site', market: 'bi', variant: 'a' });
    expect(texto).toContain('Vim pelo link da bio.');
  });

  it('com imóvel, o código é o dele', () => {
    const texto = textoDoLink(linkDoCanal(['marketplace', '1004']));
    expect(parseRefCode(texto)).toEqual({ publicCode: '1004', market: 'mk', variant: 'a' });
    expect(texto).toContain('Tenho interesse no imóvel 1004.');
  });

  it('canal que não existe, ou imóvel malformado, ainda abre o WhatsApp como site', () => {
    expect(parseRefCode(textoDoLink(linkDoCanal(['nao-existe'])))).toEqual({
      publicCode: 'site',
      market: null,
      variant: 'a',
    });
    expect(parseRefCode(textoDoLink(linkDoCanal(['google', '../x'])))).toMatchObject({ publicCode: 'site', market: 'go' });
  });

  it('a rota redireciona com 302 e sem cache', async () => {
    const resposta = await GET(new Request('https://julianasoaresimoveis.com.br/w/google'), {
      params: Promise.resolve({ rota: ['google'] }),
    });
    expect(resposta.status).toBe(302);
    expect(resposta.headers.get('Cache-Control')).toBe('no-store');
    expect(parseRefCode(textoDoLink(resposta.headers.get('Location') ?? ''))?.market).toBe('go');
  });
});
