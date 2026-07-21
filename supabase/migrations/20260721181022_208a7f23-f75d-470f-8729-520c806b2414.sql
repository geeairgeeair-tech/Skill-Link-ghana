
-- Booking columns
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS estimated_amount numeric,
  ADD COLUMN IF NOT EXISTS final_amount numeric,
  ADD COLUMN IF NOT EXISTS amount_paid numeric,
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'not_due',
  ADD COLUMN IF NOT EXISTS started_at timestamptz,
  ADD COLUMN IF NOT EXISTS worker_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS customer_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS payment_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS completion_note text,
  ADD COLUMN IF NOT EXISTS dispute_reason text,
  ADD COLUMN IF NOT EXISTS dispute_details text,
  ADD COLUMN IF NOT EXISTS disputed_at timestamptz,
  ADD COLUMN IF NOT EXISTS admin_review_requested_at timestamptz;

UPDATE public.bookings
  SET estimated_amount = COALESCE(estimated_amount, estimated_cost, budget)
  WHERE estimated_amount IS NULL;

ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS would_hire_again boolean;
CREATE UNIQUE INDEX IF NOT EXISTS reviews_booking_unique ON public.reviews(booking_id);

-- Counterparty profile read
DROP POLICY IF EXISTS "Booking counterparties view profile" ON public.profiles;
CREATE POLICY "Booking counterparties view profile" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE (b.customer_id = auth.uid() AND b.worker_id = profiles.id)
         OR (b.worker_id = auth.uid() AND b.customer_id = profiles.id)
    )
  );

-- Trigger: block direct worker status changes
CREATE OR REPLACE FUNCTION public.guard_booking_worker_updates()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE bypass text;
BEGIN
  bypass := current_setting('app.booking_rpc', true);
  IF bypass = 'on' THEN RETURN NEW; END IF;
  IF public.has_role(auth.uid(), 'admin') THEN RETURN NEW; END IF;
  IF auth.uid() = NEW.worker_id AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Workers must use the booking action functions to change status';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_guard_booking_worker_updates ON public.bookings;
CREATE TRIGGER trg_guard_booking_worker_updates
  BEFORE UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.guard_booking_worker_updates();

