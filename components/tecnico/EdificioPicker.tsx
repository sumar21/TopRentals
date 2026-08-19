// Global building picker for the technician module — país → edificio, 2 pasos.
// Same modal recipe as BottomSheet (useModalAnimation + backdropClose + createPortal) but
// always centered (never a bottom sheet) since it can be `forced` (no dismiss escape but
// "Cerrar sesión"). Portals to document.body, OUTSIDE .tecnico-theme, so the celeste
// --primary must be re-applied on the overlay itself (see shared.tsx BottomSheet fix).
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Building2, ChevronRight, Globe, X } from 'lucide-react';
import { cn, useModalAnimation } from '../ui/UIComponents';
import { backdropClose } from '../ui/backdropClose';
import type { Edificio } from '../../services/types.ts';

// Banderitas inline (SVG) — NO emoji: Windows no renderiza el emoji de bandera (muestra "AR"/"EC");
// el SVG se ve igual en desktop y en el celular del técnico. Fallback a Globe para países sin bandera.
const FLAGS: Record<string, React.ReactNode> = {
  Argentina: (
    <svg viewBox="0 0 30 20" preserveAspectRatio="xMidYMid slice" className="h-full w-full" aria-hidden>
      <rect width="30" height="20" fill="#fff" />
      <rect width="30" height="6.667" fill="#74ACDF" />
      <rect y="13.333" width="30" height="6.667" fill="#74ACDF" />
      <circle cx="15" cy="10" r="2" fill="#F6B40E" stroke="#843511" strokeWidth="0.25" />
    </svg>
  ),
  Ecuador: (
    <svg viewBox="0 0 30 20" preserveAspectRatio="xMidYMid slice" className="h-full w-full" aria-hidden>
      <rect width="30" height="10" fill="#FFDD00" />
      <rect y="10" width="30" height="5" fill="#034EA2" />
      <rect y="15" width="30" height="5" fill="#EF3340" />
    </svg>
  ),
};

const FlagIcon: React.FC<{ pais: string | null; className?: string }> = ({ pais, className }) => {
  const flag = pais ? FLAGS[pais] : undefined;
  if (!flag) {
    return (
      <span className={cn('flex items-center justify-center rounded-full bg-secondary text-secondary-foreground', className)}>
        <Globe className="h-5 w-5" />
      </span>
    );
  }
  return <span className={cn('overflow-hidden rounded-md border', className)}>{flag}</span>;
};

export interface EdificioPickerProps {
  isOpen: boolean;
  onClose: () => void;
  edificios: Edificio[];
  selected: Edificio | null;
  onSelect: (e: Edificio) => void;
  onLogout: () => void;
  /** True when no building is selected yet → not dismissable (no X, no backdrop close). */
  forced: boolean;
}

type Step = 'pais' | 'edificio';

const EdificioPicker: React.FC<EdificioPickerProps> = ({ isOpen, onClose, edificios, selected, onSelect, onLogout, forced }) => {
  const { visible, modalClass } = useModalAnimation(isOpen);
  const [step, setStep] = useState<Step>('pais');
  const [pais, setPais] = useState<string | null>(null);

  const paises = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of edificios) {
      if (!e.pais) continue;
      counts.set(e.pais, (counts.get(e.pais) ?? 0) + 1);
    }
    return [...counts.entries()].map(([nombre, count]) => ({ nombre, count }));
  }, [edificios]);
  const unicoPais = paises.length === 1;

  // Recalcular el punto de entrada cada vez que se abre: si ya hay selección, arrancar en el
  // edificio de su país; si hay un solo país, saltear el paso 1; si no, arrancar en país.
  useEffect(() => {
    if (!isOpen) return;
    if (selected?.pais) { setPais(selected.pais); setStep('edificio'); }
    else if (unicoPais) { setPais(paises[0].nombre); setStep('edificio'); }
    else { setPais(null); setStep('pais'); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!visible) return null;
  const closing = modalClass === 'modal-exit';
  const guardedClose = () => { if (!forced) onClose(); };
  const showSteps = paises.length > 1;
  const edificiosDelPais = pais ? edificios.filter((e) => e.pais === pais) : edificios;

  return createPortal(
    <div
      className={cn(
        'tecnico-theme fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 h-[100dvh]',
        closing ? 'overlay-exit' : 'overlay-enter',
      )}
      {...backdropClose(guardedClose)}
    >
      <div
        className={cn(
          'w-full max-w-md sm:max-w-2xl bg-background rounded-2xl shadow-2xl border overflow-hidden flex flex-col max-h-[90dvh]',
          closing ? 'animate-out fade-out zoom-out-95 duration-200' : 'animate-in fade-in zoom-in-95 duration-200',
        )}
      >
        <div className="relative shrink-0 bg-gradient-to-br from-primary to-primary/80 px-5 py-4 text-primary-foreground">
          {!forced && (
            <button
              onClick={onClose}
              aria-label="Cerrar"
              className="absolute right-3 top-3 rounded-full p-1.5 text-primary-foreground/90 transition-colors hover:bg-white/10"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          {showSteps && (
            <p className="text-[11px] font-semibold uppercase tracking-wide text-primary-foreground/80">
              {step === 'pais' ? 'Paso 1 de 2' : 'Paso 2 de 2'}
            </p>
          )}
          <h2 className="mt-0.5 pr-6 text-lg font-bold tracking-tight">
            {step === 'pais' ? 'Elegí un país' : `Elegí un edificio${pais ? ` en ${pais}` : ''}`}
          </h2>
          <p className="mt-1 text-xs text-primary-foreground/80">
            {step === 'pais'
              ? 'Vas a ver solo los edificios del país que selecciones.'
              : 'Vas a operar sobre este edificio durante la sesión.'}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {edificios.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Cargando edificios… si esto no cambia, no hay edificios activos.
            </p>
          ) : step === 'pais' ? (
            <div className="grid gap-2">
              {paises.map(({ nombre, count }) => (
                <button
                  key={nombre}
                  onClick={() => { setPais(nombre); setStep('edificio'); }}
                  className="flex items-center gap-3 rounded-xl border p-3 text-left transition-colors hover:bg-accent"
                >
                  <FlagIcon pais={nombre} className="h-9 w-9 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold">{nombre}</span>
                    <span className="block text-xs text-muted-foreground">
                      {count} edificio{count === 1 ? '' : 's'} activo{count === 1 ? '' : 's'}
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {!unicoPais && paises.length > 1 && (
                <button
                  onClick={() => { setStep('pais'); setPais(null); }}
                  className="text-sm font-medium text-primary hover:underline"
                >
                  ← Cambiar país
                </button>
              )}
              <div className="grid gap-2 sm:grid-cols-2">
                {edificiosDelPais.map((e) => {
                  const isSelected = selected?.id === e.id;
                  return (
                    <button
                      key={e.id}
                      onClick={() => { onSelect(e); onClose(); }}
                      className={cn(
                        'flex items-center gap-3 rounded-xl border p-3 text-left transition-colors hover:bg-accent',
                        isSelected && 'border-primary bg-primary/5',
                      )}
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
                        <Building2 className="h-5 w-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-bold">{e.nombre}</span>
                        <span className="block truncate text-xs text-muted-foreground">{e.pais}</span>
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-center gap-1.5 border-t bg-muted/20 p-3">
          {forced && <p className="text-xs text-muted-foreground">Seleccioná un edificio para continuar</p>}
          <button onClick={onLogout} className="text-sm font-medium text-muted-foreground transition-colors hover:text-destructive">
            Cerrar sesión
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default EdificioPicker;
