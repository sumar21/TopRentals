import React, { useState, useEffect } from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { createPortal } from 'react-dom';
import { Search, ChevronsUpDown, Check, type LucideIcon } from 'lucide-react';

// ────────────────────────────────────────────────────────────────────────────
// §2 Utilidades base (DESIGN.md)
// ────────────────────────────────────────────────────────────────────────────

/** Combina clases Tailwind resolviendo conflictos. Usar en TODO componente. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const MODAL_DURATION = 200;

/**
 * Mantiene un modal montado durante su animación de salida. Devuelve:
 *   visible      → si renderizar el modal (sigue true durante la salida)
 *   overlayClass → 'overlay-enter' | 'overlay-exit'
 *   modalClass   → 'modal-enter'   | 'modal-exit'
 * Emparejar con las reglas CSS de index.css.
 */
export function useModalAnimation(isOpen: boolean) {
  const [visible, setVisible] = useState(isOpen);
  const [closing, setClosing] = useState(false);
  useEffect(() => {
    if (isOpen) { setVisible(true); setClosing(false); }
    else if (visible) {
      setClosing(true);
      const t = setTimeout(() => { setVisible(false); setClosing(false); }, MODAL_DURATION);
      return () => clearTimeout(t);
    }
  }, [isOpen]);
  return {
    visible,
    overlayClass: closing ? 'overlay-exit' : 'overlay-enter',
    modalClass:   closing ? 'modal-exit'   : 'modal-enter',
  };
}

// ────────────────────────────────────────────────────────────────────────────
// §3.1 Card
// ────────────────────────────────────────────────────────────────────────────

export const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("rounded-lg border bg-card text-card-foreground shadow-sm", className)} {...props} />
));
export const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("flex flex-col space-y-1.5 p-6", className)} {...props} />
));
export const CardTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(({ className, ...props }, ref) => (
  <h3 ref={ref} className={cn("text-2xl font-semibold leading-none tracking-tight", className)} {...props} />
));
export const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(({ className, ...props }, ref) => (
  <p ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
));
export const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
));
export const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("flex items-center p-6 pt-0", className)} {...props} />
));

// ────────────────────────────────────────────────────────────────────────────
// §3.2 Button
// ────────────────────────────────────────────────────────────────────────────

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
  size?: 'default' | 'sm' | 'lg' | 'icon';
}
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant = "default", size = "default", ...props }, ref) => {
  const variants = {
    default: "bg-primary text-primary-foreground hover:bg-primary/90",
    destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
    outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
    secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
    ghost: "hover:bg-accent hover:text-accent-foreground",
    link: "text-primary underline-offset-4 hover:underline",
  };
  const sizes = { default: "h-10 px-4 py-2", sm: "h-9 rounded-md px-3", lg: "h-11 rounded-md px-8", icon: "h-10 w-10" };
  return (
    <button ref={ref}
      className={cn("inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
        variants[variant], sizes[size], className)}
      {...props} />
  );
});

// ────────────────────────────────────────────────────────────────────────────
// §3.3 Input
// ────────────────────────────────────────────────────────────────────────────

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, type, ...props }, ref) => (
  <input type={type} ref={ref}
    className={cn("flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50", className)}
    {...props} />
));

// ────────────────────────────────────────────────────────────────────────────
// §3.4 Badge
// ────────────────────────────────────────────────────────────────────────────

export const Badge = ({ className, variant = "default", ...props }: React.HTMLAttributes<HTMLDivElement> & { variant?: "default" | "secondary" | "destructive" | "outline" | "success" }) => {
  const variants = {
    default: "border-transparent bg-primary text-primary-foreground hover:bg-primary/80",
    secondary: "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
    destructive: "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
    outline: "text-foreground",
    success: "border-transparent bg-emerald-100 text-emerald-800 hover:bg-emerald-200",
  };
  return <div className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2", variants[variant], className)} {...props} />;
};

// ────────────────────────────────────────────────────────────────────────────
// §3.5 Table
// ────────────────────────────────────────────────────────────────────────────

