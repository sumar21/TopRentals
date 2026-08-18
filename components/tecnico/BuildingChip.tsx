// Compact "current building" indicator + entry point to the global EdificioPicker.
// Dropped into LayoutTecnico's desktop sidebar for now; mobile view headers get it in a
// later slice (once the 5 técnico views are wired to `useBuilding()`).
import { Building2 } from 'lucide-react';
import { cn } from '../ui/UIComponents';
import { useBuilding } from '../../contexts/BuildingContext';

interface BuildingChipProps {
  className?: string;
}

const BuildingChip: React.FC<BuildingChipProps> = ({ className }) => {
  const { selected, openPicker } = useBuilding();
  return (
    <button
      type="button"
      title="Cambiar edificio"
      onClick={openPicker}
      className={cn(
        'inline-flex max-w-full items-center gap-1.5 rounded-full bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90',
        className,
      )}
    >
      <Building2 className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{selected?.nombre ?? 'Elegí edificio'}</span>
    </button>
  );
};

export default BuildingChip;
