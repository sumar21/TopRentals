// Email dispatch — STUB for phase 1 (backend undecided).
// Target design (DESIGN.md §13): a server-side function (Supabase Edge Function or
// API route) sends via Microsoft Graph POST /users/{MAIL_SENDER}/sendMail with the
// rendered HTML + CID logo attachment. Recipients resolve from the
// emails_notificacion table by modulo ('OT' | 'Compra' | 'Aprobaciones'),
// NOTIFICATIONS_BCC env replaces the old hardcoded dev list.

export interface EmailMessage {
  subject: string;
  html: string;
}

export interface RecipientRow {
  modulo: string;
  emails: string; // semicolon-separated, as migrated from EmailConcat_E
}

export function resolveRecipients(modulo: 'OT' | 'Compra' | 'Aprobaciones', rows: RecipientRow[]): string[] {
  const row = rows.find((r) => r.modulo === modulo);
  return row ? row.emails.split(';').map((e) => e.trim()).filter(Boolean) : [];
}

/* ponytail: stub until the backend (SharePoint vs Supabase) is decided — upgrade
   path is a Graph sendMail call from an Edge Function; nothing in the UI should
   await delivery. */
export async function sendEmail(to: string[], message: EmailMessage): Promise<void> {
  console.warn('[emails] send stub — not wired to a backend yet', { to, subject: message.subject });
}
