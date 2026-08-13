REVOKE EXECUTE ON FUNCTION public.get_booking_address(uuid) FROM anon, PUBLIC;

REVOKE EXECUTE ON FUNCTION public.customer_update_job_request(uuid, text, text, uuid, integer, text, timestamptz, text, text, text, text, text, text, text, jsonb) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.customer_update_job_request(uuid, text, text, uuid, integer, text, timestamptz, text, text, text, text, text, text, text, jsonb) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.sync_display_name_from_identity() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.grant_worker_role() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.bump_jobs_completed() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.guard_booking_worker_updates() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.lock_profile_identity() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.touch_updated_at() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.validate_new_booking_fields() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.validate_profile_age() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.validate_worker_dob() FROM anon, PUBLIC;