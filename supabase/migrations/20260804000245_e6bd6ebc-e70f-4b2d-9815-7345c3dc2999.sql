ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid,
  ADD COLUMN IF NOT EXISTS cancelled_by_role text,
  ADD COLUMN IF NOT EXISTS cancel_reason_code text,
  ADD COLUMN IF NOT EXISTS cancel_note text;

DROP FUNCTION IF EXISTS public.customer_cancel_booking(uuid, text);

CREATE OR REPLACE FUNCTION public.customer_cancel_booking(
  _booking_id uuid, _reason_code text DEFAULT NULL, _note text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  b public.bookings%ROWTYPE;
  cname text;
  allowed text[] := ARRAY['changed_mind','booked_by_mistake','found_another_solution','pro_taking_too_long','emergency','financial','other'];
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _reason_code IS NULL OR NOT (_reason_code = ANY(allowed)) THEN
    RAISE EXCEPTION 'Please choose a cancellation reason';
  END IF;
  IF _reason_code = 'other' AND COALESCE(trim(_note),'') = '' THEN
    RAISE EXCEPTION 'Please explain your reason';
  END IF;

  SELECT * INTO b FROM public.bookings WHERE id = _booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found'; END IF;
  IF b.customer_id <> auth.uid() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF b.status IN ('completed','closed','customer_confirmed_complete','cancelled','declined')::text[]::booking_status[] THEN
    RAISE EXCEPTION 'This booking can no longer be cancelled';
  END IF;

  UPDATE public.bookings
     SET status = 'cancelled'::booking_status,
         cancelled_at = now(),
         cancelled_by = auth.uid(),
         cancelled_by_role = 'customer',
         cancel_reason_code = _reason_code,
         cancel_note = NULLIF(trim(COALESCE(_note,'')), ''),
         decline_reason = 'customer_cancelled',
         decline_note = NULLIF(trim(COALESCE(_note,'')), ''),
         updated_at = now()
   WHERE id = _booking_id;

  SELECT full_name INTO cname FROM public.profiles WHERE id = auth.uid();
  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (b.worker_id, 'booking_cancelled', 'Booking cancelled by customer',
    COALESCE(cname,'The customer') || ' cancelled this booking',
    jsonb_build_object('booking_id', _booking_id, 'status', 'cancelled',
      'reason_code', _reason_code, 'reason_note', NULLIF(trim(COALESCE(_note,'')), ''),
      'cancelled_by', 'customer'));
END $function$;

CREATE OR REPLACE FUNCTION public.worker_cancel_booking(
  _booking_id uuid, _reason_code text, _note text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  b public.bookings%ROWTYPE;
  wname text;
  allowed text[] := ARRAY['customer_unavailable','customer_requested','emergency','unable_to_complete','outside_service_area','safety_concern','other'];
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _reason_code IS NULL OR NOT (_reason_code = ANY(allowed)) THEN
    RAISE EXCEPTION 'Please choose a cancellation reason';
  END IF;
  IF _reason_code = 'other' AND COALESCE(trim(_note),'') = '' THEN
    RAISE EXCEPTION 'Please explain your reason';
  END IF;

  SELECT * INTO b FROM public.bookings WHERE id = _booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found'; END IF;
  IF b.worker_id <> auth.uid() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF b.status IN ('completed','closed','customer_confirmed_complete','cancelled','declined')::text[]::booking_status[] THEN
    RAISE EXCEPTION 'This booking can no longer be cancelled';
  END IF;

  UPDATE public.bookings
     SET status = 'cancelled'::booking_status,
         cancelled_at = now(),
         cancelled_by = auth.uid(),
         cancelled_by_role = 'worker',
         cancel_reason_code = _reason_code,
         cancel_note = NULLIF(trim(COALESCE(_note,'')), ''),
         decline_reason = 'worker_cancelled',
         decline_note = NULLIF(trim(COALESCE(_note,'')), ''),
         updated_at = now()
   WHERE id = _booking_id;

  SELECT full_name INTO wname FROM public.profiles WHERE id = auth.uid();
  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (b.customer_id, 'booking_cancelled', 'Booking cancelled by professional',
    COALESCE(wname,'The professional') || ' cancelled this booking',
    jsonb_build_object('booking_id', _booking_id, 'status', 'cancelled',
      'reason_code', _reason_code, 'reason_note', NULLIF(trim(COALESCE(_note,'')), ''),
      'cancelled_by', 'worker'));
END $function$;

REVOKE ALL ON FUNCTION public.customer_cancel_booking(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.worker_cancel_booking(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.customer_cancel_booking(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.worker_cancel_booking(uuid, text, text) TO authenticated;

-- Cancellation notifications are now emitted by the RPCs above; drop the
-- trigger branch that duplicated them for pending worker cancellations.
CREATE OR REPLACE FUNCTION public.notify_booking_events()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  customer_name text;
  worker_name text;
  reason_label text;
  prof_name text;
BEGIN
  SELECT c.name INTO prof_name FROM public.categories c WHERE c.id = NEW.category_id;

  IF TG_OP = 'INSERT' THEN
    SELECT full_name INTO customer_name FROM public.profiles WHERE id = NEW.customer_id;
    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (NEW.worker_id, 'booking_request',
      'New ' || COALESCE(prof_name, 'service') || ' booking request',
      COALESCE(customer_name, 'A customer') || ' requested your ' || COALESCE(prof_name, 'service') || ' service',
      jsonb_build_object('booking_id', NEW.id, 'status', NEW.status, 'profession', prof_name));
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    SELECT full_name INTO worker_name FROM public.profiles WHERE id = NEW.worker_id;
    SELECT full_name INTO customer_name FROM public.profiles WHERE id = NEW.customer_id;

    IF NEW.status = 'accepted' THEN
      INSERT INTO public.notifications (user_id, type, title, body, data)
      VALUES (NEW.customer_id, 'booking_accepted', 'Booking accepted',
        COALESCE(worker_name,'The worker') || ' accepted your ' || COALESCE(prof_name,'service') || ' booking',
        jsonb_build_object('booking_id', NEW.id, 'status', NEW.status, 'profession', prof_name));

    ELSIF NEW.status IN ('on_the_way','worker_on_the_way') THEN
      INSERT INTO public.notifications (user_id, type, title, body, data)
      VALUES (NEW.customer_id, 'worker_on_the_way', 'Your pro is on the way',
        COALESCE(worker_name,'Your pro') || ' is heading to your location',
        jsonb_build_object('booking_id', NEW.id, 'status', NEW.status, 'profession', prof_name));

    ELSIF NEW.status = 'arrived' THEN
      INSERT INTO public.notifications (user_id, type, title, body, data)
      VALUES (NEW.customer_id, 'worker_arrived', 'Your pro has arrived',
        COALESCE(worker_name,'Your pro') || ' arrived at your location',
        jsonb_build_object('booking_id', NEW.id, 'status', NEW.status, 'profession', prof_name));

    ELSIF NEW.status IN ('in_progress','work_started') THEN
      INSERT INTO public.notifications (user_id, type, title, body, data)
      VALUES (NEW.customer_id, 'job_started', 'Work has started',
        COALESCE(worker_name,'Your pro') || ' started the job',
        jsonb_build_object('booking_id', NEW.id, 'status', NEW.status, 'profession', prof_name));

    ELSIF NEW.status IN ('awaiting_customer_confirmation','worker_marked_complete') THEN
      INSERT INTO public.notifications (user_id, type, title, body, data)
      VALUES (NEW.customer_id, 'worker_completed', 'Please confirm completion',
        COALESCE(worker_name,'Your pro') || ' marked the job complete — please confirm and pay',
        jsonb_build_object('booking_id', NEW.id, 'status', NEW.status,
          'final_amount', NEW.final_amount, 'profession', prof_name));

    ELSIF NEW.status IN ('completed','customer_confirmed_complete','closed') THEN
      INSERT INTO public.notifications (user_id, type, title, body, data)
      VALUES (NEW.worker_id, 'customer_confirmed', 'Customer confirmed completion',
        COALESCE(customer_name,'The customer') || ' confirmed the job was completed',
        jsonb_build_object('booking_id', NEW.id, 'status', NEW.status, 'profession', prof_name));

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
          'reason_note', NEW.decline_note, 'profession', prof_name));

    ELSIF NEW.status = 'cancelled' AND NEW.cancelled_by IS NULL AND OLD.status = 'pending' AND auth.uid() = NEW.worker_id THEN
      INSERT INTO public.notifications (user_id, type, title, body, data)
      VALUES (NEW.customer_id, 'booking_declined', 'Booking cancelled',
        COALESCE(worker_name,'The worker') || ' cancelled your booking',
        jsonb_build_object('booking_id', NEW.id, 'status', NEW.status, 'profession', prof_name));
    END IF;
  END IF;
  RETURN NEW;
END $function$;