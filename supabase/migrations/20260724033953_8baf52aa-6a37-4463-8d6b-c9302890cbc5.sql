
-- ===== 1) Full-lifecycle booking notifications with booking_id =====
CREATE OR REPLACE FUNCTION public.notify_booking_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  customer_name text;
  worker_name text;
  reason_label text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT full_name INTO customer_name FROM public.profiles WHERE id = NEW.customer_id;
    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (NEW.worker_id, 'booking_request', 'New booking request',
      COALESCE(customer_name, 'A customer') || ' requested your service',
      jsonb_build_object('booking_id', NEW.id, 'status', NEW.status));
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    SELECT full_name INTO worker_name FROM public.profiles WHERE id = NEW.worker_id;
    SELECT full_name INTO customer_name FROM public.profiles WHERE id = NEW.customer_id;

    IF NEW.status = 'accepted' THEN
      INSERT INTO public.notifications (user_id, type, title, body, data)
      VALUES (NEW.customer_id, 'booking_accepted', 'Booking accepted',
        COALESCE(worker_name,'The worker') || ' accepted your booking',
        jsonb_build_object('booking_id', NEW.id, 'status', NEW.status));

    ELSIF NEW.status IN ('on_the_way','worker_on_the_way') THEN
      INSERT INTO public.notifications (user_id, type, title, body, data)
      VALUES (NEW.customer_id, 'worker_on_the_way', 'Your pro is on the way',
        COALESCE(worker_name,'Your pro') || ' is heading to your location',
        jsonb_build_object('booking_id', NEW.id, 'status', NEW.status));

    ELSIF NEW.status = 'arrived' THEN
      INSERT INTO public.notifications (user_id, type, title, body, data)
      VALUES (NEW.customer_id, 'worker_arrived', 'Your pro has arrived',
        COALESCE(worker_name,'Your pro') || ' arrived at your location',
        jsonb_build_object('booking_id', NEW.id, 'status', NEW.status));

    ELSIF NEW.status IN ('in_progress','work_started') THEN
      INSERT INTO public.notifications (user_id, type, title, body, data)
      VALUES (NEW.customer_id, 'job_started', 'Work has started',
        COALESCE(worker_name,'Your pro') || ' started the job',
        jsonb_build_object('booking_id', NEW.id, 'status', NEW.status));

    ELSIF NEW.status IN ('awaiting_customer_confirmation','worker_marked_complete') THEN
      INSERT INTO public.notifications (user_id, type, title, body, data)
      VALUES (NEW.customer_id, 'worker_completed', 'Please confirm completion',
        COALESCE(worker_name,'Your pro') || ' marked the job complete — please confirm and pay',
        jsonb_build_object('booking_id', NEW.id, 'status', NEW.status,
          'final_amount', NEW.final_amount));

    ELSIF NEW.status IN ('completed','customer_confirmed_complete','closed') THEN
      -- notify worker that customer confirmed
      INSERT INTO public.notifications (user_id, type, title, body, data)
      VALUES (NEW.worker_id, 'customer_confirmed', 'Customer confirmed completion',
        COALESCE(customer_name,'The customer') || ' confirmed the job was completed',
        jsonb_build_object('booking_id', NEW.id, 'status', NEW.status));

    ELSIF NEW.status = 'declined' THEN
      reason_label := CASE NEW.decline_reason
        WHEN 'schedule_conflict' THEN 'Schedule conflict'
        WHEN 'too_far' THEN 'Too far from service area'
        WHEN 'budget_low' THEN 'Budget is too low'
        WHEN 'no_equipment' THEN 'Missing required equipment'
        WHEN 'unavailable' THEN 'Currently unavailable'
        WHEN 'unclear_details' THEN 'Job details are unclear'
        WHEN 'safety_concern' THEN 'Safety concern'
        WHEN 'wrong_category' THEN 'Wrong category or service'
        WHEN 'other' THEN 'Other'
        ELSE NULL END;
      INSERT INTO public.notifications (user_id, type, title, body, data)
      VALUES (NEW.customer_id, 'booking_declined', 'Booking declined',
        COALESCE(worker_name,'The worker') || ' declined your booking'
          || CASE WHEN reason_label IS NOT NULL THEN ' — ' || reason_label ELSE '' END,
        jsonb_build_object('booking_id', NEW.id, 'status', NEW.status,
          'reason_code', NEW.decline_reason, 'reason_label', reason_label,
          'reason_note', NEW.decline_note));

    ELSIF NEW.status = 'cancelled' AND OLD.status = 'pending' AND auth.uid() = NEW.worker_id THEN
      INSERT INTO public.notifications (user_id, type, title, body, data)
      VALUES (NEW.customer_id, 'booking_declined', 'Booking cancelled',
        COALESCE(worker_name,'The worker') || ' cancelled your booking',
        jsonb_build_object('booking_id', NEW.id, 'status', NEW.status));
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- ===== 2) Notify worker on new review =====
CREATE OR REPLACE FUNCTION public.notify_review_received()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  customer_name text;
  bid uuid;
