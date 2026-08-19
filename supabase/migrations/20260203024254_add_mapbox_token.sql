-- Insert default Mapbox token setting
INSERT INTO public.app_settings (setting_key, setting_value, description)
VALUES ('mapbox_token', '', 'Mapbox public access token for map rendering')
ON CONFLICT (setting_key) DO NOTHING;
