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

export async function sendEmail(to: string[], message: EmailMessage): Promise<void> {
  await api.emailsNotificacion.enviar(to, message.subject, message.html);
}
