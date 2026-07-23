// Shared pure logic for the Órdenes de Trabajo module: role/status gating, computed
// columns, month bucketing and the file-compression helper. Kept out of the view/modal
// files so those stay focused on markup + wiring (docs/analysis/desktop_Screen_OrdenesTrabajo.md
// "role_logic" is the source of truth for every gate below).
import type { ComboboxOption } from '../ui/UIComponents';
import type { EstadoOT, OrdenTrabajo, Perfil } from '../../services/types';
import { FEATURES } from '../../config/features';
import { todayISO } from '../../utils/dates';

// ---------------------------------------------------------------------------
// Domain option lists (spec "## statuses" — tipo_trabajo/tipo_tarea share the
// same 8-value catalog; there is no separate list documented for each).
// ---------------------------------------------------------------------------
export const TIPO_TRABAJO_TAREA_OPTIONS: ComboboxOption[] = [
  'Correctivo', 'Preventivo', 'Chequeo', 'Mejora', 'Pintura', 'Electrico', 'Ventilacion', 'Otros',
].map((v) => ({ label: v, value: v }));

export const PRIORIDAD_OPTIONS: ComboboxOption[] = ['Alta', 'Media', 'Baja'].map((v) => ({ label: v, value: v }));

export const ESTADO_OT_OPTIONS: ComboboxOption[] = ['Pendiente', 'Asignada', 'Cerrada', 'Cerrada V', 'Cerrada F', 'Anulada'].map((v) => ({ label: v, value: v }));

// ---------------------------------------------------------------------------
// Status / role gating (role_logic: "anular only if Asignada, replicar only if
// 'Cerrada F', terminar only if 'Asignada', ver-repuesto only if not 'Pendiente'";
// Compras is read-only except ver-detalle/ver-repuestos per the module brief).
// ---------------------------------------------------------------------------
export const isCompras = (perfil: Perfil) => perfil === 'Compras';
export const isEstadoAbierto = (status: EstadoOT) => status === 'Pendiente' || status === 'Asignada';

export const canEditar = (ot: OrdenTrabajo, perfil: Perfil) => !isCompras(perfil) && ot.status === 'Pendiente';
export const canVerRepuestos = (ot: OrdenTrabajo) => ot.status !== 'Pendiente';
export const canBitacoras = (perfil: Perfil) => !isCompras(perfil);
export const canAnular = (ot: OrdenTrabajo, perfil: Perfil) => !isCompras(perfil) && ot.status === 'Asignada';
export const canReplicar = (ot: OrdenTrabajo, perfil: Perfil) => !isCompras(perfil) && ot.status === 'Cerrada F';
export const canCerrar = (ot: OrdenTrabajo, perfil: Perfil) => !isCompras(perfil) && ot.status === 'Asignada';
export const canFinalizar = (ot: OrdenTrabajo, perfil: Perfil) => !isCompras(perfil) && ot.status === 'Asignada';
/** Asignar OT: built complete, but only ever rendered while FEATURES.asignarOTDesktop is false→never (parity with the disabled PA feature). */
export const canAsignar = (ot: OrdenTrabajo, perfil: Perfil) => FEATURES.asignarOTDesktop && !isCompras(perfil) && ot.status === 'Pendiente';

// ---------------------------------------------------------------------------
// Computed columns
// ---------------------------------------------------------------------------
function diffDays(startIso: string, endIso: string): number {
  const start = new Date(`${startIso.slice(0, 10)}T00:00:00Z`).getTime();
  const end = new Date(`${endIso.slice(0, 10)}T00:00:00Z`).getTime();
  return Math.round((end - start) / 86400000);
}

/** "Días reales": fecha_inicio -> fecha_cierre, or -> hoy while todavía abierta. */
export function diasReales(ot: Pick<OrdenTrabajo, 'fecha_inicio' | 'fecha_cierre'>): number | null {
  if (!ot.fecha_inicio) return null;
  return diffDays(ot.fecha_inicio, ot.fecha_cierre ?? todayISO());
}

export function truncate(text: string | null | undefined, max = 42): string {
  const s = (text ?? '').trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

// ---------------------------------------------------------------------------
// Month bucketing (default list filter: "current + previous month, estados
// abiertos + cerrados del período" — data_reads FechaMes_IN bucket).
// ---------------------------------------------------------------------------
const MESES_ES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

export const monthKey = (iso: string) => iso.slice(0, 7); // 'YYYY-MM'

export function monthLabel(key: string): string {
  const [y, m] = key.split('-');
  const name = MESES_ES[Number(m) - 1] ?? m;
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${y}`;
}

/** Rolling N months (incluye el actual), más reciente primero. */
export function rollingMonths(n = 12): ComboboxOption[] {
  const now = new Date();
  const out: ComboboxOption[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    out.push({ label: monthLabel(key), value: key });
  }
  return out;
}

/** Default visibility: abiertas siempre; cerradas/anuladas solo si su mes de cierre cae en actual o anterior. */
export function isVisibleByDefault(ot: OrdenTrabajo): boolean {
  if (isEstadoAbierto(ot.status)) return true;
  const ref = ot.fecha_cierre ?? ot.fecha_inicio;
  if (!ref) return false;
  const now = new Date();
  const current = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const prevD = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const previous = `${prevD.getFullYear()}-${String(prevD.getMonth() + 1).padStart(2, '0')}`;
  const key = monthKey(ref);
  return key === current || key === previous;
}

// ---------------------------------------------------------------------------
// Image compression (DESIGN.md §6.9) — kept local to this module: the doc places
// it at utils/imageCompression.ts, but that folder is off-limits to this agent
// (FILE OWNERSHIP), so it is implemented here instead. Used only for the optional
// Bitácora photo (data URL, never rejects — '' means "no image").
// ---------------------------------------------------------------------------
export async function fileToCompressedDataUrl(file: File, maxDim = 1600, quality = 0.7): Promise<string> {
  try {
    const original = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = original;
    });
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return original;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const compressed = canvas.toDataURL('image/jpeg', quality);
    return compressed.length < original.length ? compressed : original;
  } catch {
    return '';
  }
}
