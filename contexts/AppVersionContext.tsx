// "New version available" prompt. Production builds only, and only with a signed-in user.
//
// public.app_releases (supabase/migrations/0015_app_releases.sql) holds one row per PRODUCTION release, written by
// the deploy webhook. This provider reads the latest row and asks for a reload when it is NEWER than this bundle's
// APP_VERSION (isNewerAppVersion, not plain inequality: a tab already on a build newer than the table row must not
// loop on reload). It checks on mount, every 5 minutes, when the tab becomes visible, and on a realtime insert.
// A failed check never prompts (it is only logged).
//
// Preview / local builds: `__VERCEL_ENV__` (vite.config.ts) is not 'production', so the whole thing is a no-op.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { APP_VERSION } from '../config/appVersion';
import { api } from '../services/index.ts';
import { isNewerAppVersion } from '../utils/appVersion.ts';
import { useAuth } from './AuthContext';

export const VERSION_CHECK_INTERVAL_MS = 5 * 60_000;
/** "Más tarde": how long the prompt stays hidden before it may show again. */
export const POSTPONE_MS = 30 * 60_000;

interface AppVersionState {
  /** A newer production build is available and the prompt is not postponed. */
  promptOpen: boolean;
  /** The newer version (null when there is none). */
  newVersion: string | null;
  /** Hide the prompt for POSTPONE_MS. */
  postpone: () => void;
  /** Reload the tab, which loads the deployed bundle. */
  reload: () => void;
}

const reload = () => window.location.reload();

// Outside the provider: no prompt.
const AppVersionContext = createContext<AppVersionState>({ promptOpen: false, newVersion: null, postpone: () => {}, reload });

export function AppVersionProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const enabled = __VERCEL_ENV__ === 'production' && !!user;
  const [newVersion, setNewVersion] = useState<string | null>(null);
  const [postponed, setPostponed] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const check = () => {
      api.appReleases.latest().then(
        (latest) => { if (alive) setNewVersion(isNewerAppVersion(latest, APP_VERSION) ? latest : null); },
        (err) => console.warn('[app-version] check failed:', err),
      );
    };
    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    check();
    const every = setInterval(check, VERSION_CHECK_INTERVAL_MS);
    document.addEventListener('visibilitychange', onVisible);
    const unsubscribe = api.realtime.subscribe(['appReleases'], check);
    return () => {
      alive = false;
      clearInterval(every);
      document.removeEventListener('visibilitychange', onVisible);
      unsubscribe();
    };
  }, [enabled]);

  // While postponed, the timer re-arms the prompt (it shows again only if a newer version is still there).
  useEffect(() => {
    if (!postponed) return;
    const t = setTimeout(() => setPostponed(false), POSTPONE_MS);
    return () => clearTimeout(t);
  }, [postponed]);

  const postpone = useCallback(() => setPostponed(true), []);
  const value = useMemo<AppVersionState>(
    () => ({ promptOpen: enabled && newVersion !== null && !postponed, newVersion, postpone, reload }),
    [enabled, newVersion, postponed, postpone],
  );
  return <AppVersionContext.Provider value={value}>{children}</AppVersionContext.Provider>;
}

export const useAppVersion = (): AppVersionState => useContext(AppVersionContext);
