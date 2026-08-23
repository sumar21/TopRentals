// Contraseñas de la app = ddmm (4 dígitos, igual que la Power App vieja). Supabase Auth exige un
// mínimo de 6 caracteres y ese piso NO se puede bajar, así que para conservar la UX de 4 dígitos se
// rellena hasta 6 con un sufijo FIJO. El sufijo NO es secreto (viaja en el bundle): sólo satisface el
// requisito de longitud; la fuerza real de la contraseña sigue siendo el código de 4 dígitos.
//
// DEBE aplicarse EXACTAMENTE igual en los dos extremos que tienen que coincidir: el login
// (services/supabase/adapter.ts) y el alta/edición que provisiona la cuenta (UsuariosPanel → Edge
// Function user-provision). Es un no-op para cualquier contraseña que ya tenga 6+ (seeds migrados,
// ddmmaa de usuarios viejos), así que no rompe las cuentas existentes.
export const AUTH_PAD_SUFFIX = 'tr';

export function authPassword(raw: string): string {
  return raw.length >= 6 ? raw : (raw + AUTH_PAD_SUFFIX).padEnd(6, '0');
}
