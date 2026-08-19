-- Store configurable project categories/statuses and allow custom project status values.

INSERT INTO public.app_settings (setting_key, setting_value, description)
VALUES
  (
    'project_categories',
    '[{"label":"Bridges","icon":"bridge"},{"label":"Buildings and Facilities","icon":"building"},{"label":"Flood Control and Drainage","icon":"waves"},{"label":"Roads","icon":"road"},{"label":"Septage and Sewerage Plants","icon":"droplets"},{"label":"Water Provision and Storage","icon":"droplet"}]',
    'Configurable project categories and icon names'
  ),
  (
    'project_statuses',
    '[{"value":"ongoing","label":"Ongoing"},{"value":"completed","label":"Completed"}]',
    'Configurable project statuses'
  )
ON CONFLICT (setting_key) DO NOTHING;

ALTER TABLE public.projects
  ALTER COLUMN status DROP DEFAULT;

ALTER TABLE public.projects
  ALTER COLUMN status TYPE text USING status::text;

ALTER TABLE public.projects
  ALTER COLUMN status SET DEFAULT 'ongoing';
