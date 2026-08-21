// Backfill de contraseñas REALES desde SharePoint (00.Usuarios field_8) → Supabase.
//
// Por qué: el esquema "contraseña = ddmm de nacimiento" está roto (field_5 es solo día/mes sin
// año y no siempre la contraseña es ddmm — Admin tiene una custom). La contraseña real vive en
// field_8. Este script, para cada usuario activo:
//   1) guarda field_8 en usuarios.password_seed (para mostrarla en el ABM), y
//   2) provisiona/actualiza la cuenta auth (email alias) con esa contraseña.
//
// Matchea por ID (usuarios.id === id del item de SharePoint — el migrate preserva el id).
//
// IMPORTANTE: muchas contraseñas son de 4 dígitos (ddmm). Supabase Auth exige por defecto 6.
// Antes de correr esto en LIVE, bajá el mínimo a 4 en:
//   Dashboard → Authentication → Sign In / Providers → Minimum password length = 4
// Si no, los createUser/updateUser de contraseñas cortas fallan (el script los reporta).
//
// Uso (desde scripts/migrate/):
//   node --experimental-strip-types src/backfill-passwords-sp.ts --dry-run
//   node --experimental-strip-types src/backfill-passwords-sp.ts
import { config } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { createGraphClient } from './graph.ts';
import { SP_LISTS } from './mappings.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(here, '../../../.env') });
config();

const DRY_RUN = process.argv.includes('--dry-run');

const ALIAS_DOMAIN = 'users.toprentals.internal';
const aliasFor = (usuarioApp: string): string =>
  `${usuarioApp.normalize('NFKD').toLowerCase().replace(/[^a-z0-9._-]/g, '')}@${ALIAS_DOMAIN}`;

function requireEnv(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Falta la variable de entorno ${name} (ver .env en la raíz).`);
  return v;
}

interface UsuarioRow {
  id: number;
  usuario_app: string;
  auth_user_id: string | null;
}

async function main(): Promise<void> {
  // 1) Contraseñas reales desde SharePoint (field_8), indexadas por id de item.
  const graph = createGraphClient({
    tenantId: requireEnv('MS_TENANT_ID'),
    clientId: requireEnv('MS_CLIENT_ID'),
    clientSecret: requireEnv('MS_CLIENT_SECRET'),
  });
  const siteId = await graph.resolveSiteId(requireEnv('SP_SITE_URL'));
  const listId = await graph.resolveListId(siteId, SP_LISTS.usuarios);
  const spItems = await graph.fetchAllItems(siteId, listId);
  const passById = new Map<number, string>();
  for (const it of spItems) {
    const raw = it.fields['field_8'];
    const pass = raw == null ? '' : String(raw).trim();
    if (pass) passById.set(Number(it.id), pass);
  }
  console.log(`SharePoint "${SP_LISTS.usuarios}": ${spItems.length} items, ${passById.size} con contraseña (field_8).`);

  // 2) Usuarios activos en Postgres.
  const sb = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await sb.from('usuarios').select('id, usuario_app, auth_user_id').eq('activo', true);
  if (error) throw error;
  const usuarios = (data ?? []) as UsuarioRow[];

  // Cuentas auth ya existentes, por email → id. Muchos usuarios ya tienen cuenta (de intentos
  // previos) pero sin auth_user_id linkeado en usuarios; sin este mapa el createUser choca con
  // "email already registered". listUsers pagina de a 1000.
  const authByEmail = new Map<string, string>();
  if (!DRY_RUN) {
    for (let page = 1; ; page++) {
      const { data: list, error: lErr } = await sb.auth.admin.listUsers({ page, perPage: 1000 });
      if (lErr) throw lErr;
      for (const au of list.users) if (au.email) authByEmail.set(au.email.toLowerCase(), au.id);
      if (list.users.length < 1000) break;
    }
    console.log(`Cuentas auth existentes: ${authByEmail.size}`);
  }

  let seedSet = 0, creados = 0, actualizados = 0, linkeados = 0;
  const sinPass: string[] = [];
  const cortas: string[] = [];
  const errores: string[] = [];

  for (const u of usuarios) {
    const pass = passById.get(u.id);
    if (!pass) { sinPass.push(u.usuario_app); continue; }
    if (pass.length < 4) cortas.push(`${u.usuario_app} (${pass.length} chars)`);
    const email = aliasFor(u.usuario_app);

    if (DRY_RUN) {
      console.log(`[dry-run] seed + ${u.auth_user_id ? 'update' : 'create/link'} ${email} (pass "${pass}")`);
      seedSet++; u.auth_user_id ? actualizados++ : creados++;
      continue;
    }

    try {
      // 2a) Guardar la contraseña real para mostrarla en el ABM.
      const { error: seedErr } = await sb.from('usuarios').update({ password_seed: pass }).eq('id', u.id);
      if (seedErr) throw seedErr;
      seedSet++;

      // 2b) Resolver la cuenta auth: la linkeada, o una ya existente con el mismo email.
      const authId = u.auth_user_id ?? authByEmail.get(email.toLowerCase()) ?? null;
      if (authId) {
        const { error: upErr } = await sb.auth.admin.updateUserById(authId, { email, password: pass, email_confirm: true });
        if (upErr) throw upErr;
        actualizados++;
        // Linkear si en usuarios estaba en null (cuenta existía pero suelta).
        if (!u.auth_user_id) {
          const { error: linkErr } = await sb.from('usuarios').update({ auth_user_id: authId }).eq('id', u.id);
          if (linkErr) throw linkErr;
          linkeados++;
        }
      } else {
        const { data: created, error: cErr } = await sb.auth.admin.createUser({ email, password: pass, email_confirm: true });
        if (cErr || !created.user) throw cErr ?? new Error('createUser devolvió vacío');
        const { error: linkErr } = await sb.from('usuarios').update({ auth_user_id: created.user.id }).eq('id', u.id);
        if (linkErr) throw linkErr;
        creados++;
      }
    } catch (e) {
      errores.push(`${u.usuario_app}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  if (linkeados) console.log(`Cuentas linkeadas (existían sueltas): ${linkeados}`);

  console.log('\n=== Backfill de contraseñas (SharePoint field_8) ===');
  console.log(`password_seed seteados: ${seedSet}`);
  console.log(`Auth creados:           ${creados}`);
  console.log(`Auth actualizados:      ${actualizados}`);
  console.log(`Sin contraseña en SP:   ${sinPass.length}${sinPass.length ? '  → ' + sinPass.join(', ') : ''}`);
  if (cortas.length) console.log(`Contraseñas < 4 chars:  ${cortas.length}  → ${cortas.join(', ')}`);
  if (errores.length) {
    console.log(`\nErrores: ${errores.length}`);
    console.log('  ' + errores.join('\n  '));
    process.exitCode = 1;
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
