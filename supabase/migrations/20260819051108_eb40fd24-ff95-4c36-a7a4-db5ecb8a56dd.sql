-- Prevent duplicate job-match notifications per professional + job
CREATE UNIQUE INDEX IF NOT EXISTS notifications_job_match_unique
  ON public.notifications (user_id, ((data->>'job_id')))
  WHERE type = 'job_match';

CREATE OR REPLACE FUNCTION public.notify_matching_workers_new_job()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  area_name text;
  prof_name text;
BEGIN
  IF NEW.status::text <> 'open' OR NEW.service_area_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT name INTO area_name FROM public.service_areas WHERE id = NEW.service_area_id;
  SELECT name INTO prof_name FROM public.categories WHERE id = NEW.category_id;

  INSERT INTO public.notifications (user_id, type, title, body, data)
  SELECT DISTINCT w.user_id,
         'job_match',
         'New job in ' || COALESCE(area_name, 'your area'),
         'A new ' || COALESCE(prof_name, 'service') || ' job in ' || COALESCE(area_name, 'your area')
           || ' matches your profession and service area. View it and apply if interested.',
         jsonb_build_object('job_id', NEW.id, 'service_area_id', NEW.service_area_id,
                            'category_id', NEW.category_id, 'profession', prof_name)
  FROM public.worker_profiles w
  WHERE w.verification_status::text = 'approved'
    AND COALESCE(w.is_available, true) = true
    AND w.user_id <> NEW.customer_id
    -- covers the job's canonical service area
    AND EXISTS (
      SELECT 1 FROM public.worker_service_areas wsa
      WHERE wsa.worker_id = w.user_id AND wsa.service_area_id = NEW.service_area_id
    )
    -- matching profession (approved profession, or legacy primary category)
    AND NEW.category_id IS NOT NULL
    AND (
      EXISTS (
        SELECT 1 FROM public.worker_professions wp
        WHERE wp.user_id = w.user_id
          AND wp.category_id = NEW.category_id
          AND wp.verification_status = 'approved'
      )
      OR w.category_id = NEW.category_id
    )
    -- not busy on an active booking
    AND NOT EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.worker_id = w.user_id
        AND b.status::text IN ('accepted','on_the_way','arrived','in_progress',
                               'awaiting_customer_confirmation','worker_on_the_way',
                               'work_started','worker_marked_complete','disputed')
    )
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_notify_matching_workers_new_job ON public.job_requests;
CREATE TRIGGER trg_notify_matching_workers_new_job
AFTER INSERT ON public.job_requests
FOR EACH ROW EXECUTE FUNCTION public.notify_matching_workers_new_job();