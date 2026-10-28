-- 0012 — Contraseña real migrada desde SharePoint (00.Usuarios field_8).
--
-- Contexto: el esquema original derivaba la contraseña del ddmm de la fecha de nacimiento,
-- pero (a) field_5 en SharePoint es solo día/mes (sin año) y quedó sin migrar, y (b) la
-- contraseña real está en field_8 y NO siempre es ddmm (Admin tiene una custom). Guardamos
-- la contraseña real acá para provisionar auth y mostrarla en el ABM (decisión de producto:
-- las contraseñas son visibles para el admin, igual que en la Power App original).
--
-- La escribe el backfill con service-role (scripts/migrate/src/backfill-passwords-sp.ts).
-- usuarios sigue SELECT-only para authenticated (RLS 0002), así el ABM la puede leer.
alter table usuarios add column if not exists password_seed text;

comment on column usuarios.password_seed is
  'Contraseña real migrada de SharePoint 00.Usuarios (field_8). Puede no ser ddmm.';
