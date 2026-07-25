
-- Dedupe notifications: remove manual INSERTs from RPCs that already trigger notify_booking_events / notify_application_events.

CREATE OR REPLACE FUNCTION public.worker_mark_on_the_way(_booking_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE b public.bookings%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO b FROM public.bookings WHERE id = _booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found'; END IF;
  IF b.worker_id <> auth.uid() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF b.status <> 'accepted'::booking_status THEN RAISE EXCEPTION 'Only accepted bookings can be marked on the way'; END IF;
  PERFORM set_config('app.booking_rpc', 'on', true);
  UPDATE public.bookings SET status = 'on_the_way'::booking_status, on_the_way_at = now() WHERE id = _booking_id;
END $function$;

CREATE OR REPLACE FUNCTION public.worker_mark_arrived(_booking_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE b public.bookings%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO b FROM public.bookings WHERE id = _booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found'; END IF;
  IF b.worker_id <> auth.uid() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF b.status <> 'on_the_way'::booking_status THEN RAISE EXCEPTION 'You must be On the way before marking Arrived'; END IF;
  PERFORM set_config('app.booking_rpc', 'on', true);
  UPDATE public.bookings SET status = 'arrived'::booking_status, arrived_at = now() WHERE id = _booking_id;
END $function$;

CREATE OR REPLACE FUNCTION public.worker_start_booking(_booking_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE b public.bookings%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO b FROM public.bookings WHERE id = _booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found'; END IF;
  IF b.worker_id <> auth.uid() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF b.status <> 'arrived'::booking_status THEN
    RAISE EXCEPTION 'Mark Arrived first — Start Job is only available after arrival';
  END IF;
  PERFORM set_config('app.booking_rpc', 'on', true);
  UPDATE public.bookings SET status = 'in_progress'::booking_status, started_at = now() WHERE id = _booking_id;
END $function$;

CREATE OR REPLACE FUNCTION public.worker_mark_booking_completed(_booking_id uuid, _final_amount numeric, _completion_note text DEFAULT NULL::text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE b public.bookings%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _final_amount IS NULL OR _final_amount <= 0 THEN RAISE EXCEPTION 'Final amount must be greater than zero'; END IF;
  SELECT * INTO b FROM public.bookings WHERE id = _booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found'; END IF;
  IF b.worker_id <> auth.uid() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF b.status <> 'in_progress'::booking_status THEN RAISE EXCEPTION 'Booking is not in progress'; END IF;
  PERFORM set_config('app.booking_rpc', 'on', true);
  UPDATE public.bookings
    SET status = 'awaiting_customer_confirmation'::booking_status,
        final_amount = _final_amount,
        completion_note = NULLIF(trim(COALESCE(_completion_note,'')),''),
        worker_completed_at = now(),
        payment_status = 'awaiting_confirmation'
    WHERE id = _booking_id;
END $function$;

CREATE OR REPLACE FUNCTION public.customer_confirm_booking_completion(_booking_id uuid, _amount_paid numeric, _rating integer, _review_text text DEFAULT NULL::text, _would_hire_again boolean DEFAULT NULL::boolean, _amount_note text DEFAULT NULL::text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE b public.bookings%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _amount_paid IS NULL OR _amount_paid <= 0 THEN RAISE EXCEPTION 'Amount paid must be greater than zero'; END IF;
  IF _rating IS NULL OR _rating < 1 OR _rating > 5 THEN RAISE EXCEPTION 'Rating must be 1-5'; END IF;
  SELECT * INTO b FROM public.bookings WHERE id = _booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found'; END IF;
  IF b.customer_id <> auth.uid() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF b.status <> 'awaiting_customer_confirmation'::booking_status THEN RAISE EXCEPTION 'Booking is not awaiting confirmation'; END IF;

  PERFORM set_config('app.booking_rpc', 'on', true);
  UPDATE public.bookings
    SET status = 'completed'::booking_status,
        amount_paid = _amount_paid,
        customer_confirmed_at = now(),
        payment_confirmed_at = now(),
        payment_status = 'confirmed',
        completion_note = COALESCE(completion_note, NULLIF(trim(COALESCE(_amount_note,'')),''))
    WHERE id = _booking_id;

  INSERT INTO public.reviews (booking_id, customer_id, worker_id, rating, comment, would_hire_again)
  VALUES (_booking_id, b.customer_id, b.worker_id, _rating,
          NULLIF(trim(COALESCE(_review_text,'')),''), _would_hire_again)
  ON CONFLICT (booking_id) DO NOTHING;
END $function$;

CREATE OR REPLACE FUNCTION public.customer_accept_job_application(_application_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  app public.job_applications%ROWTYPE;
  jr  public.job_requests%ROWTYPE;
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

  UPDATE public.job_requests
    SET status = 'assigned'::job_request_status,
        assigned_worker_id = app.worker_id,
        booking_id = new_booking_id
    WHERE id = jr.id;

  UPDATE public.job_applications SET status = 'accepted'::job_application_status WHERE id = app.id;
  UPDATE public.job_applications
    SET status = 'rejected'::job_application_status
    WHERE job_id = jr.id AND id <> app.id AND status = 'pending'::job_application_status;

  RETURN new_booking_id;
END $function$;

CREATE OR REPLACE FUNCTION public.customer_decline_job_application(_application_id uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE app public.job_applications%ROWTYPE; jr public.job_requests%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _reason IS NULL OR length(trim(_reason)) < 3 THEN RAISE EXCEPTION 'Please provide a decline reason'; END IF;
  SELECT * INTO app FROM public.job_applications WHERE id = _application_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Application not found'; END IF;
  SELECT * INTO jr FROM public.job_requests WHERE id = app.job_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Job not found'; END IF;
  IF jr.customer_id <> auth.uid() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF app.status <> 'pending'::job_application_status THEN RAISE EXCEPTION 'Application is not pending'; END IF;

  UPDATE public.job_applications
    SET status = 'rejected'::job_application_status,
        declined_at = now(),
        decline_reason = trim(_reason),
        updated_at = now()
    WHERE id = _application_id;
END $function$;

-- Ensure realtime is enabled for worker_professions so admin panel refreshes automatically
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.worker_professions;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END $$;
