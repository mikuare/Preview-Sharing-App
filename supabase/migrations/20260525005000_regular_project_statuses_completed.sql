-- Regular map users should only choose Ongoing or Completed.
-- The admin implementation tracker keeps its own Implemented status in
-- project_implementations and should not expose that as a public project status.
UPDATE public.app_settings
SET setting_value = '[{"value":"ongoing","label":"Ongoing"},{"value":"completed","label":"Completed"}]',
    description = 'Configurable project statuses for the regular project map',
    updated_at = now()
WHERE setting_key = 'project_statuses';
