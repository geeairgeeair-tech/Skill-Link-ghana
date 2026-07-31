
-- 1. CATEGORY MERGE ---------------------------------------------------------
DO $$
DECLARE
  pairs text[][] := ARRAY[
    ARRAY['dispatch-rider','delivery-rider','Dispatch Rider / Delivery Driver'],
    ARRAY['driver','private-driver','Driver / Private Driver'],
    ARRAY['caterer','event-caterer','Caterer / Large-Event Caterer']
  ];
  i int;
  keep_id uuid;
  dup_id uuid;
BEGIN
  FOR i IN 1..array_length(pairs,1) LOOP
    SELECT id INTO keep_id FROM public.categories WHERE slug = pairs[i][1];
    SELECT id INTO dup_id  FROM public.categories WHERE slug = pairs[i][2];
    IF keep_id IS NULL THEN CONTINUE; END IF;
    UPDATE public.categories SET name = pairs[i][3] WHERE id = keep_id;
    IF dup_id IS NULL THEN CONTINUE; END IF;

    UPDATE public.bookings     SET category_id = keep_id WHERE category_id = dup_id;
    UPDATE public.job_requests SET category_id = keep_id WHERE category_id = dup_id;
    UPDATE public.worker_profiles SET category_id = keep_id WHERE category_id = dup_id;
    -- avoid violating (user_id, category_id) uniqueness
    DELETE FROM public.worker_professions wp
      WHERE wp.category_id = dup_id
        AND EXISTS (SELECT 1 FROM public.worker_professions k
                    WHERE k.user_id = wp.user_id AND k.category_id = keep_id);
    UPDATE public.worker_professions SET category_id = keep_id WHERE category_id = dup_id;

    UPDATE public.categories SET active = false WHERE id = dup_id;
  END LOOP;
END $$;

-- 2. PROFESSION RECORD FIELDS ----------------------------------------------
ALTER TABLE public.worker_professions
  ADD COLUMN IF NOT EXISTS service_description text,
  ADD COLUMN IF NOT EXISTS starting_price integer;

-- backfill a primary profession for every existing worker profile
INSERT INTO public.worker_professions
  (user_id, category_id, bio, years_experience, starting_price, verification_status, is_primary, submitted_at, reviewed_at)
SELECT wp.user_id, wp.category_id, wp.bio, wp.years_experience, wp.starting_price,
       CASE WHEN wp.verification_status::text = 'approved' THEN 'approved' ELSE 'pending' END,
       true, COALESCE(wp.documents_submitted_at, wp.created_at), now()
FROM public.worker_profiles wp
WHERE wp.category_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.worker_professions p WHERE p.user_id = wp.user_id AND p.category_id = wp.category_id)
ON CONFLICT (user_id, category_id) DO NOTHING;

-- if a worker has rows but none primary, promote the oldest
UPDATE public.worker_professions p SET is_primary = true
WHERE p.id IN (
  SELECT DISTINCT ON (user_id) id FROM public.worker_professions
  WHERE user_id NOT IN (SELECT user_id FROM public.worker_professions WHERE is_primary)
  ORDER BY user_id, created_at
);

-- exactly one primary per worker
CREATE UNIQUE INDEX IF NOT EXISTS worker_professions_one_primary
  ON public.worker_professions (user_id) WHERE is_primary;

-- max 3 professions per worker
CREATE OR REPLACE FUNCTION public.enforce_profession_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (SELECT count(*) FROM public.worker_professions WHERE user_id = NEW.user_id) >= 3 THEN
    RAISE EXCEPTION 'A worker can have a maximum of 3 professions';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_profession_limit ON public.worker_professions;
CREATE TRIGGER trg_profession_limit BEFORE INSERT ON public.worker_professions
FOR EACH ROW EXECUTE FUNCTION public.enforce_profession_limit();

-- 3. BOOKING -> PROFESSION LINK --------------------------------------------
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS worker_profession_id uuid REFERENCES public.worker_professions(id) ON DELETE SET NULL;

UPDATE public.bookings b SET worker_profession_id = p.id
FROM public.worker_professions p
WHERE b.worker_profession_id IS NULL
  AND p.user_id = b.worker_id AND p.category_id = b.category_id;

