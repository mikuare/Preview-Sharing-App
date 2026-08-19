ALTER TABLE public.projects
ADD COLUMN IF NOT EXISTS created_user_type text,
ADD COLUMN IF NOT EXISTS created_regular_username text;

ALTER TABLE public.project_audit_logs
ADD COLUMN IF NOT EXISTS regular_username text;

CREATE POLICY "Anyone can insert project creation audit logs"
ON public.project_audit_logs
FOR INSERT
TO anon
WITH CHECK (action = 'created' AND changed_by IS NULL AND regular_username IS NOT NULL);