export const Table = React.forwardRef<HTMLTableElement, React.HTMLAttributes<HTMLTableElement>>(({ className, ...props }, ref) => (
  <div className="relative w-full overflow-auto"><table ref={ref} className={cn("w-full caption-bottom text-[13px]", className)} {...props} /></div>
));
export const TableHeader = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(({ className, ...props }, ref) => (
  <thead ref={ref} className={cn("[&_tr]:border-b", className)} {...props} />
));
export const TableBody = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(({ className, ...props }, ref) => (
  <tbody ref={ref} className={cn("[&_tr:last-child]:border-0", className)} {...props} />
));
export const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(({ className, ...props }, ref) => (
  <tr ref={ref} className={cn("border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted", className)} {...props} />
));
export const TableHead = React.forwardRef<HTMLTableCellElement, React.ThHTMLAttributes<HTMLTableCellElement>>(({ className, ...props }, ref) => (
  <th ref={ref} className={cn("h-12 px-4 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0", className)} {...props} />
));
export const TableCell = React.forwardRef<HTMLTableCellElement, React.TdHTMLAttributes<HTMLTableCellElement>>(({ className, ...props }, ref) => (
  <td ref={ref} className={cn("p-4 align-middle [&:has([role=checkbox])]:pr-0", className)} {...props} />
));

// ────────────────────────────────────────────────────────────────────────────
// §3.6 Avatar
// ────────────────────────────────────────────────────────────────────────────

export const Avatar = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full", className)} {...props} />
));
export const AvatarFallback = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("flex h-full w-full items-center justify-center rounded-full bg-muted", className)} {...props} />
));
// Uso: <Avatar><AvatarFallback className="bg-brand/10 text-brand">{inicial}</AvatarFallback></Avatar>

// ────────────────────────────────────────────────────────────────────────────
// §3.7 Tabs (implementación con Context, sin Radix)
// ────────────────────────────────────────────────────────────────────────────

const TabsContext = React.createContext<{ activeTab: string; setActiveTab: (v: string) => void } | null>(null);

export const Tabs = ({ className, children, defaultValue, value, onValueChange }: any) => {
  const [internalTab, setInternalTab] = React.useState(defaultValue);
  const activeTab = value !== undefined ? value : internalTab;
  const handleTabChange = (v: string) => { if (value === undefined) setInternalTab(v); onValueChange?.(v); };
  return <TabsContext.Provider value={{ activeTab, setActiveTab: handleTabChange }}><div className={cn("", className)}>{children}</div></TabsContext.Provider>;
};
export const TabsList = ({ className, children }: any) => (
  <div className={cn("inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground", className)}>{children}</div>
);
export const TabsTrigger = ({ className, value, children }: any) => {
  const ctx = React.useContext(TabsContext); if (!ctx) return null;
  return (
    <button data-state={ctx.activeTab === value ? "active" : "inactive"} onClick={() => ctx.setActiveTab(value)}
      className={cn("inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
        ctx.activeTab === value ? "bg-background text-foreground shadow-sm" : "hover:bg-background/50 hover:text-foreground", className)}>
      {children}
    </button>
  );
};
export const TabsContent = ({ className, value, children }: any) => {
  const ctx = React.useContext(TabsContext); if (!ctx || value !== ctx.activeTab) return null;
  return <div className={cn("mt-2 ring-offset-background animate-in fade-in slide-in-from-bottom-2", className)}>{children}</div>;
};

// ────────────────────────────────────────────────────────────────────────────
// §3.8 StatCard
// ────────────────────────────────────────────────────────────────────────────

export const StatCard: React.FC<{ title: string; value: string; icon: LucideIcon; subtext?: string; trend?: 'up' | 'down' }> = ({ title, value, icon: Icon, subtext, trend }) => (
  <Card>
    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
      <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      <Icon className="h-4 w-4 text-muted-foreground" />
    </CardHeader>
    <CardContent>
      <div className="text-2xl font-bold">{value}</div>
      {subtext && <p className={cn("text-xs mt-1", trend === 'up' ? 'text-emerald-600' : trend === 'down' ? 'text-red-500' : 'text-muted-foreground')}>{subtext}</p>}
    </CardContent>
  </Card>
);

// ────────────────────────────────────────────────────────────────────────────
// §3.16 Combobox / MultiCombobox
// ────────────────────────────────────────────────────────────────────────────

export interface ComboboxOption { label: string; value: string; icon?: React.ReactNode; }
export interface ComboboxProps {
  options: ComboboxOption[]; value: string; onChange: (value: string) => void;
  placeholder?: string; searchPlaceholder?: string; icon?: React.ReactNode;
  className?: string; disabled?: boolean; emptyText?: string;
}