BEGIN
  SELECT full_name INTO customer_name FROM public.profiles WHERE id = NEW.customer_id;
  bid := NEW.booking_id;
  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (NEW.worker_id, 'review_received', 'New review received',
    COALESCE(customer_name,'A customer') || ' left you a ' || NEW.rating || '★ review',
    jsonb_build_object('booking_id', bid, 'review_id', NEW.id, 'rating', NEW.rating));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_review_received ON public.reviews;
CREATE TRIGGER trg_notify_review_received
AFTER INSERT ON public.reviews
FOR EACH ROW EXECUTE FUNCTION public.notify_review_received();

-- ===== 3) Worker professions (multi-skill, max 3, per-profession verification) =====
CREATE TABLE IF NOT EXISTS public.worker_professions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.categories(id) ON DELETE RESTRICT,
  bio text,
  years_experience int DEFAULT 0,
  portfolio_images jsonb NOT NULL DEFAULT '[]'::jsonb,
  certificates jsonb NOT NULL DEFAULT '[]'::jsonb,
  verification_status text NOT NULL DEFAULT 'pending' CHECK (verification_status IN ('pending','approved','rejected')),
  rejection_reason text,
  is_primary boolean NOT NULL DEFAULT false,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, category_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.worker_professions TO authenticated;
GRANT ALL ON public.worker_professions TO service_role;

ALTER TABLE public.worker_professions ENABLE ROW LEVEL SECURITY;

-- Owner can read own rows
CREATE POLICY "Worker reads own professions" ON public.worker_professions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());
-- Anyone authenticated can read APPROVED rows (for search)
CREATE POLICY "Authenticated read approved professions" ON public.worker_professions
  FOR SELECT TO authenticated
  USING (verification_status = 'approved');
-- Admin read all
CREATE POLICY "Admin reads all professions" ON public.worker_professions
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));
-- Owner insert own (RPC will enforce cap; policy allows base insert)
CREATE POLICY "Worker inserts own professions" ON public.worker_professions
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
-- Owner can update while pending (for portfolio tweaks) — verification cannot be changed by owner (RPC only)
CREATE POLICY "Worker updates own pending" ON public.worker_professions
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND verification_status = 'pending')
  WITH CHECK (user_id = auth.uid() AND verification_status = 'pending');
