-- helper: is this user a super admin?
CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'super_admin'::app_role
  )
$$;

REVOKE EXECUTE ON FUNCTION public.is_super_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_super_admin(uuid) TO authenticated, service_role;

-- promote the founder admin, keeping the existing admin row intact
INSERT INTO public.user_roles (user_id, role)
SELECT '449bb1d4-762a-4c66-8976-d1bd3897d474'::uuid, 'super_admin'::app_role
WHERE NOT EXISTS (
  SELECT 1 FROM public.user_roles
  WHERE user_id = '449bb1d4-762a-4c66-8976-d1bd3897d474'::uuid AND role = 'super_admin'::app_role
);

-- RLS: only super admins may write role rows
DROP POLICY IF EXISTS "Admins insert roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins update roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins delete roles" ON public.user_roles;

CREATE POLICY "Super admins insert roles" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins update roles" ON public.user_roles
  FOR UPDATE TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins delete roles" ON public.user_roles
  FOR DELETE TO authenticated
  USING (public.is_super_admin(auth.uid()));

-- Defense in depth: trigger guard that also applies to SECURITY DEFINER paths
CREATE OR REPLACE FUNCTION public.guard_privileged_role_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  touched public.app_role;
  actor uuid := auth.uid();
  remaining int;
BEGIN
  touched := COALESCE(NEW.role, OLD.role);

  -- only guard the privileged tiers
  IF touched IN ('admin'::app_role, 'super_admin'::app_role)
     OR (TG_OP = 'UPDATE' AND OLD.role IN ('admin'::app_role, 'super_admin'::app_role)) THEN
    -- actor is NULL for service_role / migrations / system jobs
    IF actor IS NOT NULL AND NOT public.is_super_admin(actor) THEN
      RAISE EXCEPTION 'Only a super admin can manage administrator roles';
    END IF;
  END IF;

  -- never allow the last super admin to disappear
  IF (TG_OP = 'DELETE' AND OLD.role = 'super_admin'::app_role)
     OR (TG_OP = 'UPDATE' AND OLD.role = 'super_admin'::app_role AND NEW.role <> 'super_admin'::app_role) THEN
    SELECT count(*) INTO remaining
    FROM public.user_roles
    WHERE role = 'super_admin'::app_role AND id <> OLD.id;
    IF remaining = 0 THEN
      RAISE EXCEPTION 'Cannot remove the last super admin';
    END IF;
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.guard_privileged_role_changes() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_privileged_role_changes ON public.user_roles;
CREATE TRIGGER guard_privileged_role_changes
  BEFORE INSERT OR UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.guard_privileged_role_changes();