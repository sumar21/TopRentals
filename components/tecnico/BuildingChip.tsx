// "Current building" control + entry point to the global EdificioPicker.
// Two shapes: icon-only square button (default) for the tight mobile view headers —
// same size/format/alignment as the "+" action button — and a labeled full-width
// button (`showLabel`) for the desktop sidebar, where the building name has room.
import { Building2 } from 'lucide-react';
import { cn } from '../ui/UIComponents';
import { useBuilding } from '../../contexts/BuildingContext';
import { iconBtnPrimary } from './shared';

interface BuildingChipProps {
  className?: string;
  /** Sidebar variant: show the building name in a labeled button instead of icon-only. */
  showLabel?: boolean;
}

const BuildingChip: React.FC<BuildingChipProps> = ({ className, showLabel = false }) => {
  const { selected, openPicker } = useBuilding();

  if (showLabel) {
    return (
      <button
        type="button"
        title="Cambiar edificio"
        onClick={openPicker}
        className={cn(
          'inline-flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm font-semibold text-foreground shadow-sm transition-colors hover:bg-accent',
          className,
        )}
      >
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Building2 className="h-3.5 w-3.5" />
        </span>
        <span className="truncate">{selected?.nombre ?? 'Elegí edificio'}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      title={selected ? `Edificio: ${selected.nombre} — tocá para cambiar` : 'Elegí un edificio'}
      aria-label="Cambiar edificio"
      onClick={openPicker}
      className={cn(iconBtnPrimary, className)}
    >
      <Building2 className="h-5 w-5" />
    </button>
  );
};

export default BuildingChip;
