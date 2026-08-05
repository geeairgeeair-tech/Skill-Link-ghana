CREATE OR REPLACE FUNCTION public.validate_new_booking_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  placeholders text[] := ARRAY['n/a','na','none','test','unknown','-','.','xxx'];
BEGIN
  IF length(coalesce(btrim(NEW.description),'')) < 10 THEN
    RAISE EXCEPTION 'Please describe the job before continuing.';
  END IF;
  IF length(coalesce(btrim(NEW.address),'')) < 5
     OR lower(btrim(coalesce(NEW.address,''))) = ANY(placeholders) THEN
    RAISE EXCEPTION 'Enter the exact service address.';
  END IF;
  IF length(coalesce(btrim(NEW.service_area),'')) < 3
     OR lower(btrim(coalesce(NEW.service_area,''))) = ANY(placeholders) THEN
    RAISE EXCEPTION 'Enter the general service area.';
  END IF;
  NEW.description := btrim(NEW.description);
  NEW.address := btrim(NEW.address);
  NEW.service_area := btrim(NEW.service_area);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS validate_new_booking_fields_trg ON public.bookings;
CREATE TRIGGER validate_new_booking_fields_trg
BEFORE INSERT ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.validate_new_booking_fields();