// Tema claro/oscuro de la app. La clase `dark` en <html> (index.css define la paleta) la aplica el
// anti-flash de index.html antes del paint y este provider la mantiene en sync con la elección del
// usuario (persistida en localStorage). Ver DESIGN.md §1.4 (dark mode via .dark + classList.toggle).
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

export type Theme = 'light' | 'dark';
const STORAGE_KEY = 'toprentals-theme';

function initialTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'dark' || stored === 'light') return stored;
  } catch {
    /* localStorage no disponible (SSR/privado) → default claro */
  }
  return 'light';
}

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (t: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const [theme, setThemeState] = useState<Theme>(initialTheme);

  useEffect(() => {
    const root = document.documentElement;
    // Matar transiciones mientras aplicamos el tema → swap instantáneo (ver index.css .theme-switching).
    root.classList.add('theme-switching');
    root.classList.toggle('dark', theme === 'dark');
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* persistencia best-effort */
    }
    // Re-habilitar transiciones recién después de pintar el frame con el tema ya cambiado.
    const raf = requestAnimationFrame(() =>
      requestAnimationFrame(() => root.classList.remove('theme-switching')),
    );
    return () => cancelAnimationFrame(raf);
  }, [theme]);

  const setTheme = useCallback((t: Theme) => setThemeState(t), []);
  const toggleTheme = useCallback(() => setThemeState((t) => (t === 'dark' ? 'light' : 'dark')), []);

  return <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>{children}</ThemeContext.Provider>;
};

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme debe usarse dentro de <ThemeProvider>');
  return ctx;
}
