// Date helpers for the es-AR UI (dd/mm/yyyy display) <-> ISO ('YYYY-MM-DD') storage.
// Pure functions, no react/DOM — must stay importable from plain Node scripts.

/** ISO ('YYYY-MM-DD' or full timestamp) -> 'dd/mm/yyyy'. Returns '' for empty input. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

/** 'dd/mm/yyyy' -> ISO 'YYYY-MM-DD'. Throws on a malformed or out-of-range date. */
export function parseDMY(dmy: string): string {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(dmy.trim());
  if (!match) throw new Error(`Fecha inválida: "${dmy}" (esperado dd/mm/yyyy)`);
  const [, d, m, y] = match;
  const iso = `${y}-${m}-${d}`;
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.getUTCDate() !== Number(d) || date.getUTCMonth() + 1 !== Number(m)) {
    throw new Error(`Fecha inválida: "${dmy}"`);
  }
  return iso;
}

/** ISO date + N days (N may be negative) -> ISO date. */
export function addDays(iso: string, days: number): string {
  const date = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Today as ISO 'YYYY-MM-DD' (local calendar day). */
export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
