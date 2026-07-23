// utils/formatMoneyInput.ts — máscara/parseo es-AR. `.` = miles, `,` = decimales.
export function maskMoney(raw: string | number | null | undefined): string {
  if (raw == null) return '';
  const s = String(raw).replace(/[^0-9.,]/g, '');
  if (s === '') return '';
  let intRaw: string, decRaw: string, hasDecimal: boolean;
  const hasDot = s.includes('.'), hasComma = s.includes(',');
  if (hasDot && hasComma) {
    const decSep = s.lastIndexOf(',') > s.lastIndexOf('.') ? ',' : '.';
    const cut = s.lastIndexOf(decSep);
    intRaw = s.slice(0, cut).replace(/\D/g, ''); decRaw = s.slice(cut + 1).replace(/\D/g, ''); hasDecimal = true;
  } else if (hasComma) {
    const cut = s.indexOf(',');
    intRaw = s.slice(0, cut).replace(/\D/g, ''); decRaw = s.slice(cut + 1).replace(/\D/g, ''); hasDecimal = true;
  } else { intRaw = s.replace(/\D/g, ''); decRaw = ''; hasDecimal = false; }
  intRaw = intRaw.replace(/^0+(?=\d)/, '');
  let grouped = intRaw.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  if (!hasDecimal) return grouped;
  if (grouped === '') grouped = '0';
  return grouped + ',' + decRaw.slice(0, 2);
}
export function maskFromNumber(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '';
  return new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}
export function parseMoney(masked: string | number | null | undefined): number {
  if (masked == null) return 0;
  const s = String(masked).trim(); if (!s) return 0;
  const negative = s.startsWith('-');
  const cleaned = s.replace(/[^0-9.,]/g, '').replace(/\./g, '').replace(',', '.');
  const n = parseFloat(cleaned);
  if (!Number.isFinite(n)) return 0;
  return negative ? -Math.abs(n) : n;
}
