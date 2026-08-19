INSERT INTO public.app_settings (setting_key, setting_value, description)
VALUES (
  'landing_header_button',
  '[{"id":"header-button-1","enabled":false,"label":"","url":""}]',
  'Configurable website buttons shown in the landing page top header'
)
ON CONFLICT (setting_key) DO NOTHING;
