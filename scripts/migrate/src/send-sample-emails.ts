// Manda los 4 mails transaccionales de ejemplo (con el diseño nuevo) a una casilla de prueba,
// para revisar el render en un cliente real sin tener que disparar cada flujo en la app.
// Va DIRECTO a Microsoft Graph (client-credentials) — no depende de la Edge Function ni del deploy.
//
// Uso (desde scripts/migrate/):  npm run send-samples            (default: facurombo@gmail.com)
//                                npm run send-samples -- otra@mail.com
//
// Requiere en el .env de la raíz: MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET, MAIL_SENDER.
import { config } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  compraEnviadaAprobacionEmail,
  compraAprobadaEmail,
  compraRecibidaEmail,
  otResueltaEmail,
} from '../../../emails/templates.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(here, '../../../.env') });
config();

const TO = process.argv.find((a) => a.includes('@')) ?? 'facurombo@gmail.com';

function requireEnv(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Falta ${name} en el .env de la raíz.`);
  return v;
}

async function getGraphToken(): Promise<string> {
  const body = new URLSearchParams({
    client_id: requireEnv('MS_CLIENT_ID'),
    client_secret: requireEnv('MS_CLIENT_SECRET'),
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  });
  const res = await fetch(`https://login.microsoftonline.com/${requireEnv('MS_TENANT_ID')}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Token Graph falló: ${res.status} ${JSON.stringify(json)}`);
  return json.access_token as string;
}

async function sendMail(token: string, sender: string, to: string, subject: string, html: string): Promise<void> {
  const res = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/sendMail`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: { subject, body: { contentType: 'HTML', content: html }, toRecipients: [{ emailAddress: { address: to } }] },
      saveToSentItems: false,
    }),
  });
  if (!res.ok) throw new Error(`sendMail falló (${subject}): ${res.status} ${await res.text()}`);
}

// ── Datos de ejemplo ────────────────────────────────────────────────────────
const lineasCompra = [
  { edificio: 'Palermo Chico', articulo: '5 - Pinceles N° 25', cantidad: 30, costo_unitario: 1000, costo_total: 30000 },
  { edificio: 'Palermo Chico', articulo: '4 - Rodillo Pelo Largo 22cm', cantidad: 20, costo_unitario: 1500, costo_total: 30000 },
  { edificio: 'Downtown', articulo: '3 - Balde 20L Latex', cantidad: 10, costo_unitario: 8000, costo_total: 80000 },
];
const lineasRecibida = lineasCompra.map((l, i) => ({ ...l, recibido: i === 2 ? 8 : l.cantidad }));

const samples = [
  compraEnviadaAprobacionEmail(1042, lineasCompra, 'Rombola, Facundo'),
  compraAprobadaEmail(1042, lineasCompra, 'Admin'),
  compraRecibidaEmail(1042, lineasRecibida, 'Faltaron 2 baldes, se reclaman al proveedor.', 'Cordoba, Mauro'),
  otResueltaEmail({
    nroOT: 4482,
    activo: 'Admin - Otros',
    tipoTrabajo: 'Correctivo',
    tipoTarea: 'Pintura',
    diasEstimados: 1,
    diasUtilizados: 2,
    repuestos: [{ repuesto: '3 - Balde 20L Latex', cantidad: 1 }],
    tecnico: 'Cordoba, Mauro',
  }),
];

async function main(): Promise<void> {
  const token = await getGraphToken();
  const sender = requireEnv('MAIL_SENDER');
  for (const { subject, html } of samples) {
    await sendMail(token, sender, TO, subject, html);
    console.log(`✓ enviado a ${TO}: ${subject}`);
  }
  console.log(`\nListo: ${samples.length} mails de ejemplo enviados a ${TO}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
