-- Fix 1: on completion the worker was getting BOTH 'booking_completed' (thanks)
-- and 'customer_confirmed' (from notify_booking_events) in the same transaction.
-- Keep the thank-you for the customer only; the worker keeps 'customer_confirmed'.
CREATE OR REPLACE FUNCTION public.notify_booking_completed_thanks()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status::text IN ('completed','closed','customer_confirmed_complete')
     AND OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.notifications (user_id, type, title, body, data) VALUES
      (NEW.customer_id, 'booking_completed', 'Booking complete — thank you',
        'Your booking has been completed successfully. Thank you for trusting Skill Link to connect you with a skilled professional. We hope to serve you again.',
        jsonb_build_object('booking_id', NEW.id));
  END IF;
  RETURN NEW;
END $function$;

-- Fix 2: bookings created from an accepted job application already notify the
-- professional via 'application_accepted'; suppress the generic 'booking_request'.
CREATE OR REPLACE FUNCTION public.notify_booking_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  customer_name text;
  worker_name text;
  reason_label text;
  prof_name text;
BEGIN
  SELECT c.name INTO prof_name FROM public.categories c WHERE c.id = NEW.category_id;

  IF TG_OP = 'INSERT' THEN
    IF NEW.job_application_id IS NOT NULL THEN
      RETURN NEW;
    END IF;
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