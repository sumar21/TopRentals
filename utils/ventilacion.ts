// Estado de limpieza DERIVADO de una ventilación — pedido de negocio (tarea "Modulo ventilación":
// "se les es muy difícil entender ... cambiar asignado/pendiente/cerrada por A vencer y Limpio").
// Es ORTOGONAL al estado operativo (Pendiente/Asignada/Programada/Realizada): ese sigue rigiendo las
// acciones (asignar/programar/realizar) y el ciclo que auto-crea el próximo registro por frecuencia
// (services/mock/adapter.ts finalizar()). Esto es solo cómo se LEE la limpieza de un vistazo, por días.
// Pure + DOM-free para poder unit-testearlo (scripts/checks/run.ts).
import type { Ventilacion } from '../services/types.ts';

export type EstadoLimpieza = 'Limpio' | 'A vencer' | 'Sucio';

// Umbrales en días desde la última limpieza: < 60 Limpio · 60–90 A vencer · > 90 Sucio.
export const UMBRAL_LIMPIO = 60;
export const UMBRAL_A_VENCER = 90;

type LimpiezaInput = Pick<Ventilacion, 'fecha_ultima' | 'proxima_limpieza' | 'frecuencia_dias'>;

const MS_DIA = 86_400_000;
const aMedianoche = (d: Date): number => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
};
// 'YYYY-MM-DD' (o ISO con hora) → medianoche local, para contar días de calendario sin ruido de husos.
const diaLocal = (iso: string): number => aMedianoche(new Date(`${iso.slice(0, 10)}T00:00:00`));

/**
 * Días transcurridos desde la última limpieza. Si nunca se limpió (fecha_ultima null) pero hay una
 * próxima programada + frecuencia, se deriva de la identidad del ciclo (proxima = última + frecuencia):
 *   transcurridos = frecuencia − (proxima − hoy).
 * Devuelve null cuando no alcanzan los datos para calcularlo.
 */
export function diasDesdeLimpieza(v: LimpiezaInput, hoy: Date = new Date()): number | null {
  const h = aMedianoche(hoy);
  if (v.fecha_ultima) return Math.floor((h - diaLocal(v.fecha_ultima)) / MS_DIA);
  if (v.proxima_limpieza && v.frecuencia_dias != null) {
    const diasHastaProxima = Math.floor((diaLocal(v.proxima_limpieza) - h) / MS_DIA);
    return v.frecuencia_dias - diasHastaProxima;
  }
  return null;
}

/**
 * Estado de limpieza por días desde la última limpieza:
 *   < 60 → Limpio · 60–90 → A vencer · > 90 → Sucio.
 * null cuando no hay datos suficientes (la UI cae al estado operativo).
 */
export function estadoLimpieza(v: LimpiezaInput, hoy: Date = new Date()): EstadoLimpieza | null {
  const d = diasDesdeLimpieza(v, hoy);
  if (d == null) return null;
  if (d < UMBRAL_LIMPIO) return 'Limpio';
  if (d <= UMBRAL_A_VENCER) return 'A vencer';
  return 'Sucio';
}
