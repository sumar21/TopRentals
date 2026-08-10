// Email dispatch (DESIGN.md §13). Sends go through services/ (see CLAUDE.md
// "Arquitectura" — UI/callers never talk to a backend directly): the supabase adapter
// forwards to the sharepoint-write Edge Function, which calls Microsoft Graph
// POST /users/{MAIL_SENDER}/sendMail; the mock adapter no-ops. Recipients resolve from
// the emails_notificacion table by modulo ('OT' | 'Compra' | 'Aprobaciones');
// NOTIFICATIONS_BCC env (read on the Edge Function side) replaces the old hardcoded dev list.

import { api } from '../services/index.ts';

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

// TEMP (testing only): route EVERY notification to a single inbox instead of the ABM recipient
// list, so test runs never email real recipients. Set back to `null` to use the table again.
// NOTE: the Edge Function also BCCs the NOTIFICATIONS_BCC secret on every send — point that secret
// at this same address (or clear it) to fully avoid real recipients while testing.
const TEST_EMAIL_OVERRIDE: string | null = 'facurombo@gmail.com';

export async function sendEmail(to: string[], message: EmailMessage): Promise<void> {
  const recipients = TEST_EMAIL_OVERRIDE ? [TEST_EMAIL_OVERRIDE] : to;
  // Notifications are fire-and-forget: a delivery failure (Edge Function / Graph Mail.Send down or
  // not granted) must NEVER break the business operation that triggered it — e.g. confirming a
  // reception has already committed its stock intake, so throwing here would report a false failure
  // AND hide that the reception succeeded. Swallow and log; never propagate to the caller.
  try {
    await api.emailsNotificacion.enviar(recipients, message.subject, message.html);
  } catch (err) {
    console.warn('[email] notification send failed; the triggering operation already succeeded.', err);
  }
}
