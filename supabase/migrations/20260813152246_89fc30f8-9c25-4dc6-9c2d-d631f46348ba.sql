CREATE OR REPLACE FUNCTION public.admin_log_action(
  _action text,
  _target_type text DEFAULT NULL,
  _target_user_id uuid DEFAULT NULL,
  _details jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
  IF _action IS NULL OR length(trim(_action)) = 0 OR length(_action) > 100 THEN
    RAISE EXCEPTION 'Invalid action';
  END IF;

  INSERT INTO public.admin_audit_logs (admin_id, action, target_type, target_user_id, details)
  VALUES (auth.uid(), _action, _target_type, _target_user_id, COALESCE(_details, '{}'::jsonb))
  RETURNING id INTO _id;

  RETURN _id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_log_action(text, text, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_log_action(text, text, uuid, jsonb) TO authenticated, service_role;

-- No direct client INSERT anymore; writes go through SECURITY DEFINER paths only
DROP POLICY IF EXISTS "Admins insert audit logs" ON public.admin_audit_logs;
REVOKE INSERT ON public.admin_audit_logs FROM authenticated;

-- Explicit read access for super admins (in addition to existing admin read policy)
DROP POLICY IF EXISTS "Super admins read audit logs" ON public.admin_audit_logs;
CREATE POLICY "Super admins read audit logs" ON public.admin_audit_logs
  FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()));