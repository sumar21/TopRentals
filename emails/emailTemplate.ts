// Transactional email shell — DESIGN.md §13. Table-based HTML, 100% inline styles.
// BRAND.primary must match --brand in index.css (golden rule 2).

export const BRAND = {
  primary: '#23313E', // TopRentals navy — same hex as --brand
  ink: '#1a1a1a',
  muted: '#6b7280',
  border: '#e5e7eb',
  page: '#f4f4f5',
  zebra: '#f6f6f7',
};

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function formatMoney(n: number): string {
  return '$ ' + new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

export interface BrandedEmailOptions {
  title: string;
  intro?: string;
  contentHtml: string;
  footerNote?: string;
  badge?: string;
}

/** White card shell: header with badge pill, brand accent line, title, content slot, footer. */
export function renderBrandedEmail({ title, intro, contentHtml, footerNote, badge }: BrandedEmailOptions): string {
  return `<!DOCTYPE html>
<html lang="es">
<body style="margin:0;padding:24px;background:${BRAND.page};font-family:Arial,Helvetica,sans-serif;color:${BRAND.ink};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:840px;margin:0 auto;background:#ffffff;border-radius:16px;border:1px solid ${BRAND.border};">
    <tr><td style="padding:32px 40px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td style="font-size:18px;font-weight:800;color:${BRAND.primary};">TopRentals</td>
        ${badge ? `<td align="right"><span style="display:inline-block;background:${BRAND.primary};color:#ffffff;font-size:11px;font-weight:700;letter-spacing:.4px;text-transform:uppercase;border-radius:999px;padding:4px 12px;">${escapeHtml(badge)}</span></td>` : ''}
      </tr></table>
      <div style="height:3px;width:52px;background:${BRAND.primary};margin:20px 0;"></div>
      <h1 style="margin:0 0 8px;font-size:24px;font-weight:800;color:${BRAND.ink};">${escapeHtml(title)}</h1>
      ${intro ? `<p style="margin:0 0 20px;font-size:13px;color:${BRAND.muted};">${escapeHtml(intro)}</p>` : ''}
      ${contentHtml}
      ${footerNote ? `<p style="margin:24px 0 0;font-size:12px;color:${BRAND.muted};">${escapeHtml(footerNote)}</p>` : ''}
    </td></tr>
  </table>
  <p style="max-width:840px;margin:16px auto 0;text-align:center;font-size:11px;color:#b0b0b8;">Este es un mensaje automático de TopRentals.</p>
</body>
</html>`;
}

/** Generic detail table; optional total row (gray fill, amount in brand color). */
export function renderEmailTable(
  headers: string[],
  rows: string[][],
  total?: { label: string; value: string },
  aligns?: Array<'left' | 'right' | 'center'>,
): string {
  const th = headers
    .map((h, i) => `<th align="${aligns?.[i] ?? 'left'}" style="padding:8px 10px;font-size:10px;font-weight:700;letter-spacing:.4px;text-transform:uppercase;color:${BRAND.muted};border-bottom:1px solid ${BRAND.border};">${escapeHtml(h)}</th>`)
    .join('');
  const trs = rows
    .map(
      (r) =>
        `<tr>${r
          .map((c, i) => `<td align="${aligns?.[i] ?? 'left'}" style="padding:8px 10px;font-size:13px;border-bottom:1px solid ${BRAND.border};">${escapeHtml(c)}</td>`)
          .join('')}</tr>`,
    )
    .join('');
  const totalRow = total
    ? `<tr><td colspan="${headers.length - 1}" align="right" style="padding:10px;background:${BRAND.zebra};font-size:13px;font-weight:700;">${escapeHtml(total.label)}</td><td align="right" style="padding:10px;background:${BRAND.zebra};font-size:13px;font-weight:700;color:${BRAND.primary};">${escapeHtml(total.value)}</td></tr>`
    : '';
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
    <tr>${th}</tr>${trs}${totalRow}
  </table>`;
}
