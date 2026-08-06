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

// Re-run safety: a data re-migration truncates `usuarios` (auth_user_id -> NULL) but does
// NOT touch the auth schema, so the auth.users rows from a prior run survive. On a re-sync
// we must RELINK (and refresh the password from SharePoint) the existing auth user instead
// of createUser'ing again — which would collide on the email and fail. Map email -> auth id
// once so the loop can tell "new user" from "already exists, just relink".
const authIdByEmail = new Map<string, string>();
for (let page = 1; ; page++) {
  const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
  if (error) throw error;
  for (const au of data.users) if (au.email) authIdByEmail.set(au.email, au.id);
  if (data.users.length < 1000) break;
}

let created = 0, relinked = 0, alreadyLinked = 0, noPwd = 0, failed = 0;
let sampleUser: { usuario_app: string; password: string } | null = null;
for (const u of users) {
  if (u.auth_user_id) { alreadyLinked++; continue; }
  const password = pwdBySpId.get(Number(u.id));
  if (!password) { noPwd++; continue; }
  const email = aliasFor(u.usuario_app);
  const meta = { usuario_app: u.usuario_app, usuario_id: u.id, real_mail: u.mail ?? null };
  const existingId = authIdByEmail.get(email);
  let authUserId: string;
  if (existingId) {
    const { error } = await admin.auth.admin.updateUserById(existingId, { password, user_metadata: meta });
    if (error) { failed++; console.warn(`  updateUser failed for "${u.usuario_app}": ${error.message}`); continue; }
    authUserId = existingId;
    relinked++;
  } else {
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: meta });
    if (error || !data?.user) { failed++; console.warn(`  createUser failed for "${u.usuario_app}": ${error?.message}`); continue; }
    authUserId = data.user.id;
    created++;
  }
  await pgc.query('update usuarios set auth_user_id = $1 where id = $2', [authUserId, u.id]);
  if (!sampleUser) sampleUser = { usuario_app: u.usuario_app, password };
}
console.log(`\nauth provisioning: created=${created}  relinked=${relinked}  alreadyLinked=${alreadyLinked}  noPassword=${noPwd}  failed=${failed}`);

// 3. Smoke-test a real login end-to-end with the anon key (never prints the password).
if (sampleUser) {
  const anon = createClient(process.env.SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const { data, error } = await anon.auth.signInWithPassword({ email: aliasFor(sampleUser.usuario_app), password: sampleUser.password });
  console.log(`login smoke ("${sampleUser.usuario_app}"): ${data?.session ? 'OK ✅' : 'FAIL ❌ ' + (error?.message ?? '')}`);
}
await pgc.end();
