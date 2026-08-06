ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text,
  ADD COLUMN IF NOT EXISTS date_of_birth date,
  ADD COLUMN IF NOT EXISTS gender text;

-- Deliberately NO column-level SELECT grant for anon/authenticated on these
-- columns: they are private and only reachable through security-definer RPCs.
GRANT UPDATE (first_name, last_name, date_of_birth, gender) ON public.profiles TO authenticated;

CREATE OR REPLACE FUNCTION public.validate_profile_age()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.date_of_birth IS NOT NULL
     AND NEW.date_of_birth > (CURRENT_DATE - INTERVAL '18 years') THEN
    RAISE EXCEPTION 'You must be at least 18 years old to use Skill Link.';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_validate_profile_age ON public.profiles;
CREATE TRIGGER trg_validate_profile_age
BEFORE INSERT OR UPDATE OF date_of_birth ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.validate_profile_age();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  requested text;
  safe_role public.app_role;
  fn text;
  ln text;
  dob date;
BEGIN
  fn := NULLIF(trim(COALESCE(NEW.raw_user_meta_data->>'first_name','')), '');
  ln := NULLIF(trim(COALESCE(NEW.raw_user_meta_data->>'last_name','')), '');
  BEGIN
    dob := NULLIF(NEW.raw_user_meta_data->>'date_of_birth','')::date;
  EXCEPTION WHEN others THEN
    dob := NULL;
  END;

  INSERT INTO public.profiles (id, full_name, phone, first_name, last_name, date_of_birth, gender)
  VALUES (
    NEW.id,
    COALESCE(NULLIF(trim(COALESCE(fn,'') || ' ' || COALESCE(ln,'')), ''), NEW.raw_user_meta_data->>'full_name', ''),
    NEW.raw_user_meta_data->>'phone',
    fn, ln, dob,
    NULLIF(NEW.raw_user_meta_data->>'gender','')
  )
  ON CONFLICT (id) DO NOTHING;

  requested := lower(coalesce(NEW.raw_user_meta_data->>'role',''));
  safe_role := CASE WHEN requested = 'worker' THEN 'worker'::public.app_role
                    ELSE 'customer'::public.app_role END;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, safe_role)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END $function$;

-- Private read path: owner or admin only.
CREATE OR REPLACE FUNCTION public.get_profile_identity(_id uuid DEFAULT auth.uid())
RETURNS TABLE(first_name text, last_name text, date_of_birth date, gender text, phone text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT p.first_name, p.last_name, p.date_of_birth, p.gender, p.phone
  FROM public.profiles p
  WHERE p.id = _id
    AND (auth.uid() = _id OR public.has_role(auth.uid(), 'admin'));
$$;

REVOKE ALL ON FUNCTION public.get_profile_identity(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_profile_identity(uuid) TO authenticated;