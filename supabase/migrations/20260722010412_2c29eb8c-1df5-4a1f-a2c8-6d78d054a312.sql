
-- Phase A1 + A2: Secure application + booking-accept RPCs

-- Add linkage columns
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS job_application_id uuid REFERENCES public.job_applications(id) ON DELETE SET NULL;
ALTER TABLE public.job_requests ADD COLUMN IF NOT EXISTS assigned_worker_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.job_requests ADD COLUMN IF NOT EXISTS booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL;

-- ============================================================
-- worker_apply_to_job: secure application submission
-- ============================================================
CREATE OR REPLACE FUNCTION public.worker_apply_to_job(
  _job_id uuid,
  _proposed_amount integer,
  _estimated_start timestamptz,
  _message text DEFAULT NULL,
  _note text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  wp public.worker_profiles%ROWTYPE;
  jr public.job_requests%ROWTYPE;
  worker_name text;
  new_app_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _proposed_amount IS NULL OR _proposed_amount < 1 THEN RAISE EXCEPTION 'Proposed amount must be at least GH¢1'; END IF;

  SELECT * INTO wp FROM public.worker_profiles WHERE user_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'You need a worker profile to apply'; END IF;
  IF wp.verification_status::text <> 'approved' THEN
    RAISE EXCEPTION 'Only verified workers can apply. Your account is %', wp.verification_status;
  END IF;

  SELECT * INTO jr FROM public.job_requests WHERE id = _job_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Job not found'; END IF;
  IF jr.status::text <> 'open' THEN RAISE EXCEPTION 'This job is no longer open'; END IF;
  IF jr.category_id IS DISTINCT FROM wp.category_id THEN
    RAISE EXCEPTION 'This job is not in your service category';
  END IF;
  IF jr.customer_id = auth.uid() THEN RAISE EXCEPTION 'You cannot apply to your own job'; END IF;

  -- Busy check
  IF public.get_worker_public_status(auth.uid()) = 'busy' THEN
    RAISE EXCEPTION 'You have an active booking. Finish it before applying to new jobs.';
  END IF;

  -- Duplicate check
  IF EXISTS (SELECT 1 FROM public.job_applications WHERE job_id = _job_id AND worker_id = auth.uid() AND status IN ('pending','accepted')) THEN
    RAISE EXCEPTION 'You have already applied to this job';
  END IF;

  INSERT INTO public.job_applications (job_id, worker_id, quoted_price, estimated_start, message)
  VALUES (_job_id, auth.uid(), _proposed_amount,
          _estimated_start,
          NULLIF(trim(COALESCE(_message,'') || CASE WHEN _note IS NOT NULL AND length(trim(_note))>0 THEN E'\n\nNote: '||trim(_note) ELSE '' END), ''))
  RETURNING id INTO new_app_id;

  SELECT full_name INTO worker_name FROM public.profiles WHERE id = auth.uid();
  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (jr.customer_id, 'application_received', 'New application',
    COALESCE(worker_name,'A worker') || ' applied for your job: ' || COALESCE(jr.title,'your job'),
    jsonb_build_object('job_id', _job_id, 'application_id', new_app_id, 'quoted_price', _proposed_amount));

  RETURN new_app_id;
END $$;

GRANT EXECUTE ON FUNCTION public.worker_apply_to_job(uuid, integer, timestamptz, text, text) TO authenticated;

-- ============================================================
-- customer_accept_job_application: atomic hire flow
-- ============================================================
CREATE OR REPLACE FUNCTION public.customer_accept_job_application(_application_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  app public.job_applications%ROWTYPE;
  jr  public.job_requests%ROWTYPE;
  customer_name text;
  new_booking_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO app FROM public.job_applications WHERE id = _application_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Application not found'; END IF;

  SELECT * INTO jr FROM public.job_requests WHERE id = app.job_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Job not found'; END IF;
  IF jr.customer_id <> auth.uid() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF jr.status::text <> 'open' THEN RAISE EXCEPTION 'This job is no longer open'; END IF;
  IF app.status <> 'pending'::job_application_status THEN RAISE EXCEPTION 'Application is not pending'; END IF;

  -- Create the booking
  PERFORM set_config('app.booking_rpc', 'on', true);
  INSERT INTO public.bookings (
    customer_id, worker_id, category_id, description, address,
    scheduled_at, estimated_cost, status, photos, urgency, budget,
    service_area, latitude, longitude, estimated_amount, job_application_id
  ) VALUES (
    jr.customer_id, app.worker_id, jr.category_id,
    COALESCE(jr.description, jr.title),
    jr.address,
    COALESCE(app.estimated_start, jr.preferred_at),
    app.quoted_price,
    'accepted'::booking_status,
    COALESCE(jr.media, '[]'::jsonb),
    'normal',
    jr.budget,
    jr.service_area,
    jr.lat, jr.lng,
    app.quoted_price,
    app.id
  ) RETURNING id INTO new_booking_id;

  -- Assign & close the job
  UPDATE public.job_requests
    SET status = 'assigned'::job_request_status,
        assigned_worker_id = app.worker_id,
        booking_id = new_booking_id
    WHERE id = jr.id;

  -- Accept this application, reject others
  UPDATE public.job_applications SET status = 'accepted'::job_application_status WHERE id = app.id;
  UPDATE public.job_applications
    SET status = 'rejected'::job_application_status
    WHERE job_id = jr.id AND id <> app.id AND status = 'pending'::job_application_status;

  -- Notify selected worker
  SELECT full_name INTO customer_name FROM public.profiles WHERE id = jr.customer_id;
  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (app.worker_id, 'application_accepted', 'You were hired',
    COALESCE(customer_name,'The customer') || ' accepted your application for "' || COALESCE(jr.title,'a job') || '"',
    jsonb_build_object('job_id', jr.id, 'application_id', app.id, 'booking_id', new_booking_id));

  RETURN new_booking_id;
END $$;

GRANT EXECUTE ON FUNCTION public.customer_accept_job_application(uuid) TO authenticated;

-- ============================================================
-- worker_accept_booking: secure accept via RPC (bypasses guard)
-- ============================================================
CREATE OR REPLACE FUNCTION public.worker_accept_booking(_booking_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE b public.bookings%ROWTYPE; customer_name text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO b FROM public.bookings WHERE id = _booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found'; END IF;
  IF b.worker_id <> auth.uid() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF b.status <> 'pending'::booking_status THEN RAISE EXCEPTION 'Only pending bookings can be accepted'; END IF;
  IF public.get_worker_public_status(auth.uid()) = 'busy' THEN
    RAISE EXCEPTION 'You already have an active booking. Finish it before accepting new work.';
  END IF;

  PERFORM set_config('app.booking_rpc', 'on', true);
  UPDATE public.bookings SET status = 'accepted'::booking_status WHERE id = _booking_id;
END $$;

GRANT EXECUTE ON FUNCTION public.worker_accept_booking(uuid) TO authenticated;

-- ============================================================
-- worker_mark_on_the_way
-- ============================================================
CREATE OR REPLACE FUNCTION public.worker_mark_on_the_way(_booking_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE b public.bookings%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO b FROM public.bookings WHERE id = _booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found'; END IF;
  IF b.worker_id <> auth.uid() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF b.status NOT IN ('accepted'::booking_status) THEN RAISE EXCEPTION 'Only accepted bookings can be marked on the way'; END IF;

  PERFORM set_config('app.booking_rpc', 'on', true);
  UPDATE public.bookings SET status = 'on_the_way'::booking_status WHERE id = _booking_id;

  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (b.customer_id, 'worker_on_the_way', 'Your pro is on the way',
    'The professional is on their way to your location.',
    jsonb_build_object('booking_id', b.id));
END $$;

GRANT EXECUTE ON FUNCTION public.worker_mark_on_the_way(uuid) TO authenticated;