export const Combobox: React.FC<ComboboxProps> = ({ options, value, onChange, placeholder = "Seleccionar…", searchPlaceholder = "Buscar…", icon, className, disabled, emptyText = "Sin resultados" }) => {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const containerRef = React.useRef<HTMLDivElement>(null);
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const popupRef = React.useRef<HTMLDivElement>(null);
  const [coords, setCoords] = React.useState<{ top: number; left: number; width: number } | null>(null);

  const updatePosition = React.useCallback(() => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setCoords({ top: rect.bottom + window.scrollY + 4, left: rect.left + window.scrollX, width: rect.width });
    }
  }, []);
  React.useEffect(() => {
    if (open) { updatePosition(); window.addEventListener('scroll', updatePosition, true); window.addEventListener('resize', updatePosition); }
    return () => { window.removeEventListener('scroll', updatePosition, true); window.removeEventListener('resize', updatePosition); };
  }, [open, updatePosition]);
  React.useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (containerRef.current && !containerRef.current.contains(t) && popupRef.current && !popupRef.current.contains(t)) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const selectedOption = options.find(o => o.value === value);
  const filtered = options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()));

  const dropdown = open && coords ? createPortal(
    <div ref={popupRef} style={{ position: 'absolute', top: coords.top, left: coords.left, width: coords.width }}
      className="z-[90] bg-popover text-popover-foreground border rounded-md shadow-lg overflow-hidden">
      <div className="p-2 border-b bg-muted/20">
        <div className="flex items-center px-2 py-1.5 bg-background rounded border group focus-within:ring-1 focus-within:ring-primary/40 focus-within:border-primary/50 transition-all">
          <Search className="h-3.5 w-3.5 text-muted-foreground mr-2 shrink-0 group-focus-within:text-primary transition-colors" />
          <input autoFocus className="bg-transparent border-none text-xs w-full outline-none focus:outline-none placeholder:text-muted-foreground" placeholder={searchPlaceholder} value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>
      <div className="max-h-[200px] overflow-y-auto p-1 bg-popover">
        {filtered.length === 0 ? <div className="px-2 py-3 text-xs text-muted-foreground text-center">{emptyText}</div>
          : filtered.map(opt => (
            <button key={opt.value} type="button" onClick={e => { e.stopPropagation(); onChange(opt.value); setOpen(false); setSearch(''); }}
              className={cn("w-full text-left px-2 py-1.5 text-xs rounded-sm hover:bg-accent hover:text-accent-foreground flex items-center justify-between outline-none transition-colors", value === opt.value && "bg-accent/60 text-accent-foreground font-medium")}>
              <div className="flex items-center gap-2 truncate pr-2">{opt.icon && <span className="shrink-0">{opt.icon}</span>}<span className="truncate">{opt.label}</span></div>
              {value === opt.value && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
            </button>
          ))}
      </div>
    </div>, document.body) : null;

  return (
    <div className={cn("relative", className)} ref={containerRef}>
      <button ref={buttonRef} type="button" disabled={disabled} onClick={() => setOpen(!open)}
        className={cn("w-full flex items-center justify-between border bg-background px-3 h-10 text-sm rounded-md focus:outline-none focus:ring-2 focus:ring-primary/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
          open ? "border-primary/50 ring-2 ring-primary/20" : "border-input hover:border-primary/50")}>
        <div className="flex items-center gap-2 overflow-hidden w-[calc(100%-20px)]">
          {icon && <span className="text-muted-foreground shrink-0">{icon}</span>}
          {selectedOption?.icon && !icon && <span className="text-muted-foreground shrink-0">{selectedOption.icon}</span>}
          <span className="truncate">{selectedOption ? selectedOption.label : placeholder}</span>
        </div>
        <ChevronsUpDown className="w-3.5 h-3.5 text-muted-foreground shrink-0 opacity-50" />
      </button>
      {dropdown}
    </div>
  );
};

/**
 * ponytail: DESIGN.md §3.16 no incluye un bloque de código literal para
 * MultiCombobox — solo el diff en prosa contra Combobox ("mismo esqueleto…
 * checkbox cuadrado… trigger 'N selected'… botón Clear all al pie"). El doc
 * SÍ lo lista como parte de UIComponents.tsx (índice §0.5) y FilterBar (§4.7)
 * lo importa de acá, así que se derivó siguiendo ese diff al pie de la letra
 * en vez de omitirlo. Si aparece código literal en una versión futura del
 * doc, reemplazar este bloque por el literal tal cual.
 */
export interface MultiComboboxProps {
  options: ComboboxOption[]; value: string[]; onChange: (value: string[]) => void;
  placeholder?: string; searchPlaceholder?: string; icon?: React.ReactNode;
  className?: string; disabled?: boolean; emptyText?: string;
}

