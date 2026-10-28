// Extract a human-readable message from a thrown value for display in toasts / inline errors.
//
// Why this exists: Supabase's PostgrestError is a plain object ({ message, details, hint, code }),
// NOT an Error instance. The common `e instanceof Error ? e.message : fallback` therefore silently
// drops the DB message — including the user-facing `RAISE EXCEPTION` texts our RPCs throw on purpose
// (e.g. "Cantidad insuficiente."), leaving the technician with a generic error that hides the cause.
// This reads `.message` off any error-shaped value so those reach the UI, and only then falls back.
export function errorMessage(e: unknown, fallback: string): string {
  if (typeof e === 'object' && e !== null) {
    const msg = (e as { message?: unknown }).message;
    if (typeof msg === 'string' && msg.trim()) return msg;
  }
  return fallback;
}
