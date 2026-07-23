// Session/auth context. Talks only to services/api (never a concrete adapter).
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from '../services/index.ts';
import type { PerfilPermiso, Usuario } from '../services/types.ts';

const SESSION_KEY = 'toprentals:session';

interface AuthState {
  user: Usuario | null;
  permisos: PerfilPermiso[];
  /** True until the sessionStorage restore attempt on mount has settled. */
  loading: boolean;
  login(usuario: string, password: string): Promise<Usuario>;
  logout(): void;
}

const AuthContext = createContext<AuthState | null>(null);

/** Tecnico is mobile-only ("Mantenimiento" app); every other perfil uses the Desktop menu. */
async function loadPermisos(user: Usuario): Promise<PerfilPermiso[]> {
  const aplicacion = user.perfil === 'Tecnico' ? 'Mantenimiento' : 'Desktop';
  const rows = await api.perfilesPermisos.list();
  return rows.filter((row) => row.aplicacion === aplicacion && row.status === 'Activo');
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Usuario | null>(null);
  const [permisos, setPermisos] = useState<PerfilPermiso[]>([]);
  const [loading, setLoading] = useState(true);

  // Restore session on mount: only the user is persisted, permisos are always re-fetched.
  useEffect(() => {
    let cancelled = false;
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) {
      setLoading(false);
      return;
    }
    try {
      const storedUser: Usuario = JSON.parse(raw);
      setUser(storedUser);
      loadPermisos(storedUser)
        .then((rows) => { if (!cancelled) setPermisos(rows); })
        .finally(() => { if (!cancelled) setLoading(false); });
    } catch {
      sessionStorage.removeItem(SESSION_KEY);
      setLoading(false);
    }
    return () => { cancelled = true; };
  }, []);

  const login = useCallback(async (usuario: string, password: string) => {
    const loggedUser = await api.auth.login(usuario, password);
    const rows = await loadPermisos(loggedUser);
    setUser(loggedUser);
    setPermisos(rows);
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(loggedUser));
    return loggedUser;
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    setPermisos([]);
    sessionStorage.removeItem(SESSION_KEY);
  }, []);

  return <AuthContext.Provider value={{ user, permisos, loading, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
