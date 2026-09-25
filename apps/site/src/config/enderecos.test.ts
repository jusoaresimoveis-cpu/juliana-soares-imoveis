import { getPathMatch } from 'next/dist/shared/lib/router/utils/path-match';
import { describe, expect, it } from 'vitest';

import nextConfig from '../../next.config';
import { SITE } from './site';

/**
 * O endereço da Vercel leva ao domínio, menos o caminho que o banco chama.
 *
 * As duas quebras possíveis aqui são silenciosas. Sem o redirecionamento, o
 * mesmo site indexa em dois endereços no dia do lançamento. Com ele pegando
 * `/api/`, o aviso do banco recebe um 308, a revalidação não acontece e o site
 * continua mostrando o imóvel que já foi alugado, sem erro em lugar nenhum.
 */

const HOST_DA_VERCEL = 'juliana-soares-site.vercel.app';

async function regraDaVercel() {
  const regras = (await nextConfig.redirects?.()) ?? [];
  const regra = regras.find((r) => r.has?.some((h) => h.type === 'host' && h.value === HOST_DA_VERCEL));
  if (!regra) throw new Error(`sem redirecionamento de ${HOST_DA_VERCEL}`);
  return regra;
}

describe('o endereço da Vercel', () => {
  it('leva ao domínio do site, de vez', async () => {
    const regra = await regraDaVercel();
    expect(regra.destination.startsWith(`${SITE.url}/`)).toBe(true);
    expect(regra.permanent).toBe(true);
  });

  it('leva todas as páginas e deixa /api/ onde está', async () => {
    // O mesmo casamento que o Next faz com o `source` de um redirecionamento.
    const casa = getPathMatch((await regraDaVercel()).source, { strict: true, removeUnnamedParams: true });

    for (const pagina of ['/', '/aluguel', '/aluguel/apartamentos/itapema/meia-praia', '/imovel/abc', '/versao']) {
      expect(casa(pagina), `${pagina} ficou no endereço da Vercel`).not.toBe(false);
    }
    expect(casa('/api/revalidar'), 'o aviso do banco passou a ser redirecionado').toBe(false);
  });
});
