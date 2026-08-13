CREATE OR REPLACE FUNCTION public.customer_accept_job_application(_application_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  app public.job_applications%ROWTYPE;
  jr  public.job_requests%ROWTYPE;
  new_booking_id uuid;
  accepted_ts timestamptz := now();
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO app FROM public.job_applications WHERE id = _application_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Application not found'; END IF;
  SELECT * INTO jr FROM public.job_requests WHERE id = app.job_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Job not found'; END IF;
  IF jr.customer_id <> auth.uid() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF jr.status::text <> 'open' THEN RAISE EXCEPTION 'This job is no longer open'; END IF;
  IF app.status <> 'pending'::job_application_status THEN RAISE EXCEPTION 'Application is not pending'; END IF;

  PERFORM set_config('app.booking_rpc', 'on', true);
  INSERT INTO public.bookings (
    customer_id, worker_id, category_id, description, address,
    scheduled_at, estimated_cost, status, photos, urgency, budget,
    service_area, latitude, longitude, estimated_amount, job_application_id,
    accepted_at
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
    app.id,
    accepted_ts
  ) RETURNING id INTO new_booking_id;

  UPDATE public.job_requests
    SET status = 'assigned'::job_request_status,
        assigned_worker_id = app.worker_id,
        booking_id = new_booking_id
    WHERE id = jr.id;

  UPDATE public.job_applications SET status = 'accepted'::job_application_status WHERE id = app.id;
  -- Remaining applicants intentionally stay 'pending' until the selected
  -- professional presses "I'm on my way" (see worker_mark_on_the_way).

  RETURN new_booking_id;
END $function$;

-- Backfill: bookings created from an accepted application that never got an acceptance timestamp.
UPDATE public.bookings
   SET accepted_at = created_at
 WHERE job_application_id IS NOT NULL
   AND accepted_at IS NULL
   AND status::text NOT IN ('pending','declined');