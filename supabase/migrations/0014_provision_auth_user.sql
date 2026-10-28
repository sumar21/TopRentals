-- 0014 — provision_auth_user: provisiona la cuenta auth.users de un usuario del ABM ESQUIVANDO
-- el mínimo de password de GoTrue.
--
-- Contexto (2026-09-19): GoTrue empezó a enforzar "Password should be at least 6 characters" también
-- en la admin API (POST /admin/users). Las contraseñas de TopRentals son ddmm de 4 dígitos (paridad
-- con la Power App), así que `auth.admin.createUser` / `updateUserById` ahora fallan con 422 → ningún
-- alta ni edición de usuario puede provisionar la cuenta. El dashboard no deja bajar el mínimo de 6.
--
-- Solución: escribir el hash bcrypt directo en auth.users. La validación de largo corre al SETEAR la
-- contraseña por la API; el login (signInWithPassword) solo compara bcrypt y NO valida largo. Insertamos
-- la cuenta con la MISMA forma que produce GoTrue (verificado contra una cuenta real que loguea OK):
--   auth.users:      aud/role='authenticated', instance_id=0, email_confirmed_at=now(),
--                    raw_app_meta_data={"provider":"email","providers":["email"]}, tokens='' (no NULL),
--                    encrypted_password = crypt(pass, gen_salt('bf')).
--   auth.identities: provider='email', provider_id=<uid>, identity_data={sub,email,email_verified,phone_verified}.
--
-- Reemplaza a la Edge Function `user-provision` (que quedó inservible por el 422). El adapter llama esta
-- RPC directo (services/supabase/adapter.ts: usuarios.crear/actualizar).
--
-- Aplicar: correr este archivo en el SQL Editor de Supabase.

CREATE OR REPLACE FUNCTION provision_auth_user(
  p_usuario_id bigint, p_email text, p_password text, p_usuario_app text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
BEGIN
  -- Authz: un Admin autenticado, o un contexto sin JWT (SQL Editor / service role → auth.uid() NULL).
  -- Cierra el gap que la Edge Function dejaba abierto (invocable por cualquier autenticado).
  IF auth.uid() IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM usuarios WHERE auth_user_id = auth.uid() AND perfil = 'Admin' AND activo) THEN
    RAISE EXCEPTION 'No autorizado para provisionar cuentas.';
  END IF;

  SELECT auth_user_id INTO v_uid FROM usuarios WHERE id = p_usuario_id;

  IF v_uid IS NOT NULL THEN
    -- Ya tiene cuenta → re-setea email + password (hash directo, saltea el mínimo de GoTrue).
    UPDATE auth.users
      SET email = p_email,
          encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')),
          email_confirmed_at = COALESCE(email_confirmed_at, now()),
          updated_at = now()
    WHERE id = v_uid;
    RETURN v_uid;
  END IF;

  -- Alta: crea la cuenta con la forma exacta que genera GoTrue.
  v_uid := gen_random_uuid();
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change, email_change_token_new, reauthentication_token,
    is_sso_user, is_anonymous
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated', p_email,
    extensions.crypt(p_password, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('usuario_id', p_usuario_id::text, 'usuario_app', p_usuario_app, 'email_verified', true),
    now(), now(), '', '', '', '', '', false, false
  );
  INSERT INTO auth.identities (
    provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
  ) VALUES (
    v_uid::text, v_uid,
    jsonb_build_object('sub', v_uid::text, 'email', p_email, 'email_verified', false, 'phone_verified', false),
    'email', now(), now(), now()
  );
  UPDATE usuarios SET auth_user_id = v_uid WHERE id = p_usuario_id;
  RETURN v_uid;
END;
$$;

REVOKE ALL ON FUNCTION provision_auth_user(bigint, text, text, text) FROM public;
REVOKE ALL ON FUNCTION provision_auth_user(bigint, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION provision_auth_user(bigint, text, text, text) TO authenticated;
