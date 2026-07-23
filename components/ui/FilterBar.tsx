import React, { createContext, useContext, useMemo, useState } from 'react';
import { MapPin, Building2, Globe2, CalendarRange, X, SlidersHorizontal, ChevronDown, ChevronUp } from 'lucide-react';
import { MultiCombobox } from './UIComponents';

// DESIGN.md §4.7 — el módulo vive ahí como `components/dashboard/filters.tsx`;
// se coloca en `components/ui/FilterBar.tsx` por instrucción de la tarea,
// ajustando únicamente el import de MultiCombobox a la ruta relativa nueva.

// ── Estado ──
export interface DashboardFilters {
  lodges: string[]; enterprises: string[]; countries: string[];
  seasonStart?: string; seasonEnd?: string; seasonLabel?: string;
}
const EMPTY: DashboardFilters = { lodges: [], enterprises: [], countries: [] };

interface FilterCtx { filters: DashboardFilters; setFilters: React.Dispatch<React.SetStateAction<DashboardFilters>>; filterKey: string; activeCount: number; }
const Ctx = createContext<FilterCtx | null>(null);
export const useFilters = (): FilterCtx => {
  const c = useContext(Ctx);
  if (!c) throw new Error('useFilters must be used within FilterProvider');
  return c;
};
export const FilterProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [filters, setFilters] = useState<DashboardFilters>(EMPTY);
  const filterKey = JSON.stringify(filters);   // útil como key/dep para re-fetch cuando cambian filtros
  const activeCount = filters.lodges.length + filters.enterprises.length + filters.countries.length + (filters.seasonStart ? 1 : 0);
  return <Ctx.Provider value={{ filters, setFilters, filterKey, activeCount }}>{children}</Ctx.Provider>;
};

// ── Campo (label con ícono de marca + control) ──
const uniq = (arr: (string | undefined)[]) => [...new Set(arr.map(s => (s || '').trim()).filter(Boolean))].sort();
const Field: React.FC<{ icon: React.ElementType; label: string; className?: string; children: React.ReactNode }> = ({ icon: Icon, label, className, children }) => (
  <div className={className}>
    <label className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
      <Icon className="h-3.5 w-3.5 text-brand" />{label}
    </label>
    {children}
  </div>
);

// ── La barra ── (panel bordeado, NO overlay: rounded-xl border bg-muted/20 p-3)
export const FilterBar: React.FC<{ dateMode?: 'none' | 'season'; lodges: { name: string; Tipo_L: string; Pais: string }[] }> = ({ dateMode = 'none', lodges }) => {
  const { filters, setFilters, activeCount } = useFilters();
  const lodgeOpts   = useMemo(() => uniq(lodges.map(l => l.name)).map(v => ({ label: v, value: v })), [lodges]);
  const entOpts     = useMemo(() => uniq(lodges.map(l => l.Tipo_L)).map(v => ({ label: v, value: v })), [lodges]);
  const countryOpts = useMemo(() => uniq(lodges.map(l => l.Pais)).map(v => ({ label: v, value: v })), [lodges]);
  const set = (patch: Partial<DashboardFilters>) => setFilters(prev => ({ ...prev, ...patch }));
  return (
    <div className="mb-5 rounded-xl border bg-muted/20 p-3">
      <div className="flex flex-wrap items-end gap-3">
        <Field icon={MapPin} label="Lodge" className="w-full sm:w-48">
          <MultiCombobox options={lodgeOpts} value={filters.lodges} onChange={v => set({ lodges: v })} placeholder="Todos" searchPlaceholder="Buscar lodge…" />
        </Field>
        <Field icon={Building2} label="Empresa" className="w-full sm:w-44">
          <MultiCombobox options={entOpts} value={filters.enterprises} onChange={v => set({ enterprises: v })} placeholder="Todas" searchPlaceholder="Buscar empresa…" />
        </Field>
        <Field icon={Globe2} label="País" className="w-full sm:w-40">
          <MultiCombobox options={countryOpts} value={filters.countries} onChange={v => set({ countries: v })} placeholder="Todos" searchPlaceholder="Buscar país…" />
        </Field>
        {dateMode === 'season' && (
          <Field icon={CalendarRange} label="Temporada / Mes" className="w-full sm:w-44">
            {/* SeasonPicker es opcional/dominio-específico (DESIGN.md §4.7, último párrafo) — no está
               incluido en este kit; reemplazar por un DatePicker o dos inputs de rango si se necesita. */}
            <></>
          </Field>
        )}
        {activeCount > 0 && (
          <button onClick={() => setFilters(EMPTY)} className="flex h-10 items-center gap-1 rounded-md px-3 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
            <X className="h-3.5 w-3.5" /> Limpiar
          </button>
        )}
      </div>
    </div>
  );
};

// ── El botón toggle ── (vive a la derecha del header/tab bar)
export const FilterToggle: React.FC<{ open: boolean; onToggle: () => void }> = ({ open, onToggle }) => {
  const { activeCount } = useFilters();
  return (
    <button onClick={onToggle}
      className={`flex shrink-0 items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${open ? 'border-brand/30 bg-brand/[0.06] text-brand' : 'bg-background text-muted-foreground hover:text-foreground'}`}>
      <SlidersHorizontal className="h-4 w-4 text-brand" /> <span className="hidden sm:inline">Filtros</span>
      {activeCount > 0 && <span className="rounded-full bg-brand px-1.5 py-0.5 text-[10px] font-bold text-white">{activeCount}</span>}
      {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
    </button>
  );
};