CREATE INDEX IF NOT EXISTS idx_bookings_worker_profession ON public.bookings (worker_profession_id);

-- 4. UPDATED RPC ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.worker_add_profession(
  _category_id uuid, _bio text, _years integer,
  _portfolio jsonb DEFAULT '[]'::jsonb, _certificates jsonb DEFAULT '[]'::jsonb,
  _service_description text DEFAULT NULL, _starting_price integer DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _count int; _new_id uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _category_id IS NULL THEN RAISE EXCEPTION 'Category is required'; END IF;
  SELECT count(*) INTO _count FROM public.worker_professions WHERE user_id = _uid;
  IF _count >= 3 THEN RAISE EXCEPTION 'Maximum of 3 professions allowed'; END IF;
  IF EXISTS (SELECT 1 FROM public.worker_professions WHERE user_id = _uid AND category_id = _category_id) THEN
    RAISE EXCEPTION 'You already have this profession';
  END IF;
  INSERT INTO public.worker_professions
    (user_id, category_id, bio, years_experience, portfolio_images, certificates,
     verification_status, is_primary, submitted_at, service_description, starting_price)
  VALUES (_uid, _category_id, _bio, coalesce(_years,0), coalesce(_portfolio,'[]'::jsonb),
     coalesce(_certificates,'[]'::jsonb), 'pending',
     NOT EXISTS (SELECT 1 FROM public.worker_professions WHERE user_id = _uid),
     now(), _service_description, _starting_price)
  RETURNING id INTO _new_id;
  RETURN _new_id;
END $$;

DROP FUNCTION IF EXISTS public.worker_add_profession(uuid, text, integer, jsonb, jsonb);

-- 5. PROFESSION-AWARE NOTIFICATIONS ----------------------------------------
CREATE OR REPLACE FUNCTION public.notify_booking_events()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  customer_name text;
  worker_name text;
  reason_label text;
  prof_name text;
BEGIN
  SELECT c.name INTO prof_name FROM public.categories c WHERE c.id = NEW.category_id;

  IF TG_OP = 'INSERT' THEN
    SELECT full_name INTO customer_name FROM public.profiles WHERE id = NEW.customer_id;
    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (NEW.worker_id, 'booking_request',
      'New ' || COALESCE(prof_name, 'service') || ' booking request',
      COALESCE(customer_name, 'A customer') || ' requested your ' || COALESCE(prof_name, 'service') || ' service',
      jsonb_build_object('booking_id', NEW.id, 'status', NEW.status, 'profession', prof_name));
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    SELECT full_name INTO worker_name FROM public.profiles WHERE id = NEW.worker_id;
    SELECT full_name INTO customer_name FROM public.profiles WHERE id = NEW.customer_id;

    IF NEW.status = 'accepted' THEN
      INSERT INTO public.notifications (user_id, type, title, body, data)
      VALUES (NEW.customer_id, 'booking_accepted', 'Booking accepted',
        COALESCE(worker_name,'The worker') || ' accepted your ' || COALESCE(prof_name,'service') || ' booking',
        jsonb_build_object('booking_id', NEW.id, 'status', NEW.status, 'profession', prof_name));

    ELSIF NEW.status IN ('on_the_way','worker_on_the_way') THEN
      INSERT INTO public.notifications (user_id, type, title, body, data)
      VALUES (NEW.customer_id, 'worker_on_the_way', 'Your pro is on the way',
        COALESCE(worker_name,'Your pro') || ' is heading to your location',
        jsonb_build_object('booking_id', NEW.id, 'status', NEW.status, 'profession', prof_name));

    ELSIF NEW.status = 'arrived' THEN
      INSERT INTO public.notifications (user_id, type, title, body, data)
      VALUES (NEW.customer_id, 'worker_arrived', 'Your pro has arrived',
        COALESCE(worker_name,'Your pro') || ' arrived at your location',
        jsonb_build_object('booking_id', NEW.id, 'status', NEW.status, 'profession', prof_name));

    ELSIF NEW.status IN ('in_progress','work_started') THEN
      INSERT INTO public.notifications (user_id, type, title, body, data)
      VALUES (NEW.customer_id, 'job_started', 'Work has started',
        COALESCE(worker_name,'Your pro') || ' started the job',
        jsonb_build_object('booking_id', NEW.id, 'status', NEW.status, 'profession', prof_name));

    ELSIF NEW.status IN ('awaiting_customer_confirmation','worker_marked_complete') THEN
      INSERT INTO public.notifications (user_id, type, title, body, data)
      VALUES (NEW.customer_id, 'worker_completed', 'Please confirm completion',
        COALESCE(worker_name,'Your pro') || ' marked the job complete — please confirm and pay',
        jsonb_build_object('booking_id', NEW.id, 'status', NEW.status,
          'final_amount', NEW.final_amount, 'profession', prof_name));

    ELSIF NEW.status IN ('completed','customer_confirmed_complete','closed') THEN
      INSERT INTO public.notifications (user_id, type, title, body, data)
      VALUES (NEW.worker_id, 'customer_confirmed', 'Customer confirmed completion',
        COALESCE(customer_name,'The customer') || ' confirmed the job was completed',
        jsonb_build_object('booking_id', NEW.id, 'status', NEW.status, 'profession', prof_name));

    ELSIF NEW.status = 'declined' THEN
      reason_label := CASE NEW.decline_reason
        WHEN 'schedule_conflict' THEN 'Schedule conflict'
        WHEN 'too_far' THEN 'Too far from service area'
        WHEN 'budget_low' THEN 'Budget is too low'
        WHEN 'no_equipment' THEN 'Missing required equipment'
        WHEN 'unavailable' THEN 'Currently unavailable'
        WHEN 'unclear_details' THEN 'Job details are unclear'
        WHEN 'safety_concern' THEN 'Safety concern'
        WHEN 'wrong_category' THEN 'Wrong category or service'
        WHEN 'other' THEN 'Other'
        ELSE NULL END;
      INSERT INTO public.notifications (user_id, type, title, body, data)
      VALUES (NEW.customer_id, 'booking_declined', 'Booking declined',
        COALESCE(worker_name,'The worker') || ' declined your booking'
          || CASE WHEN reason_label IS NOT NULL THEN ' — ' || reason_label ELSE '' END,
        jsonb_build_object('booking_id', NEW.id, 'status', NEW.status,
          'reason_code', NEW.decline_reason, 'reason_label', reason_label,
          'reason_note', NEW.decline_note, 'profession', prof_name));

    ELSIF NEW.status = 'cancelled' AND OLD.status = 'pending' AND auth.uid() = NEW.worker_id THEN
      INSERT INTO public.notifications (user_id, type, title, body, data)
      VALUES (NEW.customer_id, 'booking_declined', 'Booking cancelled',
        COALESCE(worker_name,'The worker') || ' cancelled your booking',
        jsonb_build_object('booking_id', NEW.id, 'status', NEW.status, 'profession', prof_name));
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.notify_new_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  b public.bookings%ROWTYPE;
  recipient uuid;
  sender_name text;
  preview text;
  prof_name text;
BEGIN
  SELECT * INTO b FROM public.bookings WHERE id = NEW.booking_id;
  IF NOT FOUND THEN RETURN NEW; END IF;
  IF NEW.sender_id = b.customer_id THEN recipient := b.worker_id;
  ELSIF NEW.sender_id = b.worker_id THEN recipient := b.customer_id;
  ELSE RETURN NEW; END IF;
  SELECT full_name INTO sender_name FROM public.profiles WHERE id = NEW.sender_id;
  SELECT c.name INTO prof_name FROM public.categories c WHERE c.id = b.category_id;
  preview := substring(COALESCE(NEW.content,'') from 1 for 120);
  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (recipient, 'chat_message',
    COALESCE(sender_name,'New message'), preview,
    jsonb_build_object('booking_id', NEW.booking_id, 'message_id', NEW.id,
      'profession', prof_name, 'sender_id', NEW.sender_id, 'sender_name', sender_name));
  RETURN NEW;
END $$;

-- 6. REALTIME ---------------------------------------------------------------
DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.messages; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.bookings; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.return_requests; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;
ALTER TABLE public.messages REPLICA IDENTITY FULL;
