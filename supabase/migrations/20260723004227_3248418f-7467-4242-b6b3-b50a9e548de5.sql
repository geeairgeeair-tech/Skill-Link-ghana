
-- 1. Track decline metadata on applications
ALTER TABLE public.job_applications
  ADD COLUMN IF NOT EXISTS declined_at timestamptz,
  ADD COLUMN IF NOT EXISTS decline_reason text;

-- 2. Track completion time on public job posts
ALTER TABLE public.job_requests
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

-- 3. Customer decline application RPC
CREATE OR REPLACE FUNCTION public.customer_decline_job_application(_application_id uuid, _reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  app public.job_applications%ROWTYPE;
  jr  public.job_requests%ROWTYPE;
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

  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (app.worker_id, 'application_rejected', 'Application not selected',
    'Your application for "' || COALESCE(jr.title, 'a job') || '" was not selected.',
    jsonb_build_object('job_id', jr.id, 'application_id', _application_id, 'reason', trim(_reason)));
END $$;

-- 4. Sync linked job status when booking is completed
CREATE OR REPLACE FUNCTION public.sync_job_on_booking_complete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status = 'completed'::booking_status
     AND (OLD.status IS DISTINCT FROM NEW.status) THEN
    UPDATE public.job_requests
      SET status = 'completed'::job_request_status,
          completed_at = COALESCE(completed_at, now()),
          updated_at = now()
      WHERE booking_id = NEW.id
        AND status <> 'completed'::job_request_status;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sync_job_on_booking_complete ON public.bookings;
CREATE TRIGGER trg_sync_job_on_booking_complete
  AFTER UPDATE OF status ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.sync_job_on_booking_complete();

-- 5. Backfill: mark any assigned jobs whose linked bookings are already completed
UPDATE public.job_requests jr
  SET status = 'completed'::job_request_status,
      completed_at = COALESCE(jr.completed_at, b.customer_confirmed_at, b.updated_at, now()),
      updated_at = now()
  FROM public.bookings b
  WHERE jr.booking_id = b.id
    AND b.status = 'completed'::booking_status
    AND jr.status <> 'completed'::job_request_status;
