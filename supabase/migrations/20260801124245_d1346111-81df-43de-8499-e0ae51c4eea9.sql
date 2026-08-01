-- 1) Notify customer when worker uploads progress / completion photos
CREATE OR REPLACE FUNCTION public.booking_add_photos(_booking_id uuid, _kind text, _urls jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  b public.bookings%ROWTYPE;
  n_added int;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _kind NOT IN ('progress','completion') THEN RAISE EXCEPTION 'Invalid photo kind'; END IF;
  SELECT * INTO b FROM public.bookings WHERE id = _booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found'; END IF;
  IF b.worker_id <> auth.uid() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  PERFORM set_config('app.booking_rpc','on',true);

  n_added := COALESCE(jsonb_array_length(COALESCE(_urls,'[]'::jsonb)), 0);

  IF _kind = 'progress' THEN
    UPDATE public.bookings SET progress_photos = COALESCE(progress_photos,'[]'::jsonb) || COALESCE(_urls,'[]'::jsonb) WHERE id = _booking_id;
  ELSE
    UPDATE public.bookings SET completion_photos = COALESCE(completion_photos,'[]'::jsonb) || COALESCE(_urls,'[]'::jsonb) WHERE id = _booking_id;
  END IF;

  IF n_added > 0 THEN
    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (
      b.customer_id,
      CASE WHEN _kind = 'progress' THEN 'booking_progress_photo' ELSE 'booking_completion_photo' END,
      CASE WHEN _kind = 'progress' THEN 'Work in Progress photo added' ELSE 'Work Completion photo added' END,
      CASE WHEN _kind = 'progress'
        THEN 'Your professional uploaded a Work in Progress photo.'
        ELSE 'Your professional uploaded a Work Completion photo.' END,
      jsonb_build_object('booking_id', _booking_id, 'kind', _kind, 'count', n_added)
    );
  END IF;
END $function$;

-- 2) Allow job edits until the selected professional is on the way
CREATE OR REPLACE FUNCTION public.customer_update_job_request(_job_id uuid, _title text, _description text, _category_id uuid, _budget integer, _urgency text, _preferred_at timestamp with time zone, _city text, _address text, _service_area text, _region text, _area text, _landmark text, _location_instructions text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  jr public.job_requests%ROWTYPE;
  bk public.bookings%ROWTYPE;
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
  IF jr.status::text NOT IN ('open','assigned') THEN RAISE EXCEPTION 'This job can no longer be edited'; END IF;

  IF jr.booking_id IS NOT NULL THEN
    SELECT * INTO bk FROM public.bookings WHERE id = jr.booking_id;
    IF FOUND AND bk.status::text NOT IN ('pending','accepted') THEN
      RAISE EXCEPTION 'Your professional has already started travelling — edits are locked';
    END IF;
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
    IF jr.assigned_worker_id IS NOT NULL AND jr.booking_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, type, title, body, data)
      VALUES (jr.assigned_worker_id, 'job_updated', 'Job details updated',
        'The customer updated details for your job: ' || trim(_title),
        jsonb_build_object('booking_id', jr.booking_id, 'job_id', _job_id));
    END IF;
  END IF;
END $function$;

-- 3) Selecting a professional no longer rejects the other applicants
CREATE OR REPLACE FUNCTION public.customer_accept_job_application(_application_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  app public.job_applications%ROWTYPE;
  jr  public.job_requests%ROWTYPE;
  new_booking_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO app FROM public.job_applications WHERE id = _application_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Application not found'; END IF;
  SELECT * INTO jr FROM public.job_requests WHERE id = app.job_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Job not found'; END IF;
  IF jr.customer_id <> auth.uid() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF jr.status::text <> 'open' THEN RAISE EXCEPTION 'This job is no longer open'; END IF;
  IF app.status <> 'pending'::job_application_status THEN RAISE EXCEPTION 'Application is not pending'; END IF;

  PERFORM set_config('app.booking_rpc', 'on', true);
  INSERT INTO public.bookings (
    customer_id, worker_id, category_id, description, address,
    scheduled_at, estimated_cost, status, photos, urgency, budget,
    service_area, latitude, longitude, estimated_amount, job_application_id
  ) VALUES (
    jr.customer_id, app.worker_id, jr.category_id,
    COALESCE(jr.description, jr.title),
    jr.address,
    COALESCE(app.estimated_start, jr.preferred_at),
    app.quoted_price,
    'accepted'::booking_status,
    COALESCE(jr.media, '[]'::jsonb),
    'normal',
    jr.budget,
    jr.service_area,
    jr.lat, jr.lng,
    app.quoted_price,
    app.id
  ) RETURNING id INTO new_booking_id;

  UPDATE public.job_requests
    SET status = 'assigned'::job_request_status,
        assigned_worker_id = app.worker_id,
        booking_id = new_booking_id
    WHERE id = jr.id;

  UPDATE public.job_applications SET status = 'accepted'::job_application_status WHERE id = app.id;
  -- Remaining applicants intentionally stay 'pending' until the selected
  -- professional presses "I'm on my way" (see worker_mark_on_the_way).

  RETURN new_booking_id;
END $function$;

-- 4) When the selected professional starts travelling, close out other applicants
CREATE OR REPLACE FUNCTION public.worker_mark_on_the_way(_booking_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  b public.bookings%ROWTYPE;
  jr public.job_requests%ROWTYPE;
  app_row record;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO b FROM public.bookings WHERE id = _booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found'; END IF;
  IF b.worker_id <> auth.uid() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF b.status <> 'accepted'::booking_status THEN RAISE EXCEPTION 'Only accepted bookings can be marked on the way'; END IF;
  PERFORM set_config('app.booking_rpc', 'on', true);
  UPDATE public.bookings SET status = 'on_the_way'::booking_status, on_the_way_at = now() WHERE id = _booking_id;

  SELECT * INTO jr FROM public.job_requests WHERE booking_id = _booking_id;
  IF FOUND THEN
    FOR app_row IN
      SELECT id, worker_id FROM public.job_applications
       WHERE job_id = jr.id AND worker_id <> b.worker_id
         AND status = 'pending'::job_application_status
    LOOP
      UPDATE public.job_applications
         SET status = 'rejected'::job_application_status,
             declined_at = now(),
             decline_reason = 'another_professional_selected'
       WHERE id = app_row.id;

      INSERT INTO public.notifications (user_id, type, title, body, data)
      VALUES (app_row.worker_id, 'application_closed', 'Job no longer available',
        'Another professional is now on the way to complete this job.',
        jsonb_build_object('job_id', jr.id));
    END LOOP;
  END IF;
END $function$;