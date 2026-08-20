
-- 1) ONE canonical definition of "unresolved accepted commitment"
CREATE OR REPLACE FUNCTION public.commitment_statuses()
RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT ARRAY['accepted','on_the_way','arrived','in_progress',
               'awaiting_customer_confirmation','worker_on_the_way',
               'work_started','worker_marked_complete','disputed']::text[];
$$;

CREATE OR REPLACE FUNCTION public.worker_has_commitment(_worker_id uuid, _exclude_booking uuid DEFAULT NULL)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.bookings b
     WHERE b.worker_id = _worker_id
       AND (_exclude_booking IS NULL OR b.id <> _exclude_booking)
       AND b.status::text = ANY (public.commitment_statuses())
  );
$$;

GRANT EXECUTE ON FUNCTION public.commitment_statuses() TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.worker_has_commitment(uuid, uuid) TO authenticated, service_role;

-- 2) Reuse it everywhere
CREATE OR REPLACE FUNCTION public.get_worker_public_status(_worker_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT CASE
    WHEN NOT COALESCE((SELECT is_available FROM public.worker_profiles WHERE user_id = _worker_id), true) THEN 'unavailable'
    WHEN public.worker_has_commitment(_worker_id) THEN 'busy'
    ELSE 'available'
  END;
$$;

CREATE OR REPLACE FUNCTION public.list_busy_workers()
RETURNS TABLE(worker_id uuid) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT DISTINCT b.worker_id FROM public.bookings b
   WHERE b.status::text = ANY (public.commitment_statuses());
$$;

CREATE OR REPLACE FUNCTION public.get_worker_active_booking(_worker_id uuid)
RETURNS TABLE(booking_id uuid, status text, created_at timestamp with time zone)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT b.id, b.status::text, b.created_at
  FROM public.bookings b
  WHERE b.worker_id = _worker_id
    AND b.status::text = ANY (public.commitment_statuses())
    AND (
      auth.uid() = _worker_id
      OR auth.uid() = b.customer_id
      OR public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'super_admin')
    )
  ORDER BY b.created_at DESC
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.enforce_worker_availability_on_booking()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE wp public.worker_profiles%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.worker_id::text, 0));

  SELECT * INTO wp FROM public.worker_profiles WHERE user_id = NEW.worker_id;
  IF NOT FOUND OR wp.verification_status::text <> 'approved' THEN
    RAISE EXCEPTION 'This professional is not available for bookings right now.';
  END IF;

  IF COALESCE(wp.is_available, true) = false THEN
    RAISE EXCEPTION 'This worker is currently unavailable. Please choose another professional or check again later.';
  END IF;

  IF public.worker_has_commitment(NEW.worker_id, NEW.id) THEN
    RAISE EXCEPTION 'This professional already has an accepted booking and is reserved until it is completed or resolved.';
  END IF;

  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.worker_accept_booking(_booking_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE b public.bookings%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 0));
  SELECT * INTO b FROM public.bookings WHERE id = _booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found'; END IF;
  IF b.worker_id <> auth.uid() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF b.status <> 'pending'::booking_status THEN RAISE EXCEPTION 'Only pending bookings can be accepted'; END IF;
  IF public.worker_has_commitment(auth.uid(), _booking_id) THEN
    RAISE EXCEPTION 'You already have an accepted booking. Complete or resolve it before accepting another.';
  END IF;
  PERFORM set_config('app.booking_rpc', 'on', true);
  UPDATE public.bookings SET status = 'accepted'::booking_status, accepted_at = now() WHERE id = _booking_id;
END $$;

CREATE OR REPLACE FUNCTION public.worker_apply_to_job(_job_id uuid, _proposed_amount integer, _estimated_start timestamp with time zone, _message text DEFAULT NULL::text, _note text DEFAULT NULL::text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  wp public.worker_profiles%ROWTYPE;
  jr public.job_requests%ROWTYPE;
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
        WHERE p.user_id = auth.uid() AND p.category_id = jr.category_id AND p.verification_status = 'approved'
     ) THEN
    RAISE EXCEPTION 'This job is not in your service category';
  END IF;

  IF jr.service_area_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.worker_service_areas wsa
        WHERE wsa.worker_id = auth.uid() AND wsa.service_area_id = jr.service_area_id
     ) THEN
    SELECT name INTO area_name FROM public.service_areas WHERE id = jr.service_area_id;
    RAISE EXCEPTION 'This job is in %, which is outside your service areas.', COALESCE(area_name, 'another area');
  END IF;

  IF NOT COALESCE(wp.is_available, true) THEN
    RAISE EXCEPTION 'You are marked unavailable. Switch to Available to apply for jobs.';
  END IF;
  IF public.worker_has_commitment(auth.uid()) THEN
    RAISE EXCEPTION 'You already have an accepted booking. Complete or resolve it before applying for another job.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.job_applications WHERE job_id = _job_id AND worker_id = auth.uid() AND status IN ('pending','accepted')) THEN
    RAISE EXCEPTION 'You have already applied to this job';
  END IF;

  INSERT INTO public.job_applications (job_id, worker_id, quoted_price, estimated_start, message)
  VALUES (_job_id, auth.uid(), _proposed_amount, _estimated_start,
          NULLIF(trim(COALESCE(_message,'') || CASE WHEN _note IS NOT NULL AND length(trim(_note))>0 THEN E'\n\nNote: '||trim(_note) ELSE '' END), ''))
  RETURNING id INTO new_app_id;

  RETURN new_app_id;