-- Admin update all
CREATE POLICY "Admin updates professions" ON public.worker_professions
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
-- Delete: owner (own pending or rejected only) or admin
CREATE POLICY "Worker/admin deletes professions" ON public.worker_professions
  FOR DELETE TO authenticated
  USING (
    (user_id = auth.uid() AND verification_status IN ('pending','rejected'))
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE TRIGGER trg_worker_professions_touch BEFORE UPDATE ON public.worker_professions
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX IF NOT EXISTS idx_worker_prof_user ON public.worker_professions(user_id);
CREATE INDEX IF NOT EXISTS idx_worker_prof_category_approved ON public.worker_professions(category_id) WHERE verification_status = 'approved';

-- Seed primary profession row for existing approved worker_profiles (skip if already exists)
INSERT INTO public.worker_professions (user_id, category_id, bio, years_experience, portfolio_images, verification_status, is_primary)
SELECT wp.user_id, wp.category_id, wp.bio, COALESCE(wp.years_experience, 0),
       COALESCE(wp.portfolio_images, '[]'::jsonb),
       CASE WHEN wp.verification_status::text = 'approved' THEN 'approved' ELSE 'pending' END,
       true
FROM public.worker_profiles wp
WHERE wp.category_id IS NOT NULL
ON CONFLICT (user_id, category_id) DO NOTHING;

-- ===== 4) RPCs for professions =====
CREATE OR REPLACE FUNCTION public.worker_add_profession(
  _category_id uuid,
  _bio text,
  _years int,
  _portfolio jsonb DEFAULT '[]'::jsonb,
  _certificates jsonb DEFAULT '[]'::jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  new_id uuid;
  n_current int;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _category_id IS NULL THEN RAISE EXCEPTION 'Category is required'; END IF;
  IF _bio IS NULL OR length(trim(_bio)) < 10 THEN RAISE EXCEPTION 'Please add a short bio (10+ chars)'; END IF;

  SELECT COUNT(*) INTO n_current FROM public.worker_professions WHERE user_id = auth.uid();
  IF n_current >= 3 THEN
    RAISE EXCEPTION 'You can have at most 3 professions';
  END IF;
  IF EXISTS (SELECT 1 FROM public.worker_professions WHERE user_id = auth.uid() AND category_id = _category_id) THEN
    RAISE EXCEPTION 'You already have this profession';
  END IF;

  INSERT INTO public.worker_professions
    (user_id, category_id, bio, years_experience, portfolio_images, certificates, verification_status, is_primary)
  VALUES
    (auth.uid(), _category_id, trim(_bio), COALESCE(_years,0), COALESCE(_portfolio,'[]'::jsonb), COALESCE(_certificates,'[]'::jsonb), 'pending', false)
  RETURNING id INTO new_id;

  -- Notify admins
  INSERT INTO public.notifications (user_id, type, title, body, data)
  SELECT ur.user_id, 'verification_submitted', 'New profession submitted',
    'A worker submitted a new profession for verification',
    jsonb_build_object('profession_id', new_id, 'worker_id', auth.uid(), 'category_id', _category_id)
  FROM public.user_roles ur WHERE ur.role = 'admin'::app_role;

  RETURN new_id;
END $$;

CREATE OR REPLACE FUNCTION public.admin_approve_profession(_profession_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE p public.worker_professions%ROWTYPE;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  SELECT * INTO p FROM public.worker_professions WHERE id = _profession_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profession not found'; END IF;
  UPDATE public.worker_professions
    SET verification_status = 'approved', reviewed_at = now(), rejection_reason = NULL
    WHERE id = _profession_id;
  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (p.user_id, 'verification_approved', 'Profession approved',
    'Your additional profession has been approved. Customers can now find you for it.',
    jsonb_build_object('profession_id', _profession_id, 'category_id', p.category_id));
END $$;

CREATE OR REPLACE FUNCTION public.admin_reject_profession(_profession_id uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE p public.worker_professions%ROWTYPE;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  SELECT * INTO p FROM public.worker_professions WHERE id = _profession_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profession not found'; END IF;
  UPDATE public.worker_professions
    SET verification_status = 'rejected', reviewed_at = now(),
        rejection_reason = COALESCE(NULLIF(trim(_reason),''), 'Rejected by admin')
    WHERE id = _profession_id;
  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (p.user_id, 'verification_rejected', 'Profession not approved',
    COALESCE(NULLIF(trim(_reason),''), 'Your additional profession was not approved.'),
    jsonb_build_object('profession_id', _profession_id, 'category_id', p.category_id));
END $$;

-- Public list helper: workers approved in a category (via primary OR extra profession)
CREATE OR REPLACE FUNCTION public.workers_in_category(_category_id uuid)
RETURNS TABLE (user_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT wp.user_id FROM public.worker_profiles wp
    WHERE wp.category_id = _category_id AND wp.verification_status::text = 'approved'
  UNION
  SELECT p.user_id FROM public.worker_professions p
    WHERE p.category_id = _category_id AND p.verification_status = 'approved';
$$;
