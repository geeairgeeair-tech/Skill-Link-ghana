
ALTER TABLE public.notifications REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Drop duplicate manual notification (trigger trg_notify_application_insert already sends it)
CREATE OR REPLACE FUNCTION public.worker_apply_to_job(_job_id uuid, _proposed_amount integer, _estimated_start timestamp with time zone, _message text DEFAULT NULL::text, _note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  wp public.worker_profiles%ROWTYPE;
  jr public.job_requests%ROWTYPE;
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
  IF jr.customer_id = auth.uid() THEN RAISE EXCEPTION 'You cannot apply to your own job'; END IF;

  IF jr.category_id IS NOT NULL
     AND jr.category_id IS DISTINCT FROM wp.category_id
     AND NOT EXISTS (
       SELECT 1 FROM public.worker_professions p
        WHERE p.user_id = auth.uid()
          AND p.category_id = jr.category_id
          AND p.verification_status = 'approved'
     ) THEN
    RAISE EXCEPTION 'This job is not in your service category';
  END IF;

  IF public.get_worker_public_status(auth.uid()) = 'busy' THEN
    RAISE EXCEPTION 'You have an active booking. Finish it before applying to new jobs.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.job_applications WHERE job_id = _job_id AND worker_id = auth.uid() AND status IN ('pending','accepted')) THEN
    RAISE EXCEPTION 'You have already applied to this job';
  END IF;

  INSERT INTO public.job_applications (job_id, worker_id, quoted_price, estimated_start, message)
  VALUES (_job_id, auth.uid(), _proposed_amount,
          _estimated_start,
          NULLIF(trim(COALESCE(_message,'') || CASE WHEN _note IS NOT NULL AND length(trim(_note))>0 THEN E'\n\nNote: '||trim(_note) ELSE '' END), ''))
  RETURNING id INTO new_app_id;

  RETURN new_app_id;
END $function$;

-- Better copy + no duplicate on cancellation
CREATE OR REPLACE FUNCTION public.notify_application_events()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  job_row public.job_requests%ROWTYPE;
  worker_name text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT * INTO job_row FROM public.job_requests WHERE id = NEW.job_id;
    SELECT full_name INTO worker_name FROM public.profiles WHERE id = NEW.worker_id;
    IF job_row.customer_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, type, title, body, data)
      VALUES (job_row.customer_id, 'application_received', 'New application',
        COALESCE(worker_name, 'A worker') || ' applied to "' || COALESCE(job_row.title, 'your job') || '"',
        jsonb_build_object('job_id', NEW.job_id, 'application_id', NEW.id, 'quoted_price', NEW.quoted_price));
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    SELECT * INTO job_row FROM public.job_requests WHERE id = NEW.job_id;

    IF NEW.status = 'accepted' THEN
      INSERT INTO public.notifications (user_id, type, title, body, data)
      VALUES (NEW.worker_id, 'application_accepted', 'You were hired',
        'Your application for "' || COALESCE(job_row.title, 'a job') || '" was accepted',
        jsonb_build_object('job_id', NEW.job_id, 'application_id', NEW.id,
                           'booking_id', job_row.booking_id));

    ELSIF NEW.status = 'rejected' THEN
      -- job cancelled path already sends its own 'job_cancelled' notification
      IF job_row.status::text = 'cancelled' THEN RETURN NEW; END IF;

      IF NEW.decline_reason IS NOT NULL THEN
        INSERT INTO public.notifications (user_id, type, title, body, data)
        VALUES (NEW.worker_id, 'application_rejected', 'Application declined',
          'Your application for "' || COALESCE(job_row.title, 'a job') || '" was declined: ' || NEW.decline_reason,
          jsonb_build_object('job_id', NEW.job_id, 'application_id', NEW.id));
      ELSE
        INSERT INTO public.notifications (user_id, type, title, body, data)
        VALUES (NEW.worker_id, 'application_rejected', 'Another worker was selected',
          'The customer chose another worker for "' || COALESCE(job_row.title, 'a job') || '". Keep an eye on the job board for new work.',
          jsonb_build_object('job_id', NEW.job_id, 'application_id', NEW.id));
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
