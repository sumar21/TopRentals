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
  /** Email "OT resuelta" a los destinatarios del módulo OT al finalizar una orden (desktop y técnico).
   *  Apagado por pedido de producto (2026-08): el código de envío queda intacto, solo NO se dispara.
   *  Poner en true para reactivar. Compras y Aprobaciones NO se ven afectados. */
  emailOtResuelta: false,
} as const;
