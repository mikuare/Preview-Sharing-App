-- Keep the existing public RPC API stable while moving the privileged table
-- read out of the exposed public schema. The public wrapper is SECURITY INVOKER,
-- so Supabase's exposed API roles no longer execute a SECURITY DEFINER function
-- through /rest/v1/rpc/validate_user_credentials.

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;

CREATE OR REPLACE FUNCTION private.validate_user_credentials(input_username text, input_password text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  stored_password text;
BEGIN
  SELECT password
  INTO stored_password
  FROM public.user_credentials
  WHERE username = input_username;

  RETURN stored_password IS NOT NULL AND stored_password = input_password;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_user_credentials(input_username text, input_password text)
RETURNS boolean
LANGUAGE sql
SECURITY INVOKER
SET search_path = public, private
AS $$
  SELECT private.validate_user_credentials(input_username, input_password);
$$;

REVOKE ALL ON FUNCTION public.validate_user_credentials(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.validate_user_credentials(text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.validate_user_credentials(text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.validate_user_credentials(text, text) TO service_role;

REVOKE ALL ON FUNCTION private.validate_user_credentials(text, text) FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO anon, service_role;
GRANT EXECUTE ON FUNCTION private.validate_user_credentials(text, text) TO anon, service_role;
