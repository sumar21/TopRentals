// Globally selected building for the technician session (foundation — no view wired yet,
// see EdificioPicker/BuildingChip). Mirrors ThemeContext/AuthContext's Provider+hook shape.
// Must be mounted INSIDE AuthProvider (needs useAuth() for the edificio_id seed) and is
// scoped to /tecnico only — the back-office never mounts it (see App.tsx).
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from '../services/index.ts';
import { useAuth } from './AuthContext';
import type { Edificio } from '../services/types.ts';

const STORAGE_KEY = 'toprentals:edificio';

export interface BuildingContextValue {
  /** Active buildings only, loaded once. */
  edificios: Edificio[];
  /** The globally selected building for this session. */
  selected: Edificio | null;
  /** Sets the selection and persists it (sessionStorage). */
  setSelected: (e: Edificio) => void;
  /** True while `edificios` is loading. */
  loading: boolean;
  pickerOpen: boolean;
  openPicker: () => void;
  closePicker: () => void;
}

const BuildingContext = createContext<BuildingContextValue | null>(null);

export function BuildingProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [edificios, setEdificios] = useState<Edificio[]>([]);
  const [selected, setSelectedState] = useState<Edificio | null>(null);
  const [loading, setLoading] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.edificios.list()
      .then((rows) => {
        if (cancelled) return;
        const activos = rows.filter((e) => e.status === 'Activo');
        setEdificios(activos);

        const storedRaw = sessionStorage.getItem(STORAGE_KEY);
        const stored = storedRaw != null ? activos.find((e) => e.id === Number(storedRaw)) ?? null : null;
        const seeded = activos.find((e) => e.id === user?.edificio_id) ?? null;
        // Único edificio activo → se autoselecciona (nunca hace falta el picker).
        const initial = stored ?? seeded ?? (activos.length === 1 ? activos[0] : null);

        if (initial) sessionStorage.setItem(STORAGE_KEY, String(initial.id));
        setSelectedState(initial);
        // Primera entrada sin selección resuelta y con más de un edificio → forzar el picker.
        if (!initial && activos.length > 1) setPickerOpen(true);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [user]);

  const setSelected = useCallback((e: Edificio) => {
    setSelectedState(e);
    sessionStorage.setItem(STORAGE_KEY, String(e.id));
  }, []);

  const openPicker = useCallback(() => setPickerOpen(true), []);
  const closePicker = useCallback(() => setPickerOpen(false), []);

  return (
    <BuildingContext.Provider value={{ edificios, selected, setSelected, loading, pickerOpen, openPicker, closePicker }}>
      {children}
    </BuildingContext.Provider>
  );
}

export function useBuilding(): BuildingContextValue {
  const ctx = useContext(BuildingContext);
  if (!ctx) throw new Error('useBuilding debe usarse dentro de <BuildingProvider>');
  return ctx;
}
