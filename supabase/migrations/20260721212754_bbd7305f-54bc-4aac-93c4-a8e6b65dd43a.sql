
-- Admin dispute resolution RPCs
CREATE OR REPLACE FUNCTION public.admin_resolve_dispute(
  _booking_id uuid,
  _action text,
  _note text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b public.bookings%ROWTYPE;
  allowed text[] := ARRAY['mark_completed','return_in_progress','cancel','resolve_no_penalty'];
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF _action IS NULL OR NOT (_action = ANY(allowed)) THEN
    RAISE EXCEPTION 'Invalid action';
  END IF;
  SELECT * INTO b FROM public.bookings WHERE id = _booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found'; END IF;
  IF b.status <> 'disputed'::booking_status THEN
    RAISE EXCEPTION 'Only disputed bookings can be resolved';
  END IF;

  PERFORM set_config('app.booking_rpc', 'on', true);

  IF _action = 'mark_completed' THEN
    UPDATE public.bookings
      SET status = 'completed'::booking_status,
          payment_status = 'confirmed',
          payment_confirmed_at = COALESCE(payment_confirmed_at, now()),
          customer_confirmed_at = COALESCE(customer_confirmed_at, now()),
          admin_resolution_note = _note,
          admin_resolved_at = now()
      WHERE id = _booking_id;
  ELSIF _action = 'return_in_progress' THEN
    UPDATE public.bookings
      SET status = 'in_progress'::booking_status,
          payment_status = 'not_due',
          admin_resolution_note = _note,
          admin_resolved_at = now()
      WHERE id = _booking_id;
  ELSIF _action = 'cancel' THEN
    UPDATE public.bookings
      SET status = 'cancelled'::booking_status,
          admin_resolution_note = _note,
          admin_resolved_at = now()
      WHERE id = _booking_id;
  ELSIF _action = 'resolve_no_penalty' THEN
    UPDATE public.bookings
      SET status = 'completed'::booking_status,
          admin_resolution_note = _note,
          admin_resolved_at = now()
      WHERE id = _booking_id;
  END IF;

  INSERT INTO public.admin_audit_logs(admin_id, action, target_user_id, target_type, details)
    VALUES (auth.uid(), 'dispute_resolved', b.customer_id, 'booking',
      jsonb_build_object('booking_id', b.id, 'action', _action, 'note', _note));

  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES
    (b.customer_id, 'dispute_resolved', 'Dispute resolved',
      'An admin resolved your dispute: ' || _action,
      jsonb_build_object('booking_id', b.id, 'action', _action)),
    (b.worker_id, 'dispute_resolved', 'Dispute resolved',
      'An admin resolved the dispute: ' || _action,
      jsonb_build_object('booking_id', b.id, 'action', _action));
END $$;

-- Add resolution columns if missing
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS admin_resolution_note text,
  ADD COLUMN IF NOT EXISTS admin_resolved_at timestamptz;

-- Inactivity reminder RPC - callable via cron
CREATE OR REPLACE FUNCTION public.send_awaiting_confirmation_reminders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  sent int := 0;
BEGIN
  FOR r IN
    SELECT b.id, b.customer_id, b.worker_completed_at, b.reminder_count
    FROM public.bookings b
    WHERE b.status = 'awaiting_customer_confirmation'::booking_status
      AND b.worker_completed_at IS NOT NULL
  LOOP
    -- 24h reminder
    IF (r.reminder_count IS NULL OR r.reminder_count < 1)
       AND r.worker_completed_at < now() - INTERVAL '24 hours' THEN
      INSERT INTO public.notifications (user_id, type, title, body, data)
      VALUES (r.customer_id, 'confirmation_reminder', 'Please confirm your booking',
        'Your professional marked the job completed 24 hours ago. Please confirm or report a problem.',
        jsonb_build_object('booking_id', r.id, 'reminder', 1));
      UPDATE public.bookings SET reminder_count = 1, last_reminder_at = now() WHERE id = r.id;
      sent := sent + 1;
    -- 48h reminder
    ELSIF r.reminder_count = 1 AND r.worker_completed_at < now() - INTERVAL '48 hours' THEN
      INSERT INTO public.notifications (user_id, type, title, body, data)
      VALUES (r.customer_id, 'confirmation_reminder', 'Second reminder — please confirm',
        'Your booking has been awaiting confirmation for 48 hours. Confirm or report a problem.',
        jsonb_build_object('booking_id', r.id, 'reminder', 2));
      UPDATE public.bookings SET reminder_count = 2, last_reminder_at = now() WHERE id = r.id;
      sent := sent + 1;
    -- 72h reminder
    ELSIF r.reminder_count = 2 AND r.worker_completed_at < now() - INTERVAL '72 hours' THEN
      INSERT INTO public.notifications (user_id, type, title, body, data)
      VALUES (r.customer_id, 'confirmation_reminder', 'Final reminder — please confirm',
        'Your booking has been awaiting confirmation for 72 hours. The worker may request admin review.',
        jsonb_build_object('booking_id', r.id, 'reminder', 3));
      UPDATE public.bookings SET reminder_count = 3, last_reminder_at = now() WHERE id = r.id;
      sent := sent + 1;
    END IF;
  END LOOP;
  RETURN sent;
END $$;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS reminder_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_reminder_at timestamptz;

REVOKE ALL ON FUNCTION public.send_awaiting_confirmation_reminders() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_resolve_dispute(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_resolve_dispute(uuid, text, text) TO authenticated;

-- Schedule the reminder job every hour
CREATE EXTENSION IF NOT EXISTS pg_cron;
DO $$
BEGIN
  PERFORM cron.unschedule('booking-confirmation-reminders');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
SELECT cron.schedule('booking-confirmation-reminders', '0 * * * *',
  $$SELECT public.send_awaiting_confirmation_reminders();$$);