END $$;

CREATE OR REPLACE FUNCTION public.notify_matching_workers_new_job()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
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
    AND EXISTS (
      SELECT 1 FROM public.worker_service_areas wsa
      WHERE wsa.worker_id = w.user_id AND wsa.service_area_id = NEW.service_area_id
    )
    AND NEW.category_id IS NOT NULL
    AND (
      EXISTS (
        SELECT 1 FROM public.worker_professions wp
        WHERE wp.user_id = w.user_id AND wp.category_id = NEW.category_id AND wp.verification_status = 'approved'
      )
      OR w.category_id = NEW.category_id
    )
    -- suppressed while the professional has an unresolved accepted commitment
    AND NOT public.worker_has_commitment(w.user_id)
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END; $$;

-- Job-application acceptance: explicit, friendly server-side lock check
CREATE OR REPLACE FUNCTION public.customer_accept_job_application(_application_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  app public.job_applications%ROWTYPE;
  jr  public.job_requests%ROWTYPE;
  new_booking_id uuid;
  accepted_ts timestamptz := now();
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO app FROM public.job_applications WHERE id = _application_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Application not found'; END IF;
  SELECT * INTO jr FROM public.job_requests WHERE id = app.job_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Job not found'; END IF;
  IF jr.customer_id <> auth.uid() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF jr.status::text <> 'open' THEN RAISE EXCEPTION 'This job is no longer open'; END IF;
  IF app.status <> 'pending'::job_application_status THEN RAISE EXCEPTION 'Application is not pending'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(app.worker_id::text, 0));
  IF public.worker_has_commitment(app.worker_id) THEN
    RAISE EXCEPTION 'This professional already has an accepted booking and is reserved until it is completed or resolved.';
  END IF;

  PERFORM set_config('app.booking_rpc', 'on', true);
  INSERT INTO public.bookings (
    customer_id, worker_id, category_id, description, address,
    scheduled_at, estimated_cost, status, photos, urgency, budget,
    service_area, latitude, longitude, estimated_amount, job_application_id, accepted_at
  ) VALUES (
    jr.customer_id, app.worker_id, jr.category_id,
    COALESCE(jr.description, jr.title), jr.address,
    COALESCE(app.estimated_start, jr.preferred_at), app.quoted_price,
    'accepted'::booking_status, COALESCE(jr.media, '[]'::jsonb), 'normal',
    jr.budget, jr.service_area, jr.lat, jr.lng, app.quoted_price, app.id, accepted_ts
  ) RETURNING id INTO new_booking_id;

  UPDATE public.job_requests
    SET status = 'assigned'::job_request_status,
        assigned_worker_id = app.worker_id,
        booking_id = new_booking_id
    WHERE id = jr.id;

  UPDATE public.job_applications SET status = 'accepted'::job_application_status WHERE id = app.id;
  RETURN new_booking_id;
END $$;

-- 3) Scheduled-booking reminders (server-side, pg_cron; works while users are offline)
CREATE OR REPLACE FUNCTION public.send_scheduled_booking_reminders()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  r record;
  spec record;
BEGIN
  FOR spec IN
    SELECT * FROM (VALUES
      ('booking_reminder_24h', interval '24 hours', interval '30 minutes', 'Booking tomorrow', 'Your scheduled booking starts tomorrow.'),
      ('booking_reminder_2h',  interval '2 hours',  interval '15 minutes', 'Booking in 2 hours', 'Your scheduled booking starts in 2 hours.'),
      ('booking_reminder_30m', interval '30 minutes', interval '10 minutes', 'Booking in 30 minutes', 'Your scheduled booking starts in 30 minutes. Get ready.'),
      ('booking_reminder_start', interval '0 minutes', interval '10 minutes', 'It''s time', 'It''s time for your scheduled booking.')
    ) AS t(kind, lead, window_len, title, body)
  LOOP
    FOR r IN
      SELECT b.id, b.worker_id
      FROM public.bookings b
      WHERE b.scheduled_at IS NOT NULL
        AND b.status::text = ANY (public.commitment_statuses())
        AND b.scheduled_at - spec.lead <= now()
        AND b.scheduled_at - spec.lead > now() - spec.window_len
        AND NOT EXISTS (
          SELECT 1 FROM public.notifications n
          WHERE n.user_id = b.worker_id AND n.type = spec.kind
            AND n.data->>'booking_id' = b.id::text
        )
    LOOP
      INSERT INTO public.notifications (user_id, type, title, body, data)
      VALUES (r.worker_id, spec.kind, spec.title, spec.body,
              jsonb_build_object('booking_id', r.id));
    END LOOP;
  END LOOP;
END $$;

SELECT cron.schedule('scheduled-booking-reminders', '*/5 * * * *', $$SELECT public.send_scheduled_booking_reminders();$$);
