import React from 'react';
import type { Ventilacion } from '../../services/types.ts';
import { StatusBadge } from '../ui/StatusBadge';
import { estadoLimpieza } from '../../utils/ventilacion.ts';

/**
 * Estado de una ventilación en UNA sola tag. Normalmente muestra la LIMPIEZA por días
 * (Limpio/A vencer/Sucio) — lo que el negocio quiere leer de un vistazo. Excepción: si la
 * ventilación ya está PROGRAMADA, eso es lo relevante y la tag lo dice (pisa a la limpieza).
 * Sin datos de limpieza → cae al estado operativo. Compartido por back-office y técnico.
 */
export const EstadoVentilacionCell: React.FC<{ v: Ventilacion }> = ({ v }) => {
  const limpieza = estadoLimpieza(v);
  const estado = v.estado === 'Programada' ? 'Programada' : (limpieza ?? v.estado);
  return <StatusBadge status={estado} />;
};

export default EstadoVentilacionCell;
