// Fase 0 — provision Supabase auth.users for active usuarios, seeding their EXISTING
// SharePoint passwords (internal management app; continuity over reset, per decision).
// Login is by username via a synthetic email alias (most users have no real mailbox).
// Idempotent: skips usuarios already linked (auth_user_id set).
//
//   node --experimental-strip-types --env-file=../../.env provision-auth.ts
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';
import { createGraphClient } from './src/graph.ts';
import { SP_LISTS } from './src/mappings.ts';

const ALIAS_DOMAIN = 'users.toprentals.internal';
// The app's Supabase auth.login MUST build the email with this EXACT rule (username ->
// email local-part): NFKD, lowercase, keep only [a-z0-9._-]. Strips accents/ñ/spaces so
// the local part is a valid email. Keep both sides in sync.
const aliasFor = (usuarioApp: string) =>
  `${usuarioApp.normalize('NFKD').toLowerCase().replace(/[^a-z0-9._-]/g, '')}@${ALIAS_DOMAIN}`;

const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

// 1. Passwords live ONLY in SharePoint (field_8) — read them, keyed by SP usuario id (= PG id).
const graph = createGraphClient({
  tenantId: process.env.MS_TENANT_ID!,
  clientId: process.env.MS_CLIENT_ID!,
  clientSecret: process.env.MS_CLIENT_SECRET!,
});
const siteId = await graph.resolveSiteId(process.env.SP_SITE_URL!);
const listId = await graph.resolveListId(siteId, SP_LISTS.usuarios);
const items = await graph.fetchAllItems(siteId, listId);
const pwdBySpId = new Map<number, string>();
for (const it of items) {
  const pw = it.fields['field_8'];
  if (pw != null && String(pw).trim() !== '') pwdBySpId.set(Number(it.id), String(pw));
}

// 2. Active usuarios not yet linked.
const pgc = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
await pgc.connect();
const { rows: users } = await pgc.query(
  'select id, usuario_app, mail, auth_user_id from usuarios where activo = true order by id',
);

let created = 0, alreadyLinked = 0, noPwd = 0, failed = 0;
let sampleUser: { usuario_app: string; password: string } | null = null;
for (const u of users) {
  if (u.auth_user_id) { alreadyLinked++; continue; }
  const password = pwdBySpId.get(Number(u.id));
  if (!password) { noPwd++; continue; }
  const { data, error } = await admin.auth.admin.createUser({
    email: aliasFor(u.usuario_app),
    password,
    email_confirm: true,
    user_metadata: { usuario_app: u.usuario_app, usuario_id: u.id, real_mail: u.mail ?? null },
  });
  if (error || !data?.user) { failed++; console.warn(`  createUser failed for "${u.usuario_app}": ${error?.message}`); continue; }
  await pgc.query('update usuarios set auth_user_id = $1 where id = $2', [data.user.id, u.id]);
  created++;
  if (!sampleUser) sampleUser = { usuario_app: u.usuario_app, password };
}
console.log(`\nauth provisioning: created=${created}  alreadyLinked=${alreadyLinked}  noPassword=${noPwd}  failed=${failed}`);

// 3. Smoke-test a real login end-to-end with the anon key (never prints the password).
if (sampleUser) {
  const anon = createClient(process.env.SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const { data, error } = await anon.auth.signInWithPassword({ email: aliasFor(sampleUser.usuario_app), password: sampleUser.password });
  console.log(`login smoke ("${sampleUser.usuario_app}"): ${data?.session ? 'OK ✅' : 'FAIL ❌ ' + (error?.message ?? '')}`);
}
await pgc.end();
