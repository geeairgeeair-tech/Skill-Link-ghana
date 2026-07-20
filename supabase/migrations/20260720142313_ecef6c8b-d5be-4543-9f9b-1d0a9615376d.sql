
-- 1. Extend enum
ALTER TYPE booking_status ADD VALUE IF NOT EXISTS 'declined';
ALTER TYPE booking_status ADD VALUE IF NOT EXISTS 'arrived';

-- 2. New booking columns
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS urgency text NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS budget integer,
  ADD COLUMN IF NOT EXISTS service_area text,
  ADD COLUMN IF NOT EXISTS latitude numeric(9,6),
  ADD COLUMN IF NOT EXISTS longitude numeric(9,6);

ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_urgency_check;
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_urgency_check CHECK (urgency IN ('normal','urgent','emergency'));

-- 3. Notification trigger
CREATE OR REPLACE FUNCTION public.notify_booking_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  customer_name text;
  worker_name text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT full_name INTO customer_name FROM public.profiles WHERE id = NEW.customer_id;
    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (
      NEW.worker_id,
      'booking_request',
      'New booking request',
      COALESCE(customer_name, 'A customer') || ' requested your service',
      jsonb_build_object('booking_id', NEW.id, 'status', NEW.status)
    );
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    SELECT full_name INTO worker_name FROM public.profiles WHERE id = NEW.worker_id;
    IF NEW.status = 'accepted' THEN
      INSERT INTO public.notifications (user_id, type, title, body, data)
      VALUES (
        NEW.customer_id,
        'booking_accepted',
        'Booking accepted',
        COALESCE(worker_name,'The worker') || ' accepted your booking',
        jsonb_build_object('booking_id', NEW.id, 'status', NEW.status)
      );
    ELSIF NEW.status = 'declined' OR (NEW.status = 'cancelled' AND OLD.status = 'pending' AND auth.uid() = NEW.worker_id) THEN
      INSERT INTO public.notifications (user_id, type, title, body, data)
      VALUES (
        NEW.customer_id,
        'booking_declined',
        'Booking declined',
        COALESCE(worker_name,'The worker') || ' declined your booking',
        jsonb_build_object('booking_id', NEW.id, 'status', NEW.status)
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_booking_insert ON public.bookings;
CREATE TRIGGER trg_notify_booking_insert
AFTER INSERT ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.notify_booking_events();

DROP TRIGGER IF EXISTS trg_notify_booking_status ON public.bookings;
CREATE TRIGGER trg_notify_booking_status
AFTER UPDATE OF status ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.notify_booking_events();
