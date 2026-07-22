
CREATE OR REPLACE FUNCTION public.worker_update_job_application(
  _application_id uuid,
  _proposed_amount integer,
  _estimated_start timestamptz,
  _message text,
  _note text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  app public.job_applications%ROWTYPE;
  jr  public.job_requests%ROWTYPE;
  worker_name text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _proposed_amount IS NULL OR _proposed_amount < 1 THEN
    RAISE EXCEPTION 'Proposed amount must be at least GH¢1';
  END IF;
  IF _message IS NULL OR length(trim(_message)) < 3 THEN
    RAISE EXCEPTION 'Please include a short message to the customer';
  END IF;

  SELECT * INTO app FROM public.job_applications WHERE id = _application_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Application not found'; END IF;
  IF app.worker_id <> auth.uid() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF app.status <> 'pending'::job_application_status THEN
    RAISE EXCEPTION 'Only pending applications can be edited';
  END IF;

  SELECT * INTO jr FROM public.job_requests WHERE id = app.job_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Job not found'; END IF;
  IF jr.status::text <> 'open' THEN RAISE EXCEPTION 'This job is no longer open'; END IF;

  UPDATE public.job_applications
    SET quoted_price = _proposed_amount,
        estimated_start = _estimated_start,
        message = NULLIF(trim(COALESCE(_message,'') ||
          CASE WHEN _note IS NOT NULL AND length(trim(_note))>0
               THEN E'\n\nNote: '||trim(_note) ELSE '' END), '')
    WHERE id = _application_id;

  SELECT full_name INTO worker_name FROM public.profiles WHERE id = auth.uid();
  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (jr.customer_id, 'application_updated', 'Application updated',
    COALESCE(worker_name,'A worker') || ' updated their application for "' || COALESCE(jr.title,'your job') || '"',
    jsonb_build_object('job_id', jr.id, 'application_id', _application_id, 'quoted_price', _proposed_amount));
END $$;
