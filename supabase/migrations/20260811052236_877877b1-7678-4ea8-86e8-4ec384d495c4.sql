-- Backfill: every user with a worker profile or a profession must hold the 'worker' role
INSERT INTO public.user_roles (user_id, role)
SELECT DISTINCT wp.user_id, 'worker'::app_role FROM public.worker_profiles wp
ON CONFLICT (user_id, role) DO NOTHING;

INSERT INTO public.user_roles (user_id, role)
SELECT DISTINCT wpr.user_id, 'worker'::app_role FROM public.worker_professions wpr
ON CONFLICT (user_id, role) DO NOTHING;

-- Keep it true going forward
CREATE OR REPLACE FUNCTION public.grant_worker_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.user_id, 'worker'::app_role)
  ON CONFLICT (user_id, role) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS grant_worker_role_on_profile ON public.worker_profiles;
CREATE TRIGGER grant_worker_role_on_profile
AFTER INSERT ON public.worker_profiles
FOR EACH ROW EXECUTE FUNCTION public.grant_worker_role();

DROP TRIGGER IF EXISTS grant_worker_role_on_profession ON public.worker_professions;
CREATE TRIGGER grant_worker_role_on_profession
AFTER INSERT ON public.worker_professions
FOR EACH ROW EXECUTE FUNCTION public.grant_worker_role();