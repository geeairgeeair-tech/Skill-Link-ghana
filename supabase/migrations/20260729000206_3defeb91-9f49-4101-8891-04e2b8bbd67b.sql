
CREATE TABLE public.booking_estimates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  worker_id uuid NOT NULL,
  version integer NOT NULL DEFAULT 1,
  labour_type text,
  labour_description text,
  labour_cost numeric NOT NULL DEFAULT 0,
  materials jsonb NOT NULL DEFAULT '[]'::jsonb,
  extras jsonb NOT NULL DEFAULT '[]'::jsonb,
  discount numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  note text,
  status text NOT NULL DEFAULT 'sent',
  approved_at timestamptz,
  rejected_at timestamptz,
  reject_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (booking_id, version)
);

GRANT SELECT, INSERT, UPDATE ON public.booking_estimates TO authenticated;
GRANT ALL ON public.booking_estimates TO service_role;

ALTER TABLE public.booking_estimates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Parties and admins can read estimates"
ON public.booking_estimates FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.id = booking_estimates.booking_id
      AND (b.customer_id = auth.uid() OR b.worker_id = auth.uid())
  )
);

CREATE TRIGGER touch_booking_estimates
BEFORE UPDATE ON public.booking_estimates
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS final_amount_reason text,
  ADD COLUMN IF NOT EXISTS final_amount_note text;

