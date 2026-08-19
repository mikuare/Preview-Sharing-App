ALTER TABLE public.projects
ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS created_by_email text,
ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS updated_by_email text;

CREATE TABLE IF NOT EXISTS public.project_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  action text NOT NULL,
  changed_by uuid REFERENCES auth.users(id),
  changed_by_email text,
  changed_by_name text,
  changed_at timestamp with time zone DEFAULT now() NOT NULL,
  changes jsonb
);

CREATE INDEX IF NOT EXISTS idx_project_audit_logs_project_id_changed_at
ON public.project_audit_logs(project_id, changed_at DESC);

ALTER TABLE public.project_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view project audit logs"
ON public.project_audit_logs
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can insert project audit logs"
ON public.project_audit_logs
FOR INSERT
TO authenticated
WITH CHECK (true);
