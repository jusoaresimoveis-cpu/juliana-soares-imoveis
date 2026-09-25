import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { CHAVE_DO_TEMA } from './hooks/useTheme';
import { COR_PADRAO } from './lib/cores';

/**
 * O CRM abre no claro e no bronze, qualquer que seja o aparelho.
 *
 * Quem decide é o script do index.html, antes da primeira pintura. Aqui ele
 * roda de verdade, num celular de mentira que está no modo escuro: é o caso
 * que fazia o CRM abrir escuro para quem nunca escolheu o escuro.
 */

const html = readFileSync(join(__dirname, '..', 'index.html'), 'utf8');
const boot = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1] ?? '';

function abrir(guardado: Record<string, string>) {
  const classes = new Set<string>();
  const estilos = new Map<string, string>();
  runInNewContext(boot, {
    localStorage: { getItem: (k: string) => guardado[k] ?? null },
    // O aparelho está no modo escuro.
    window: { matchMedia: () => ({ matches: true }) },
    document: {
      documentElement: {
        classList: { add: (c: string) => classes.add(c) },
        style: { setProperty: (k: string, v: string) => estilos.set(k, v) },
      },
    },
  });
  return { escuro: classes.has('dark'), estilos };
}

describe('o CRM ao abrir', () => {
  it('abre no claro mesmo com o aparelho no escuro', () => {
    expect(boot, 'o script de abertura sumiu do index.html').not.toBe('');
    expect(abrir({}).escuro).toBe(false);
  });

  it('abre no escuro só quando a pessoa escolheu', () => {
    // A chave vem do hook do botão: se um dos dois mudar sozinho, a escolha
    // deixa de valer ao reabrir o app.
    expect(abrir({ [CHAVE_DO_TEMA]: 'dark' }).escuro).toBe(true);
    expect(abrir({ [CHAVE_DO_TEMA]: 'light' }).escuro).toBe(false);
  });

  it('ignora o escuro que a chave antiga guardou sem ninguém escolher', () => {
    expect(abrir({ 'sc-theme': 'dark' }).escuro).toBe(false);
  });

  it('sem cor guardada, vale o bronze', () => {
    // O script só pinta a cor que já foi escolhida antes; sem ela, ficam os
    // tokens do index.css, que são os do bronze.
    expect(COR_PADRAO).toBe('bronze');
    expect(abrir({}).estilos.size).toBe(0);
    expect(abrir({ 'sc-cor': 'verde' }).estilos.has('--pri')).toBe(true);
  });
});
