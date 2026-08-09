CREATE OR REPLACE FUNCTION public.customer_update_job_request(
  _job_id uuid, _title text, _description text, _category_id uuid, _budget integer,
  _urgency text, _preferred_at timestamptz, _city text, _address text,
  _service_area text, _region text, _area text, _landmark text, _location_instructions text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  jr public.job_requests%ROWTYPE;
  material_changed boolean := false;
  app_row record;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF length(coalesce(trim(_title),'')) < 4 THEN RAISE EXCEPTION 'Title is required (min 4 chars)'; END IF;
  IF length(coalesce(trim(_description),'')) < 10 THEN RAISE EXCEPTION 'Description is required (min 10 chars)'; END IF;
  IF _urgency IS NULL OR _urgency NOT IN ('normal','urgent','emergency') THEN RAISE EXCEPTION 'Invalid urgency'; END IF;

  SELECT * INTO jr FROM public.job_requests WHERE id = _job_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Job not found'; END IF;
  IF jr.customer_id <> auth.uid() THEN RAISE EXCEPTION 'Not authorized'; END IF;

  -- Permanently locked once a professional has been accepted.
  IF jr.status::text <> 'open' OR jr.assigned_worker_id IS NOT NULL OR jr.booking_id IS NOT NULL THEN
    RAISE EXCEPTION 'This job can no longer be edited — a professional has been accepted';
  END IF;

  IF jr.budget IS DISTINCT FROM _budget
     OR jr.preferred_at IS DISTINCT FROM _preferred_at
     OR jr.category_id IS DISTINCT FROM _category_id
     OR jr.city IS DISTINCT FROM _city
     OR jr.service_area IS DISTINCT FROM _service_area
     OR jr.address IS DISTINCT FROM _address THEN
    material_changed := true;
  END IF;

  UPDATE public.job_requests SET
    title = trim(_title),
    description = trim(_description),
    category_id = _category_id,
    budget = _budget,
    urgency = _urgency::job_urgency,
    preferred_at = _preferred_at,
    city = NULLIF(trim(coalesce(_city,'')),''),
    address = NULLIF(trim(coalesce(_address,'')),''),
    service_area = NULLIF(trim(coalesce(_service_area,'')),''),
    region = NULLIF(trim(coalesce(_region,'')),''),
    area = NULLIF(trim(coalesce(_area,'')),''),
    landmark = NULLIF(trim(coalesce(_landmark,'')),''),
    location_instructions = NULLIF(trim(coalesce(_location_instructions,'')),''),
    updated_at = now()
  WHERE id = _job_id;

  IF material_changed THEN
    FOR app_row IN
      SELECT worker_id FROM public.job_applications
       WHERE job_id = _job_id AND status = 'pending'::job_application_status
    LOOP
      INSERT INTO public.notifications (user_id, type, title, body, data)
      VALUES (app_row.worker_id, 'job_updated', 'Job details updated',
        'The customer updated details for a job you applied to: ' || trim(_title),
        jsonb_build_object('job_id', _job_id));
    END LOOP;
  END IF;
END $$;