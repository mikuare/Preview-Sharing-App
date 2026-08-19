-- Fix mutable search_path warning on trigger function
CREATE OR REPLACE FUNCTION public.update_user_credentials_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Move regular-user credential validation into the database so the client
-- no longer needs direct SELECT access to plaintext credentials.
CREATE OR REPLACE FUNCTION public.validate_user_credentials(input_username text, input_password text)
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

REVOKE ALL ON FUNCTION public.validate_user_credentials(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_user_credentials(text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.validate_user_credentials(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_user_credentials(text, text) TO service_role;

DROP POLICY IF EXISTS "Anyone can read user credentials" ON public.user_credentials;
CREATE POLICY "Authenticated users can read user credentials"
ON public.user_credentials
FOR SELECT
TO authenticated
USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Allow public insert reports" ON public.project_reports;
CREATE POLICY "Allow public insert reports"
ON public.project_reports
FOR INSERT
TO anon, authenticated
WITH CHECK (
  project_id IS NOT NULL
  AND NULLIF(BTRIM(category), '') IS NOT NULL
  AND category = ANY (ARRAY['For demobilize', 'Suspend', 'Cancelled', 'Implemented'])
  AND NULLIF(BTRIM(message), '') IS NOT NULL
  AND COALESCE(status, 'pending'::public.report_status) = 'pending'::public.report_status
  AND (
    reporter_email IS NULL
    OR reporter_email ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$'
  )
  AND COALESCE(array_length(proof_urls, 1), 0) <= 5
);

DROP POLICY IF EXISTS "allow_all_insert" ON public.projects;
CREATE POLICY "allow_all_insert"
ON public.projects
FOR INSERT
TO anon, authenticated
WITH CHECK (
  NULLIF(BTRIM(project_id), '') IS NOT NULL
  AND NULLIF(BTRIM(description), '') IS NOT NULL
  AND NULLIF(BTRIM(engineer_name), '') IS NOT NULL
  AND NULLIF(BTRIM(user_name), '') IS NOT NULL
  AND latitude BETWEEN -90 AND 90
  AND longitude BETWEEN -180 AND 180
);

DROP POLICY IF EXISTS "allow_authenticated_delete" ON public.projects;
CREATE POLICY "allow_authenticated_delete"
ON public.projects
FOR DELETE
TO authenticated
USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "allow_authenticated_update" ON public.projects;
CREATE POLICY "allow_authenticated_update"
ON public.projects
FOR UPDATE
TO authenticated
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);
