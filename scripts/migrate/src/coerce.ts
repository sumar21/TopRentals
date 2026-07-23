// Pure, tolerant coercion helpers for dirty SharePoint string data.
//
// Rule: NEVER throw. SharePoint list columns are all typed as plain strings by
// the Power Apps client, so a malformed date/number/flag is a fact of this
// dataset, not a bug — every function here returns null on anything it can't
// parse so the caller can insert NULL + keep migrating instead of aborting.

/** '' / whitespace / the literal string 'null' -> null. Otherwise trimmed string. */
export function emptyToNull(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  if (s === '' || s.toLowerCase() === 'null') return null;
  return s;
}

/** Strict 'dd/mm/yyyy' (es-AR) -> 'yyyy-mm-dd'. null on empty/malformed/impossible dates. */
export function parseDMY(value: unknown): string | null {
  const s = emptyToNull(value);
  if (!s) return null;
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  if (!match) return null;
  const [, d, m, y] = match;
  const date = new Date(`${y}-${m}-${d}T00:00:00Z`);
  const isReal =
    !Number.isNaN(date.getTime()) &&
    date.getUTCFullYear() === Number(y) &&
    date.getUTCMonth() + 1 === Number(m) &&
    date.getUTCDate() === Number(d);
  return isReal ? `${y}-${m}-${d}` : null;
}

/** 'H:mm' or 'HH:mm' -> Postgres 'HH:mm:ss' time literal. null on empty/malformed/out-of-range. */
export function parseHora(value: unknown): string | null {
  const s = emptyToNull(value);
  if (!s) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!match) return null;
  const h = Number(match[1]);
  const min = Number(match[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}:00`;
}

/**
 * dd/mm/yyyy date + HH:mm hora -> ISO-ish local timestamp for a timestamptz column.
 * Missing/unparseable hora falls back to midnight; missing/unparseable date -> null
 * (a bare time with no date isn't insertable).
 */
export function combineDateTime(dateValue: unknown, horaValue: unknown): string | null {
  const date = parseDMY(dateValue);
  if (!date) return null;
  const hora = parseHora(horaValue) ?? '00:00:00';
  return `${date}T${hora}`;
}

/**
 * Comma-or-dot decimal string -> number. Tolerates a thousands-separator paired
 * with a different decimal separator (e.g. '1.234,50'); a lone ',' is treated
 * as the decimal point (SharePoint/Power Apps Text() values never group here).
 */
export function parseNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const s = emptyToNull(value);
  if (!s) return null;
  let cleaned = s.replace(/\s/g, '');
  const hasDot = cleaned.includes('.');
  const hasComma = cleaned.includes(',');
  if (hasDot && hasComma) {
    const decimalSep = cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.') ? ',' : '.';
    const thousandsSep = decimalSep === ',' ? '.' : ',';
    cleaned = cleaned.split(thousandsSep).join('');
    cleaned = cleaned.replace(decimalSep, '.');
  } else if (hasComma) {
    cleaned = cleaned.replace(',', '.');
  }
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** 'SI'/'NO' (case-insensitive) -> boolean. Also tolerates true/false/1/0. null otherwise. */
export function siNoToBool(value: unknown): boolean | null {
  const s = emptyToNull(value)?.toUpperCase() ?? null;
  if (s === null) return null;
  if (s === 'SI' || s === 'TRUE' || s === '1' || s === 'YES') return true;
  if (s === 'NO' || s === 'FALSE' || s === '0') return false;
  return null;
}

/** 'Activo'/'Inactivo' (case-insensitive) -> boolean. Shared by every Status_* soft-delete flag. */
export function activoToBool(value: unknown): boolean | null {
  const s = emptyToNull(value)?.toUpperCase() ?? null;
  if (s === null) return null;
  if (s === 'ACTIVO') return true;
  if (s === 'INACTIVO') return false;
  return null;
}

/** 'ALTA'/'BAJA' (case-insensitive) -> boolean. Status_Usr and Status_ABMUnid. */
export function altaBajaToBool(value: unknown): boolean | null {
  const s = emptyToNull(value)?.toUpperCase() ?? null;
  if (s === null) return null;
  if (s === 'ALTA') return true;
  if (s === 'BAJA') return false;
  return null;
}
