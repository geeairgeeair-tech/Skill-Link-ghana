CREATE OR REPLACE FUNCTION public.customer_cancel_booking(_booking_id uuid, _reason_code text DEFAULT NULL::text, _note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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
  IF b.status::text IN ('completed','closed','customer_confirmed_complete','cancelled','declined') THEN
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

CREATE OR REPLACE FUNCTION public.worker_cancel_booking(_booking_id uuid, _reason_code text, _note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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
  IF b.status::text = 'pending' THEN
    RAISE EXCEPTION 'Please decline this request instead';
  END IF;
  IF b.status::text IN ('completed','closed','customer_confirmed_complete','cancelled','declined') THEN
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