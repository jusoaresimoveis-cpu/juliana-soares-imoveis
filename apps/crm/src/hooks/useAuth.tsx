import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { AppRole } from '@contracts';

export type { AppRole };

export interface Profile {
  id: string;
  organization_id: string;
  full_name: string;
  email: string | null;
  avatar_url: string | null;
  creci: string | null;
  title: string | null;
  /** Paleta escolhida pela pessoa. Acompanha o perfil, não o aparelho. */
  theme_color: string;
}

interface AuthState {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  roles: AppRole[];
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  isAdminOrAbove: () => boolean;
  /**
   * Admin PURO — sem o gerente junto.
   *
   * `isAdminOrAbove` responde por dois cargos, e por 103 migrações isso bastou:
   * gerente distribui lead, cobra corretor, fecha o mês. Decidir onde a verba
   * de anúncio entra e de onde ela sai é outra coisa, e é do dono.
   *
   * Espelha `public.e_admin()` no banco (migração 104), que é quem de fato
   * fecha a porta. Esta função aqui só evita mostrar à pessoa uma tela que o
   * servidor vai recusar.
   */
  isAdmin: () => boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    async function hydrate(uid: string) {
      // Duas consultas em paralelo. O CRM de referência encadeia três
      // sequenciais e paga o custo em toda montagem.
      const [profileRes, rolesRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, organization_id, full_name, email, avatar_url, creci, title, theme_color')
          .eq('id', uid)
          .maybeSingle(),
        supabase.from('user_roles').select('role').eq('user_id', uid),
      ]);

      if (!alive) return;
      setProfile((profileRes.data as Profile | null) ?? null);
      setRoles(((rolesRes.data ?? []) as { role: AppRole }[]).map((r) => r.role));
    }

    // Registrar o listener ANTES do getSession, senão o evento inicial escapa.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (next?.user) {
        // Fora do callback: o cliente do Supabase não gosta de await aqui.
        setTimeout(() => void hydrate(next.user.id), 0);
      } else {
        setProfile(null);
        setRoles([]);
      }
    });

    void supabase.auth.getSession().then(async ({ data }) => {
      if (!alive) return;
      setSession(data.session);
      if (data.session?.user) await hydrate(data.session.user.id);
      if (alive) setLoading(false);
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const value: AuthState = {
    user: session?.user ?? null,
    session,
    profile,
    roles,
    loading,
    async signIn(email, password) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (!error) return { error: null };
      return {
        error:
          error.message === 'Invalid login credentials'
            ? 'E-mail ou senha incorretos.'
            : error.message,
      };
    },
    async signOut() {
      await supabase.auth.signOut();
    },
    isAdminOrAbove() {
      return roles.includes('admin') || roles.includes('gerente');
    },
    isAdmin() {
      return roles.includes('admin');
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth precisa estar dentro de <AuthProvider>');
  return ctx;
}
