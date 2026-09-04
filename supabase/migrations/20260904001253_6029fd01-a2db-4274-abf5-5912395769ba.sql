CREATE OR REPLACE FUNCTION public.worker_mark_booking_completed(_booking_id uuid, _final_amount numeric, _completion_note text DEFAULT NULL::text, _variance_reason text DEFAULT NULL::text, _variance_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE b public.bookings%ROWTYPE; approved numeric; proposal numeric; baseline numeric; baseline_label text; v_reason text; v_note text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _final_amount IS NULL OR _final_amount <= 0 THEN RAISE EXCEPTION 'Final amount must be greater than zero'; END IF;
  SELECT * INTO b FROM public.bookings WHERE id = _booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found'; END IF;
  IF b.worker_id <> auth.uid() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF b.status <> 'in_progress'::booking_status THEN RAISE EXCEPTION 'Booking is not in progress'; END IF;

  SELECT total INTO approved FROM public.booking_estimates
    WHERE booking_id = _booking_id AND status = 'approved'
    ORDER BY version DESC LIMIT 1;

  -- Accepted professional proposal (only for bookings created from an application)
  IF b.job_application_id IS NOT NULL THEN
    proposal := NULLIF(COALESCE(b.estimated_amount, b.estimated_cost::numeric), 0);
  END IF;

  -- Priority: approved estimate > accepted proposal > customer budget
  IF approved IS NOT NULL THEN
    baseline := approved; baseline_label := 'approved estimate';
  ELSIF proposal IS NOT NULL AND proposal > 0 THEN
    baseline := proposal; baseline_label := 'accepted proposal';
  ELSIF b.budget IS NOT NULL AND b.budget > 0 THEN
    baseline := b.budget::numeric; baseline_label := 'customer budget';
  END IF;

  v_reason := NULLIF(trim(COALESCE(_variance_reason,'')),'');
  v_note := NULLIF(trim(COALESCE(_variance_note,'')),'');

  IF baseline IS NOT NULL AND baseline <> _final_amount THEN
    IF v_reason IS NULL OR length(v_reason) < 3 THEN
      RAISE EXCEPTION 'Please give a reason why the final amount differs from the %', baseline_label;
    END IF;
    IF v_reason ILIKE 'other%' AND (v_note IS NULL OR length(v_note) < 3) AND length(v_reason) < 10 THEN
      RAISE EXCEPTION 'Please add a short note explaining the difference';
    END IF;
  ELSE
    v_reason := NULL;
    v_note := NULL;
  END IF;

  PERFORM set_config('app.booking_rpc', 'on', true);
  UPDATE public.bookings
    SET status = 'awaiting_customer_confirmation'::booking_status,
        final_amount = _final_amount,
        estimated_amount = COALESCE(approved, estimated_amount),
        completion_note = NULLIF(trim(COALESCE(_completion_note,'')),''),
        final_amount_reason = v_reason,
        final_amount_note = v_note,
        worker_completed_at = now(),
        payment_status = 'awaiting_confirmation'
    WHERE id = _booking_id;
END $function$;