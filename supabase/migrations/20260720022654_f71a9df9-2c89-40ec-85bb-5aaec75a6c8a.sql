
-- Add rejection reason/timestamp to worker_profiles
ALTER TABLE public.worker_profiles
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ;

-- Support tickets table
CREATE TABLE IF NOT EXISTS public.support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  related_worker_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  attachment_url TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_review','resolved','closed')),
  admin_response TEXT,
  admin_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.support_tickets TO authenticated;
GRANT ALL ON public.support_tickets TO service_role;

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users view own tickets" ON public.support_tickets
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "users create own tickets" ON public.support_tickets
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users update own open tickets subject/message" ON public.support_tickets
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER support_tickets_touch BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX IF NOT EXISTS idx_support_tickets_user ON public.support_tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON public.support_tickets(status);

-- Admin user detail RPC: returns single row of full user detail
CREATE OR REPLACE FUNCTION public.admin_get_user_detail(_user_id UUID)
RETURNS TABLE(
  user_id UUID,
  full_name TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  avatar_url TEXT,
  roles TEXT[],
  created_at TIMESTAMPTZ,
  last_sign_in_at TIMESTAMPTZ,
  is_worker BOOLEAN,
  verification_status TEXT,
  category_name TEXT,
  service_area TEXT,
  city TEXT,
  years_experience INTEGER,
  bio TEXT,
  date_of_birth DATE,
  age INTEGER,
  is_available BOOLEAN,
  is_suspended BOOLEAN,
  rejection_reason TEXT,
  rejected_at TIMESTAMPTZ,
  jobs_completed INTEGER,
  rating NUMERIC,
  reviews_count INTEGER,
  ghana_card_number TEXT,
  ghana_card_url TEXT,
  selfie_url TEXT,
  jobs_posted_count INTEGER,
  bookings_as_customer_count INTEGER,
  bookings_as_worker_count INTEGER,
  applications_count INTEGER,
  reviews_received_count INTEGER,
  reviews_written_count INTEGER
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id,
    p.full_name,
    u.email::text,
    p.phone,
    p.address,
    p.avatar_url,
    COALESCE((SELECT array_agg(r.role::text) FROM public.user_roles r WHERE r.user_id = p.id), ARRAY[]::text[]),
    p.created_at,
    u.last_sign_in_at,
    (wp.user_id IS NOT NULL),
    wp.verification_status::text,
    c.name,
    wp.service_area,
    wp.city,
    wp.years_experience,
    wp.bio,
    wp.date_of_birth,
    CASE WHEN wp.date_of_birth IS NULL THEN NULL ELSE EXTRACT(YEAR FROM age(wp.date_of_birth))::integer END,
    wp.is_available,
    (wp.verification_status::text = 'suspended'),
    wp.rejection_reason,
    wp.rejected_at,
    wp.jobs_completed,
    wp.rating,
    wp.reviews_count,
    wp.ghana_card_number,
    wp.ghana_card_url,
    wp.selfie_url,
    (SELECT COUNT(*)::int FROM public.job_requests jr WHERE jr.customer_id = p.id),
    (SELECT COUNT(*)::int FROM public.bookings b WHERE b.customer_id = p.id),
    (SELECT COUNT(*)::int FROM public.bookings b WHERE b.worker_id = p.id),
    (SELECT COUNT(*)::int FROM public.job_applications a WHERE a.worker_id = p.id),
    (SELECT COUNT(*)::int FROM public.reviews r WHERE r.worker_id = p.id),
    (SELECT COUNT(*)::int FROM public.reviews r WHERE r.customer_id = p.id)
  FROM public.profiles p
  LEFT JOIN auth.users u ON u.id = p.id
  LEFT JOIN public.worker_profiles wp ON wp.user_id = p.id
  LEFT JOIN public.categories c ON c.id = wp.category_id
  WHERE p.id = _user_id
    AND public.has_role(auth.uid(), 'admin');
$$;

REVOKE EXECUTE ON FUNCTION public.admin_get_user_detail(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_get_user_detail(UUID) TO authenticated;

-- Admin reject worker with reason
CREATE OR REPLACE FUNCTION public.admin_reject_worker(_user_id UUID, _reason TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF _reason IS NULL OR length(trim(_reason)) < 5 THEN
    RAISE EXCEPTION 'Rejection reason is required (min 5 chars)';
  END IF;
  UPDATE public.worker_profiles
    SET verification_status = 'rejected',
        rejection_reason = _reason,
        rejected_at = now()
    WHERE user_id = _user_id;
  INSERT INTO public.admin_audit_logs(admin_id, action, target_user_id, target_type, details)
    VALUES (auth.uid(), 'worker_rejected', _user_id, 'worker', jsonb_build_object('reason', _reason));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_reject_worker(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_reject_worker(UUID, TEXT) TO authenticated;

-- Clear rejection when worker resubmits
CREATE OR REPLACE FUNCTION public.worker_resubmit_verification()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  UPDATE public.worker_profiles
    SET verification_status = 'pending',
        rejection_reason = NULL,
        rejected_at = NULL
    WHERE user_id = auth.uid()
      AND verification_status = 'rejected';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.worker_resubmit_verification() FROM anon;
GRANT EXECUTE ON FUNCTION public.worker_resubmit_verification() TO authenticated;
