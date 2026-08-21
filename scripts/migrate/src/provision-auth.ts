// Backfill de cuentas auth.users para los usuarios ya migrados, para que puedan loguear.
// Uso: desde scripts/migrate/ correr `npm run provision-auth` (o `--dry-run` para simular).
//
// Regla (misma que la Edge Function `user-provision` y el ABM):
//   - email de login = alias sintético `usuario_app@users.toprentals.internal`
//   - contraseña     = ddmm de fecha_nac
//   - usuarios SIN fecha_nac se SALTEAN (no se puede derivar la contraseña) — se provisionan
//     cuando un Admin los edite y les cargue la fecha.
//
// Idempotente: si el usuario ya tiene auth_user_id, actualiza email+password; si no, crea la cuenta
// y setea usuarios.auth_user_id.
import { config } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const here = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(here, '../../../.env') });
config();

const DRY_RUN = process.argv.includes('--dry-run');

const ALIAS_DOMAIN = 'users.toprentals.internal';
const aliasFor = (usuarioApp: string): string =>
  `${usuarioApp.normalize('NFKD').toLowerCase().replace(/[^a-z0-9._-]/g, '')}@${ALIAS_DOMAIN}`;

/** ddmm de una fecha ISO "YYYY-MM-DD". Devuelve null si no matchea. */
function passwordFromFechaNac(fechaNac: string | null): string | null {
  if (!fechaNac) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(fechaNac);
  return m ? `${m[3]}${m[2]}` : null;
}

function requireEnv(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Falta la variable de entorno ${name} (ver env.example / .env en la raíz).`);
  return v;
}

interface UsuarioRow {
  id: number;
  usuario_app: string;
  fecha_nac: string | null;
  auth_user_id: string | null;
  activo: boolean;
}

async function main(): Promise<void> {
  const sb = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await sb
    .from('usuarios')
    .select('id, usuario_app, fecha_nac, auth_user_id, activo')
    .eq('activo', true);
  if (error) throw error;
  const usuarios = (data ?? []) as UsuarioRow[];

  let creados = 0;
  let actualizados = 0;
  const saltados: string[] = [];
  const errores: string[] = [];

  for (const u of usuarios) {
    const password = passwordFromFechaNac(u.fecha_nac);
    if (!password) {
      saltados.push(`${u.usuario_app} (sin fecha_nac)`);
      continue;
    }
    const email = aliasFor(u.usuario_app);
    if (DRY_RUN) {
      console.log(`[dry-run] ${u.auth_user_id ? 'update' : 'create'} ${email} (pass ${password})`);
      u.auth_user_id ? actualizados++ : creados++;
      continue;
    }
    try {
      if (u.auth_user_id) {
        const { error: upErr } = await sb.auth.admin.updateUserById(u.auth_user_id, { email, password, email_confirm: true });
        if (upErr) throw upErr;
        actualizados++;
      } else {
        const { data: created, error: cErr } = await sb.auth.admin.createUser({ email, password, email_confirm: true });
        if (cErr || !created.user) throw cErr ?? new Error('createUser devolvió vacío');
        const { error: linkErr } = await sb.from('usuarios').update({ auth_user_id: created.user.id }).eq('id', u.id);
        if (linkErr) throw linkErr;
        creados++;
      }
    } catch (e) {
      errores.push(`${u.usuario_app}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  console.log('\n=== Backfill de auth ===');
  console.log(`Creados:      ${creados}`);
  console.log(`Actualizados: ${actualizados}`);
  console.log(`Salteados (sin fecha_nac): ${saltados.length}`);
  if (saltados.length) console.log('  ' + saltados.join('\n  '));
  if (errores.length) {
    console.log(`Errores: ${errores.length}`);
    console.log('  ' + errores.join('\n  '));
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
