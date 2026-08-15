import React from 'react';
import type { Ventilacion } from '../../services/types.ts';
import { cn } from '../ui/UIComponents';
import { StatusBadge, NEUTRAL_CHIP } from '../ui/StatusBadge';
import { estadoLimpieza } from '../../utils/ventilacion.ts';

/**
 * Estado de una ventilación: badge de LIMPIEZA por días (Limpio/A vencer/Sucio) como principal —
 * lo que el negocio quiere leer de un vistazo — con el estado OPERATIVO (Pendiente/Asignada/Programada/
 * Realizada) como chip chico al lado (sigue rigiendo las acciones). Sin datos de limpieza → cae al
 * operativo como principal. Compartido por la vista back-office y la del técnico (mismo look en las dos).
 * El wrapper `inline-flex` lo deja como un único ítem, así entra igual en una fila `gap` o en un `justify-between`.
 */
export const EstadoVentilacionCell: React.FC<{ v: Ventilacion }> = ({ v }) => {
  const limpieza = estadoLimpieza(v);
  if (!limpieza) return <StatusBadge status={v.estado} />;
  return (
    <span className="inline-flex items-center gap-1.5">
      <StatusBadge status={limpieza} />
      <span
        className={cn('rounded-full px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide', NEUTRAL_CHIP)}
        title={`Estado operativo: ${v.estado}`}
      >
        {v.estado}
      </span>
    </span>
  );
};

export default EstadoVentilacionCell;
