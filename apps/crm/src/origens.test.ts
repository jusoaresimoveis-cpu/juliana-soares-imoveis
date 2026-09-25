import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * `APP_ORIGIN` é uma lista, e toda função que o navegador chama responde à
 * origem de quem chamou.
 *
 * `CORS` traz só a PRIMEIRA origem da lista. Função que responde com ele puro
 * funciona num endereço e falha nos outros, e a tela diz só "Failed to send a
 * request to the Edge Function". Na origem isso derrubou a conexão do WhatsApp;
 * aqui o CRM mora em app.julianasoaresimoveis.com.br e a lista ainda tem o
 * endereço da Vercel e o localhost.
 */

const FUNCOES = join(__dirname, '..', '..', '..', 'supabase', 'functions');

const doNavegador = readdirSync(FUNCOES, { withFileTypes: true })
  .filter((d) => d.isDirectory() && !d.name.startsWith('_'))
  .map((d) => ({ nome: d.name, arquivo: join(FUNCOES, d.name, 'index.ts') }))
  .filter(({ arquivo }) => existsSync(arquivo))
  .map(({ nome, arquivo }) => ({ nome, fonte: readFileSync(arquivo, 'utf8') }))
  .filter(({ fonte }) => fonte.includes("req.method === 'OPTIONS'"));

describe('funções que o navegador chama', () => {
  it('incluem as que o CRM usa', () => {
    // Sem isto, um filtro que não acha nada faria o teste de baixo passar vazio.
    expect(doNavegador.map((f) => f.nome)).toEqual(
      expect.arrayContaining(['criar-corretor', 'meta-conectar', 'push-inscrever', 'redefinir-senha', 'whatsapp-instancia']),
    );
  });

  it.each(doNavegador.map((f) => [f.nome, f.fonte]))('%s responde à origem de quem chamou', (_nome, fonte) => {
    expect(fonte).toMatch(/servir\(|comOrigem\(await /);
  });
});