-- Worker creates or revises an estimate
CREATE OR REPLACE FUNCTION public.worker_submit_estimate(
  _booking_id uuid,
  _labour_type text,
  _labour_description text,
  _labour_cost numeric,
  _materials jsonb,
  _extras jsonb,
  _discount numeric,
  _note text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  b public.bookings%ROWTYPE;
  next_version integer;
  mat_total numeric := 0;
  ext_total numeric := 0;
  grand numeric := 0;
  new_id uuid;
  worker_name text;
  item jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO b FROM public.bookings WHERE id = _booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found'; END IF;
  IF b.worker_id <> auth.uid() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF b.status::text NOT IN ('accepted','on_the_way','arrived') THEN
    RAISE EXCEPTION 'Estimates can only be sent before work starts';
  END IF;
  IF COALESCE(_labour_cost,0) < 0 OR COALESCE(_discount,0) < 0 THEN
    RAISE EXCEPTION 'Amounts cannot be negative';
  END IF;

  FOR item IN SELECT * FROM jsonb_array_elements(COALESCE(_materials,'[]'::jsonb)) LOOP
    mat_total := mat_total + (COALESCE((item->>'qty')::numeric,0) * COALESCE((item->>'unit_price')::numeric,0));
  END LOOP;
  FOR item IN SELECT * FROM jsonb_array_elements(COALESCE(_extras,'[]'::jsonb)) LOOP
    ext_total := ext_total + COALESCE((item->>'amount')::numeric,0);
  END LOOP;

  grand := COALESCE(_labour_cost,0) + mat_total + ext_total - COALESCE(_discount,0);
  IF grand <= 0 THEN RAISE EXCEPTION 'Estimate total must be greater than zero'; END IF;

  SELECT COALESCE(MAX(version),0) + 1 INTO next_version
    FROM public.booking_estimates WHERE booking_id = _booking_id;

  UPDATE public.booking_estimates
    SET status = 'superseded'
    WHERE booking_id = _booking_id AND status IN ('sent','approved','rejected');

  INSERT INTO public.booking_estimates (
    booking_id, worker_id, version, labour_type, labour_description, labour_cost,
    materials, extras, discount, total, note, status
  ) VALUES (
    _booking_id, auth.uid(), next_version, _labour_type, _labour_description, COALESCE(_labour_cost,0),
    COALESCE(_materials,'[]'::jsonb), COALESCE(_extras,'[]'::jsonb), COALESCE(_discount,0), grand,
    NULLIF(trim(COALESCE(_note,'')),''), 'sent'
  ) RETURNING id INTO new_id;

  PERFORM set_config('app.booking_rpc', 'on', true);
  UPDATE public.bookings SET estimated_amount = grand, updated_at = now() WHERE id = _booking_id;

  SELECT full_name INTO worker_name FROM public.profiles WHERE id = auth.uid();

  INSERT INTO public.notifications (user_id, type, title, body, data) VALUES
    (b.customer_id, 'estimate_sent',
      CASE WHEN next_version > 1 THEN 'Estimate revised' ELSE 'You received an estimate' END,
      COALESCE(worker_name,'Your worker') || ' sent an estimate of GH' || chr(8373) || grand::text || ' for your booking.',
      jsonb_build_object('booking_id', _booking_id, 'estimate_id', new_id, 'version', next_version)),
    (auth.uid(), 'estimate_sent', 'Estimate sent successfully',
      'Your estimate of GH' || chr(8373) || grand::text || ' was sent to the customer.',
      jsonb_build_object('booking_id', _booking_id, 'estimate_id', new_id, 'version', next_version));

  RETURN new_id;
END $$;

-- Customer approves the current estimate
CREATE OR REPLACE FUNCTION public.customer_approve_estimate(_estimate_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE e public.booking_estimates%ROWTYPE; b public.bookings%ROWTYPE; cname text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO e FROM public.booking_estimates WHERE id = _estimate_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Estimate not found'; END IF;
  SELECT * INTO b FROM public.bookings WHERE id = e.booking_id;
  IF b.customer_id <> auth.uid() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF e.status <> 'sent' THEN RAISE EXCEPTION 'This estimate can no longer be approved'; END IF;

  UPDATE public.booking_estimates SET status = 'approved', approved_at = now() WHERE id = _estimate_id;

  SELECT full_name INTO cname FROM public.profiles WHERE id = auth.uid();
  INSERT INTO public.notifications (user_id, type, title, body, data) VALUES
    (b.worker_id, 'estimate_approved', 'Estimate approved',
      COALESCE(cname,'The customer') || ' approved your estimate of GH' || chr(8373) || e.total::text || '.',
      jsonb_build_object('booking_id', b.id, 'estimate_id', e.id)),
    (b.customer_id, 'estimate_approved', 'You approved the estimate',
      'You approved an estimate of GH' || chr(8373) || e.total::text || '. Your worker can now proceed.',
      jsonb_build_object('booking_id', b.id, 'estimate_id', e.id));
END $$;

-- Customer rejects the current estimate
CREATE OR REPLACE FUNCTION public.customer_reject_estimate(_estimate_id uuid, _reason text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE e public.booking_estimates%ROWTYPE; b public.bookings%ROWTYPE; cname text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _reason IS NULL OR length(trim(_reason)) < 3 THEN RAISE EXCEPTION 'Please choose a reason'; END IF;
  SELECT * INTO e FROM public.booking_estimates WHERE id = _estimate_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Estimate not found'; END IF;
  SELECT * INTO b FROM public.bookings WHERE id = e.booking_id;
  IF b.customer_id <> auth.uid() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF e.status <> 'sent' THEN RAISE EXCEPTION 'This estimate can no longer be rejected'; END IF;

  UPDATE public.booking_estimates
    SET status = 'rejected', rejected_at = now(), reject_reason = trim(_reason)
    WHERE id = _estimate_id;

  SELECT full_name INTO cname FROM public.profiles WHERE id = auth.uid();
  INSERT INTO public.notifications (user_id, type, title, body, data) VALUES
    (b.worker_id, 'estimate_rejected', 'Estimate rejected',
      COALESCE(cname,'The customer') || ' rejected your estimate: ' || trim(_reason),
      jsonb_build_object('booking_id', b.id, 'estimate_id', e.id)),
    (b.customer_id, 'estimate_rejected', 'You rejected the estimate',
      'Your worker can send a revised estimate.',
      jsonb_build_object('booking_id', b.id, 'estimate_id', e.id));
END $$;

-- Completion with variance reason against the approved estimate
CREATE OR REPLACE FUNCTION public.worker_mark_booking_completed(
  _booking_id uuid,
  _final_amount numeric,
  _completion_note text DEFAULT NULL,
  _variance_reason text DEFAULT NULL,
  _variance_note text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE b public.bookings%ROWTYPE; approved numeric;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _final_amount IS NULL OR _final_amount <= 0 THEN RAISE EXCEPTION 'Final amount must be greater than zero'; END IF;
  SELECT * INTO b FROM public.bookings WHERE id = _booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found'; END IF;
  IF b.worker_id <> auth.uid() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF b.status <> 'in_progress'::booking_status THEN RAISE EXCEPTION 'Booking is not in progress'; END IF;

  SELECT total INTO approved FROM public.booking_estimates
    WHERE booking_id = _booking_id AND status = 'approved'
    ORDER BY version DESC LIMIT 1;

  IF approved IS NOT NULL AND approved <> _final_amount THEN
    IF _variance_reason IS NULL OR length(trim(_variance_reason)) < 3 THEN
      RAISE EXCEPTION 'Please give a reason why the final amount differs from the approved estimate';
    END IF;
  END IF;

  PERFORM set_config('app.booking_rpc', 'on', true);
  UPDATE public.bookings
    SET status = 'awaiting_customer_confirmation'::booking_status,
        final_amount = _final_amount,
        completion_note = NULLIF(trim(COALESCE(_completion_note,'')),''),
        final_amount_reason = NULLIF(trim(COALESCE(_variance_reason,'')),''),
        final_amount_note = NULLIF(trim(COALESCE(_variance_note,'')),''),
        worker_completed_at = now(),
        payment_status = 'awaiting_confirmation'
    WHERE id = _booking_id;
END $$;

-- Thank-you notifications on completion
CREATE OR REPLACE FUNCTION public.notify_booking_completed_thanks()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status::text IN ('completed','closed','customer_confirmed_complete')
     AND OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.notifications (user_id, type, title, body, data) VALUES
      (NEW.customer_id, 'booking_completed', 'Booking complete — thank you',
        'Your booking has been completed successfully. Thank you for trusting Skill Link to connect you with a skilled professional. We hope to serve you again.',
        jsonb_build_object('booking_id', NEW.id)),
      (NEW.worker_id, 'booking_completed', 'Job complete — thank you',
        'This job has been completed successfully. Thank you for delivering your service through Skill Link and helping us build a trusted professional community.',
        jsonb_build_object('booking_id', NEW.id));
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_notify_booking_completed_thanks ON public.bookings;
CREATE TRIGGER trg_notify_booking_completed_thanks
AFTER UPDATE ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.notify_booking_completed_thanks();
