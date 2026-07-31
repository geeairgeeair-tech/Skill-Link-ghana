CREATE OR REPLACE FUNCTION public.prevent_self_booking()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.customer_id IS NOT NULL AND NEW.worker_id IS NOT NULL AND NEW.customer_id = NEW.worker_id THEN
    RAISE EXCEPTION 'You cannot book yourself.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_self_booking ON public.bookings;
CREATE TRIGGER trg_prevent_self_booking
BEFORE INSERT OR UPDATE ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.prevent_self_booking();