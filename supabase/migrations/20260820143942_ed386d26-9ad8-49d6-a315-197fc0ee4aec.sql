CREATE OR REPLACE FUNCTION public.guard_booking_worker_updates()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  bypass text;
  col text;
  protected_cols text[] := ARRAY[
    'customer_id','worker_id','job_application_id','submission_id',
    'status','payment_status','amount_paid','final_amount','estimated_amount','estimated_cost',
    'final_amount_reason','final_amount_note','completion_note',
    'dispute_reason','dispute_details','disputed_at',
    'admin_review_requested_at','admin_resolution_note','admin_resolved_at',
    'accepted_at','on_the_way_at','arrived_at','started_at',
    'worker_completed_at','customer_confirmed_at','payment_confirmed_at',
    'declined_at','decline_reason','decline_note',
    'cancelled_at','cancelled_by','cancelled_by_role','cancel_reason_code','cancel_note',
    'is_paused','paused_at','pause_reason','return_count','reopened_at',
    'photos','progress_photos','completion_photos',
    'reminder_count','last_reminder_at'
  ];
  old_j jsonb := to_jsonb(OLD);
  new_j jsonb := to_jsonb(NEW);
BEGIN
  -- Trusted paths: explicit RPC bypass flag, or execution inside a
  -- SECURITY DEFINER lifecycle function (current_user is the function owner,
  -- not the PostgREST 'authenticated'/'anon' role).
  bypass := current_setting('app.booking_rpc', true);
  IF bypass = 'on' THEN RETURN NEW; END IF;
  IF current_user NOT IN ('authenticated','anon') THEN RETURN NEW; END IF;
  IF public.has_role(auth.uid(), 'admin') THEN RETURN NEW; END IF;

  FOREACH col IN ARRAY protected_cols LOOP
    IF (old_j -> col) IS DISTINCT FROM (new_j -> col) THEN
      RAISE EXCEPTION 'Field "%" can only be changed through the booking workflow.', col
        USING ERRCODE = '42501';
    END IF;
  END LOOP;

  RETURN NEW;
END $function$;