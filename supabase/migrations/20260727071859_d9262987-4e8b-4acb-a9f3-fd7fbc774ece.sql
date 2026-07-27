
CREATE OR REPLACE FUNCTION public.get_worker_public_status(_worker_id uuid)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN NOT COALESCE((SELECT is_available FROM public.worker_profiles WHERE user_id = _worker_id), true) THEN 'unavailable'
    WHEN EXISTS (
      SELECT 1 FROM public.bookings
       WHERE worker_id = _worker_id
         AND status::text IN ('accepted','on_the_way','arrived','in_progress',
                              'awaiting_customer_confirmation','worker_on_the_way',
                              'work_started','worker_marked_complete','disputed')
    ) THEN 'busy'
    ELSE 'available'
  END;
$$;

GRANT EXECUTE ON FUNCTION public.get_worker_public_status(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_worker_active_booking(_worker_id uuid)
RETURNS TABLE(booking_id uuid, status text, created_at timestamptz)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT b.id, b.status::text, b.created_at
  FROM public.bookings b
  WHERE b.worker_id = _worker_id
    AND b.status::text IN ('accepted','on_the_way','arrived','in_progress',
                           'awaiting_customer_confirmation','worker_on_the_way',
                           'work_started','worker_marked_complete','disputed')
  ORDER BY b.created_at DESC
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_worker_active_booking(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.enforce_worker_availability_on_booking()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  wp public.worker_profiles%ROWTYPE;
  busy_exists boolean;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.worker_id::text, 0));

  SELECT * INTO wp FROM public.worker_profiles WHERE user_id = NEW.worker_id;
  IF NOT FOUND OR wp.verification_status::text <> 'approved' THEN
    RAISE EXCEPTION 'This professional is not available for bookings right now.';
  END IF;

  IF COALESCE(wp.is_available, true) = false THEN
    RAISE EXCEPTION 'This worker is currently unavailable. Please choose another professional or check again later.';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.bookings
     WHERE worker_id = NEW.worker_id
       AND status::text IN ('accepted','on_the_way','arrived','in_progress',
                            'awaiting_customer_confirmation','worker_on_the_way',
                            'work_started','worker_marked_complete','disputed')
  ) INTO busy_exists;

  IF busy_exists THEN
    RAISE EXCEPTION 'This worker is currently working on another booking.';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_enforce_worker_availability ON public.bookings;
CREATE TRIGGER trg_enforce_worker_availability
BEFORE INSERT ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.enforce_worker_availability_on_booking();

CREATE OR REPLACE FUNCTION public.worker_accept_booking(_booking_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE b public.bookings%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 0));
  SELECT * INTO b FROM public.bookings WHERE id = _booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found'; END IF;
  IF b.worker_id <> auth.uid() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF b.status <> 'pending'::booking_status THEN RAISE EXCEPTION 'Only pending bookings can be accepted'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.bookings
     WHERE worker_id = auth.uid() AND id <> _booking_id
       AND status::text IN ('accepted','on_the_way','arrived','in_progress',
                            'awaiting_customer_confirmation','worker_on_the_way',
                            'work_started','worker_marked_complete','disputed')
  ) THEN
    RAISE EXCEPTION 'You already have an active booking. Finish it before accepting new work.';
  END IF;
  PERFORM set_config('app.booking_rpc', 'on', true);
  UPDATE public.bookings SET status = 'accepted'::booking_status, accepted_at = now() WHERE id = _booking_id;
END $$;

DROP FUNCTION IF EXISTS public.admin_list_workers(text);
CREATE OR REPLACE FUNCTION public.admin_list_workers(_status text DEFAULT NULL::text)
RETURNS TABLE(user_id uuid, full_name text, email text, phone text, date_of_birth date, age integer, category_name text, service_area text, city text, years_experience integer, verification_status text, is_available boolean, availability_state text, active_booking_id uuid, subscription_expires_at timestamp with time zone, jobs_completed integer, rating numeric, reviews_count integer, avatar_url text, created_at timestamp with time zone)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    wp.user_id,
    p.full_name,
    u.email::text,
    p.phone,
    wp.date_of_birth,
    CASE WHEN wp.date_of_birth IS NULL THEN NULL
         ELSE EXTRACT(YEAR FROM age(wp.date_of_birth))::integer END,
    c.name,
    wp.service_area,
    wp.city,
    wp.years_experience,
    wp.verification_status::text,
    wp.is_available,
    public.get_worker_public_status(wp.user_id),
    (SELECT ab.booking_id FROM public.get_worker_active_booking(wp.user_id) ab),
    wp.subscription_expires_at,
    wp.jobs_completed,
    wp.rating,
    wp.reviews_count,
    p.avatar_url,
    wp.created_at
  FROM public.worker_profiles wp
  LEFT JOIN public.profiles p ON p.id = wp.user_id
  LEFT JOIN auth.users u ON u.id = wp.user_id
  LEFT JOIN public.categories c ON c.id = wp.category_id
  WHERE public.has_role(auth.uid(), 'admin')
    AND (_status IS NULL OR wp.verification_status::text = _status)
  ORDER BY wp.created_at DESC;
$$;
