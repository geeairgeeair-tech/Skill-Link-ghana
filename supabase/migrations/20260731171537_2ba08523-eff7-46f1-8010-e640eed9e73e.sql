-- 1) Prevent role escalation at signup: never trust client-supplied role metadata for admin
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  requested text;
  safe_role public.app_role;
BEGIN
  INSERT INTO public.profiles (id, full_name, phone)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name',''), NEW.raw_user_meta_data->>'phone')
  ON CONFLICT (id) DO NOTHING;

  requested := lower(coalesce(NEW.raw_user_meta_data->>'role',''));
  -- Only self-service roles are allowed here. 'admin' can never be self-granted.
  safe_role := CASE WHEN requested = 'worker' THEN 'worker'::public.app_role
                    ELSE 'customer'::public.app_role END;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, safe_role)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END $function$;

-- 2) Revoke anon EXECUTE on SECURITY DEFINER functions that are not meant for signed-out callers
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND p.proname NOT IN ('get_worker_public_status','list_busy_workers')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon, public', r.sig);
  END LOOP;
END $$;

-- Trigger functions must not be directly callable by app roles either
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND pg_get_function_result(p.oid) = 'trigger'
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated', r.sig);
  END LOOP;
END $$;

-- Keep the two public availability helpers callable by anonymous visitors (browse page)
GRANT EXECUTE ON FUNCTION public.get_worker_public_status(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_busy_workers() TO anon, authenticated;