export const MultiCombobox: React.FC<MultiComboboxProps> = ({ options, value, onChange, placeholder = "Seleccionar…", searchPlaceholder = "Buscar…", icon, className, disabled, emptyText = "Sin resultados" }) => {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const containerRef = React.useRef<HTMLDivElement>(null);
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const popupRef = React.useRef<HTMLDivElement>(null);
  const [coords, setCoords] = React.useState<{ top: number; left: number; width: number } | null>(null);

  const updatePosition = React.useCallback(() => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setCoords({ top: rect.bottom + window.scrollY + 4, left: rect.left + window.scrollX, width: rect.width });
    }
  }, []);
  React.useEffect(() => {
    if (open) { updatePosition(); window.addEventListener('scroll', updatePosition, true); window.addEventListener('resize', updatePosition); }
    return () => { window.removeEventListener('scroll', updatePosition, true); window.removeEventListener('resize', updatePosition); };
  }, [open, updatePosition]);
  React.useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (containerRef.current && !containerRef.current.contains(t) && popupRef.current && !popupRef.current.contains(t)) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const filtered = options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()));
  const toggleValue = (v: string) => onChange(value.includes(v) ? value.filter(x => x !== v) : [...value, v]);
  const triggerLabel = value.length === 0 ? placeholder : value.length === 1 ? (options.find(o => o.value === value[0])?.label ?? placeholder) : `${value.length} seleccionados`;

  const dropdown = open && coords ? createPortal(
    <div ref={popupRef} style={{ position: 'absolute', top: coords.top, left: coords.left, width: coords.width }}
      className="z-[90] bg-popover text-popover-foreground border rounded-md shadow-lg overflow-hidden">
      <div className="p-2 border-b bg-muted/20">
        <div className="flex items-center px-2 py-1.5 bg-background rounded border group focus-within:ring-1 focus-within:ring-primary/40 focus-within:border-primary/50 transition-all">
          <Search className="h-3.5 w-3.5 text-muted-foreground mr-2 shrink-0 group-focus-within:text-primary transition-colors" />
          <input autoFocus className="bg-transparent border-none text-xs w-full outline-none focus:outline-none placeholder:text-muted-foreground" placeholder={searchPlaceholder} value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>
      <div className="max-h-[200px] overflow-y-auto p-1 bg-popover">
        {filtered.length === 0 ? <div className="px-2 py-3 text-xs text-muted-foreground text-center">{emptyText}</div>
          : filtered.map(opt => {
            const checked = value.includes(opt.value);
            return (
              <button key={opt.value} type="button" onClick={e => { e.stopPropagation(); toggleValue(opt.value); }}
                className={cn("w-full text-left px-2 py-1.5 text-xs rounded-sm hover:bg-accent hover:text-accent-foreground flex items-center gap-2 outline-none transition-colors", checked && "bg-accent/60 text-accent-foreground font-medium")}>
                <span className={cn("h-4 w-4 rounded border flex items-center justify-center shrink-0 transition-colors", checked ? "bg-primary border-primary" : "border-input bg-background")}>
                  {checked && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
                </span>
                <div className="flex items-center gap-2 truncate">{opt.icon && <span className="shrink-0">{opt.icon}</span>}<span className="truncate">{opt.label}</span></div>
              </button>
            );
          })}
      </div>
      {value.length > 0 && (
        <button type="button" onClick={() => onChange([])} className="w-full border-t px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent text-left">Limpiar</button>
      )}
    </div>, document.body) : null;

  return (
    <div className={cn("relative", className)} ref={containerRef}>
      <button ref={buttonRef} type="button" disabled={disabled} onClick={() => setOpen(!open)}
        className={cn("w-full flex items-center justify-between border bg-background px-3 h-10 text-sm rounded-md focus:outline-none focus:ring-2 focus:ring-primary/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
          open ? "border-primary/50 ring-2 ring-primary/20" : "border-input hover:border-primary/50")}>
        <div className="flex items-center gap-2 overflow-hidden w-[calc(100%-20px)]">
          {icon && <span className="text-muted-foreground shrink-0">{icon}</span>}
          <span className="truncate">{triggerLabel}</span>
        </div>
        <ChevronsUpDown className="w-3.5 h-3.5 text-muted-foreground shrink-0 opacity-50" />
      </button>
      {dropdown}
    </div>
  );
};
