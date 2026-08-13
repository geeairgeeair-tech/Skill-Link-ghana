-- 1) Internal trigger/maintenance routines must not be directly callable by app users.
REVOKE ALL ON FUNCTION public.bump_jobs_completed() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.grant_worker_role() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_booking_worker_updates() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.lock_profile_identity() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_display_name_from_identity() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_new_booking_fields() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_profile_age() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_worker_dob() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.send_document_expiry_reminders() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.send_awaiting_confirmation_reminders() FROM PUBLIC, anon, authenticated;

-- 2) Anonymous callers have no business touching these admin-facing tables at all.
REVOKE ALL ON TABLE public.admin_audit_logs FROM anon;
REVOKE ALL ON TABLE public.user_roles FROM anon;
REVOKE ALL ON TABLE public.platform_settings FROM anon;

-- 3) Keep only the privileges the app actually needs on these tables.
REVOKE ALL ON TABLE public.user_roles FROM authenticated;
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

REVOKE ALL ON TABLE public.admin_audit_logs FROM authenticated;
GRANT SELECT, INSERT ON public.admin_audit_logs TO authenticated;
GRANT ALL ON public.admin_audit_logs TO service_role;

REVOKE ALL ON TABLE public.platform_settings FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_settings TO authenticated;
GRANT ALL ON public.platform_settings TO service_role;