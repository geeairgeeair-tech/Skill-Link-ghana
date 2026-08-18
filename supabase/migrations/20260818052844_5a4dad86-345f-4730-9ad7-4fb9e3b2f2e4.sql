CREATE OR REPLACE FUNCTION public.worker_apply_to_job(_job_id uuid, _proposed_amount integer, _estimated_start timestamp with time zone, _message text DEFAULT NULL::text, _note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  wp public.worker_profiles%ROWTYPE;
  jr public.job_requests%ROWTYPE;
  st text;
  new_app_id uuid;
  area_name text;
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

  -- Canonical service-area matching (primary and additional areas count equally).
  -- Legacy jobs with a NULL service_area_id keep their previous behaviour.
  IF jr.service_area_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.worker_service_areas wsa
        WHERE wsa.worker_id = auth.uid()
          AND wsa.service_area_id = jr.service_area_id
     ) THEN
    SELECT name INTO area_name FROM public.service_areas WHERE id = jr.service_area_id;
    RAISE EXCEPTION 'This job is in %, which is outside your service areas.', COALESCE(area_name, 'another area');
  END IF;

  st := public.get_worker_public_status(auth.uid());
  IF st = 'unavailable' THEN
    RAISE EXCEPTION 'You are marked unavailable. Switch to Available to apply for jobs.';
  END IF;
  IF st = 'busy' THEN
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