-- Lifecycle RPCs
CREATE OR REPLACE FUNCTION public.worker_start_booking(_booking_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE b public.bookings%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO b FROM public.bookings WHERE id = _booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found'; END IF;
  IF b.worker_id <> auth.uid() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF b.status <> 'accepted'::booking_status THEN RAISE EXCEPTION 'Only accepted bookings can be started'; END IF;
  PERFORM set_config('app.booking_rpc', 'on', true);
  UPDATE public.bookings SET status = 'in_progress'::booking_status, started_at = now() WHERE id = _booking_id;
  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (b.customer_id, 'job_started', 'Job started',
    'Your professional has started the job',
    jsonb_build_object('booking_id', b.id));
END $$;

CREATE OR REPLACE FUNCTION public.worker_mark_booking_completed(
  _booking_id uuid, _final_amount numeric, _completion_note text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  b public.bookings%ROWTYPE;
  worker_name text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _final_amount IS NULL OR _final_amount <= 0 THEN RAISE EXCEPTION 'Final amount must be greater than zero'; END IF;
  SELECT * INTO b FROM public.bookings WHERE id = _booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found'; END IF;
  IF b.worker_id <> auth.uid() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF b.status <> 'in_progress'::booking_status THEN RAISE EXCEPTION 'Booking is not in progress'; END IF;

  PERFORM set_config('app.booking_rpc', 'on', true);
  UPDATE public.bookings
    SET status = 'awaiting_customer_confirmation'::booking_status,
        final_amount = _final_amount,
        completion_note = NULLIF(trim(COALESCE(_completion_note,'')),''),
        worker_completed_at = now(),
        payment_status = 'awaiting_confirmation'
    WHERE id = _booking_id;

  SELECT full_name INTO worker_name FROM public.profiles WHERE id = b.worker_id;
  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (b.customer_id, 'awaiting_confirmation', 'Confirm completion',
    COALESCE(worker_name,'Your pro') || ' marked the job completed and reported GH₵' || _final_amount::text || '. Please confirm.',
    jsonb_build_object('booking_id', b.id, 'final_amount', _final_amount));
END $$;

CREATE OR REPLACE FUNCTION public.customer_confirm_booking_completion(
  _booking_id uuid, _amount_paid numeric, _rating int,
  _review_text text DEFAULT NULL, _would_hire_again boolean DEFAULT NULL, _amount_note text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  b public.bookings%ROWTYPE;
  customer_name text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _amount_paid IS NULL OR _amount_paid <= 0 THEN RAISE EXCEPTION 'Amount paid must be greater than zero'; END IF;
  IF _rating IS NULL OR _rating < 1 OR _rating > 5 THEN RAISE EXCEPTION 'Rating must be 1-5'; END IF;
  SELECT * INTO b FROM public.bookings WHERE id = _booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found'; END IF;
  IF b.customer_id <> auth.uid() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF b.status <> 'awaiting_customer_confirmation'::booking_status THEN RAISE EXCEPTION 'Booking is not awaiting confirmation'; END IF;

  PERFORM set_config('app.booking_rpc', 'on', true);
  UPDATE public.bookings
    SET status = 'completed'::booking_status,
        amount_paid = _amount_paid,
        customer_confirmed_at = now(),
        payment_confirmed_at = now(),
        payment_status = 'confirmed',
        completion_note = COALESCE(completion_note, NULLIF(trim(COALESCE(_amount_note,'')),''))
    WHERE id = _booking_id;

  INSERT INTO public.reviews (booking_id, customer_id, worker_id, rating, comment, would_hire_again)
  VALUES (_booking_id, b.customer_id, b.worker_id, _rating,
          NULLIF(trim(COALESCE(_review_text,'')),''), _would_hire_again)
  ON CONFLICT (booking_id) DO NOTHING;

  SELECT full_name INTO customer_name FROM public.profiles WHERE id = b.customer_id;
  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (b.worker_id, 'booking_completed', 'Booking completed',
    COALESCE(customer_name,'The customer') || ' confirmed completion and rated ' || _rating::text || '★',
    jsonb_build_object('booking_id', b.id, 'rating', _rating, 'amount_paid', _amount_paid));
END $$;

CREATE OR REPLACE FUNCTION public.customer_dispute_booking(
  _booking_id uuid, _reason_code text, _details text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  b public.bookings%ROWTYPE;
  allowed text[] := ARRAY['not_completed','quality','amount','no_show','damage','other'];
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _reason_code IS NULL OR NOT (_reason_code = ANY(allowed)) THEN RAISE EXCEPTION 'Invalid reason'; END IF;
  IF _details IS NULL OR length(trim(_details)) < 10 THEN RAISE EXCEPTION 'Please describe the issue (min 10 chars)'; END IF;
  SELECT * INTO b FROM public.bookings WHERE id = _booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found'; END IF;
  IF b.customer_id <> auth.uid() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF b.status <> 'awaiting_customer_confirmation'::booking_status THEN RAISE EXCEPTION 'Booking is not awaiting confirmation'; END IF;

  PERFORM set_config('app.booking_rpc', 'on', true);
  UPDATE public.bookings
    SET status = 'disputed'::booking_status,
        dispute_reason = _reason_code,
        dispute_details = trim(_details),
        disputed_at = now(),
        payment_status = 'disputed'
    WHERE id = _booking_id;

  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (b.worker_id, 'booking_disputed', 'Booking disputed',
    'The customer opened a dispute. An admin will review it.',
    jsonb_build_object('booking_id', b.id, 'reason_code', _reason_code));
END $$;

CREATE OR REPLACE FUNCTION public.worker_request_admin_review(_booking_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE b public.bookings%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO b FROM public.bookings WHERE id = _booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found'; END IF;
  IF b.worker_id <> auth.uid() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF b.status <> 'awaiting_customer_confirmation'::booking_status THEN RAISE EXCEPTION 'Not eligible'; END IF;
  IF b.worker_completed_at IS NULL OR b.worker_completed_at > now() - INTERVAL '72 hours' THEN
    RAISE EXCEPTION 'Available 72 hours after marking completed';
  END IF;
  PERFORM set_config('app.booking_rpc', 'on', true);
  UPDATE public.bookings SET admin_review_requested_at = now() WHERE id = _booking_id;
END $$;

-- Derived worker status
CREATE OR REPLACE FUNCTION public.get_worker_public_status(_worker_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN NOT COALESCE((SELECT is_available FROM public.worker_profiles WHERE user_id = _worker_id), true) THEN 'unavailable'
    WHEN EXISTS (
      SELECT 1 FROM public.bookings
       WHERE worker_id = _worker_id
         AND status::text IN ('accepted','in_progress','awaiting_customer_confirmation','on_the_way','arrived','worker_on_the_way','work_started','worker_marked_complete')
    ) THEN 'busy'
    ELSE 'available'
  END;
$$;

GRANT EXECUTE ON FUNCTION public.worker_start_booking(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.worker_mark_booking_completed(uuid, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.customer_confirm_booking_completion(uuid, numeric, int, text, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.customer_dispute_booking(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.worker_request_admin_review(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_worker_public_status(uuid) TO authenticated, anon;
