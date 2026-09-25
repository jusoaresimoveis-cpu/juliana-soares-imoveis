import { describe, expect, it } from 'vitest';

import { diaDoAparelho, pareceRobo, registrarNoAparelho } from './visitas';

describe('registrarNoAparelho', () => {
  it('a primeira visita do dia conta, a segunda ao mesmo imóvel não', () => {
    const primeira = registrarNoAparelho(null, '1000', '2026-09-25');
    expect(primeira.contar).toBe(true);
    const segunda = registrarNoAparelho(primeira.guardar, '1000', '2026-09-25');
    expect(segunda.contar).toBe(false);
  });

  it('outro imóvel no mesmo dia conta', () => {
    const guardado = registrarNoAparelho(null, '1000', '2026-09-25').guardar;
    expect(registrarNoAparelho(guardado, '1001', '2026-09-25').contar).toBe(true);
  });

  it('no dia seguinte o mesmo imóvel conta de novo, e a lista zera', () => {
    const ontem = registrarNoAparelho(null, '1000', '2026-09-25').guardar;
    const hoje = registrarNoAparelho(ontem, '1000', '2026-09-26');
    expect(hoje.contar).toBe(true);
    expect(JSON.parse(hoje.guardar)).toEqual({ dia: '2026-09-26', codigos: ['1000'] });
  });

  it('guardado estragado não impede a contagem', () => {
    expect(registrarNoAparelho('{isto não é json', '1000', '2026-09-25').contar).toBe(true);
    expect(registrarNoAparelho('{"dia":"2026-09-25","codigos":"1000"}', '1000', '2026-09-25').contar).toBe(true);
  });
});

describe('pareceRobo', () => {
  it('reconhece os robôs que executam a página', () => {
    expect(pareceRobo('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)')).toBe(true);
    expect(pareceRobo('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 HeadlessChrome/120.0')).toBe(true);
    expect(pareceRobo('Mozilla/5.0 (Linux; Android 10) Chrome-Lighthouse')).toBe(true);
  });

  it('não confunde gente com robô', () => {
    expect(pareceRobo('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1')).toBe(false);
    expect(pareceRobo('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0 Safari/537.36')).toBe(false);
  });
});

describe('diaDoAparelho', () => {
  it('escreve o dia como o banco', () => {
    expect(diaDoAparelho(new Date(2026, 8, 5, 23, 59))).toBe('2026-09-05');
  });
});
