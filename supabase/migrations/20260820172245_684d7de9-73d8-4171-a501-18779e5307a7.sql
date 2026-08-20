CREATE OR REPLACE FUNCTION public.guard_job_request_media()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  -- Only enforce for ordinary authenticated callers (service_role / backend jobs have no auth.uid()).
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Admins may act on behalf of users.
  IF public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin') THEN
    RETURN NEW;
  END IF;

  -- Only validate when media actually changes; historical rows stay untouched.
  IF TG_OP = 'UPDATE' AND NEW.media IS NOT DISTINCT FROM OLD.media THEN
    RETURN NEW;
  END IF;

  IF NEW.media IS NULL OR jsonb_array_length(COALESCE(NEW.media,'[]'::jsonb)) = 0 THEN
    RETURN NEW;
  END IF;

  IF NOT public.media_array_owned_by(NEW.media, auth.uid()) THEN
    RAISE EXCEPTION 'Media must be files you uploaded';
  END IF;

  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_guard_job_request_media ON public.job_requests;
CREATE TRIGGER trg_guard_job_request_media
BEFORE INSERT OR UPDATE OF media ON public.job_requests
FOR EACH ROW EXECUTE FUNCTION public.guard_job_request_media();