// Shared building blocks for the Módulo Técnico (mobile-first) views.
// DESIGN.md §5.6/§5.5/§4.1: modals here are bottom-sheets (fixed inset-x-0 bottom-0
// rounded-t-2xl, dvh-aware), built once here on top of useModalAnimation + backdropClose
// + createPortal, and reused by every view in this folder.
import React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn, useModalAnimation } from '../ui/UIComponents';
import { backdropClose } from '../ui/backdropClose';
import type { Edificio } from '../../services/types.ts';

// ────────────────────────────────────────────────────────────────────────────
// BottomSheet — the one modal recipe every view in this module reuses.
// ────────────────────────────────────────────────────────────────────────────

export interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** Suppresses X/backdrop close while a save is in flight — pass `saving` from the consumer. */
  locked?: boolean;
}

export const BottomSheet: React.FC<BottomSheetProps> = ({ isOpen, onClose, title, subtitle, children, footer, locked = false }) => {
  const { visible, modalClass } = useModalAnimation(isOpen);
  if (!visible) return null;
  const closing = modalClass === 'modal-exit';
  const guardedClose = () => { if (!locked) onClose(); };
  return createPortal(
    <div
      className={cn('fixed inset-0 z-[60] flex items-end justify-center bg-black/60 backdrop-blur-sm', closing ? 'overlay-exit' : 'overlay-enter')}
      {...backdropClose(guardedClose)}
    >
      <div
        className={cn(
          'w-full max-w-md bg-background rounded-t-2xl shadow-2xl border-t overflow-hidden flex flex-col max-h-[85dvh]',
          closing ? 'animate-out slide-out-to-bottom fade-out duration-200' : 'animate-in slide-in-from-bottom-full fade-in duration-300',
        )}
      >
        <div className="px-4 py-3 border-b flex items-start justify-between gap-3 shrink-0 bg-secondary/20">
          <div className="min-w-0">
            <h2 className="text-base font-bold tracking-tight truncate">{title}</h2>
            {subtitle && <p className="text-xs text-muted-foreground mt-0.5 truncate">{subtitle}</p>}
          </div>
          <button onClick={locked ? undefined : onClose} aria-label="Cerrar" className="p-2 -m-2 shrink-0 rounded-full text-muted-foreground hover:bg-secondary transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">{children}</div>
        {footer && <div className="p-3 border-t bg-muted/20 flex flex-col sm:flex-row gap-2 shrink-0">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
};

// ────────────────────────────────────────────────────────────────────────────
// Building groupings — data-driven (Edificio.zona / Edificio.grupo_stock), never a
// hardcoded name switch (this is the exact bug class the original PA screens had).
// ────────────────────────────────────────────────────────────────────────────

/** Grouping key for the OT/Ventilaciones tower picker. Buildings without a zona are their own group. */
export const zonaKey = (e: Edificio): string => e.zona ?? e.nombre;
/** Grouping key for the Stock picker (shared stock pools). */
export const grupoStockKey = (e: Edificio): string => e.grupo_stock ?? e.nombre;

/** Building names sharing `zona` (or the same name if it has no zona) — matches Unidad/OT `torre`. */
export function torresEnZona(edificios: Edificio[], zona: string): string[] {
  return edificios.filter((e) => zonaKey(e) === zona).map((e) => e.nombre);
}

/** Edificio ids sharing a stock pool with `edificioId`. */
export function edificioIdsEnGrupoStock(edificios: Edificio[], edificioId: number): number[] {
  const target = edificios.find((e) => e.id === edificioId);
  if (!target) return [edificioId];
  const grupo = grupoStockKey(target);
  return edificios.filter((e) => grupoStockKey(e) === grupo).map((e) => e.id);
}

/** Edificio options for a Select, sorted so buildings in the same group sit together. */
export function edificioOptions(edificios: Edificio[], groupBy: (e: Edificio) => string) {
  return [...edificios]
    .sort((a, b) => groupBy(a).localeCompare(groupBy(b)) || a.nombre.localeCompare(b.nombre))
    .map((e) => ({ value: String(e.id), label: e.nombre }));
}

// ────────────────────────────────────────────────────────────────────────────
// Image capture — DESIGN.md §6.9. Compresses before staging/uploading; never rejects.
// ────────────────────────────────────────────────────────────────────────────

export async function fileToCompressedDataUrl(file: File, maxDim = 1600, quality = 0.7): Promise<string> {
  let original: string;
  try {
    original = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  } catch {
    return '';
  }
  try {
    const compressed = await new Promise<string>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('canvas 2d context unavailable')); return; }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => reject(new Error('image decode failed'));
      img.src = original;
    });
    return compressed.length < original.length ? compressed : original;
  } catch {
    return original;
  }
}
