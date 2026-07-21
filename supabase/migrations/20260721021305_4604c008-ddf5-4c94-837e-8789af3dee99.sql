
-- Re-point FKs from auth.users to public.profiles (profiles.id already cascades from auth.users)
ALTER TABLE public.job_requests DROP CONSTRAINT job_requests_customer_id_fkey;
ALTER TABLE public.job_requests
  ADD CONSTRAINT job_requests_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.job_applications DROP CONSTRAINT job_applications_worker_id_fkey;
ALTER TABLE public.job_applications
  ADD CONSTRAINT job_applications_worker_id_fkey FOREIGN KEY (worker_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.bookings DROP CONSTRAINT bookings_customer_id_fkey;
ALTER TABLE public.bookings DROP CONSTRAINT bookings_worker_id_fkey;
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.profiles(id) ON DELETE CASCADE,
  ADD CONSTRAINT bookings_worker_id_fkey FOREIGN KEY (worker_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- Extend booking_status enum
ALTER TYPE booking_status ADD VALUE IF NOT EXISTS 'worker_on_the_way';
ALTER TYPE booking_status ADD VALUE IF NOT EXISTS 'work_started';
ALTER TYPE booking_status ADD VALUE IF NOT EXISTS 'worker_marked_complete';
ALTER TYPE booking_status ADD VALUE IF NOT EXISTS 'customer_confirmed_complete';
ALTER TYPE booking_status ADD VALUE IF NOT EXISTS 'closed';
ALTER TYPE booking_status ADD VALUE IF NOT EXISTS 'disputed';
ALTER TYPE booking_status ADD VALUE IF NOT EXISTS 'no_show';

-- Application notifications trigger
CREATE OR REPLACE FUNCTION public.notify_application_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
        jsonb_build_object('job_id', NEW.job_id, 'application_id', NEW.id));
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    SELECT * INTO job_row FROM public.job_requests WHERE id = NEW.job_id;
    IF NEW.status = 'accepted' THEN
      INSERT INTO public.notifications (user_id, type, title, body, data)
      VALUES (NEW.worker_id, 'application_accepted', 'You were hired',
        'Your application for "' || COALESCE(job_row.title, 'a job') || '" was accepted',
        jsonb_build_object('job_id', NEW.job_id, 'application_id', NEW.id));
    ELSIF NEW.status = 'rejected' THEN
      INSERT INTO public.notifications (user_id, type, title, body, data)
      VALUES (NEW.worker_id, 'application_rejected', 'Application declined',
        'Your application for "' || COALESCE(job_row.title, 'a job') || '" was declined',
        jsonb_build_object('job_id', NEW.job_id, 'application_id', NEW.id));
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_application_events() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_notify_application_insert ON public.job_applications;
DROP TRIGGER IF EXISTS trg_notify_application_status ON public.job_applications;
CREATE TRIGGER trg_notify_application_insert AFTER INSERT ON public.job_applications
  FOR EACH ROW EXECUTE FUNCTION public.notify_application_events();
CREATE TRIGGER trg_notify_application_status AFTER UPDATE ON public.job_applications
  FOR EACH ROW EXECUTE FUNCTION public.notify_application_events();

-- Verification notifications trigger
CREATE OR REPLACE FUNCTION public.notify_verification_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.verification_status IS DISTINCT FROM OLD.verification_status THEN
    IF NEW.verification_status = 'approved' THEN
      INSERT INTO public.notifications (user_id, type, title, body, data)
      VALUES (NEW.user_id, 'verification_approved', 'You are verified',
        'Your worker profile has been approved. You can now receive bookings.',
        jsonb_build_object('worker_id', NEW.user_id));
    ELSIF NEW.verification_status = 'rejected' THEN
      INSERT INTO public.notifications (user_id, type, title, body, data)
      VALUES (NEW.user_id, 'verification_rejected', 'Verification declined',
        COALESCE(NEW.rejection_reason, 'Please review the requirements and resubmit.'),
        jsonb_build_object('worker_id', NEW.user_id));
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_verification_events() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_notify_verification ON public.worker_profiles;
CREATE TRIGGER trg_notify_verification AFTER UPDATE ON public.worker_profiles
  FOR EACH ROW EXECUTE FUNCTION public.notify_verification_events();
