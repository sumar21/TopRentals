import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ListFilter, Check } from 'lucide-react';

export const CategoryMultiSelect: React.FC<{
  categories: string[]; selected: string[]; onChange: (next: string[]) => void;
  label: string; clearLabel: string; className?: string;
}> = ({ categories, selected, onChange, label, clearLabel, className }) => {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const n = e.target as Node;
      if (btnRef.current?.contains(n) || panelRef.current?.contains(n)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const toggleOpen = () => {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      const width = Math.max(r.width, 220);
      let left = r.left;
      if (left + width > window.innerWidth - 8) left = Math.max(8, r.right - width); // right-align si desborda
      setRect({ top: r.bottom + 4, left, width });
    }
    setOpen(o => !o);
  };
  const toggle = (cat: string) => onChange(selected.includes(cat) ? selected.filter(c => c !== cat) : [...selected, cat]);
  const count = selected.length;

  return (
    <>
      <button ref={btnRef} onClick={toggleOpen}
        className={`relative flex items-center gap-2 h-9 px-3 rounded-md border text-sm transition-colors shrink-0 ${count > 0 ? 'border-primary text-primary bg-primary/5 ring-1 ring-primary/30' : 'border-input bg-background text-foreground hover:bg-accent'} ${className || ''}`}>
        <ListFilter className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{label}</span>
        <ChevronDown className="h-3.5 w-3.5 opacity-60 ml-auto shrink-0" />
        {count > 0 && <span className="absolute -top-1.5 -right-1.5 h-4 min-w-[1rem] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">{count}</span>}
      </button>
      {open && rect && createPortal(
        <div ref={panelRef} style={{ position: 'fixed', top: rect.top, left: rect.left, width: rect.width }}
          className="bg-popover border rounded-md shadow-md z-[90] animate-in fade-in zoom-in-95 duration-100 overflow-hidden">
          <div className="max-h-[260px] overflow-y-auto py-1">
            {categories.length === 0 ? <div className="px-3 py-2 text-xs text-muted-foreground text-center">—</div>
              : categories.map(cat => {
                const sel = selected.includes(cat);
                return (
                  <button key={cat} onClick={() => toggle(cat)}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-accent flex items-center gap-2.5 ${sel ? 'font-medium' : ''}`}>
                    <span className={`h-4 w-4 rounded border flex items-center justify-center shrink-0 transition-colors ${sel ? 'bg-primary border-primary text-primary-foreground' : 'border-input bg-background'}`}>
                      {sel && <Check className="h-3 w-3" />}
                    </span>
                    <span className="truncate flex-1">{cat}</span>
                  </button>
                );
              })}
          </div>
          {count > 0 && <button onClick={() => onChange([])} className="w-full border-t px-3 py-2 text-xs text-muted-foreground hover:bg-accent text-left">{clearLabel}</button>}
        </div>, document.body)}
    </>
  );
};
export default CategoryMultiSelect;
