
ALTER TABLE public.worker_profiles ADD COLUMN IF NOT EXISTS date_of_birth date;

CREATE OR REPLACE FUNCTION public.validate_worker_dob()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.date_of_birth IS NOT NULL THEN
    IF NEW.date_of_birth > CURRENT_DATE THEN
      RAISE EXCEPTION 'Date of birth cannot be in the future';
    END IF;
    IF NEW.date_of_birth < DATE '1900-01-01' THEN
      RAISE EXCEPTION 'Date of birth is not valid';
    END IF;
    IF NEW.date_of_birth > (CURRENT_DATE - INTERVAL '18 years')::date THEN
      RAISE EXCEPTION 'Workers must be at least 18 years old';
    END IF;
  END IF;
  IF NEW.verification_status IN ('pending','approved') AND NEW.date_of_birth IS NULL THEN
    RAISE EXCEPTION 'Date of birth is required before verification';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_validate_worker_dob ON public.worker_profiles;
CREATE TRIGGER trg_validate_worker_dob
  BEFORE INSERT OR UPDATE ON public.worker_profiles
  FOR EACH ROW EXECUTE FUNCTION public.validate_worker_dob();

DROP FUNCTION IF EXISTS public.get_worker_identity(uuid);
CREATE FUNCTION public.get_worker_identity(_user_id uuid)
RETURNS TABLE(ghana_card_number text, ghana_card_url text, selfie_url text, date_of_birth date)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT ghana_card_number, ghana_card_url, selfie_url, date_of_birth
  FROM public.worker_profiles
  WHERE user_id = _user_id
    AND (auth.uid() = _user_id OR public.has_role(auth.uid(), 'admin'));
$$;
REVOKE EXECUTE ON FUNCTION public.get_worker_identity(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_worker_identity(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_user_email(_user_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT u.email::text FROM auth.users u
  WHERE u.id = _user_id
    AND (auth.uid() = _user_id OR public.has_role(auth.uid(), 'admin'));
$$;
REVOKE EXECUTE ON FUNCTION public.get_user_email(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_user_email(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_list_users()
RETURNS TABLE(
  user_id uuid, full_name text, email text, phone text,
  roles text[], created_at timestamptz,
  verification_status text, is_suspended boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    p.id, p.full_name, u.email::text, p.phone,
    COALESCE((SELECT array_agg(r.role::text) FROM public.user_roles r WHERE r.user_id = p.id), ARRAY[]::text[]),
    p.created_at,
    wp.verification_status::text,
    (wp.verification_status = 'rejected')
  FROM public.profiles p
  LEFT JOIN auth.users u ON u.id = p.id
  LEFT JOIN public.worker_profiles wp ON wp.user_id = p.id
  WHERE public.has_role(auth.uid(), 'admin')
  ORDER BY p.created_at DESC;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_list_users() FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_list_users() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_list_workers(_status text DEFAULT NULL)
RETURNS TABLE(
  user_id uuid, full_name text, email text, phone text,
  date_of_birth date, age integer,
  category_name text, service_area text, city text,
  years_experience integer, verification_status text,
  is_available boolean, subscription_expires_at timestamptz,
  jobs_completed integer, rating numeric, reviews_count integer,
  avatar_url text, created_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    wp.user_id, p.full_name, u.email::text, p.phone,
    wp.date_of_birth,
    CASE WHEN wp.date_of_birth IS NULL THEN NULL
         ELSE EXTRACT(YEAR FROM age(wp.date_of_birth))::integer END,
    c.name, wp.service_area, wp.city,
    wp.years_experience, wp.verification_status::text,
    wp.is_available, wp.subscription_expires_at,
    wp.jobs_completed, wp.rating, wp.reviews_count,
    p.avatar_url, wp.created_at
  FROM public.worker_profiles wp
  LEFT JOIN public.profiles p ON p.id = wp.user_id
  LEFT JOIN auth.users u ON u.id = wp.user_id
  LEFT JOIN public.categories c ON c.id = wp.category_id
  WHERE public.has_role(auth.uid(), 'admin')
    AND (_status IS NULL OR wp.verification_status::text = _status)
  ORDER BY wp.created_at DESC;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_list_workers(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_list_workers(text) TO authenticated;

CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action text NOT NULL,
  target_user_id uuid,
  target_type text,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.admin_audit_logs TO authenticated;
GRANT ALL ON public.admin_audit_logs TO service_role;
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read audit logs" ON public.admin_audit_logs;
CREATE POLICY "Admins read audit logs" ON public.admin_audit_logs
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Admins insert audit logs" ON public.admin_audit_logs;
CREATE POLICY "Admins insert audit logs" ON public.admin_audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') AND admin_id = auth.uid());
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created ON public.admin_audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_target ON public.admin_audit_logs (target_user_id);
