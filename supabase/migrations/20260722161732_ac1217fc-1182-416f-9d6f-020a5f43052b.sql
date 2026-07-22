
-- ============================================================
-- Sprint 2A: booking lifecycle, job edit/cancel, support RPCs
-- ============================================================

-- 1. Booking timestamp columns
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS on_the_way_at timestamptz,
  ADD COLUMN IF NOT EXISTS arrived_at timestamptz;

-- 2. Job request columns for cancel + location
ALTER TABLE public.job_requests
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancel_reason text,
  ADD COLUMN IF NOT EXISTS region text,
  ADD COLUMN IF NOT EXISTS area text,
  ADD COLUMN IF NOT EXISTS landmark text,
  ADD COLUMN IF NOT EXISTS location_instructions text;

-- 3. worker_accept_booking: set accepted_at
CREATE OR REPLACE FUNCTION public.worker_accept_booking(_booking_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE b public.bookings%ROWTYPE;
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
  UPDATE public.bookings SET status = 'accepted'::booking_status, accepted_at = now() WHERE id = _booking_id;
END $$;

-- 4. worker_mark_on_the_way: set on_the_way_at
CREATE OR REPLACE FUNCTION public.worker_mark_on_the_way(_booking_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE b public.bookings%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO b FROM public.bookings WHERE id = _booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found'; END IF;
  IF b.worker_id <> auth.uid() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF b.status <> 'accepted'::booking_status THEN RAISE EXCEPTION 'Only accepted bookings can be marked on the way'; END IF;
  PERFORM set_config('app.booking_rpc', 'on', true);
  UPDATE public.bookings SET status = 'on_the_way'::booking_status, on_the_way_at = now() WHERE id = _booking_id;
  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (b.customer_id, 'worker_on_the_way', 'Your pro is on the way',
    'The professional is on their way to your location.',
    jsonb_build_object('booking_id', b.id));
END $$;

-- 5. NEW: worker_mark_arrived
CREATE OR REPLACE FUNCTION public.worker_mark_arrived(_booking_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE b public.bookings%ROWTYPE; worker_name text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO b FROM public.bookings WHERE id = _booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found'; END IF;
  IF b.worker_id <> auth.uid() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF b.status <> 'on_the_way'::booking_status THEN RAISE EXCEPTION 'You must be On the way before marking Arrived'; END IF;
  PERFORM set_config('app.booking_rpc', 'on', true);
  UPDATE public.bookings SET status = 'arrived'::booking_status, arrived_at = now() WHERE id = _booking_id;
  SELECT full_name INTO worker_name FROM public.profiles WHERE id = b.worker_id;
  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (b.customer_id, 'worker_arrived', 'Your pro has arrived',
    COALESCE(worker_name,'The professional') || ' has arrived at your location.',
    jsonb_build_object('booking_id', b.id));
END $$;

-- 6. worker_start_booking: change guard from accepted → arrived
CREATE OR REPLACE FUNCTION public.worker_start_booking(_booking_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
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
  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (b.customer_id, 'job_started', 'Job started',
    'Your professional has started the job',
    jsonb_build_object('booking_id', b.id));
END $$;

-- 7. get_worker_public_status: include 'arrived' in busy set (recreate)
CREATE OR REPLACE FUNCTION public.get_worker_public_status(_worker_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT CASE
    WHEN NOT COALESCE((SELECT is_available FROM public.worker_profiles WHERE user_id = _worker_id), true) THEN 'unavailable'
    WHEN EXISTS (
      SELECT 1 FROM public.bookings
       WHERE worker_id = _worker_id
         AND status::text IN ('accepted','on_the_way','arrived','in_progress',
                              'awaiting_customer_confirmation','worker_on_the_way',
                              'work_started','worker_marked_complete')
    ) THEN 'busy'
    ELSE 'available'
  END;
$$;

-- 8. customer_update_job_request RPC
CREATE OR REPLACE FUNCTION public.customer_update_job_request(
  _job_id uuid,
  _title text,
  _description text,
  _category_id uuid,
  _budget integer,
  _urgency text,
  _preferred_at timestamptz,
  _city text,
  _address text,
  _service_area text,
  _region text,
  _area text,
  _landmark text,
  _location_instructions text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  jr public.job_requests%ROWTYPE;
  material_changed boolean := false;
  app_row record;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF length(coalesce(trim(_title),'')) < 4 THEN RAISE EXCEPTION 'Title is required (min 4 chars)'; END IF;
  IF length(coalesce(trim(_description),'')) < 10 THEN RAISE EXCEPTION 'Description is required (min 10 chars)'; END IF;
  IF _urgency IS NULL OR _urgency NOT IN ('normal','urgent','emergency') THEN RAISE EXCEPTION 'Invalid urgency'; END IF;

  SELECT * INTO jr FROM public.job_requests WHERE id = _job_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Job not found'; END IF;
  IF jr.customer_id <> auth.uid() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF jr.status::text <> 'open' THEN RAISE EXCEPTION 'Only open jobs can be edited'; END IF;
  IF jr.assigned_worker_id IS NOT NULL THEN RAISE EXCEPTION 'A worker has already been selected for this job'; END IF;

  IF jr.budget IS DISTINCT FROM _budget
     OR jr.preferred_at IS DISTINCT FROM _preferred_at
     OR jr.category_id IS DISTINCT FROM _category_id
     OR jr.city IS DISTINCT FROM _city
     OR jr.service_area IS DISTINCT FROM _service_area
     OR jr.address IS DISTINCT FROM _address THEN
    material_changed := true;
  END IF;

  UPDATE public.job_requests SET
    title = trim(_title),
    description = trim(_description),
    category_id = _category_id,
    budget = _budget,
    urgency = _urgency::job_urgency,
    preferred_at = _preferred_at,
    city = NULLIF(trim(coalesce(_city,'')),''),
    address = NULLIF(trim(coalesce(_address,'')),''),
    service_area = NULLIF(trim(coalesce(_service_area,'')),''),
    region = NULLIF(trim(coalesce(_region,'')),''),
    area = NULLIF(trim(coalesce(_area,'')),''),
    landmark = NULLIF(trim(coalesce(_landmark,'')),''),
    location_instructions = NULLIF(trim(coalesce(_location_instructions,'')),''),
    updated_at = now()
  WHERE id = _job_id;

  IF material_changed THEN
    FOR app_row IN
      SELECT worker_id FROM public.job_applications
       WHERE job_id = _job_id AND status = 'pending'::job_application_status
    LOOP
      INSERT INTO public.notifications (user_id, type, title, body, data)
      VALUES (app_row.worker_id, 'job_updated', 'Job details updated',
        'The customer updated details for a job you applied to: ' || trim(_title),
        jsonb_build_object('job_id', _job_id));
    END LOOP;
  END IF;
END $$;

-- 9. customer_cancel_job_request RPC
CREATE OR REPLACE FUNCTION public.customer_cancel_job_request(_job_id uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  jr public.job_requests%ROWTYPE;
  app_row record;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _reason IS NULL OR length(trim(_reason)) < 3 THEN RAISE EXCEPTION 'Please provide a cancellation reason'; END IF;

  SELECT * INTO jr FROM public.job_requests WHERE id = _job_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Job not found'; END IF;
  IF jr.customer_id <> auth.uid() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF jr.assigned_worker_id IS NOT NULL THEN
    RAISE EXCEPTION 'A worker has already been selected. Cancel the linked booking instead.';
  END IF;
  IF jr.status::text NOT IN ('open','draft') THEN
    RAISE EXCEPTION 'This job can no longer be cancelled';
  END IF;

  UPDATE public.job_requests
    SET status = 'cancelled'::job_request_status,
        cancelled_at = now(),
        cancel_reason = trim(_reason),
        updated_at = now()
    WHERE id = _job_id;

  FOR app_row IN
    SELECT worker_id FROM public.job_applications
     WHERE job_id = _job_id AND status = 'pending'::job_application_status
  LOOP
    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (app_row.worker_id, 'job_cancelled', 'Job cancelled by customer',
      'A job you applied to was cancelled: ' || COALESCE(jr.title,''),
      jsonb_build_object('job_id', _job_id, 'reason', trim(_reason)));
  END LOOP;

  UPDATE public.job_applications
    SET status = 'rejected'::job_application_status
    WHERE job_id = _job_id AND status = 'pending'::job_application_status;
END $$;

-- 10. submit_support_ticket RPC (in-app ack via notification)
CREATE OR REPLACE FUNCTION public.submit_support_ticket(
  _subject text, _message text, _category text, _contact_email text DEFAULT NULL, _attachment_url text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE new_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF length(coalesce(trim(_subject),'')) < 3 THEN RAISE EXCEPTION 'Subject is required'; END IF;
  IF length(coalesce(trim(_message),'')) < 10 THEN RAISE EXCEPTION 'Please describe the issue (min 10 chars)'; END IF;

  INSERT INTO public.support_tickets (user_id, subject, message, category, attachment_url)
  VALUES (auth.uid(), trim(_subject), trim(_message), COALESCE(_category,'general'), _attachment_url)
  RETURNING id INTO new_id;

  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (auth.uid(), 'support_received', 'We received your message',
    'Skill Link support will respond soon. Ticket #' || substring(new_id::text,1,8),
    jsonb_build_object('ticket_id', new_id));

  RETURN new_id;
END $$;

-- 11. admin_reply_support_ticket RPC
CREATE OR REPLACE FUNCTION public.admin_reply_support_ticket(
  _ticket_id uuid, _reply text, _new_status text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE t public.support_tickets%ROWTYPE;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF length(coalesce(trim(_reply),'')) < 3 THEN RAISE EXCEPTION 'Reply cannot be empty'; END IF;
  IF _new_status IS NOT NULL AND _new_status NOT IN ('open','in_review','resolved','closed') THEN
    RAISE EXCEPTION 'Invalid status';
  END IF;

  SELECT * INTO t FROM public.support_tickets WHERE id = _ticket_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ticket not found'; END IF;

  UPDATE public.support_tickets
    SET admin_response = trim(_reply),
        admin_id = auth.uid(),
        responded_at = now(),
        status = COALESCE(_new_status, CASE WHEN status = 'open' THEN 'in_review' ELSE status END)
    WHERE id = _ticket_id;

  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (t.user_id, 'support_reply', 'Support responded',
    substring(trim(_reply), 1, 140),
    jsonb_build_object('ticket_id', _ticket_id));
END $$;

-- 12. Grants
GRANT EXECUTE ON FUNCTION public.worker_mark_arrived(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.customer_update_job_request(uuid,text,text,uuid,integer,text,timestamptz,text,text,text,text,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.customer_cancel_job_request(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_support_ticket(text,text,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reply_support_ticket(uuid,text,text) TO authenticated;
