-- 0013 — dashboard_global: scope the Admin general dashboard to one edificio by default.
--
-- Contexto: el dashboard general de Admin (/dashboard) mostraba datos GLOBALES (todas las
-- torres) a los 21 usuarios Admin existentes. Decisión de producto: solo los Admin con
-- dashboard_global = true conservan la vista global; el resto ve el MISMO dashboard pero
-- acotado a su propio edificio (usuarios.edificio_id). Los dos usuarios que conservan la
-- vista global se marcan por flag de DB (no hardcodeados en código).
alter table usuarios add column if not exists dashboard_global boolean not null default false;

comment on column usuarios.dashboard_global is
  'Admin cuyo /dashboard muestra TODAS las torres en vez de acotarse a edificios_dash.';

-- Ampliación: un Admin scopeado ahora puede ver VARIAS torres (no solo edificio_id). Lista de
-- nombres separada por ';' (mismo patrón que emails_notificacion.emails), ej: "Downtown;Huergo".
alter table usuarios add column if not exists edificios_dash text;

comment on column usuarios.edificios_dash is
  'Torres (edificios.nombre) separadas por '';'' que ve un Admin no-global en /dashboard. Vacío = no ve datos.';

-- Re-crear usuario_crear/usuario_actualizar para que el ABM pueda escribir dashboard_global
-- (usuarios es SELECT-only para authenticated; toda escritura pasa por estas RPC DEFINER).
CREATE OR REPLACE FUNCTION usuario_crear(p_payload jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id bigint;
BEGIN
  INSERT INTO usuarios (
    nombre, apellido, concat_name, usuario_app, dni, fecha_nac, mail, num_cel,
    edificio_id, edificio_default, pais, dashboard_global, edificios_dash, perfil, validado, wapp_default, mnt_global,
    aplicacion, es_testing, activo, legacy_id_usr, updated_at
  ) VALUES (
    p_payload->>'nombre', p_payload->>'apellido', p_payload->>'concat_name', p_payload->>'usuario_app',
    (p_payload->>'dni')::numeric, (p_payload->>'fecha_nac')::date, p_payload->>'mail', p_payload->>'num_cel',
    (p_payload->>'edificio_id')::bigint, p_payload->>'edificio_default', p_payload->>'pais',
    coalesce((p_payload->>'dashboard_global')::boolean, false), p_payload->>'edificios_dash', (p_payload->>'perfil')::perfil_usuario,
    (p_payload->>'validado')::boolean, p_payload->>'wapp_default', p_payload->>'mnt_global',
    p_payload->>'aplicacion', (p_payload->>'es_testing')::boolean, coalesce((p_payload->>'activo')::boolean, true),
    (p_payload->>'legacy_id_usr')::numeric, now()
  ) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION usuario_actualizar(p_id bigint, p_patch jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE usuarios SET
    nombre           = CASE WHEN p_patch ? 'nombre'           THEN p_patch->>'nombre'                   ELSE nombre END,
    apellido         = CASE WHEN p_patch ? 'apellido'         THEN p_patch->>'apellido'                 ELSE apellido END,
    concat_name      = CASE WHEN p_patch ? 'concat_name'      THEN p_patch->>'concat_name'              ELSE concat_name END,
    usuario_app      = CASE WHEN p_patch ? 'usuario_app'      THEN p_patch->>'usuario_app'              ELSE usuario_app END,
    dni              = CASE WHEN p_patch ? 'dni'              THEN (p_patch->>'dni')::numeric           ELSE dni END,
    fecha_nac        = CASE WHEN p_patch ? 'fecha_nac'        THEN (p_patch->>'fecha_nac')::date        ELSE fecha_nac END,
    mail             = CASE WHEN p_patch ? 'mail'             THEN p_patch->>'mail'                     ELSE mail END,
    num_cel          = CASE WHEN p_patch ? 'num_cel'          THEN p_patch->>'num_cel'                  ELSE num_cel END,
    edificio_id      = CASE WHEN p_patch ? 'edificio_id'      THEN (p_patch->>'edificio_id')::bigint    ELSE edificio_id END,
    edificio_default = CASE WHEN p_patch ? 'edificio_default' THEN p_patch->>'edificio_default'         ELSE edificio_default END,
    pais             = CASE WHEN p_patch ? 'pais'             THEN p_patch->>'pais'                     ELSE pais END,
    dashboard_global = CASE WHEN p_patch ? 'dashboard_global' THEN (p_patch->>'dashboard_global')::boolean ELSE dashboard_global END,
    edificios_dash   = CASE WHEN p_patch ? 'edificios_dash'   THEN p_patch->>'edificios_dash'             ELSE edificios_dash END,
    perfil           = CASE WHEN p_patch ? 'perfil'           THEN (p_patch->>'perfil')::perfil_usuario ELSE perfil END,
    validado         = CASE WHEN p_patch ? 'validado'         THEN (p_patch->>'validado')::boolean      ELSE validado END,
    wapp_default     = CASE WHEN p_patch ? 'wapp_default'     THEN p_patch->>'wapp_default'             ELSE wapp_default END,
    mnt_global       = CASE WHEN p_patch ? 'mnt_global'       THEN p_patch->>'mnt_global'               ELSE mnt_global END,
    aplicacion       = CASE WHEN p_patch ? 'aplicacion'       THEN p_patch->>'aplicacion'               ELSE aplicacion END,
    es_testing       = CASE WHEN p_patch ? 'es_testing'       THEN (p_patch->>'es_testing')::boolean    ELSE es_testing END,
    activo           = CASE WHEN p_patch ? 'activo'           THEN (p_patch->>'activo')::boolean        ELSE activo END,
    legacy_id_usr    = CASE WHEN p_patch ? 'legacy_id_usr'    THEN (p_patch->>'legacy_id_usr')::numeric ELSE legacy_id_usr END,
    updated_at       = now()
  WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Usuario % no encontrado.', p_id;
  END IF;
  RETURN p_id;
END;
$$;
