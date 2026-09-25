/**
 * Papéis.
 *
 * O enum `app_role` nasceu na migration 001 e até agora não governava nada: o
 * `useAuth` comparava com string solta (`roles.includes('admin')`) e o RLS
 * liberava tudo por organização. Renomear um papel no banco deixaria o
 * TypeScript compilando e a permissão silenciosamente errada.
 *
 * Com as notificações eles passam a decidir quem recebe o quê, então entram no
 * dicionário e o teste de contrato compara com o enum do banco.
 */

export const APP_ROLES = ['admin', 'gerente', 'corretor'] as const;

export type AppRole = (typeof APP_ROLES)[number];

export const ROLE_LABEL: Record<AppRole, string> = {
  admin: 'Administrador',
  gerente: 'Corretor gerente',
  corretor: 'Corretor',
};

export const ROLE_DESCRIPTION: Record<AppRole, string> = {
  admin: 'Cuida do sistema, dos anúncios e das integrações. Não atende lead.',
  gerente: 'Dono da imobiliária. Vê a operação inteira e também atende lead.',
  corretor: 'Atende a própria carteira.',
};

/**
 * Hierarquia, para comparação — não para permissão direta.
 *
 * Quem pode o quê mora nas funções do banco (`is_admin_or_above`), porque
 * permissão decidida na tela é permissão que a API não tem.
 */
export const ROLE_RANK: Record<AppRole, number> = {
  admin: 3,
  gerente: 2,
  corretor: 1,
};

/**
 * Quem atende lead e pode ser dono de visita.
 *
 * O admin fica de fora de propósito: ele cuida de desenvolvimento e de mídia.
 * Sem esta lista ele aparece no seletor de corretor da agenda, e dá para marcar
 * visita no nome de quem nunca vai abrir a porta do imóvel.
 */
export const ROLES_QUE_ATENDEM: readonly AppRole[] = ['gerente', 'corretor'];

export function isAppRole(v: string): v is AppRole {
  return (APP_ROLES as readonly string[]).includes(v);
}

export function atendeLead(role: string): boolean {
  return (ROLES_QUE_ATENDEM as readonly string[]).includes(role);
}

/** O papel mais alto de uma lista. Usuário pode ter mais de um. */
export function papelPrincipal(roles: readonly string[]): AppRole | null {
  let melhor: AppRole | null = null;
  for (const r of roles) {
    if (!isAppRole(r)) continue;
    if (!melhor || ROLE_RANK[r] > ROLE_RANK[melhor]) melhor = r;
  }
  return melhor;
}
