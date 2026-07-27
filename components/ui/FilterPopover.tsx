import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { SlidersHorizontal, ChevronDown, ChevronUp } from 'lucide-react';

// Toolbar filter control (DESIGN.md §4.7, Patrón A / §3.17): a "Filtros" button whose
// panel drops down ANCHORED to the button (portaled, not a full-width bar and not a
// centered modal). Its children are the per-dimension filter controls (CategoryMultiSelect).
//
// Nested-portal note: the children open their own portaled dropdowns. Those panels carry
// `data-filter-portal`, and this popover's outside-click handler treats a click inside any
// `[data-filter-portal]` as "inside" — otherwise selecting an option would close this popover.
export const FilterPopover: React.FC<{
  activeCount: number;
  onClear?: () => void;
  clearLabel?: string;
  label?: string;
  children: React.ReactNode;
  className?: string;
}> = ({ activeCount, onClear, clearLabel = 'Limpiar todo', label = 'Filtros', children, className }) => {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const place = () => {
      if (!btnRef.current) return;
      const r = btnRef.current.getBoundingClientRect();
      const width = Math.max(r.width, 260);
      let left = r.left;
      if (left + width > window.innerWidth - 8) left = Math.max(8, r.right - width); // right-align si desborda
      setRect({ top: r.bottom + 6, left, width });
    };
    place();
    const onDown = (e: MouseEvent) => {
      const n = e.target as Element;
      if (btnRef.current?.contains(n) || panelRef.current?.contains(n)) return;
      if (n.closest?.('[data-filter-portal]')) return; // click en un dropdown hijo portaled
      setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex shrink-0 items-center gap-2 rounded-lg border px-3 h-9 text-sm font-medium transition-colors ${open || activeCount > 0 ? 'border-brand/30 bg-brand/[0.06] text-brand' : 'bg-background text-muted-foreground hover:text-foreground'} ${className || ''}`}
      >
        <SlidersHorizontal className="h-3.5 w-3.5" /> <span className="hidden sm:inline">{label}</span>
        {activeCount > 0 && <span className="rounded-full bg-brand px-1.5 py-0.5 text-[10px] font-bold text-white">{activeCount}</span>}
        {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>
      {open && rect && createPortal(
        <div
          ref={panelRef}
          data-filter-portal
          style={{ position: 'fixed', top: rect.top, left: rect.left, width: rect.width }}
          className="bg-popover border rounded-lg shadow-lg z-[90] animate-in fade-in zoom-in-95 duration-100 p-3"
        >
          <div className="flex flex-col gap-2">{children}</div>
          {activeCount > 0 && onClear && (
            <button onClick={onClear} className="mt-2 w-full border-t pt-2 text-xs text-muted-foreground hover:text-foreground text-left">
              {clearLabel}
            </button>
          )}
        </div>,
        document.body,
      )}
    </>
  );
};

export default FilterPopover;
