// DatePicker — styled calendar popover (es-AR, dd/mm/aaaa), drop-in replacement for
// `<Input type="date">`. Same value contract: ISO 'yyyy-mm-dd' in/out. Portaled to
// document.body like Select/Combobox (DESIGN.md §3.9 pattern) so it escapes modal
// clipping; no date library — native Date only.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from './UIComponents';

export interface DatePickerProps {
  value: string;                          // ISO 'yyyy-mm-dd' (or '')
  onChange: (value: string) => void;      // emits ISO 'yyyy-mm-dd' (or '' when cleared)
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  min?: string;                           // ISO lower bound (inclusive)
  max?: string;                           // ISO upper bound (inclusive)
}

const WEEKDAYS = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'];
const pad = (n: number) => String(n).padStart(2, '0');
const toIso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;

// Parse ISO WITHOUT timezone drift — never `new Date(iso)` (that parses as UTC and can
// shift the day depending on the local offset).
const parseIso = (iso: string): { y: number; m: number; d: number } | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  return match ? { y: Number(match[1]), m: Number(match[2]) - 1, d: Number(match[3]) } : null;
};
const displayDate = (iso: string) => {
  const p = parseIso(iso);
  return p ? `${pad(p.d)}/${pad(p.m + 1)}/${p.y}` : '';
};
const todayIso = () => { const t = new Date(); return toIso(t.getFullYear(), t.getMonth(), t.getDate()); };

const POPUP_W = 268;
const POPUP_H = 336;

export const DatePicker: React.FC<DatePickerProps> = ({ value, onChange, placeholder = 'dd/mm/aaaa', className, disabled = false, min, max }) => {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0 });

  // Which month the grid shows — seeded from the value, else the current month.
  const [view, setView] = useState(() => {
    const p = parseIso(value);
    if (p) return { y: p.y, m: p.m };
    const t = new Date();
    return { y: t.getFullYear(), m: t.getMonth() };
  });

  // Re-centre on the selected date each time it opens.
  useEffect(() => {
    if (!open) return;
    const p = parseIso(value);
    if (p) setView({ y: p.y, m: p.m });
  }, [open, value]);

  const getCoords = useCallback(() => {
    if (!triggerRef.current) return { top: 0, left: 0, width: 0 };
    const rect = triggerRef.current.getBoundingClientRect();
    let top = rect.bottom + window.scrollY + 4;
    if (rect.bottom + POPUP_H > window.innerHeight && rect.top - POPUP_H > 0) top = rect.top + window.scrollY - POPUP_H - 4;
    const width = Math.max(rect.width, POPUP_W);
    let left = rect.left + window.scrollX;
    const overflowRight = left + width - window.scrollX - window.innerWidth + 8;
    if (overflowRight > 0) left -= overflowRight;
    return { top, left: Math.max(window.scrollX + 8, left), width };
  }, []);
  const updatePosition = useCallback(() => setCoords(getCoords()), [getCoords]);

  useEffect(() => {
    if (!open) return;
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    return () => { window.removeEventListener('scroll', updatePosition, true); window.removeEventListener('resize', updatePosition); };
  }, [open, updatePosition]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (containerRef.current && !containerRef.current.contains(t) && popupRef.current && !popupRef.current.contains(t)) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const monthName = new Date(view.y, view.m, 1).toLocaleDateString('es-AR', { month: 'long' });
  // Year jump (birthdates etc. — no more month-by-month): now+5 down to now-100, always incl. the view year.
  const years = useMemo(() => {
    const now = new Date().getFullYear();
    const arr: number[] = [];
    for (let y = Math.max(now + 5, view.y); y >= Math.min(now - 100, view.y); y--) arr.push(y);
    return arr;
  }, [view.y]);
  const cells = useMemo(() => {
    const lead = (new Date(view.y, view.m, 1).getDay() + 6) % 7; // Monday-first
    const days = new Date(view.y, view.m + 1, 0).getDate();
    const arr: (number | null)[] = Array.from({ length: lead }, () => null);
    for (let d = 1; d <= days; d++) arr.push(d);
    while (arr.length % 7 !== 0) arr.push(null);
    return arr;
  }, [view]);

  const today = todayIso();
  const outOfRange = (iso: string) => (!!min && iso < min) || (!!max && iso > max);
  const step = (delta: number) => setView((v) => {
    const m = v.m + delta;
    return { y: v.y + Math.floor(m / 12), m: ((m % 12) + 12) % 12 };
  });
  const pick = (iso: string) => { if (!outOfRange(iso)) { onChange(iso); setOpen(false); } };

  const popup = open ? createPortal(
    <div ref={popupRef} style={{ position: 'absolute', top: coords.top, left: coords.left, width: coords.width }}
      className="z-[95] rounded-md border bg-popover p-3 text-popover-foreground shadow-lg animate-in fade-in zoom-in-95 duration-100"
      onMouseDown={(e) => e.stopPropagation()}>
      <div className="mb-2 flex items-center justify-between gap-1">
        <button type="button" onClick={() => step(-1)} aria-label="Mes anterior" className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"><ChevronLeft className="h-4 w-4" /></button>
        <div className="flex items-center gap-1">
          <span className="text-sm font-medium capitalize">{monthName}</span>
          <select
            value={view.y}
            onChange={(e) => setView((v) => ({ ...v, y: Number(e.target.value) }))}
            onMouseDown={(e) => e.stopPropagation()}
            aria-label="Año"
            className="cursor-pointer rounded-md bg-transparent px-1 py-0.5 text-sm font-medium outline-none transition-colors hover:bg-accent focus:ring-2 focus:ring-ring">
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <button type="button" onClick={() => step(1)} aria-label="Mes siguiente" className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"><ChevronRight className="h-4 w-4" /></button>
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {WEEKDAYS.map((w) => <div key={w} className="flex h-7 items-center justify-center text-[10px] font-semibold uppercase text-muted-foreground">{w}</div>)}
        {cells.map((d, i) => {
          if (d == null) return <div key={i} className="h-9" />;
          const iso = toIso(view.y, view.m, d);
          const selected = iso === value;
          const disabledDay = outOfRange(iso);
          return (
            <button key={i} type="button" disabled={disabledDay} onClick={() => pick(iso)}
              className={cn('flex h-9 items-center justify-center rounded-md text-sm transition-colors',
                selected ? 'bg-primary font-semibold text-primary-foreground' : 'hover:bg-accent hover:text-accent-foreground',
                !selected && iso === today && 'border border-primary/40 font-medium',
                disabledDay && 'pointer-events-none opacity-30')}>
              {d}
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex items-center justify-between border-t pt-2">
        <button type="button" onClick={() => pick(today)} disabled={outOfRange(today)}
          className="text-xs font-medium text-primary hover:underline disabled:opacity-40">Hoy</button>
        {value && <button type="button" onClick={() => { onChange(''); setOpen(false); }} className="text-xs text-muted-foreground transition-colors hover:text-destructive">Limpiar</button>}
      </div>
    </div>, document.body) : null;

  return (
    <div className="relative w-full" ref={containerRef}>
      <button ref={triggerRef} type="button" disabled={disabled}
        onClick={() => { if (!open) { setCoords(getCoords()); setOpen(true); } else setOpen(false); }}
        className={cn('flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
          !value && 'text-muted-foreground', open && 'ring-2 ring-ring ring-offset-2', className)}>
        <span>{value ? displayDate(value) : placeholder}</span>
        <CalendarIcon className="h-4 w-4 shrink-0 opacity-60" />
      </button>
      {popup}
    </div>
  );
};

export default DatePicker;
