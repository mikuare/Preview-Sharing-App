-- The regular-user login flow calls this RPC before Supabase Auth sign-in, so
-- anon EXECUTE is required for the current app behavior. Authenticated users do
-- not need to call it directly.
REVOKE ALL ON FUNCTION public.validate_user_credentials(text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.validate_user_credentials(text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.validate_user_credentials(text, text) TO service_role;
