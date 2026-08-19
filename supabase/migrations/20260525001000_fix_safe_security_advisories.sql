-- Fix Supabase advisory warnings that can be resolved without changing app behavior.
--
-- Public buckets can still serve files through getPublicUrl() without a broad
-- storage.objects SELECT policy. Dropping these policies prevents clients from
-- listing every object in each bucket.
DROP POLICY IF EXISTS "Anyone can view project documents" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view project images" ON storage.objects;
DROP POLICY IF EXISTS "Public Access Proofs" ON storage.objects;

-- This trigger function only needs to run from table triggers. It does not need
-- SECURITY DEFINER or direct EXECUTE access from Supabase API roles.
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM anon;
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.update_updated_at_column() TO service_role;
