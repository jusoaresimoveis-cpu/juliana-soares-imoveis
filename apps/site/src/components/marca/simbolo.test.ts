import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * O símbolo do cabeçalho e o dos favicons são o mesmo desenho.
 *
 * O cabeçalho desenha o símbolo no próprio HTML (Simbolo.tsx), e os favicons
 * saem de `ferramentas/marca/simbolo.svg` pelo gerador. Quem trocar o arquivo e
 * esquecer o componente, ou o contrário, põe dois logos diferentes no ar sem
 * erro em lugar nenhum.
 */

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..', '..', '..', '..', '..');

const ler = (caminho: string) => readFileSync(join(RAIZ, caminho), 'utf8');
const tracos = (texto: string) => [...texto.matchAll(/\s(?:d|points)="([^"]+)"/g)].map((m) => m[1]);

describe('o símbolo da marca', () => {
  const arquivo = ler('ferramentas/marca/simbolo.svg');

  it('o cabeçalho desenha os traços do arquivo, na mesma caixa', () => {
    const componente = ler('apps/site/src/components/marca/Simbolo.tsx');
    expect(tracos(arquivo).length).toBeGreaterThan(0);
    expect(tracos(componente)).toEqual(tracos(arquivo));
    // Caixa diferente corta o desenho ou tira ele do centro.
    expect(/viewBox="([^"]+)"/.exec(componente)?.[1]).toBe(/viewBox="([^"]+)"/.exec(arquivo)?.[1]);
  });

  it('os favicons em SVG saíram do arquivo atual (senão, rode o gerador)', () => {
    for (const favicon of ['apps/site/src/app/icon.svg', 'apps/crm/public/favicon.svg']) {
      expect(tracos(ler(favicon)), favicon).toEqual(tracos(arquivo));
    }
  });
});
