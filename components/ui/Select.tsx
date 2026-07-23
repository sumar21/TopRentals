import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from './UIComponents';

interface SelectOption { value: string; label: string; }
interface SelectProps {
  value: string; onChange: (value: string) => void; options: SelectOption[];
  placeholder?: string; className?: string; disabled?: boolean;
}

export const Select: React.FC<SelectProps> = ({ value, onChange, options, placeholder = 'Seleccionar…', className, disabled = false }) => {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0 });

  const getCoords = useCallback(() => {
    if (!triggerRef.current) return { top: 0, left: 0, width: 0 };
    const rect = triggerRef.current.getBoundingClientRect();
    const dropdownHeight = Math.min(options.length * 36 + 8, 240);
    let top = rect.bottom + window.scrollY + 4;
    if (rect.bottom + dropdownHeight > window.innerHeight && rect.top - dropdownHeight > 0) {
      top = rect.top + window.scrollY - dropdownHeight - 4;
    }
    return { top, left: rect.left + window.scrollX, width: rect.width };
  }, [options.length]);

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

  const selectedLabel = options.find(o => o.value === value)?.label;

  const dropdown = open ? createPortal(
    <div ref={popupRef} style={{ position: 'absolute', top: coords.top, left: coords.left, width: coords.width }}
      className="z-[90] bg-popover text-popover-foreground border rounded-md shadow-md overflow-hidden" onClick={e => e.stopPropagation()}>
      <div className="p-1 max-h-60 overflow-y-auto">
        {options.map(option => (
          <button key={option.value} type="button" onClick={() => { onChange(option.value); setOpen(false); }}
            className={cn('w-full flex items-center justify-between px-2 py-1.5 text-sm rounded-sm transition-colors cursor-default',
              option.value === value ? 'bg-accent text-accent-foreground font-medium' : 'hover:bg-accent hover:text-accent-foreground')}>
            <span>{option.label}</span>
            {option.value === value && <Check className="h-4 w-4 shrink-0" />}
          </button>
        ))}
      </div>
    </div>, document.body) : null;

  return (
    <div className="relative w-full" ref={containerRef}>
      <button ref={triggerRef} type="button" disabled={disabled}
        onClick={() => { if (!open) { setCoords(getCoords()); setOpen(true); } else setOpen(false); }}
        className={cn('flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
          !value && 'text-muted-foreground', open && 'ring-2 ring-ring ring-offset-2', className)}>
        <span className="truncate">{selectedLabel ?? placeholder}</span>
        <ChevronDown className={cn('h-4 w-4 opacity-50 shrink-0 transition-transform', open && 'rotate-180')} />
      </button>
      {dropdown}
    </div>
  );
};
