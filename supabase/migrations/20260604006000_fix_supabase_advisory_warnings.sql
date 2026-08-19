-- Tighten broad RLS write policies flagged by Supabase's database linter.
DROP POLICY IF EXISTS "Authenticated users can insert project audit logs"
ON public.project_audit_logs;
DROP POLICY IF EXISTS "Authenticated users can insert own project audit logs"
ON public.project_audit_logs;

CREATE POLICY "Authenticated users can insert own project audit logs"
ON public.project_audit_logs
FOR INSERT
TO authenticated
WITH CHECK (changed_by = auth.uid());

DROP POLICY IF EXISTS "Authenticated users can manage photo metadata"
ON public.project_photo_metadata;
DROP POLICY IF EXISTS "Authenticated users can insert photo metadata"
ON public.project_photo_metadata;
DROP POLICY IF EXISTS "Authenticated users can update photo metadata"
ON public.project_photo_metadata;
DROP POLICY IF EXISTS "Authenticated users can delete photo metadata"
ON public.project_photo_metadata;

CREATE POLICY "Authenticated users can insert photo metadata"
ON public.project_photo_metadata
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update photo metadata"
ON public.project_photo_metadata
FOR UPDATE
TO authenticated
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete photo metadata"
ON public.project_photo_metadata
FOR DELETE
TO authenticated
USING (auth.uid() IS NOT NULL);

-- Keep public RPC names stable, but make exposed public functions SECURITY
-- INVOKER wrappers around private SECURITY DEFINER implementations.
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.validate_user_credentials_with_access(input_username text, input_password text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  credential_record public.user_credentials%ROWTYPE;
BEGIN
  SELECT *
  INTO credential_record
  FROM public.user_credentials
  WHERE username = input_username
    AND password = input_password
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false);
  END IF;

  RETURN jsonb_build_object(
    'valid', true,
    'username', credential_record.username,
    'permissions', jsonb_build_object(
      'canSearchMap', credential_record.can_search_map,
      'canPinProject', credential_record.can_pin_project,
      'canEnterProjectByLocation', credential_record.can_enter_project_by_location,
      'canInputProjectDetails', credential_record.can_input_project_details
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_user_credentials_with_access(input_username text, input_password text)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = private, pg_temp
AS $$
  SELECT private.validate_user_credentials_with_access(input_username, input_password);
$$;

REVOKE ALL ON FUNCTION public.validate_user_credentials_with_access(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.validate_user_credentials_with_access(text, text) FROM anon;
REVOKE ALL ON FUNCTION public.validate_user_credentials_with_access(text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.validate_user_credentials_with_access(text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.validate_user_credentials_with_access(text, text) TO service_role;

REVOKE ALL ON FUNCTION private.validate_user_credentials_with_access(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.validate_user_credentials_with_access(text, text) TO anon, service_role;

CREATE OR REPLACE FUNCTION private.list_admin_auth_users()
RETURNS TABLE (
  id uuid,
  email text,
  full_name text,
  provider text,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  email_confirmed_at timestamptz,
  banned_until timestamptz,
  is_anonymous boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = auth, public, pg_temp
AS $$
  SELECT
    u.id,
    u.email,
    COALESCE(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name') AS full_name,
    COALESCE(u.raw_app_meta_data->>'provider', 'email') AS provider,
    u.created_at,
    u.last_sign_in_at,
    u.email_confirmed_at,
    u.banned_until,
    COALESCE(NULLIF(to_jsonb(u)->>'is_anonymous', '')::boolean, false) AS is_anonymous
  FROM auth.users u
  WHERE auth.uid() IS NOT NULL
  ORDER BY u.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.list_admin_auth_users()
RETURNS TABLE (
  id uuid,
  email text,
  full_name text,
  provider text,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  email_confirmed_at timestamptz,
  banned_until timestamptz,
  is_anonymous boolean
)
LANGUAGE sql
SECURITY INVOKER
SET search_path = private, pg_temp
AS $$
  SELECT * FROM private.list_admin_auth_users();
$$;

REVOKE ALL ON FUNCTION public.list_admin_auth_users() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_admin_auth_users() FROM anon;
REVOKE ALL ON FUNCTION public.list_admin_auth_users() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.list_admin_auth_users() TO authenticated, service_role;

REVOKE ALL ON FUNCTION private.list_admin_auth_users() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.list_admin_auth_users() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.set_admin_auth_user_ban(target_user_id uuid, should_ban boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot change the access status of your own signed-in admin account';
  END IF;

  UPDATE auth.users
  SET
    banned_until = CASE
      WHEN should_ban THEN now() + interval '100 years'
      ELSE NULL
    END,
    updated_at = now()
  WHERE id = target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Admin user not found';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_admin_auth_user_ban(target_user_id uuid, should_ban boolean)
RETURNS void
LANGUAGE sql
SECURITY INVOKER
SET search_path = private, pg_temp
AS $$
  SELECT private.set_admin_auth_user_ban(target_user_id, should_ban);
$$;

REVOKE ALL ON FUNCTION public.set_admin_auth_user_ban(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_admin_auth_user_ban(uuid, boolean) FROM anon;
REVOKE ALL ON FUNCTION public.set_admin_auth_user_ban(uuid, boolean) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.set_admin_auth_user_ban(uuid, boolean) TO authenticated, service_role;

REVOKE ALL ON FUNCTION private.set_admin_auth_user_ban(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.set_admin_auth_user_ban(uuid, boolean) TO authenticated, service_role;
