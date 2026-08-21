// Feature flags for functionality that exists fully built in the Power Apps source
// (formulas, stock-deduction logic, WhatsApp summary link, etc.) but was shipped
// disabled there (Visible=false / hardcoded off) — see docs/analysis/desktop_Screen_OrdenesTrabajo.md
// "Group_AsignarOT" and docs/analysis/desktop_Screen_Ventilaciones.md for the source evidence.
// Do NOT delete or flip these on without an explicit product decision — they are dead-but-built
// parity flags, not TODOs.
export const FEATURES = {
  /** "Asignar OT" (technician + spare-parts assignment from the desktop OT screen). */
  asignarOTDesktop: false,
  /** Assigning a ventilación to a technician directly from the desktop screen. */
  asignarVentilacionDesktop: false,
  /** "Adelantar ventilación" (incident flow, mobile técnico). El doc de análisis lo describe, pero
   *  el cliente no lo encuentra accesible en la PA real y el YAML crudo no está en el repo para
   *  confirmarlo → apagado por decisión de producto. Poner en true si se confirma que existe en PA. */
  adelantarVentilacionMobile: false,
} as const;
