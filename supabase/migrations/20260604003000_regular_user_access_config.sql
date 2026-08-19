ALTER TABLE public.user_credentials
ADD COLUMN IF NOT EXISTS can_search_map boolean DEFAULT true NOT NULL,
ADD COLUMN IF NOT EXISTS can_pin_project boolean DEFAULT true NOT NULL,
ADD COLUMN IF NOT EXISTS can_enter_project_by_location boolean DEFAULT true NOT NULL,
ADD COLUMN IF NOT EXISTS can_input_project_details boolean DEFAULT true NOT NULL;

CREATE OR REPLACE FUNCTION private.validate_user_credentials_with_access(input_username text, input_password text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  credential_record public.user_credentials%ROWTYPE;
BEGIN
  SELECT *
  INTO credential_record
  FROM public.user_credentials
  WHERE username = input_username
    AND password = input_password
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false);
  END IF;

  RETURN jsonb_build_object(
    'valid', true,
    'username', credential_record.username,
    'permissions', jsonb_build_object(
      'canSearchMap', credential_record.can_search_map,
      'canPinProject', credential_record.can_pin_project,
      'canEnterProjectByLocation', credential_record.can_enter_project_by_location,
      'canInputProjectDetails', credential_record.can_input_project_details
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_user_credentials_with_access(input_username text, input_password text)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = private, pg_temp
AS $$
  SELECT private.validate_user_credentials_with_access(input_username, input_password);
$$;

REVOKE ALL ON FUNCTION public.validate_user_credentials_with_access(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.validate_user_credentials_with_access(text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.validate_user_credentials_with_access(text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.validate_user_credentials_with_access(text, text) TO service_role;

REVOKE ALL ON FUNCTION private.validate_user_credentials_with_access(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.validate_user_credentials_with_access(text, text) TO anon, service_role;
