
-- ============ STORAGE POLICIES ============
CREATE POLICY "worker docs owner write" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'worker-docs' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "worker docs owner update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'worker-docs' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "worker docs owner delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'worker-docs' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "worker docs owner or admin read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'worker-docs' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.has_role(auth.uid(),'admin')));

CREATE POLICY "portfolio owner write" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'worker-portfolio' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "portfolio owner update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'worker-portfolio' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "portfolio owner delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'worker-portfolio' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "portfolio readable to authenticated" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'worker-portfolio');

-- ============ BOOKING COLUMNS ============
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS progress_photos jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS completion_photos jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS is_paused boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS paused_at timestamptz,
  ADD COLUMN IF NOT EXISTS pause_reason text,
  ADD COLUMN IF NOT EXISTS return_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reopened_at timestamptz;

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS attachment_url text,
  ADD COLUMN IF NOT EXISTS read_at timestamptz;

ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS resolution text,
  ADD COLUMN IF NOT EXISTS is_return_review boolean NOT NULL DEFAULT false;

-- ============ WITHDRAW APPLICATION ============
CREATE OR REPLACE FUNCTION public.worker_withdraw_application(_application_id uuid, _reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE app public.job_applications%ROWTYPE; jr public.job_requests%ROWTYPE; wname text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO app FROM public.job_applications WHERE id = _application_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Application not found'; END IF;
  IF app.worker_id <> auth.uid() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF app.status <> 'pending'::job_application_status THEN RAISE EXCEPTION 'Only pending applications can be withdrawn'; END IF;

  UPDATE public.job_applications
    SET status = 'withdrawn'::job_application_status, updated_at = now()
    WHERE id = _application_id;

  SELECT * INTO jr FROM public.job_requests WHERE id = app.job_id;
  SELECT full_name INTO wname FROM public.profiles WHERE id = auth.uid();
  IF jr.id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (jr.customer_id, 'application_withdrawn', 'Application withdrawn',
      COALESCE(wname,'A worker') || ' withdrew their application for "' || COALESCE(jr.title,'your job') || '"'
      || CASE WHEN _reason IS NOT NULL AND length(trim(_reason)) > 0 THEN ': ' || trim(_reason) ELSE '' END,
      jsonb_build_object('job_id', jr.id, 'application_id', _application_id));
  END IF;
END $$;

-- ============ PAUSE / RESUME ============
CREATE OR REPLACE FUNCTION public.worker_pause_work(_booking_id uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE b public.bookings%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _reason IS NULL OR length(trim(_reason)) < 3 THEN RAISE EXCEPTION 'Please give a reason for pausing'; END IF;
  SELECT * INTO b FROM public.bookings WHERE id = _booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found'; END IF;
  IF b.worker_id <> auth.uid() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF b.status <> 'in_progress'::booking_status THEN RAISE EXCEPTION 'Only work in progress can be paused'; END IF;
  IF b.is_paused THEN RAISE EXCEPTION 'Work is already paused'; END IF;
  PERFORM set_config('app.booking_rpc','on',true);
  UPDATE public.bookings SET is_paused = true, paused_at = now(), pause_reason = trim(_reason) WHERE id = _booking_id;
  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (b.customer_id, 'work_paused', 'Work paused', trim(_reason), jsonb_build_object('booking_id', _booking_id));
END $$;

CREATE OR REPLACE FUNCTION public.worker_resume_work(_booking_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE b public.bookings%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO b FROM public.bookings WHERE id = _booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found'; END IF;
  IF b.worker_id <> auth.uid() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF NOT b.is_paused THEN RAISE EXCEPTION 'Work is not paused'; END IF;
  PERFORM set_config('app.booking_rpc','on',true);
  UPDATE public.bookings SET is_paused = false, paused_at = NULL, pause_reason = NULL WHERE id = _booking_id;
  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (b.customer_id, 'work_resumed', 'Work resumed', 'Your professional has resumed work.', jsonb_build_object('booking_id', _booking_id));
END $$;

-- ============ BOOKING PHOTOS ============
CREATE OR REPLACE FUNCTION public.booking_add_photos(_booking_id uuid, _kind text, _urls jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE b public.bookings%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _kind NOT IN ('progress','completion') THEN RAISE EXCEPTION 'Invalid photo kind'; END IF;
  SELECT * INTO b FROM public.bookings WHERE id = _booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found'; END IF;
  IF b.worker_id <> auth.uid() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  PERFORM set_config('app.booking_rpc','on',true);
  IF _kind = 'progress' THEN
    UPDATE public.bookings SET progress_photos = COALESCE(progress_photos,'[]'::jsonb) || COALESCE(_urls,'[]'::jsonb) WHERE id = _booking_id;
  ELSE
    UPDATE public.bookings SET completion_photos = COALESCE(completion_photos,'[]'::jsonb) || COALESCE(_urls,'[]'::jsonb) WHERE id = _booking_id;
  END IF;
END $$;

-- ============ MESSAGE READ RECEIPTS ============
CREATE OR REPLACE FUNCTION public.mark_messages_read(_booking_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE b public.bookings%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO b FROM public.bookings WHERE id = _booking_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found'; END IF;
  IF auth.uid() NOT IN (b.customer_id, b.worker_id) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  UPDATE public.messages SET read_at = now()
    WHERE booking_id = _booking_id AND sender_id <> auth.uid() AND read_at IS NULL;
END $$;

CREATE OR REPLACE FUNCTION public.unread_message_count(_user_id uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT COUNT(*)::int FROM public.messages m
  JOIN public.bookings b ON b.id = m.booking_id
  WHERE _user_id = auth.uid()
    AND m.sender_id <> _user_id
    AND m.read_at IS NULL
    AND (b.customer_id = _user_id OR b.worker_id = _user_id);
$$;

-- ============ RETURN REQUESTS ============
CREATE TABLE IF NOT EXISTS public.return_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL,
  worker_id uuid NOT NULL,
  reason text NOT NULL,
  photos jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  worker_response text,
  scheduled_at timestamptz,
  info_request text,
  customer_info_reply text,
  responded_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.return_requests TO authenticated;
GRANT ALL ON public.return_requests TO service_role;
ALTER TABLE public.return_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "parties can read return requests" ON public.return_requests FOR SELECT TO authenticated
  USING (auth.uid() = customer_id OR auth.uid() = worker_id OR public.has_role(auth.uid(),'admin'));

CREATE TRIGGER touch_return_requests BEFORE UPDATE ON public.return_requests
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.customer_request_return(_booking_id uuid, _reason text, _photos jsonb DEFAULT '[]'::jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE b public.bookings%ROWTYPE; new_id uuid; cname text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _reason IS NULL OR length(trim(_reason)) < 10 THEN RAISE EXCEPTION 'Please explain the issue (min 10 characters)'; END IF;
  SELECT * INTO b FROM public.bookings WHERE id = _booking_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found'; END IF;
  IF b.customer_id <> auth.uid() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF b.status <> 'completed'::booking_status THEN RAISE EXCEPTION 'Return visits can only be requested on completed bookings'; END IF;
  IF EXISTS (SELECT 1 FROM public.return_requests WHERE booking_id = _booking_id AND status IN ('pending','info_requested','scheduled','accepted')) THEN
    RAISE EXCEPTION 'There is already an open return request for this booking';
  END IF;

  INSERT INTO public.return_requests (booking_id, customer_id, worker_id, reason, photos)
  VALUES (_booking_id, b.customer_id, b.worker_id, trim(_reason), COALESCE(_photos,'[]'::jsonb))
  RETURNING id INTO new_id;

  SELECT full_name INTO cname FROM public.profiles WHERE id = auth.uid();
  INSERT INTO public.notifications (user_id, type, title, body, data) VALUES
    (b.worker_id, 'return_requested', 'Return visit requested',
      COALESCE(cname,'A customer') || ' asked you to come back: ' || substring(trim(_reason) from 1 for 120),
      jsonb_build_object('booking_id', _booking_id, 'return_id', new_id)),
    (b.customer_id, 'return_requested', 'Return visit requested',
      'We sent your return request to the professional.',
      jsonb_build_object('booking_id', _booking_id, 'return_id', new_id));
  RETURN new_id;
END $$;

CREATE OR REPLACE FUNCTION public.worker_respond_return(_return_id uuid, _action text, _note text DEFAULT NULL, _scheduled_at timestamptz DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r public.return_requests%ROWTYPE; b public.bookings%ROWTYPE; wname text; busy boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _action NOT IN ('accept','schedule','request_info','decline') THEN RAISE EXCEPTION 'Invalid action'; END IF;
  SELECT * INTO r FROM public.return_requests WHERE id = _return_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Return request not found'; END IF;
  IF r.worker_id <> auth.uid() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF r.status NOT IN ('pending','info_requested') THEN RAISE EXCEPTION 'This return request has already been handled'; END IF;

  SELECT * INTO b FROM public.bookings WHERE id = r.booking_id FOR UPDATE;

  IF _action = 'request_info' THEN
    IF _note IS NULL OR length(trim(_note)) < 3 THEN RAISE EXCEPTION 'Please say what information you need'; END IF;
    UPDATE public.return_requests SET status = 'info_requested', info_request = trim(_note), responded_at = now() WHERE id = _return_id;
    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (r.customer_id, 'return_info_requested', 'More information needed', trim(_note),
      jsonb_build_object('booking_id', r.booking_id, 'return_id', _return_id));
    RETURN;
  END IF;

  IF _action = 'decline' THEN
    IF _note IS NULL OR length(trim(_note)) < 3 THEN RAISE EXCEPTION 'Please give a reason for declining'; END IF;
    UPDATE public.return_requests SET status = 'declined', worker_response = trim(_note), responded_at = now() WHERE id = _return_id;
    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (r.customer_id, 'return_declined', 'Return visit declined', trim(_note),
      jsonb_build_object('booking_id', r.booking_id, 'return_id', _return_id));
    RETURN;
  END IF;

  -- accept or schedule: reopen the booking
  SELECT EXISTS (
    SELECT 1 FROM public.bookings
     WHERE worker_id = auth.uid() AND id <> r.booking_id
       AND status::text IN ('accepted','on_the_way','arrived','in_progress',
                            'awaiting_customer_confirmation','worker_on_the_way',
                            'work_started','worker_marked_complete','disputed')
  ) INTO busy;
  IF busy THEN RAISE EXCEPTION 'You have another active booking. Finish it before accepting a return visit.'; END IF;

  UPDATE public.return_requests
    SET status = CASE WHEN _action = 'schedule' THEN 'scheduled' ELSE 'accepted' END,
        worker_response = NULLIF(trim(COALESCE(_note,'')),''),
        scheduled_at = _scheduled_at,
        responded_at = now()
    WHERE id = _return_id;

  PERFORM set_config('app.booking_rpc','on',true);
  UPDATE public.bookings
    SET status = 'accepted'::booking_status,
        return_count = COALESCE(return_count,0) + 1,
        reopened_at = now(),
        scheduled_at = COALESCE(_scheduled_at, scheduled_at),
        payment_status = 'not_due',
        worker_completed_at = NULL,
        customer_confirmed_at = NULL,
        on_the_way_at = NULL,
        arrived_at = NULL,
        started_at = NULL,
        is_paused = false,
        paused_at = NULL,
        pause_reason = NULL
    WHERE id = r.booking_id;

  SELECT full_name INTO wname FROM public.profiles WHERE id = auth.uid();
  INSERT INTO public.notifications (user_id, type, title, body, data) VALUES
    (r.customer_id, 'return_accepted', 'Return visit confirmed',
      COALESCE(wname,'Your professional') || ' accepted the return visit'
      || CASE WHEN _scheduled_at IS NOT NULL THEN ' for ' || to_char(_scheduled_at,'DD Mon YYYY, HH24:MI') ELSE '' END || '.',
      jsonb_build_object('booking_id', r.booking_id, 'return_id', _return_id)),
    (r.worker_id, 'return_accepted', 'Return visit confirmed',
      'The booking has been reopened. Chat with the customer is active again.',
      jsonb_build_object('booking_id', r.booking_id, 'return_id', _return_id));
END $$;

CREATE OR REPLACE FUNCTION public.customer_reply_return_info(_return_id uuid, _reply text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r public.return_requests%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _reply IS NULL OR length(trim(_reply)) < 3 THEN RAISE EXCEPTION 'Please add details'; END IF;
  SELECT * INTO r FROM public.return_requests WHERE id = _return_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Return request not found'; END IF;
  IF r.customer_id <> auth.uid() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF r.status <> 'info_requested' THEN RAISE EXCEPTION 'No information was requested'; END IF;
  UPDATE public.return_requests SET status = 'pending', customer_info_reply = trim(_reply) WHERE id = _return_id;
  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (r.worker_id, 'return_info_reply', 'Customer replied', trim(_reply),
    jsonb_build_object('booking_id', r.booking_id, 'return_id', _return_id));
END $$;

-- close open return requests when a reopened booking completes again
CREATE OR REPLACE FUNCTION public.close_return_on_completion()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.status = 'completed'::booking_status AND OLD.status IS DISTINCT FROM NEW.status THEN
    UPDATE public.return_requests
      SET status = 'completed', resolved_at = now()
      WHERE booking_id = NEW.id AND status IN ('accepted','scheduled');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_close_return_on_completion ON public.bookings;
CREATE TRIGGER trg_close_return_on_completion AFTER UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.close_return_on_completion();

-- allow the confirmation RPC to record a resolution answer for return visits
CREATE OR REPLACE FUNCTION public.customer_confirm_booking_completion(_booking_id uuid, _amount_paid numeric, _rating integer, _review_text text DEFAULT NULL::text, _would_hire_again boolean DEFAULT NULL::boolean, _amount_note text DEFAULT NULL::text, _resolution text DEFAULT NULL::text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE b public.bookings%ROWTYPE; had_return boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _amount_paid IS NULL OR _amount_paid <= 0 THEN RAISE EXCEPTION 'Amount paid must be greater than zero'; END IF;
  IF _rating IS NULL OR _rating < 1 OR _rating > 5 THEN RAISE EXCEPTION 'Rating must be 1-5'; END IF;
  SELECT * INTO b FROM public.bookings WHERE id = _booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found'; END IF;
  IF b.customer_id <> auth.uid() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF b.status <> 'awaiting_customer_confirmation'::booking_status THEN RAISE EXCEPTION 'Booking is not awaiting confirmation'; END IF;

  had_return := COALESCE(b.return_count,0) > 0;
  IF had_return AND (_resolution IS NULL OR _resolution NOT IN ('completely','partially','not_resolved')) THEN
    RAISE EXCEPTION 'Please tell us whether the issue was resolved';
  END IF;

  PERFORM set_config('app.booking_rpc', 'on', true);
  UPDATE public.bookings
    SET status = 'completed'::booking_status,
        amount_paid = _amount_paid,
        customer_confirmed_at = now(),
        payment_confirmed_at = now(),
        payment_status = 'confirmed',
        completion_note = COALESCE(completion_note, NULLIF(trim(COALESCE(_amount_note,'')),''))
    WHERE id = _booking_id;

  INSERT INTO public.reviews (booking_id, customer_id, worker_id, rating, comment, would_hire_again, resolution, is_return_review)
  VALUES (_booking_id, b.customer_id, b.worker_id, _rating,
          NULLIF(trim(COALESCE(_review_text,'')),''), _would_hire_again,
          CASE WHEN had_return THEN _resolution ELSE NULL END, had_return)
  ON CONFLICT (booking_id) DO UPDATE
    SET rating = EXCLUDED.rating,
        comment = COALESCE(EXCLUDED.comment, public.reviews.comment),
        would_hire_again = EXCLUDED.would_hire_again,
        resolution = EXCLUDED.resolution,
        is_return_review = EXCLUDED.is_return_review;
END $$;

-- worker earnings summary
CREATE OR REPLACE FUNCTION public.worker_earnings_summary(_worker_id uuid)
RETURNS TABLE(total_paid numeric, awaiting_payment numeric, this_month numeric, completed_jobs integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT
    COALESCE(SUM(CASE WHEN payment_status = 'confirmed' THEN COALESCE(amount_paid, final_amount, 0) ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN payment_status IN ('awaiting_confirmation','disputed') THEN COALESCE(final_amount, estimated_amount, 0) ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN payment_status = 'confirmed' AND payment_confirmed_at >= date_trunc('month', now()) THEN COALESCE(amount_paid, final_amount, 0) ELSE 0 END),0),
    COUNT(*) FILTER (WHERE status = 'completed'::booking_status)::int
  FROM public.bookings
  WHERE worker_id = _worker_id AND (auth.uid() = _worker_id OR public.has_role(auth.uid(),'admin'));
$$;
