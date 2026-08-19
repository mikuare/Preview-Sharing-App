CREATE TABLE IF NOT EXISTS public.project_photo_metadata (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  photo_url text NOT NULL,
  component_id text,
  purpose text DEFAULT 'attachment',
  date_captured date,
  location text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  updated_by uuid,
  UNIQUE (project_id, photo_url)
);

ALTER TABLE public.project_photo_metadata ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Photo metadata is publicly readable"
ON public.project_photo_metadata
FOR SELECT
USING (true);

CREATE POLICY "Authenticated users can manage photo metadata"
ON public.project_photo_metadata
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);
