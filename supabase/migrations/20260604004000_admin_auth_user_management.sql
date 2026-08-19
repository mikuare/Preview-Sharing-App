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

CREATE OR REPLACE FUNCTION public.set_admin_auth_user_ban(target_user_id uuid, should_ban boolean)
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

REVOKE ALL ON FUNCTION public.list_admin_auth_users() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_admin_auth_user_ban(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_admin_auth_users() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_admin_auth_user_ban(uuid, boolean) TO authenticated, service_role;
