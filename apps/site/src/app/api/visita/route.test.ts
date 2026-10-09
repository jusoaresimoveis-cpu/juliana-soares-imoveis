import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from './route';

/**
 * A porta de entrada das visitas. O número vai para o CRM da Juliana e, depois,
 * para o painel do dono do imóvel: contar o que não é visita (pré-visualização,
 * outra origem, lixo no corpo) seria mostrar ao dono um número inflado.
 */

const pedido = (corpo: unknown, origem: string | null = 'https://julianasoaresimoveis.com.br') =>
  new Request('https://julianasoaresimoveis.com.br/api/visita', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(origem ? { Origin: origem } : {}) },
    body: typeof corpo === 'string' ? corpo : JSON.stringify(corpo),
  });

let banco: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.stubEnv('VERCEL_ENV', 'production');
  vi.stubEnv('SUPABASE_URL', 'https://exemplo.supabase.co');
  vi.stubEnv('SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_teste');
  vi.stubEnv('SITE_ORGANIZACAO', 'juliana-soares');
  banco = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));
  vi.stubGlobal('fetch', banco);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('/api/visita', () => {
  it('conta a visita pela função do banco, com a organização do site', async () => {
    const resposta = await POST(pedido({ codigo: '1000' }));
    expect(resposta.status).toBe(204);
    expect(banco).toHaveBeenCalledTimes(1);
    const [url, opcoes] = banco.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://exemplo.supabase.co/rest/v1/rpc/registrar_visita');
    expect(JSON.parse(String(opcoes.body))).toEqual({ _organizacao: 'juliana-soares', _codigo: '1000' });
  });

  it('fora da produção não conta', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview');
    expect((await POST(pedido({ codigo: '1000' }))).status).toBe(204);
    expect(banco).not.toHaveBeenCalled();
  });

  it('pedido de outra origem não conta', async () => {
    expect((await POST(pedido({ codigo: '1000' }, 'https://outro-site.com'))).status).toBe(403);
    expect(banco).not.toHaveBeenCalled();
  });

  it('código fora do formato não chega ao banco', async () => {
    for (const corpo of [{ codigo: '' }, { codigo: "1000'; drop table" }, { codigo: 1000 }, 'isto não é json']) {
      expect((await POST(pedido(corpo))).status).toBe(400);
    }
    expect(banco).not.toHaveBeenCalled();
  });
});
