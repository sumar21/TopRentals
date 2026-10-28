import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, RefreshCw } from 'lucide-react';
import { Button } from './ui/UIComponents';
import { useAppVersion } from '../contexts/AppVersionContext';

/** After this long still on the page, "Actualizar ahora" is offered again (a "Leave site?" dialog may have kept the reload). */
export const RELOAD_RETRY_MS = 5_000;

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * "New version available" (contexts/AppVersionContext.tsx). Confirmation-modal recipe of docs/DESIGN.md §4.2.
 * Two ways out: "Actualizar ahora" reloads (spinner until the page goes, offered again after RELOAD_RETRY_MS), and
 * "Más tarde" / Escape postpones it. A backdrop click does nothing. Focus is trapped inside and restored on close.
 */
const NewVersionModal: React.FC = () => {
  const { promptOpen, newVersion, postpone, reload } = useAppVersion();
  const [reloading, setReloading] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const updateNowRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const textId = useId();

  useEffect(() => {
    if (!promptOpen) return;
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    updateNowRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation(); // a modal underneath must not close on it
        postpone();
        return;
      }
      if (e.key !== 'Tab' || !dialogRef.current) return;
      const items = [...dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const at = document.activeElement;
      const inside = at instanceof Node && dialogRef.current.contains(at);
      if (e.shiftKey ? (!inside || at === first) : (!inside || at === last)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      }
    };
    const onFocusIn = (e: FocusEvent) => {
      if (dialogRef.current && e.target instanceof Node && !dialogRef.current.contains(e.target)) updateNowRef.current?.focus();
    };
    window.addEventListener('keydown', onKey, true);
    document.addEventListener('focusin', onFocusIn);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      document.removeEventListener('focusin', onFocusIn);
      if (before?.isConnected) before.focus();
    };
  }, [promptOpen, postpone]);

  useEffect(() => {
    if (!reloading) return;
    const retry = setTimeout(() => setReloading(false), RELOAD_RETRY_MS);
    return () => clearTimeout(retry);
  }, [reloading]);

  if (!promptOpen) return null;

  const updateNow = () => {
    setReloading(true);
    reload();
  };

  return createPortal(
    // Above toasts (z-[99999]) and any modal already open.
    <div className="fixed inset-0 z-[100000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 h-[100dvh] animate-in fade-in duration-200">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={textId}
        className="bg-background w-full max-w-md rounded-xl shadow-2xl border border-border overflow-hidden flex flex-col max-h-[90dvh] animate-in zoom-in-95 duration-200">
        <div className="p-8 flex flex-col items-center text-center overflow-y-auto">
          <div className="h-12 w-12 rounded-full flex items-center justify-center mb-4 bg-brand/10 text-brand">
            <RefreshCw aria-hidden="true" className="h-6 w-6" />
          </div>
          <h3 id={titleId} className="text-lg font-bold text-foreground mb-2">Hay una nueva versión</h3>
          <p id={textId} className="text-sm text-muted-foreground mb-2 leading-relaxed">
            Actualizá para usar la última versión de TopRentals.
          </p>
          {newVersion && <p className="text-xs text-muted-foreground tabular-nums mb-6">Nueva versión: {newVersion}</p>}
          <div className="flex flex-col-reverse sm:flex-row gap-3 w-full mt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={postpone}>Más tarde</Button>
            <Button ref={updateNowRef} type="button" className="flex-1 gap-2" onClick={updateNow} disabled={reloading} aria-busy={reloading}>
              {reloading && <Loader2 aria-hidden="true" className="w-4 h-4 animate-spin" />}Actualizar ahora
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default NewVersionModal;
