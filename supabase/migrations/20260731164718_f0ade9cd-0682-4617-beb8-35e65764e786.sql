-- 1. Remove unused SECURITY DEFINER view that bypassed RLS
DROP VIEW IF EXISTS public.workers_public;

-- 2. Column-level lockdown on worker_profiles (RLS rows unchanged)
REVOKE SELECT ON public.worker_profiles FROM anon, authenticated;
GRANT SELECT (
  user_id, category_id, bio, years_experience, city, service_area,
  hourly_rate, callout_fee, starting_price, portfolio_images,
  verification_status, subscription_plan, subscription_expires_at,
  rating, reviews_count, jobs_completed, is_featured, phone_verified,
  is_available, unavailable_note, created_at, updated_at
) ON public.worker_profiles TO anon, authenticated;
GRANT ALL ON public.worker_profiles TO service_role;

-- 3. Column-level lockdown on profiles (phone/address never readable directly)
REVOKE SELECT ON public.profiles FROM anon, authenticated;
GRANT SELECT (id, full_name, avatar_url, city, created_at, updated_at)
  ON public.profiles TO anon, authenticated;
GRANT ALL ON public.profiles TO service_role;

-- 4. Contact release only after a booking is actually accepted/confirmed
CREATE OR REPLACE FUNCTION public.get_profile_contact(_id uuid)
RETURNS TABLE(phone text, address text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT p.phone, p.address
  FROM public.profiles p
  WHERE p.id = _id
    AND (
      auth.uid() = _id
      OR public.has_role(auth.uid(), 'admin')
      OR EXISTS (
        SELECT 1 FROM public.bookings b
        WHERE ((b.customer_id = auth.uid() AND b.worker_id = _id)
            OR (b.worker_id = auth.uid() AND b.customer_id = _id))
          AND b.status::text NOT IN ('pending','declined','cancelled')
      )
    );
$$;

-- 5. Worker can read their own verification state (incl. internal notes)
CREATE OR REPLACE FUNCTION public.get_my_worker_verification()
RETURNS TABLE(
  verification_status text, rejection_reason text, rejected_at timestamptz,
  category_id uuid, is_available boolean,
  documents_expire_at date,
  documents_resubmission_requested_at timestamptz,
  documents_resubmission_reason text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT wp.verification_status::text, wp.rejection_reason, wp.rejected_at,
         wp.category_id, wp.is_available, wp.documents_expire_at,
         wp.documents_resubmission_requested_at, wp.documents_resubmission_reason
  FROM public.worker_profiles wp
  WHERE wp.user_id = auth.uid();
$$;
GRANT EXECUTE ON FUNCTION public.get_my_worker_verification() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_my_worker_verification() FROM anon, public;

-- 6. Signed-out users must not be able to call sensitive SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.get_worker_identity(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_profile_contact(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_user_email(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_job_request_address(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.admin_get_user_detail(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.admin_list_users() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.admin_list_workers(text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.admin_list_expiring_documents(integer) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_worker_identity(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_profile_contact(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_email(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_job_request_address(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_user_detail(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_users() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_workers(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_expiring_documents(integer) TO authenticated;