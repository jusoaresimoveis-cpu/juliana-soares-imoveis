import { describe, expect, it } from 'vitest';
import { APP_ROLES, atendeLead, papelPrincipal } from './index';
import { valoresDoEnum } from '../../../supabase/testes/esquema';

describe('papéis', () => {
  it('APP_ROLES bate com o enum do banco', () => {
    expect([...valoresDoEnum('app_role')].sort()).toEqual([...APP_ROLES].sort());
  });

  it('o admin não atende lead', () => {
    // Sem isto ele aparece no seletor de corretor da agenda, e dá para marcar
    // visita no nome de quem cuida de anúncio e de código.
    expect(atendeLead('admin')).toBe(false);
    expect(atendeLead('gerente')).toBe(true);
    expect(atendeLead('corretor')).toBe(true);
  });

  it('o papel principal é o mais alto da lista', () => {
    expect(papelPrincipal(['corretor', 'admin'])).toBe('admin');
    expect(papelPrincipal(['corretor', 'gerente'])).toBe('gerente');
    expect(papelPrincipal(['xpto'])).toBeNull();
  });
});
