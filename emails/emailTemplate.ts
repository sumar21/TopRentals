// Transactional email shell — DESIGN.md §13. Table-based HTML, 100% inline styles.
// BRAND.primary must match --brand in index.css (golden rule 2).
// Two layouts share this engine: Compras = secciones + tabla (estilo "Cable Sur"),
// Mantenimiento = kicker + lista clave/valor + narrativa (estilo "Wash Inn").

export const BRAND = {
  primary: '#23313E', // TopRentals navy — same hex as --brand
  ink: '#1a1a1a',
  muted: '#6b7280',
  border: '#e5e7eb',
  page: '#f4f4f5',
  zebra: '#f6f6f7',
};

// Logo de marca, servido desde /public (Vercel). Los mails van por Graph → la imagen debe estar
// hosteada en una URL pública (no relativa, no data-URI que Outlook bloquea). Si cambia el dominio,
// actualizá esta constante.
const LOGO_URL = 'https://top-rentals.vercel.app/logo.png';

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
  /** Etiqueta chica en mayúsculas arriba del título (ej. "Mantenimiento", "Compras"). */
  kicker?: string;
  title: string;
  /** Bajada en texto plano (se escapea). Para negritas usar `introHtml`. */
  intro?: string;
  /** Bajada con HTML confiable (el caller es responsable de escapar las interpolaciones). */
  introHtml?: string;
  contentHtml: string;
  /** Línea de firma (ej. "Resuelta por Juan", "Aprobada por Admin"). */
  footerNote?: string;
  /** Pill a la derecha del header (ej. "Resuelta", "Aprobada"). */
  badge?: string;
}

/** Shell blanco: barra de acento navy, logo + badge, kicker, título, bajada, contenido, firma, pie legal. */
export function renderBrandedEmail({ kicker, title, intro, introHtml, contentHtml, footerNote, badge }: BrandedEmailOptions): string {
  const bajada = introHtml ?? (intro ? escapeHtml(intro) : '');
  return `<!DOCTYPE html>
<html lang="es">
<body style="margin:0;padding:24px;background:${BRAND.page};font-family:Arial,Helvetica,sans-serif;color:${BRAND.ink};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:14px;border:1px solid ${BRAND.border};overflow:hidden;">
    <tr><td style="height:4px;background:${BRAND.primary};font-size:0;line-height:0;">&nbsp;</td></tr>
    <tr><td style="padding:28px 36px 32px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td style="vertical-align:middle;"><img src="${LOGO_URL}" width="40" height="40" alt="TopRentals" style="display:block;border-radius:9px;"></td>
        ${badge ? `<td align="right" style="vertical-align:middle;"><span style="display:inline-block;background:${BRAND.primary};color:#ffffff;font-size:11px;font-weight:700;letter-spacing:.4px;text-transform:uppercase;border-radius:999px;padding:5px 13px;">${escapeHtml(badge)}</span></td>` : ''}
      </tr></table>
      ${kicker ? `<p style="margin:26px 0 4px;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:${BRAND.primary};">${escapeHtml(kicker)}</p>` : '<div style="height:22px;line-height:22px;font-size:0;">&nbsp;</div>'}
      <h1 style="margin:0 0 ${bajada ? '12' : '20'}px;font-size:23px;font-weight:800;color:${BRAND.ink};line-height:1.25;">${escapeHtml(title)}</h1>
      ${bajada ? `<p style="margin:0 0 20px;font-size:14px;line-height:1.55;color:#374151;">${bajada}</p>` : ''}
      ${contentHtml}
      ${footerNote ? `<p style="margin:26px 0 0;font-size:13px;font-weight:600;color:${BRAND.ink};">${escapeHtml(footerNote)}</p>` : ''}
      <div style="height:1px;background:${BRAND.border};margin:24px 0 0;"></div>
      <p style="margin:16px 0 0;font-size:11px;color:#9ca3af;">Mensaje automático de TopRentals · Por favor no respondas a este correo.</p>
    </td></tr>
  </table>
</body>
</html>`;
}

/** Título de sección con barra navy a la izquierda (estilo "Cable Sur"). */
export function renderSectionTitle(text: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 10px;border-collapse:collapse;"><tr>
    <td style="width:4px;background:${BRAND.primary};border-radius:2px;font-size:0;line-height:0;">&nbsp;</td>
    <td style="padding-left:10px;font-size:13px;font-weight:800;letter-spacing:.3px;text-transform:uppercase;color:${BRAND.primary};">${escapeHtml(text)}</td>
  </tr></table>`;
}

/** Lista clave/valor (estilo "Wash Inn"): label mayúscula gris a la izquierda, valor en negrita a la derecha. */
export function renderKeyValueList(rows: Array<[string, string]>): string {
  const trs = rows
    .map(
      ([k, v]) =>
        `<tr>
          <td style="padding:11px 0;font-size:11px;font-weight:700;letter-spacing:.4px;text-transform:uppercase;color:${BRAND.muted};border-bottom:1px solid ${BRAND.border};white-space:nowrap;vertical-align:top;">${escapeHtml(k)}</td>
          <td align="right" style="padding:11px 0;font-size:14px;font-weight:600;color:${BRAND.ink};border-bottom:1px solid ${BRAND.border};">${escapeHtml(v)}</td>
        </tr>`,
    )
    .join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${trs}</table>`;
}

/** Tabla de detalle con header navy; fila de total opcional (fondo gris, monto en color de marca). */
export function renderEmailTable(
  headers: string[],
  rows: string[][],
  total?: { label: string; value: string },
  aligns?: Array<'left' | 'right' | 'center'>,
): string {
  const th = headers
    .map((h, i) => `<th align="${aligns?.[i] ?? 'left'}" style="padding:9px 10px;font-size:10px;font-weight:700;letter-spacing:.4px;text-transform:uppercase;color:#ffffff;background:${BRAND.primary};">${escapeHtml(h)}</th>`)
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
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid ${BRAND.border};border-radius:8px;overflow:hidden;">
    <tr>${th}</tr>${trs}${totalRow}
  </table>`;
}
